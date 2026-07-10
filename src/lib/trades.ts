import type { Trade, TradeFilters } from '@/types/trade'
import { MOCK_TRADES } from '@/mocks/trades'

/**
 * Data access layer for trades.
 * Phase 1: reads from mocks. Swap the body of these functions for a real API later —
 * components should only call this module, never import mocks directly.
 */
export async function fetchTrades(): Promise<Trade[]> {
  // Simulate network latency for skeleton states
  await delay(450)
  return MOCK_TRADES.map(cloneTrade)
}

export async function fetchTradeById(id: string): Promise<Trade | null> {
  await delay(200)
  const trade = MOCK_TRADES.find((t) => t.id === id)
  return trade ? cloneTrade(trade) : null
}

export function filterTrades(trades: Trade[], filters: TradeFilters): Trade[] {
  return trades.filter((trade) => {
    if (filters.sport !== 'all' && trade.sport !== filters.sport) return false
    if (filters.betType !== 'all' && trade.betType !== filters.betType) return false
    if (filters.userAction !== 'all' && trade.userAction !== filters.userAction)
      return false
    return true
  })
}

export function sortByEdgeDesc(trades: Trade[]): Trade[] {
  return [...trades].sort((a, b) => b.edgePercentage - a.edgePercentage)
}

function cloneTrade(trade: Trade): Trade {
  return {
    ...trade,
    matchup: { ...trade.matchup },
    historicalData: {
      ...trade.historicalData,
      last10Games: trade.historicalData.last10Games.map((g) => ({ ...g })),
    },
    books: Object.fromEntries(
      Object.entries(trade.books).map(([name, book]) => [
        name,
        { ...book, lastUpdated: new Date(book.lastUpdated) },
      ]),
    ),
    createdAt: new Date(trade.createdAt),
    expiresAt: new Date(trade.expiresAt),
    placement: trade.placement
      ? {
          ...trade.placement,
          placedAt: new Date(trade.placement.placedAt),
        }
      : undefined,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
