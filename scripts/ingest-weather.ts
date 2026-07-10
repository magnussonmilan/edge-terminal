/**
 * Fetch weather for outdoor home stadiums for a set of games.
 *
 * Usage:
 *   npm run ingest:weather -- --dry-run-season=2025 --dry-run-week=17
 *   npm run ingest:weather
 *
 * Without dry-run, expects src/data/nfl/current-week-schedule.json
 * (written by ingest:odds / weekly workflow). Fails loudly if missing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getStadium, isOutdoorStadium } from '../src/lib/stadiums.ts'
import { getGameWeather, type GameWeather } from '../src/lib/weather.ts'
import { parseCsv } from '../src/lib/csv.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')
const BASE = 'https://github.com/nflverse/nflverse-data/releases/download'

export interface WeatherByGame {
  gameId: string
  homeTeam: string
  awayTeam: string
  gameTime: string
  outdoor: boolean
  weather: GameWeather | null
}

function parseArgs(argv: string[]) {
  let dryRunSeason: number | null = null
  let dryRunWeek: number | null = null
  for (const arg of argv) {
    const s = arg.match(/^--dry-run-season=(\d+)$/)
    if (s) dryRunSeason = Number(s[1])
    const w = arg.match(/^--dry-run-week=(\d+)$/)
    if (w) dryRunWeek = Number(w[1])
  }
  if ((dryRunSeason == null) !== (dryRunWeek == null)) {
    throw new Error('Dry-run requires both --dry-run-season and --dry-run-week')
  }
  return { dryRunSeason, dryRunWeek }
}

async function loadDryRunGames(season: number, week: number) {
  const res = await fetch(`${BASE}/schedules/games.csv`)
  if (!res.ok) throw new Error(`Failed schedules fetch: ${res.status}`)
  const rows = parseCsv(await res.text())
  return rows
    .filter(
      (r) =>
        Number(r.season) === season &&
        Number(r.week) === week &&
        r.game_type === 'REG',
    )
    .map((r) => ({
      gameId: r.game_id,
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      gameTime: r.gameday
        ? `${r.gameday}T${(r.gametime || '13:00').padStart(5, '0')}:00Z`
        : new Date().toISOString(),
    }))
}

async function main() {
  const { dryRunSeason, dryRunWeek } = parseArgs(process.argv.slice(2))
  let games: Array<{
    gameId: string
    homeTeam: string
    awayTeam: string
    gameTime: string
  }>

  if (dryRunSeason != null && dryRunWeek != null) {
    console.log(`Dry-run weather: ${dryRunSeason} week ${dryRunWeek}`)
    games = await loadDryRunGames(dryRunSeason, dryRunWeek)
  } else {
    const schedulePath = path.join(OUT_DIR, 'current-week-schedule.json')
    try {
      const raw = await readFile(schedulePath, 'utf8')
      const parsed = JSON.parse(raw) as { games?: typeof games }
      if (!parsed.games?.length) {
        console.error('current-week-schedule.json has no games — failing loudly')
        process.exit(1)
      }
      games = parsed.games
    } catch {
      console.error(
        'No current-week-schedule.json — run ingest:odds first, or use --dry-run-season/--dry-run-week',
      )
      process.exit(1)
    }
  }

  if (games.length === 0) {
    console.error('No games to fetch weather for — failing loudly')
    process.exit(1)
  }

  const results: WeatherByGame[] = []
  for (const g of games) {
    const outdoor = isOutdoorStadium(g.homeTeam)
    if (!outdoor) {
      results.push({
        gameId: g.gameId,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        gameTime: g.gameTime,
        outdoor: false,
        weather: null,
      })
      continue
    }
    const stadium = getStadium(g.homeTeam)
    if (!stadium) {
      console.error(`Missing stadium for ${g.homeTeam} — failing loudly`)
      process.exit(1)
    }
    try {
      const weather = await getGameWeather(
        stadium.lat,
        stadium.lon,
        new Date(g.gameTime),
      )
      results.push({
        gameId: g.gameId,
        homeTeam: g.homeTeam,
        awayTeam: g.awayTeam,
        gameTime: g.gameTime,
        outdoor: true,
        weather,
      })
      console.log(
        `  ${g.gameId}: ${weather.tempF ?? '—'}°F, wind ${weather.windMph ?? '—'} mph, ${weather.shortForecast}`,
      )
    } catch (err) {
      console.error(`Weather fetch failed for ${g.gameId}:`, err)
      process.exit(1)
    }
  }

  await mkdir(OUT_DIR, { recursive: true })
  const outPath = path.join(OUT_DIR, 'current-week-weather.json')
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun: dryRunSeason != null,
        season: dryRunSeason,
        week: dryRunWeek,
        games: results,
      },
      null,
      2,
    ),
  )
  console.log(`Wrote weather for ${results.length} games → ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
