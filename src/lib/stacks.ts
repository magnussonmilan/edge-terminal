/**
 * Stack data layer — mirrors lib/trades.ts.
 * Reads ingested correlation fixtures and joins power-rating predictions
 * for the cross-model high-confidence badge.
 */
import type { Stack } from '@/types/stack'
import type { GamePrediction } from '@/lib/predictions'
import stacksData from '@/data/nfl/correlation-stacks.json'
import metaData from '@/data/nfl/stack-finder-meta.json'
import predictionsData from '@/data/nfl/predictions.json'

export const STACK_FINDER_META = metaData as {
  source: string
  seasons: number[]
  generatedAt: string
  minSampleSize: number
  stackCount: number
  notes: string[]
}

export const FREE_STACK_LIMIT = 3

type RawStack = Omit<Stack, 'highConfidenceGame' | 'gameStars'>

const RAW_STACKS = stacksData as RawStack[]
const PREDICTIONS = predictionsData as GamePrediction[]

/** Index predictions by season-week-team pair for clean joins (not string guessing). */
const PRED_BY_MATCHUP = buildPredictionIndex(PREDICTIONS)

function buildPredictionIndex(preds: GamePrediction[]) {
  const map = new Map<string, GamePrediction>()
  for (const p of preds) {
    const a = `${p.season}_${p.week}_${p.awayTeam}_${p.homeTeam}`
    const b = `${p.season}_${p.week}_${p.homeTeam}_${p.awayTeam}`
    map.set(a, p)
    map.set(b, p)
  }
  return map
}

/**
 * Stack gameIds are `${season}_${week}_${team}_${opponent}` from ingest.
 * Join against predictions via season/week + both team codes.
 */
export function predictionForStackGameId(gameId: string): GamePrediction | null {
  const parts = gameId.split('_')
  if (parts.length < 4) return null
  const season = parts[0]
  const week = String(Number(parts[1])) // normalize 01 → 1 for key? predictions use numeric week
  const team = parts[2]
  const opp = parts[3]
  // Try both orderings with zero-padded and bare week
  const weekNum = Number(week)
  const weekPad = String(weekNum).padStart(2, '0')
  const keys = [
    `${season}_${weekNum}_${team}_${opp}`,
    `${season}_${weekNum}_${opp}_${team}`,
    `${season}_${weekPad}_${team}_${opp}`,
    `${season}_${weekPad}_${opp}_${team}`,
  ]
  for (const k of keys) {
    // Predictions keyed as season_week_away_home with numeric week from JSON
    const hit = PRED_BY_MATCHUP.get(k)
    if (hit) return hit
  }
  // Direct scan fallback using parsed fields
  return (
    PREDICTIONS.find(
      (p) =>
        p.season === Number(season) &&
        p.week === weekNum &&
        ((p.homeTeam === team && p.awayTeam === opp) ||
          (p.homeTeam === opp && p.awayTeam === team)),
    ) ?? null
  )
}

function attachGameContext(stack: RawStack): Stack {
  const recentId = stack.gameIds[stack.gameIds.length - 1]
  const pred = recentId ? predictionForStackGameId(recentId) : null
  const gameStars = pred?.starRating.stars ?? 0
  return {
    ...stack,
    highConfidenceGame: gameStars >= 2.0,
    gameStars,
  }
}

export async function fetchStacks(): Promise<Stack[]> {
  await delay(350)
  return RAW_STACKS.map((s) => attachGameContext(cloneRaw(s)))
}

export async function fetchStackByKey(pairKey: string): Promise<Stack | null> {
  await delay(150)
  const stack = RAW_STACKS.find((s) => s.pairKey === pairKey)
  return stack ? attachGameContext(cloneRaw(stack)) : null
}

export function filterStacksByTeam(stacks: Stack[], team: string | 'all'): Stack[] {
  if (team === 'all') return stacks
  return stacks.filter(
    (s) => s.playerA.team === team || s.playerB.team === team,
  )
}

export function sortByJointHitRate(stacks: Stack[]): Stack[] {
  return [...stacks].sort((a, b) => {
    if (b.jointHitRate.rate !== a.jointHitRate.rate) {
      return b.jointHitRate.rate - a.jointHitRate.rate
    }
    return Math.abs(b.correlation) - Math.abs(a.correlation)
  })
}

export function listStackTeams(stacks: Stack[]): string[] {
  const teams = new Set<string>()
  for (const s of stacks) {
    teams.add(s.playerA.team)
    teams.add(s.playerB.team)
  }
  return [...teams].sort()
}

function cloneRaw(stack: RawStack): RawStack {
  return {
    ...stack,
    playerA: { ...stack.playerA },
    playerB: { ...stack.playerB },
    jointHitRate: { ...stack.jointHitRate },
    seriesA: [...stack.seriesA],
    seriesB: [...stack.seriesB],
    gameIds: [...stack.gameIds],
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
