import type { BetType, Trade, UserPortfolio } from '@/types/trade'
import { potentialReturn } from '@/lib/odds'

const BET_TYPES: BetType[] = ['moneyline', 'spread', 'prop', 'total']

/**
 * Derive portfolio metrics from trade placement history + current bankroll.
 * Settled placements drive ROI/streaks; open placed bets are excluded from ROI
 * until Phase 3 settlement.
 */
export function computePortfolio(
  trades: Trade[],
  bankroll: number,
  userId = 'mock-user-1',
): UserPortfolio {
  const settled = trades.filter(
    (t) =>
      t.userAction === 'placed' &&
      t.status === 'settled' &&
      t.placement?.result,
  )

  let totalRisked = 0
  let totalWins = 0

  const byType: Record<
    BetType,
    { risked: number; returned: number; wins: number; losses: number }
  > = {
    moneyline: { risked: 0, returned: 0, wins: 0, losses: 0 },
    spread: { risked: 0, returned: 0, wins: 0, losses: 0 },
    prop: { risked: 0, returned: 0, wins: 0, losses: 0 },
    total: { risked: 0, returned: 0, wins: 0, losses: 0 },
  }

  for (const trade of settled) {
    const p = trade.placement!
    totalRisked += p.stake
    const bucket = byType[trade.betType]
    bucket.risked += p.stake

    if (p.result === 'won') {
      const returned = potentialReturn(p.stake, p.odds)
      totalWins += returned
      bucket.returned += returned
      bucket.wins += 1
    } else {
      bucket.losses += 1
    }
  }

  const totalLosses = settled
    .filter((t) => t.placement?.result === 'lost')
    .reduce((sum, t) => sum + (t.placement?.stake ?? 0), 0)

  const roi = totalRisked > 0 ? (totalWins - totalRisked) / totalRisked : 0

  const yieldByBetType: UserPortfolio['yieldByBetType'] = {}
  for (const betType of BET_TYPES) {
    const bucket = byType[betType]
    const betsPlaced = bucket.wins + bucket.losses
    if (betsPlaced === 0) continue
    yieldByBetType[betType] = {
      betsPlaced,
      roi: bucket.risked > 0 ? (bucket.returned - bucket.risked) / bucket.risked : 0,
      winRate: bucket.wins / betsPlaced,
    }
  }

  const { winStreak, lossStreak } = computeStreaks(settled)

  return {
    userId,
    activeBankroll: bankroll,
    totalRisked,
    totalWins,
    totalLosses,
    roi,
    yieldByBetType,
    winStreak,
    lossStreak,
    lastUpdated: new Date(),
  }
}

export function countSettledResults(trades: Trade[]): {
  wins: number
  losses: number
  openPlaced: number
} {
  let wins = 0
  let losses = 0
  let openPlaced = 0
  for (const t of trades) {
    if (t.userAction !== 'placed' || !t.placement) continue
    if (t.status === 'active') openPlaced += 1
    else if (t.placement.result === 'won') wins += 1
    else if (t.placement.result === 'lost') losses += 1
  }
  return { wins, losses, openPlaced }
}

function computeStreaks(settled: Trade[]): { winStreak: number; lossStreak: number } {
  const ordered = [...settled].sort(
    (a, b) =>
      (b.placement?.placedAt.getTime() ?? 0) - (a.placement?.placedAt.getTime() ?? 0),
  )

  let winStreak = 0
  let lossStreak = 0
  if (ordered.length === 0) return { winStreak, lossStreak }

  const first = ordered[0].placement?.result
  if (first === 'won') {
    for (const t of ordered) {
      if (t.placement?.result === 'won') winStreak += 1
      else break
    }
  } else if (first === 'lost') {
    for (const t of ordered) {
      if (t.placement?.result === 'lost') lossStreak += 1
      else break
    }
  }

  return { winStreak, lossStreak }
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatUsdPrecise(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}
