/**
 * Build live MLB Elo fixtures: Neil Paine 2025-05-09 seed → Stats API backfill
 * through end of 2025 → offseason regress → 2026 roll + upcoming predictions.
 *
 * Usage: npm run build:mlb-live
 *
 * Copyright (c) 2024 Neil Paine — seed from games-recent.json (MIT).
 * Results: MLB Stats API — see mlbStatsApi.ts terms note.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MlbEloGame } from '../src/lib/mlbTypes.ts'
import {
  MLB_STATS_API_COPYRIGHT_NOTE,
  fetchMlbScheduleRange,
  type MlbGameResult,
} from '../src/lib/mlbStatsApi.ts'
import {
  MLB_ELO_HOME_ADV,
  MLB_ELO_K,
  MLB_ELO_MEAN,
  MLB_OFFSEASON_RETAIN,
  backfillThrough2025Season,
  predictUpcomingGames,
  rollRatingsForward,
  seedMlb2026FromPriorSeason,
  type MlbSeedState,
} from '../src/lib/mlbEloLive.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/mlb/live')
const RECENT_PATH = path.join(__dirname, '../src/data/mlb/games-recent.json')

const SEED_AS_OF = '2025-05-09'
const BACKFILL_START = '2025-05-10'
const BACKFILL_END = '2025-09-28' // last regular-season day observed in Stats API

function extractSeedFromNeilPaine(games: MlbEloGame[]): MlbSeedState[] {
  // Last settled post-game Elo per team on or before SEED_AS_OF
  const last: Record<string, { elo: number; date: string }> = {}
  const settled = games
    .filter(
      (g) =>
        g.score1 != null &&
        g.score2 != null &&
        g.elo1Post != null &&
        g.elo2Post != null &&
        g.date <= SEED_AS_OF,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId))

  for (const g of settled) {
    last[g.homeTeam] = { elo: g.elo1Post!, date: g.date }
    last[g.awayTeam] = { elo: g.elo2Post!, date: g.date }
  }

  return Object.entries(last)
    .map(([team, v]) => ({
      team,
      eloRating: v.elo,
      asOfDate: SEED_AS_OF,
    }))
    .sort((a, b) => a.team.localeCompare(b.team))
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const recent = JSON.parse(await readFile(RECENT_PATH, 'utf8')) as {
    games: MlbEloGame[]
  }
  const seedMay = extractSeedFromNeilPaine(recent.games)
  if (seedMay.length < 30) {
    console.warn(
      `Warning: only ${seedMay.length} teams in May 2025 seed (expected 30).`,
    )
  }

  console.log('Fetching 2025 backfill from MLB Stats API…')
  const results2025 = await fetchMlbScheduleRange(BACKFILL_START, BACKFILL_END, {
    gameTypes: ['R'],
    settledOnly: true,
  })
  console.log(`  settled R games ${BACKFILL_START}→${BACKFILL_END}: ${results2025.length}`)

  const endOf2025 = backfillThrough2025Season(seedMay, results2025)
  const seed2026 = seedMlb2026FromPriorSeason(endOf2025)

  const today = new Date()
  const todayIso = today.toISOString().slice(0, 10)
  // 2026 regular season roughly Mar 20 – Sep 28; fetch from opening through +7d
  const season2026Start = '2026-03-20'
  const upcomingEnd = new Date(today)
  upcomingEnd.setUTCDate(upcomingEnd.getUTCDate() + 7)
  const upcomingEndIso = upcomingEnd.toISOString().slice(0, 10)

  console.log('Fetching 2026 schedule/results from MLB Stats API…')
  const schedule2026 = await fetchMlbScheduleRange(
    season2026Start,
    upcomingEndIso,
    { gameTypes: ['R'] },
  )
  const settled2026 = schedule2026.filter(
    (g) =>
      g.abstractGameState === 'Final' &&
      Number.isFinite(g.homeScore) &&
      Number.isFinite(g.awayScore),
  )
  const upcoming2026 = schedule2026.filter(
    (g) => g.abstractGameState !== 'Final' && g.gameDate >= todayIso,
  )
  console.log(
    `  2026 settled: ${settled2026.length}; upcoming (from ${todayIso}): ${upcoming2026.length}`,
  )

  const rolled = rollRatingsForward(seed2026, settled2026)
  const predictions = predictUpcomingGames(rolled.ratings, upcoming2026)

  const meta = {
    attributionNeilPaine:
      'Copyright (c) 2024 Neil Paine. Seed Elo from mlb-elo-latest.csv (MIT).',
    mlbStatsApi: MLB_STATS_API_COPYRIGHT_NOTE,
    methodology: {
      homeAdvantage: MLB_ELO_HOME_ADV,
      k: MLB_ELO_K,
      leagueMean: MLB_ELO_MEAN,
      offseasonRetain: MLB_OFFSEASON_RETAIN,
      note:
        'K=4 constant Elo update approximates Neil Paine post-game ratings; not bit-identical MOV scaling.',
    },
    seedAsOf: SEED_AS_OF,
    backfill: {
      start: BACKFILL_START,
      end: BACKFILL_END,
      settledGameCount: results2025.length,
    },
    live: {
      season: 2026,
      ratingsAsOf: rolled.asOfDate,
      settled2026Count: settled2026.length,
      upcomingCount: predictions.length,
      generatedAt: new Date().toISOString(),
    },
    honesty:
      'Neil Paine feed frozen for settled results at 2025-05-09; rows after that in the CSV are unsettled placeholders and were not used as results. Gap filled via MLB Stats API. Commercial use of Stats API data may require MLBAM authorization.',
  }

  await writeFile(
    path.join(OUT_DIR, 'meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
  )
  await writeFile(
    path.join(OUT_DIR, 'seed-2025-05-09.json'),
    JSON.stringify({ asOf: SEED_AS_OF, teams: seedMay }, null, 2) + '\n',
  )
  await writeFile(
    path.join(OUT_DIR, 'end-of-2025.json'),
    JSON.stringify({ teams: endOf2025 }, null, 2) + '\n',
  )
  await writeFile(
    path.join(OUT_DIR, 'seed-2026.json'),
    JSON.stringify({ teams: seed2026 }, null, 2) + '\n',
  )
  await writeFile(
    path.join(OUT_DIR, 'ratings-current.json'),
    JSON.stringify(
      {
        asOfDate: rolled.asOfDate,
        ratings: rolled.ratings,
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile(
    path.join(OUT_DIR, 'predictions-upcoming.json'),
    JSON.stringify(
      {
        generatedAt: meta.live.generatedAt,
        asOfDate: rolled.asOfDate,
        games: predictions,
      },
      null,
      2,
    ) + '\n',
  )

  // Keep a compact settled sample for adapter/tests (last 14 days of 2026)
  const recentSettled = settled2026.filter((g) => {
    const d = new Date(`${g.gameDate}T12:00:00Z`)
    const cutoff = new Date(today)
    cutoff.setUTCDate(cutoff.getUTCDate() - 14)
    return d >= cutoff
  })
  await writeFile(
    path.join(OUT_DIR, 'results-recent.json'),
    JSON.stringify({ games: recentSettled as MlbGameResult[] }, null, 2) + '\n',
  )

  console.log('Wrote', OUT_DIR)
  console.log(
    `Predictions: ${predictions.length} upcoming; ratings as of ${rolled.asOfDate}`,
  )
  if (predictions[0]) {
    const p = predictions[0]
    console.log(
      `Sample: ${p.awayTeam}@${p.homeTeam} ${p.date} P(home)=${p.modelHomeWinProb.toFixed(3)}`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
