/**
 * Stack data layer — mirrors lib/trades.ts.
 * Phase demo: reads ingested nflverse correlation fixtures.
 * Swap the body of fetchStacks() later without touching components.
 */
import type { Stack } from '@/types/stack'
import stacksData from '@/data/nfl/correlation-stacks.json'
import metaData from '@/data/nfl/stack-finder-meta.json'

export const STACK_FINDER_META = metaData as {
  source: string
  seasons: number[]
  generatedAt: string
  minSampleSize: number
  stackCount: number
  notes: string[]
}

export const FREE_STACK_LIMIT = 3

const ALL_STACKS = stacksData as Stack[]

export async function fetchStacks(): Promise<Stack[]> {
  await delay(350)
  return ALL_STACKS.map(cloneStack)
}

export async function fetchStackByKey(pairKey: string): Promise<Stack | null> {
  await delay(150)
  const stack = ALL_STACKS.find((s) => s.pairKey === pairKey)
  return stack ? cloneStack(stack) : null
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

function cloneStack(stack: Stack): Stack {
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
