/**
 * Ingest nflverse weekly player stats → PropSeries → correlation stacks.
 * Writes src/data/nfl/stack-series.json and src/data/nfl/correlation-stacks.json
 *
 * Usage: npx tsx scripts/ingest-stack-finder.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildStackCandidates,
  type PropSeries,
  type PropType,
} from '../src/lib/correlation.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')
const SEASONS = [2022, 2023, 2024]
const BASE =
  'https://github.com/nflverse/nflverse-data/releases/download/player_stats'

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`)
  return res.text()
}

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

interface WeeklyLog {
  playerId: string
  playerName: string
  team: string
  position: string
  season: number
  week: number
  gameId: string
  passYds: number
  passAtt: number
  recYds: number
  targets: number
  rushYds: number
  carries: number
}

function buildSeries(logs: WeeklyLog[]): PropSeries[] {
  // Group by playerId + team + propType so trades don't mix across teams
  type Acc = {
    playerId: string
    playerName: string
    team: string
    propType: PropType
    points: Array<{ gameId: string; value: number; season: number; week: number }>
  }
  const map = new Map<string, Acc>()

  function push(
    log: WeeklyLog,
    propType: PropType,
    value: number,
    minActivity: boolean,
  ) {
    if (!minActivity) return
    const key = `${log.playerId}:${log.team}:${propType}`
    let acc = map.get(key)
    if (!acc) {
      acc = {
        playerId: log.playerId,
        playerName: log.playerName,
        team: log.team,
        propType,
        points: [],
      }
      map.set(key, acc)
    }
    acc.playerName = log.playerName
    acc.points.push({
      gameId: log.gameId,
      value,
      season: log.season,
      week: log.week,
    })
  }

  for (const log of logs) {
    const pos = log.position.toUpperCase()
    if (pos === 'QB') {
      push(log, 'pass_yds', log.passYds, log.passAtt >= 10)
      push(log, 'pass_att', log.passAtt, log.passAtt >= 10)
      push(log, 'rush_yds', log.rushYds, log.carries >= 1 || log.rushYds !== 0)
    }
    if (pos === 'WR' || pos === 'TE') {
      push(log, 'rec_yds', log.recYds, log.targets >= 2)
      push(log, 'targets', log.targets, log.targets >= 2)
    }
    if (pos === 'RB') {
      push(log, 'rush_yds', log.rushYds, log.carries >= 5)
      push(log, 'rec_yds', log.recYds, log.targets >= 2)
      push(log, 'targets', log.targets, log.targets >= 2)
    }
  }

  const series: PropSeries[] = []
  for (const acc of map.values()) {
    acc.points.sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.week - b.week,
    )
    // Keep players with enough games to possibly clear the 20-game pair gate
    if (acc.points.length < 12) continue
    series.push({
      playerId: acc.playerId,
      playerName: acc.playerName,
      team: acc.team,
      propType: acc.propType,
      values: acc.points.map((p) => p.value),
      gameIds: acc.points.map((p) => p.gameId),
    })
  }
  return series
}

async function main() {
  const logs: WeeklyLog[] = []

  for (const season of SEASONS) {
    console.log(`Downloading player_stats_${season}.csv…`)
    const csv = await fetchText(`${BASE}/player_stats_${season}.csv`)
    const rows = parseCsv(csv)
    let n = 0
    for (const r of rows) {
      if (r.season_type && r.season_type !== 'REG') continue
      const week = Number(r.week)
      if (!Number.isFinite(week) || week < 1) continue
      const playerId = r.player_id
      const team = r.recent_team
      if (!playerId || !team) continue

      logs.push({
        playerId,
        playerName: r.player_display_name || r.player_name || playerId,
        team,
        position: r.position || '',
        season: Number(r.season) || season,
        week,
        gameId: `${r.season}_${String(week).padStart(2, '0')}_${team}_${r.opponent_team || 'UNK'}`,
        passYds: Number(r.passing_yards) || 0,
        passAtt: Number(r.attempts) || 0,
        recYds: Number(r.receiving_yards) || 0,
        targets: Number(r.targets) || 0,
        rushYds: Number(r.rushing_yards) || 0,
        carries: Number(r.carries) || 0,
      })
      n++
    }
    console.log(`  ${n} REG weekly rows`)
  }

  console.log('Building prop series…')
  const series = buildSeries(logs)
  console.log(`  ${series.length} player-prop series`)

  console.log('Computing stack candidates (min 20 shared games)…')
  const stacks = buildStackCandidates(series, 20)
    .filter((s) => {
      // Demo quality: keep pairs with a real relationship signal
      if (Math.abs(s.correlation) < 0.25) return false
      // Prefer classic stack shapes; still allow rush/target competition
      return true
    })
    .sort((a, b) => {
      // Headline sort: joint hit-rate, then |r|
      if (b.jointHitRate.rate !== a.jointHitRate.rate) {
        return b.jointHitRate.rate - a.jointHitRate.rate
      }
      return Math.abs(b.correlation) - Math.abs(a.correlation)
    })
  console.log(`  ${stacks.length} stacks after quality filter`)

  // Trim chart series to last 24 shared games for payload size
  const stacksOut = stacks.slice(0, 120).map((s) => {
    const keep = Math.min(24, s.gameIds.length)
    const start = s.gameIds.length - keep
    return {
      ...s,
      correlation: round(s.correlation),
      lineA: round(s.lineA),
      lineB: round(s.lineB),
      jointHitRate: {
        ...s.jointHitRate,
        rate: round(s.jointHitRate.rate),
      },
      seriesA: s.seriesA.slice(start).map(round),
      seriesB: s.seriesB.slice(start).map(round),
      gameIds: s.gameIds.slice(start),
      lookbackGames: s.sampleSize,
      chartGames: keep,
    }
  })

  await mkdir(OUT_DIR, { recursive: true })

  const meta = {
    source: 'nflverse/player_stats weekly',
    seasons: SEASONS,
    generatedAt: new Date().toISOString(),
    minSampleSize: 20,
    stackCount: stacksOut.length,
    notes: [
      'Illustrative lines = rolling averages of each prop series — not live pick\'em odds.',
      'Equal-weight correlation across seasons; recency weighting is a labeled v2 item.',
      'Pairs require ≥20 shared games.',
    ],
  }

  await writeFile(
    path.join(OUT_DIR, 'correlation-stacks.json'),
    JSON.stringify(stacksOut),
  )
  await writeFile(
    path.join(OUT_DIR, 'stack-finder-meta.json'),
    JSON.stringify(meta, null, 2),
  )

  // Compact series index for debugging / future client recompute (optional, capped)
  await writeFile(
    path.join(OUT_DIR, 'stack-series-index.json'),
    JSON.stringify({
      count: series.length,
      players: series.slice(0, 50).map((s) => ({
        playerId: s.playerId,
        playerName: s.playerName,
        team: s.team,
        propType: s.propType,
        games: s.gameIds.length,
      })),
    }),
  )

  console.log(`Wrote ${stacksOut.length} stacks to ${OUT_DIR}`)
  if (stacksOut[0]) {
    console.log(
      'Top stack:',
      stacksOut[0].playerA.name,
      stacksOut[0].playerA.propType,
      '↔',
      stacksOut[0].playerB.name,
      stacksOut[0].playerB.propType,
      `hit ${(stacksOut[0].jointHitRate.rate * 100).toFixed(0)}%`,
      `r=${stacksOut[0].correlation}`,
    )
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
