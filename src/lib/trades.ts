import type { Trade, TradeFilters } from '@/types/trade'
import { MOCK_TRADES } from '@/mocks/trades'
import {
  fetchNflOdds,
  isOddsApiConfigured,
  oddsSnapshotsToTrades,
} from '@/lib/oddsFeed'
import currentOddsJson from '@/data/nfl/current-odds.json'

type CurrentOddsFile = {
  generatedAt?: string
  snapshots?: unknown[]
  trades?: Trade[]
}

const CURRENT_ODDS = currentOddsJson as unknown as CurrentOddsFile

/**
 * Data access layer for trades.
 * - ODDS_API_KEY / VITE_ODDS_API_KEY set → live The Odds API (fails loudly on error)
 * - else if ingest wrote current-odds.json with trades → use that
 * - else mocks (local demo without a key)
 */
export async function fetchTrades(): Promise<Trade[]> {
  if (isOddsApiConfigured()) {
    const snapshots = await fetchNflOdds()
    if (!snapshots.length) {
      throw new Error('The Odds API returned zero NFL events — refusing empty live feed')
    }
    return oddsSnapshotsToTrades(snapshots).map(cloneTrade)
  }

  if (CURRENT_ODDS.trades && CURRENT_ODDS.trades.length > 0) {
    await delay(200)
    return CURRENT_ODDS.trades.map((t) =>
      cloneTrade({
        ...t,
        createdAt: new Date(t.createdAt),
        expiresAt: new Date(t.expiresAt),
        books: Object.fromEntries(
          Object.entries(t.books).map(([name, book]) => [
            name,
            { ...book, lastUpdated: new Date(book.lastUpdated) },
          ]),
        ),
      }),
    )
  }

  await delay(450)
  return MOCK_TRADES.map(cloneTrade)
}

export async function fetchTradeById(id: string): Promise<Trade | null> {
  const trades = await fetchTrades()
  return trades.find((t) => t.id === id) ?? null
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
    bestLineHome: trade.bestLineHome ? { ...trade.bestLineHome } : undefined,
    bestLineAway: trade.bestLineAway ? { ...trade.bestLineAway } : undefined,
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
