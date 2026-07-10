/**
 * Ingest nflverse schedules + injuries + season player stats for seasons
 * 2022–2024, run power-rating updates with injury differentials, and write
 * compact JSON fixtures under src/data/nfl/ for the client demo.
 *
 * Usage: npx tsx scripts/ingest-nflverse.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  processSeasonRatings,
  seedFromPriorSeason,
  type GameResult,
  type TeamRating,
} from '../src/lib/powerRatings.ts'
import {
  buildPlayerValuesFromSeasonRows,
  computeInjuryDifferential,
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
const SEASONS = [2022, 2023, 2024]

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
      console.log(`  ${values.length} valued skill players`)
    } catch (e) {
      console.warn(`Player stats ${season} skipped:`, e)
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
    )
    ratingsBySeason[season] = { byWeek, final, seed }
    priorFinal = final

    for (const game of seasonGames) {
      const homeR = ratingBeforeWeek(byWeek, game.week, game.homeTeam, seed)
      const awayR = ratingBeforeWeek(byWeek, game.week, game.awayTeam, seed)
      predictions.push(buildGamePrediction(game, homeR, awayR))
    }
  }

  // Compact stacks: pick high-star games and invent correlated prop pairs
  const playable = predictions
    .filter((p) => p.starRating.playable && p.starRating.stars >= 1.5)
    .sort((a, b) => b.starRating.stars - a.starRating.stars)
    .slice(0, 24)

  const stacks = playable.map((p, i) => {
    const side = p.modelSpread >= 0 ? p.homeTeam : p.awayTeam
    return {
      id: `stack-${p.gameId}-${i}`,
      gameId: p.gameId,
      season: p.season,
      week: p.week,
      matchup: `${p.awayTeam} @ ${p.homeTeam}`,
      legs: [
        {
          player: `${side} skill player A`,
          prop: 'Anytime TD',
          bookImplied: 0.42,
          fairValue: 0.51,
        },
        {
          player: `${side} skill player B`,
          prop: 'Receiving yards over',
          bookImplied: 0.48,
          fairValue: 0.55,
        },
      ],
      correlation: 0.35 + (i % 5) * 0.03,
      combinedEdge: 0.06 + (i % 4) * 0.015,
      highConfidenceGame: p.starRating.stars >= 2.0,
      gameStars: p.starRating.stars,
    }
  })

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
  await writeFile(path.join(OUT_DIR, 'stacks.json'), JSON.stringify(stacks, null, 2))
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
