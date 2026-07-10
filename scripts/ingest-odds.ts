/**
 * Fetch live NFL spreads from The Odds API and write static JSON for the SPA.
 *
 * Requires ODDS_API_KEY in the environment. Fails loudly if unset or empty response.
 *
 * Pricing reminder: see comment in src/lib/oddsFeed.ts — spreads×us ≈ 1 credit/call.
 *
 * Usage: ODDS_API_KEY=... npm run ingest:odds
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchNflOdds,
  oddsSnapshotsToTrades,
  bestHomeSpread,
  bestAwaySpread,
} from '../src/lib/oddsFeed.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')

async function main() {
  if (!process.env.ODDS_API_KEY) {
    console.error(
      'ODDS_API_KEY is unset — failing loudly (no silent mock write)',
    )
    process.exit(1)
  }

  const snapshots = await fetchNflOdds()
  if (snapshots.length === 0) {
    console.log(
      'No NFL events from The Odds API (off-season or empty slate) — nothing to write',
    )
    process.exit(0)
  }

  const trades = oddsSnapshotsToTrades(snapshots)
  const scheduleGames = snapshots.map((s) => ({
    gameId: s.id,
    homeTeam: abbreviateTeam(s.homeTeam),
    awayTeam: abbreviateTeam(s.awayTeam),
    homeTeamFull: s.homeTeam,
    awayTeamFull: s.awayTeam,
    gameTime: s.commenceTime,
  }))

  await mkdir(OUT_DIR, { recursive: true })

  await writeFile(
    path.join(OUT_DIR, 'current-odds.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'the-odds-api',
        snapshotCount: snapshots.length,
        snapshots,
        trades,
        bestLines: snapshots.map((s) => ({
          id: s.id,
          home: bestHomeSpread(s),
          away: bestAwaySpread(s),
        })),
      },
      null,
      2,
    ),
  )

  await writeFile(
    path.join(OUT_DIR, 'current-week-schedule.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        games: scheduleGames,
      },
      null,
      2,
    ),
  )

  console.log(
    `Wrote ${snapshots.length} odds events + schedule → src/data/nfl/current-odds.json`,
  )
}

/** Best-effort map full Odds API names → nflverse abbreviations for weather join. */
function abbreviateTeam(full: string): string {
  const map: Record<string, string> = {
    'Arizona Cardinals': 'ARI',
    'Atlanta Falcons': 'ATL',
    'Baltimore Ravens': 'BAL',
    'Buffalo Bills': 'BUF',
    'Carolina Panthers': 'CAR',
    'Chicago Bears': 'CHI',
    'Cincinnati Bengals': 'CIN',
    'Cleveland Browns': 'CLE',
    'Dallas Cowboys': 'DAL',
    'Denver Broncos': 'DEN',
    'Detroit Lions': 'DET',
    'Green Bay Packers': 'GB',
    'Houston Texans': 'HOU',
    'Indianapolis Colts': 'IND',
    'Jacksonville Jaguars': 'JAX',
    'Kansas City Chiefs': 'KC',
    'Las Vegas Raiders': 'LV',
    'Los Angeles Chargers': 'LAC',
    'Los Angeles Rams': 'LA',
    'Miami Dolphins': 'MIA',
    'Minnesota Vikings': 'MIN',
    'New England Patriots': 'NE',
    'New Orleans Saints': 'NO',
    'New York Giants': 'NYG',
    'New York Jets': 'NYJ',
    'Philadelphia Eagles': 'PHI',
    'Pittsburgh Steelers': 'PIT',
    'San Francisco 49ers': 'SF',
    'Seattle Seahawks': 'SEA',
    'Tampa Bay Buccaneers': 'TB',
    'Tennessee Titans': 'TEN',
    'Washington Commanders': 'WAS',
  }
  return map[full] ?? full
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
