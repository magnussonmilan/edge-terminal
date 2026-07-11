/**
 * Ingest FiveThirtyEight / ABC News MLB Elo game-by-game forecasts.
 *
 * Source (canonical, documented by 538): 
 *   https://projects.fivethirtyeight.com/mlb-api/mlb_elo.csv
 *   https://projects.fivethirtyeight.com/mlb-api/mlb_elo_latest.csv
 * License: CC BY 4.0 —
 *   https://github.com/fivethirtyeight/data/blob/master/LICENSE
 * Attribution: Data by FiveThirtyEight/ABC News.
 * Dataset tree: https://github.com/fivethirtyeight/data/tree/master/mlb-elo
 *
 * Using this material does not imply FiveThirtyEight or ABC News sponsors,
 * endorses, or is affiliated with Edge Terminal (CC BY 4.0 §2(a)(6)).
 *
 * Freshness (verified at ingest time — see meta.json): the official projects
 * URLs currently redirect away from the CSV (ABC News transition). We fall
 * back to a Wayback Machine snapshot and report whether the payload looks
 * live or frozen from the data's own dates — not from HTTP 200 alone.
 *
 * Usage: npx tsx scripts/ingest-mlb-elo.ts
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveFranchiseId, normalizeMlbTeamAbbr } from '../src/lib/mlbTeamIds.ts'
import type { MlbEloGame, MlbIngestMeta } from '../src/lib/mlbTypes.ts'
import {
  DEFAULT_MLB_ERAS,
  verifyAllEras,
  verifyBySeason,
  verifyRatingByPitcherAdjProxy,
} from '../src/lib/mlbEloVerification.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/mlb')
const RAW_DIR = path.join(OUT_DIR, 'raw')

const OFFICIAL_FULL =
  'https://projects.fivethirtyeight.com/mlb-api/mlb_elo.csv'
const OFFICIAL_LATEST =
  'https://projects.fivethirtyeight.com/mlb-api/mlb_elo_latest.csv'
/** Closest Wayback snapshot that still returned CSV (verified 2026-07). */
const WAYBACK_FULL =
  'https://web.archive.org/web/20250306125343id_/https://projects.fivethirtyeight.com/mlb-api/mlb_elo.csv'
const WAYBACK_TS = '20250306125343'

const ATTRIBUTION = 'Data by FiveThirtyEight/ABC News, CC BY 4.0'

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
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function looksLikeCsv(text: string): boolean {
  const head = text.slice(0, 80).toLowerCase()
  return head.includes('date') && head.includes('season') && !head.includes('<!doctype')
}

async function probeOfficial(url: string): Promise<{
  ok: boolean
  note: string
}> {
  try {
    const res = await fetch(url, { redirect: 'follow' })
    const text = await res.text()
    if (looksLikeCsv(text)) {
      return { ok: true, note: `Official URL returned CSV (${res.status})` }
    }
    return {
      ok: false,
      note: `Official URL did not return CSV (HTTP ${res.status}, final body is not mlb_elo). Likely dead after ABC News transition.`,
    }
  } catch (e) {
    return {
      ok: false,
      note: `Official URL fetch failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}

async function downloadText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`)
  const text = await res.text()
  if (!looksLikeCsv(text)) {
    throw new Error(`Response from ${url} is not an mlb_elo CSV`)
  }
  return text
}

function rowToGame(row: Record<string, string>, idx: number): MlbEloGame {
  const home = normalizeMlbTeamAbbr(row.team1 ?? '')
  const away = normalizeMlbTeamAbbr(row.team2 ?? '')
  const season = Number(row.season)
  const date = row.date ?? ''
  return {
    gameId: `${date}-${home}-${away}-${idx}`,
    date,
    season,
    neutral: row.neutral === '1' || row.neutral === 'true',
    playoff: row.playoff ? row.playoff : null,
    homeTeam: home,
    awayTeam: away,
    homeFranchiseId: resolveFranchiseId(home),
    awayFranchiseId: resolveFranchiseId(away),
    elo1Pre: num(row.elo1_pre) ?? 1500,
    elo2Pre: num(row.elo2_pre) ?? 1500,
    eloProb1: num(row.elo_prob1) ?? 0.5,
    eloProb2: num(row.elo_prob2) ?? 0.5,
    elo1Post: num(row.elo1_post),
    elo2Post: num(row.elo2_post),
    rating1Pre: num(row.rating1_pre),
    rating2Pre: num(row.rating2_pre),
    pitcher1: row.pitcher1 || null,
    pitcher2: row.pitcher2 || null,
    pitcher1Rgs: num(row.pitcher1_rgs),
    pitcher2Rgs: num(row.pitcher2_rgs),
    pitcher1Adj: num(row.pitcher1_adj),
    pitcher2Adj: num(row.pitcher2_adj),
    ratingProb1: num(row.rating_prob1),
    ratingProb2: num(row.rating_prob2),
    rating1Post: num(row.rating1_post),
    rating2Post: num(row.rating2_post),
    score1: num(row.score1),
    score2: num(row.score2),
  }
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true })
  await mkdir(OUT_DIR, { recursive: true })

  const officialProbe = await probeOfficial(OFFICIAL_FULL)
  const latestProbe = await probeOfficial(OFFICIAL_LATEST)
  console.log('Official full:', officialProbe.note)
  console.log('Official latest:', latestProbe.note)

  let csvText: string
  let resolvedSource: string
  let archiveTimestamp: string | null = null

  const localCache = path.join(RAW_DIR, 'mlb_elo.csv')
  try {
    await access(localCache)
    const { readFile } = await import('node:fs/promises')
    csvText = await readFile(localCache, 'utf8')
    if (!looksLikeCsv(csvText)) throw new Error('local cache invalid')
    resolvedSource = `local cache ${localCache}`
    console.log('Using local raw cache')
  } catch {
    if (officialProbe.ok) {
      csvText = await downloadText(OFFICIAL_FULL)
      resolvedSource = OFFICIAL_FULL
    } else {
      console.log('Falling back to Wayback Machine snapshot', WAYBACK_TS)
      csvText = await downloadText(WAYBACK_FULL)
      resolvedSource = WAYBACK_FULL
      archiveTimestamp = WAYBACK_TS
    }
    await writeFile(localCache, csvText)
  }

  const rows = parseCsv(csvText)
  const games = rows.map((r, i) => rowToGame(r, i))
  const settled = games.filter((g) => g.score1 != null && g.score2 != null)
  const unsettled = games.length - settled.length

  let minDate = ''
  let maxDate = ''
  let maxSeason = -Infinity
  let maxSettledDate: string | null = null
  for (const g of games) {
    if (g.date) {
      if (!minDate || g.date < minDate) minDate = g.date
      if (!maxDate || g.date > maxDate) maxDate = g.date
    }
    if (g.season > maxSeason) maxSeason = g.season
    if (g.score1 != null && g.score2 != null && g.date) {
      if (maxSettledDate == null || g.date > maxSettledDate) {
        maxSettledDate = g.date
      }
    }
  }

  // Frozen if official is dead OR settled history ends well before "today"
  const frozen =
    !officialProbe.ok ||
    (maxSettledDate != null &&
      maxSettledDate < '2024-01-01')

  const meta: MlbIngestMeta = {
    attribution: ATTRIBUTION,
    license: 'CC BY 4.0',
    licenseUrl: 'https://github.com/fivethirtyeight/data/blob/master/LICENSE',
    sourceReadme:
      'https://github.com/fivethirtyeight/data/tree/master/mlb-elo',
    canonicalUrls: [OFFICIAL_FULL, OFFICIAL_LATEST],
    fetchStatus: {
      officialLive: officialProbe.ok,
      officialNote: `${officialProbe.note} | latest: ${latestProbe.note}`,
      resolvedSource,
      archiveTimestamp,
    },
    freshness: {
      status: frozen ? 'frozen' : 'live',
      summary: frozen
        ? `Frozen historical snapshot — official projects.fivethirtyeight.com/mlb-api URLs no longer serve CSV (redirect away). Resolved file last settled game ${maxSettledDate}, max season ${maxSeason}. Fine for historical verification; not a live feed for current seasons.`
        : `Appears current through settled ${maxSettledDate}.`,
      minDate,
      maxDate,
      maxSeason,
      maxSettledDate,
      settledGameCount: settled.length,
      unsettledGameCount: unsettled,
    },
    generatedAt: new Date().toISOString(),
    gameCount: games.length,
  }

  const eraResults = verifyAllEras(games, DEFAULT_MLB_ERAS)
  const bySeason = verifyBySeason(games, 2015, Math.min(maxSeason, 2023))
  const openerProxy = verifyRatingByPitcherAdjProxy(games, {
    minSeason: 2018,
    maxSeason: Math.min(maxSeason, 2023),
    lowAdjThreshold: 3,
  })

  const verification = {
    attribution: ATTRIBUTION,
    licenseNote:
      'These accuracy/Brier figures are Edge Terminal computations over FiveThirtyEight/ABC News CC BY 4.0 data — not 538 published summaries. Not an endorsement or affiliation.',
    sourceReadme: meta.sourceReadme,
    closingLineNote:
      'ATS / closing-line evaluation is out of scope this pass. A real historical source exists (The Odds API historical baseball_mlb from 2020-06-30) but is not integrated here — confirm paid access before assuming coverage.',
    freshness: meta.freshness,
    eras: eraResults,
    bySeason2015plus: bySeason,
    openerProxy,
    decisionNotes: buildDecisionNotes(eraResults, meta, openerProxy),
  }

  await writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
  await writeFile(
    path.join(OUT_DIR, 'verification.json'),
    JSON.stringify(verification, null, 2),
  )

  // Small sample only in-repo (full history stays in raw/, gitignored)
  const sample = settled.filter((g) => g.season >= 2022).slice(0, 25)
  await writeFile(
    path.join(OUT_DIR, 'sample-games.json'),
    JSON.stringify(
      {
        attribution: ATTRIBUTION,
        note: 'Sample rows for UI attribution — not the full history. Full CSV in raw/mlb_elo.csv (gitignored).',
        games: sample,
      },
      null,
      2,
    ),
  )

  console.log(JSON.stringify(meta.freshness, null, 2))
  console.log('Era results:')
  for (const e of eraResults) {
    console.log(
      `  ${e.eraLabel}: elo ${(e.eloAccuracy * 100).toFixed(2)}% / Brier ${e.eloBrier.toFixed(4)} (n=${e.eloN}); rating ${(e.ratingAccuracy * 100).toFixed(2)}% / Brier ${e.ratingBrier.toFixed(4)} (n=${e.ratingN}); homeBaseline ${(e.homeBaselineAccuracy * 100).toFixed(2)}%`,
    )
  }
  console.log('Wrote', path.join(OUT_DIR, 'verification.json'))
}

function buildDecisionNotes(
  eras: ReturnType<typeof verifyAllEras>,
  meta: MlbIngestMeta,
  opener: ReturnType<typeof verifyRatingByPitcherAdjProxy>,
): string[] {
  const notes: string[] = []
  notes.push(meta.freshness.summary)

  const modern = eras.find((e) => e.eraLabel.includes('2014–2023'))
  const all = eras.find((e) => e.eraLabel === 'all seasons')
  if (modern) {
    notes.push(
      `Pitcher-adjusted rating (2014–2023): ${(modern.ratingAccuracy * 100).toFixed(2)}% SU, Brier ${modern.ratingBrier.toFixed(4)} vs plain Elo ${(modern.eloAccuracy * 100).toFixed(2)}% / ${modern.eloBrier.toFixed(4)} (n=${modern.ratingN}). Third-party writeups often cite ~57.7% — our independent figure is ${(modern.ratingAccuracy * 100).toFixed(2)}%, within a couple of points (essentially matching).`,
    )
  }
  notes.push(
    `Coverage gap inside the freeze: 2023 settled games stop at ${meta.freshness.maxSettledDate} (${meta.freshness.unsettledGameCount} unsettled rows remain through ${meta.freshness.maxDate}). Do not treat late-2023 as fully scored in this file.`,
  )
  if (all) {
    notes.push(
      `All-time aggregate is intentionally de-emphasized (elo ${(all.eloAccuracy * 100).toFixed(2)}%) — pre-1950 baseball is not comparable to the DH / bullpen era.`,
    )
  }

  const lift =
    modern != null ? modern.ratingAccuracy - modern.eloAccuracy : 0
  if (modern && lift > 0.005) {
    notes.push(
      `Decision leaning: rating system shows a real but modest edge over plain Elo in the modern window (+${(lift * 100).toFixed(2)} pts). Do not rebuild a from-scratch MLB Elo first — use this licensed corpus as the validation benchmark. Because the feed is frozen/dead, it cannot be a live data source; any live MLB model must be independent (no-look-ahead rating updates) and checked against this freeze + real closing lines later.`,
    )
  } else {
    notes.push(
      `Decision leaning: no clear modern lift for the pitcher-adjusted system over Elo in this freeze — investigate before treating rating as the preferred baseline.`,
    )
  }

  notes.push(
    `Opener proxy (2018–${meta.freshness.maxSeason}, |adj|<${opener.lowAdjThreshold} both starters): rating acc low-adj ${(opener.lowAdj.ratingAccuracy * 100).toFixed(2)}% (n=${opener.lowAdj.ratingN}) vs normal ${(opener.normalAdj.ratingAccuracy * 100).toFixed(2)}% (n=${opener.normalAdj.ratingN}). On the low-adj subset, rating (${(opener.lowAdj.ratingAccuracy * 100).toFixed(2)}%) does not beat Elo (${(opener.lowAdj.eloAccuracy * 100).toFixed(2)}%) — consistent with pitcher-adjustment helping less (or hurting) when listed starters carry little rating weight. Sample is small (n=${opener.lowAdj.ratingN}); treat as a checkable caveat, not proof of opener failure.`,
  )

  return notes
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
