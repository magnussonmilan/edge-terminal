/**
 * Ingest MLB Elo from Neil Paine's MIT-licensed historical feed.
 *
 * Copyright (c) 2024 Neil Paine
 * Source: https://github.com/Neil-Paine-1/MLB-WAR-data-historical
 * File: mlb-elo-latest.csv
 * License: MIT — https://github.com/Neil-Paine-1/MLB-WAR-data-historical/blob/master/LICENSE.txt
 *          Retain the copyright notice in redistributions.
 *
 * Currency (verified at ingest — see meta.json): check GitHub commit dates
 * and settled score dates in the file itself; do not assume liveness from
 * HTTP 200 alone.
 *
 * Row shape note: each game appears twice (is_home=0/1). We keep is_home=1
 * only so team1/score1 are the home perspective (matches prior 538 shape).
 * This feed has Elo probs only — no pitcher-adjusted rating_prob columns.
 *
 * Usage: npm run ingest:mlb-elo
 */
import { mkdir, writeFile, access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  resolveFranchiseId,
  normalizeMlbTeamAbbr,
} from '../src/lib/mlbTeamIds.ts'
import type { MlbEloGame, MlbIngestMeta } from '../src/lib/mlbTypes.ts'
import {
  DEFAULT_MLB_ERAS,
  verifyAllEras,
  verifyBySeason,
} from '../src/lib/mlbEloVerification.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/mlb')
const RAW_DIR = path.join(OUT_DIR, 'raw')

const SOURCE_REPO =
  'https://github.com/Neil-Paine-1/MLB-WAR-data-historical'
const SOURCE_CSV_RAW =
  'https://raw.githubusercontent.com/Neil-Paine-1/MLB-WAR-data-historical/master/mlb-elo-latest.csv'
const LICENSE_URL = `${SOURCE_REPO}/blob/master/LICENSE.txt`
const COMMITS_API =
  'https://api.github.com/repos/Neil-Paine-1/MLB-WAR-data-historical/commits?path=mlb-elo-latest.csv&per_page=5'

const COPYRIGHT = 'Copyright (c) 2024 Neil Paine'
const ATTRIBUTION = `${COPYRIGHT}. Source: ${SOURCE_REPO} (MIT).`

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0]!).map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function num(v: string | undefined): number | null {
  if (v == null || v === '' || v === 'NA') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function looksLikeCsv(text: string): boolean {
  const head = text.slice(0, 100).toLowerCase()
  return (
    head.includes('date') &&
    head.includes('season') &&
    head.includes('elo_prob') &&
    !head.includes('<!doctype')
  )
}

async function fetchLastCommitDate(): Promise<string | null> {
  try {
    const res = await fetch(COMMITS_API, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{
      commit?: { author?: { date?: string } }
    }>
    return data[0]?.commit?.author?.date?.slice(0, 10) ?? null
  } catch {
    return null
  }
}

function rowToGame(row: Record<string, string>, idx: number): MlbEloGame | null {
  // Keep home-perspective rows only (Neil Paine duplicates each game).
  if (row.is_home !== '1') return null
  const season = num(row.season)
  if (season == null) return null
  const home = normalizeMlbTeamAbbr(row.team1 ?? '')
  const away = normalizeMlbTeamAbbr(row.team2 ?? '')
  if (!home || !away) return null
  const eloProb1 = num(row.elo_prob1)
  const eloProb2 = num(row.elo_prob2)
  if (eloProb1 == null || eloProb2 == null) return null
  const date = row.date ?? ''
  const playoff =
    row.playoff && row.playoff !== 'NA' ? row.playoff : null

  return {
    gameId: `${date}-${home}-${away}-${idx}`,
    date,
    season,
    neutral: row.neutral === '1',
    playoff,
    homeTeam: home,
    awayTeam: away,
    homeFranchiseId: resolveFranchiseId(home),
    awayFranchiseId: resolveFranchiseId(away),
    elo1Pre: num(row.elo1_pre) ?? 1500,
    elo2Pre: num(row.elo2_pre) ?? 1500,
    eloProb1,
    eloProb2,
    elo1Post: num(row.elo1_post),
    elo2Post: num(row.elo2_post),
    rating1Pre: null,
    rating2Pre: null,
    pitcher1: null,
    pitcher2: null,
    pitcher1Rgs: null,
    pitcher2Rgs: null,
    pitcher1Adj: null,
    pitcher2Adj: null,
    ratingProb1: null,
    ratingProb2: null,
    rating1Post: null,
    rating2Post: null,
    score1: num(row.score1),
    score2: num(row.score2),
  }
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })
  await mkdir(OUT_DIR, { recursive: true })

  const lastRepoCommitDate = await fetchLastCommitDate()
  console.log('Last mlb-elo-latest.csv commit:', lastRepoCommitDate ?? 'unknown')

  const localCache = path.join(RAW_DIR, 'mlb_elo_neil_paine.csv')
  let csvText: string
  let resolvedSource: string

  try {
    await access(localCache)
    csvText = await readFile(localCache, 'utf8')
    if (!looksLikeCsv(csvText)) throw new Error('local cache invalid')
    resolvedSource = `local cache ${localCache}`
    console.log('Using local raw cache')
  } catch {
    console.log('Downloading', SOURCE_CSV_RAW)
    const res = await fetch(SOURCE_CSV_RAW)
    if (!res.ok) throw new Error(`Download failed: ${res.status}`)
    csvText = await res.text()
    if (!looksLikeCsv(csvText)) {
      throw new Error('Downloaded body is not mlb-elo CSV')
    }
    resolvedSource = SOURCE_CSV_RAW
    await writeFile(localCache, csvText)
  }

  const rawRows = parseCsv(csvText)
  const games: MlbEloGame[] = []
  for (let i = 0; i < rawRows.length; i++) {
    const g = rowToGame(rawRows[i]!, i)
    if (g) games.push(g)
  }

  let minDate = ''
  let maxDate = ''
  let maxSeason = -Infinity
  let maxSettledDate: string | null = null
  let settledCount = 0
  for (const g of games) {
    if (g.date) {
      if (!minDate || g.date < minDate) minDate = g.date
      if (!maxDate || g.date > maxDate) maxDate = g.date
    }
    if (g.season > maxSeason) maxSeason = g.season
    if (g.score1 != null && g.score2 != null) {
      settledCount += 1
      if (g.date && (maxSettledDate == null || g.date > maxSettledDate)) {
        maxSettledDate = g.date
      }
    }
  }
  const unsettled = games.length - settledCount

  // Honesty: not updating into 2026 as of this check window
  const nowYear = new Date().getUTCFullYear()
  const commitStale =
    !lastRepoCommitDate || lastRepoCommitDate < `${nowYear}-01-01`
  const noCurrentSeason = maxSeason < nowYear
  const status: MlbIngestMeta['freshness']['status'] =
    commitStale || noCurrentSeason ? 'seasonal' : 'live'

  const summary =
    status === 'seasonal'
      ? `Seasonal/manual feed — not actively updating into the ${nowYear} season. Last GitHub commit on mlb-elo-latest.csv: ${lastRepoCommitDate ?? 'unknown'}. Settled scores through ${maxSettledDate}; file dates through ${maxDate} (includes unsettled rows). Stronger/more current than the prior 538 freeze (settled ~2023-06-20), but not a live ${nowYear} pipeline.`
      : `Appears current through settled ${maxSettledDate} (repo commit ${lastRepoCommitDate}).`

  const meta: MlbIngestMeta = {
    attribution: ATTRIBUTION,
    copyrightNotice: COPYRIGHT,
    license: 'MIT',
    licenseUrl: LICENSE_URL,
    sourceReadme: SOURCE_REPO,
    canonicalUrls: [SOURCE_CSV_RAW],
    fetchStatus: {
      officialLive: status === 'live',
      officialNote: `Neil Paine MLB-WAR-data-historical mlb-elo-latest.csv. ${summary}`,
      resolvedSource,
      archiveTimestamp: null,
      lastRepoCommitDate,
    },
    freshness: {
      status,
      summary,
      minDate,
      maxDate,
      maxSeason,
      maxSettledDate,
      settledGameCount: settledCount,
      unsettledGameCount: unsettled,
    },
    generatedAt: new Date().toISOString(),
    gameCount: games.length,
  }

  const eras = [
    ...DEFAULT_MLB_ERAS,
    { minSeason: 2024, maxSeason: 2025, label: '2024–2025 (Neil Paine window)' },
  ]
  const eraResults = verifyAllEras(games, eras)
  const bySeason = verifyBySeason(
    games,
    Math.max(2015, maxSeason - 10),
    maxSeason,
  )

  const verification = {
    attribution: ATTRIBUTION,
    copyrightNotice: COPYRIGHT,
    licenseNote:
      'Accuracy/Brier figures are Edge Terminal computations over Neil Paine MIT data — not published summaries. Retain Copyright (c) 2024 Neil Paine on redistributions.',
    sourceReadme: SOURCE_REPO,
    note: 'This CSV has Elo probs only (no pitcher-adjusted rating_prob). ratingAccuracy/ratingN will be zero.',
    freshness: meta.freshness,
    eras: eraResults,
    bySeason2015plus: bySeason,
    decisionNotes: [
      meta.freshness.summary,
      'Reuse franchise-continuity mapping (mlbTeamIds.ts) and era-split verification — source swapped, methodology unchanged.',
      'No pitcher-adjusted system in this file; Elo-only metrics are the honest comparison.',
    ],
  }

  await writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
  await writeFile(
    path.join(OUT_DIR, 'verification.json'),
    JSON.stringify(verification, null, 2),
  )

  // Recent seasons for SportAdapter / Compare (home rows only already)
  const recent = games.filter((g) => g.season >= 2024)
  await writeFile(
    path.join(OUT_DIR, 'games-recent.json'),
    JSON.stringify(
      {
        attribution: ATTRIBUTION,
        copyrightNotice: COPYRIGHT,
        note: 'Home-perspective games (is_home=1) for 2024–max season. Full CSV in raw/ (gitignored).',
        games: recent,
      },
      null,
      2,
    ),
  )

  const sample = recent.filter((g) => g.score1 != null).slice(-40)
  await writeFile(
    path.join(OUT_DIR, 'sample-games.json'),
    JSON.stringify(
      {
        attribution: ATTRIBUTION,
        copyrightNotice: COPYRIGHT,
        games: sample,
      },
      null,
      2,
    ),
  )

  console.log(JSON.stringify(meta.freshness, null, 2))
  for (const e of eraResults) {
    console.log(
      `  ${e.eraLabel}: elo ${(e.eloAccuracy * 100).toFixed(2)}% Brier ${e.eloBrier.toFixed(4)} n=${e.eloN}`,
    )
  }
  console.log('Wrote meta + verification + games-recent.json', recent.length, 'games')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
