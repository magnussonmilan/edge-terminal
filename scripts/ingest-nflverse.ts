/**
 * Ingest nflverse schedules + injuries + season player stats for seasons
 * 2009–2024, run power-rating updates with injury differentials, and write
 * compact JSON fixtures under src/data/nfl/ for the client demo.
 *
 * Usage: npx tsx scripts/ingest-nflverse.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  processSeasonRatings,
  seedFromPriorSeason,
  type GameResult,
  type HfaConfig,
  type TeamRating,
  HOME_FIELD_ADVANTAGE,
} from '../src/lib/powerRatings.ts'
import {
  buildDefenderValuesFromSeasonRows,
  buildOlValuesFromSnapRows,
  buildPlayerValuesFromSeasonRows,
  computeInjuryDifferential,
  setPlayerValueCoeffs,
  type HistoricalInjuryReport,
  type PlayerValue,
} from '../src/lib/playerValues.ts'
import {
  buildGamePrediction,
  ratingBeforeWeek,
  type GamePrediction,
} from '../src/lib/predictions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')
const SEASONS = [
  2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021,
  2022, 2023, 2024,
]

const BASE =
  'https://github.com/nflverse/nflverse-data/releases/download'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`)
  return res.text()
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0])
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i])
    if (cols.length < headers.length) continue
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? ''
    })
    rows.push(row)
  }
  return rows
}

/** Minimal CSV splitter that handles quoted fields. */
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

function num(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function main() {
  let hfa: HfaConfig = HOME_FIELD_ADVANTAGE
  let useReplacementAddBack = true
  try {
    const raw = await readFile(path.join(OUT_DIR, 'calibrated-coeffs.json'), 'utf8')
    const calibrated = JSON.parse(raw) as {
      hfa?: HfaConfig
      playerCoeffs?: Record<string, number>
      useReplacementAddBack?: boolean
      generatedAt?: string
    }
    if (calibrated.generatedAt && calibrated.generatedAt !== 'pending') {
      if (calibrated.hfa != null) hfa = calibrated.hfa
      if (calibrated.playerCoeffs) setPlayerValueCoeffs(calibrated.playerCoeffs)
      if (calibrated.useReplacementAddBack != null) {
        useReplacementAddBack = calibrated.useReplacementAddBack
      }
      console.log(
        `Using calibrated coeffs (HFA=${typeof hfa === 'number' ? hfa : 'seasonMap'}, replacement=${useReplacementAddBack})`,
      )
    }
  } catch {
    console.log('No calibrated-coeffs.json — using defaults')
  }

  console.log('Downloading nflverse games…')
  const gamesCsv = await fetchText(`${BASE}/schedules/games.csv`)
  const allGames = parseCsv(gamesCsv)

  const games: GameResult[] = allGames
    .filter((r) => {
      const season = Number(r.season)
      return (
        SEASONS.includes(season) &&
        r.game_type === 'REG' &&
        r.home_score !== '' &&
        r.away_score !== ''
      )
    })
    .map((r) => ({
      gameId: r.game_id,
      season: Number(r.season),
      week: Number(r.week),
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      homeScore: Number(r.home_score),
      awayScore: Number(r.away_score),
      spreadLine: num(r.spread_line),
      homeRest: num(r.home_rest),
      awayRest: num(r.away_rest),
      weekday: r.weekday || null,
      gametime: r.gametime || null,
    }))

  console.log(`Parsed ${games.length} regular-season games`)

  const injuries: HistoricalInjuryReport[] = []
  const playerValues: PlayerValue[] = []

  console.log('Downloading players id map…')
  const pfrToGsis: Record<string, string> = {}
  try {
    const playersCsv = await fetchText(`${BASE}/players/players.csv`)
    for (const r of parseCsv(playersCsv)) {
      if (r.pfr_id && r.gsis_id) pfrToGsis[r.pfr_id] = r.gsis_id
    }
    console.log(`  ${Object.keys(pfrToGsis).length} pfr→gsis mappings`)
  } catch (e) {
    console.warn('Players map skipped:', e)
  }

  for (const season of SEASONS) {
    console.log(`Downloading injuries ${season}…`)
    try {
      const injCsv = await fetchText(`${BASE}/injuries/injuries_${season}.csv`)
      for (const r of parseCsv(injCsv)) {
        if (r.game_type && r.game_type !== 'REG') continue
        injuries.push({
          season,
          week: Number(r.week),
          team: r.team,
          playerId: r.gsis_id,
          playerName: r.full_name || `${r.first_name} ${r.last_name}`,
          position: r.position || '',
          reportStatus: (r.report_status || '').toLowerCase(),
        })
      }
    } catch (e) {
      console.warn(`Injuries ${season} skipped:`, e)
    }

    console.log(`Downloading player season stats ${season}…`)
    try {
      const statsCsv = await fetchText(
        `${BASE}/player_stats/player_stats_season_${season}.csv`,
      )
      const values = buildPlayerValuesFromSeasonRows(parseCsv(statsCsv), season)
      playerValues.push(...values)
      const olCount = values.filter((v) => v.position === 'OL').length
      console.log(`  ${values.length} valued skill/OL players (${olCount} OL)`)
    } catch (e) {
      console.warn(`Player stats ${season} skipped:`, e)
    }

    console.log(`Downloading defensive season stats ${season}…`)
    try {
      const defCsv = await fetchText(
        `${BASE}/player_stats/player_stats_def_season_${season}.csv`,
      )
      const defenders = buildDefenderValuesFromSeasonRows(parseCsv(defCsv), season)
      playerValues.push(...defenders)
      console.log(`  ${defenders.length} valued defenders`)
    } catch (e) {
      console.warn(`Def stats ${season} skipped:`, e)
    }

    console.log(`Downloading snap counts for OL ${season}…`)
    try {
      const snapCsv = await fetchText(
        `${BASE}/snap_counts/snap_counts_${season}.csv`,
      )
      const ol = buildOlValuesFromSnapRows(parseCsv(snapCsv), season, pfrToGsis)
      playerValues.push(...ol)
      console.log(`  ${ol.length} valued OL from snaps`)
    } catch (e) {
      console.warn(`Snap counts ${season} skipped:`, e)
    }
  }

  const injuryLostCache = new Map<string, number>()
  function valueLost(season: number, week: number, team: string): number {
    const key = `${season}-${week}-${team}`
    if (injuryLostCache.has(key)) return injuryLostCache.get(key)!
    const seasonValues = playerValues.filter((p) => p.season === season)
    const lost = computeInjuryDifferential(
      team,
      week,
      season,
      seasonValues,
      injuries,
      { useReplacementAddBack },
    )
    injuryLostCache.set(key, lost)
    return lost
  }

  let priorFinal: Record<string, TeamRating> = {}
  const ratingsBySeason: Record<
    number,
    {
      byWeek: Record<number, Record<string, number>>
      final: Record<string, TeamRating>
      seed: Record<string, number>
    }
  > = {}

  const predictions: GamePrediction[] = []

  for (const season of SEASONS) {
    const seasonGames = games.filter((g) => g.season === season)
    const seed =
      Object.keys(priorFinal).length > 0
        ? seedFromPriorSeason(priorFinal, 0.5)
        : {}

    console.log(`Processing ratings for ${season} (${seasonGames.length} games)…`)
    const { final, byWeek } = processSeasonRatings(
      seasonGames,
      seed,
      (s, w, team) => valueLost(s, w, team),
      hfa,
    )
    ratingsBySeason[season] = { byWeek, final, seed }
    priorFinal = final

    for (const game of seasonGames) {
      const homeR = ratingBeforeWeek(byWeek, game.week, game.homeTeam, seed)
      const awayR = ratingBeforeWeek(byWeek, game.week, game.awayTeam, seed)
      predictions.push(buildGamePrediction(game, homeR, awayR, hfa))
    }
  }

  // Compact stacks removed — Stack Finder uses scripts/ingest-stack-finder.ts

  await mkdir(OUT_DIR, { recursive: true })

  const ratingsCompact: Record<
    string,
    { seed: Record<string, number>; byWeek: Record<string, Record<string, number>> }
  > = {}
  for (const season of SEASONS) {
    const r = ratingsBySeason[season]
    ratingsCompact[String(season)] = {
      seed: roundMap(r.seed),
      byWeek: Object.fromEntries(
        Object.entries(r.byWeek).map(([w, m]) => [w, roundMap(m)]),
      ),
    }
  }

  const meta = {
    source: 'nflverse',
    seasons: SEASONS,
    generatedAt: new Date().toISOString(),
    notes: [
      'Score-based power ratings with formula injury differentials.',
      'Game factors at prediction time: rest days + primetime only (simplified subset).',
      'spread_line from nflverse is home-perspective historical closing line when present.',
      'Not a claim of market-beating predictive edge — demo of mechanism transparency.',
    ],
    gameCount: games.length,
    predictionCount: predictions.length,
    injuryReportCount: injuries.length,
    playerValueCount: playerValues.length,
  }

  // Round prediction numbers for smaller JSON
  const predictionsOut = predictions.map((p) => ({
    ...p,
    homeRating: round(p.homeRating),
    awayRating: round(p.awayRating),
    modelSpread: round(p.modelSpread),
    postedSpread:
      p.postedSpread == null ? null : round(p.postedSpread),
    restAdjustment: round(p.restAdjustment),
    primetimeAdjustment: round(p.primetimeAdjustment),
    starRating: {
      ...p.starRating,
      differentialPct: round(p.starRating.differentialPct),
    },
  }))

  await writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2))
  await writeFile(
    path.join(OUT_DIR, 'games.json'),
    JSON.stringify(
      games.map((g) => ({
        ...g,
        spreadLine: g.spreadLine == null ? null : round(g.spreadLine),
      })),
    ),
  )
  await writeFile(
    path.join(OUT_DIR, 'ratings.json'),
    JSON.stringify(ratingsCompact),
  )
  await writeFile(
    path.join(OUT_DIR, 'predictions.json'),
    JSON.stringify(predictionsOut),
  )
  await writeFile(
    path.join(OUT_DIR, 'player-values.json'),
    JSON.stringify(
      playerValues.map((p) => ({
        ...p,
        baseValue: round(p.baseValue),
      })),
    ),
  )

  console.log(`Wrote fixtures to ${OUT_DIR}`)
  console.log(
    `Playable predictions: ${predictions.filter((p) => p.starRating.playable).length}`,
  )

  // Spot-check: injury differentials should be non-zero for some OL/def "out" weeks
  let olDefHits = 0
  let olHits = 0
  const olDefIds = new Set(
    playerValues
      .filter((p) => p.position === 'OL' || p.position === 'DL' || p.position === 'LB' || p.position === 'DB')
      .map((p) => p.playerId),
  )
  const olIds = new Set(
    playerValues.filter((p) => p.position === 'OL').map((p) => p.playerId),
  )
  for (const inj of injuries) {
    if (!['out', 'doubtful'].includes(inj.reportStatus)) continue
    if (!olDefIds.has(inj.playerId)) continue
    const lost = valueLost(inj.season, inj.week, inj.team)
    if (lost > 0) {
      olDefHits += 1
      if (olIds.has(inj.playerId)) {
        olHits += 1
        if (olHits <= 3) {
          console.log(
            `  OL injury spot-check: ${inj.playerName} (${inj.position}) ${inj.team} W${inj.week} ${inj.season} → team lost ${lost.toFixed(2)}`,
          )
        }
      } else if (olDefHits <= 3) {
        console.log(
          `  injury spot-check: ${inj.playerName} (${inj.position}) ${inj.team} W${inj.week} ${inj.season} → team lost ${lost.toFixed(2)}`,
        )
      }
    }
  }
  console.log(`OL/def injury differentials with value > 0: ${olDefHits} (OL-matched: ${olHits})`)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function roundMap(m: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(m)) out[k] = round(v)
  return out
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
