import { create } from 'zustand'
import type {
  MockUser,
  ShockEvent,
  Trade,
  TradeFilters,
  TradePlacement,
  UserAction,
  UserTier,
} from '@/types/trade'
import { fetchTrades, filterTrades, sortByEdgeDesc } from '@/lib/trades'

const BANKROLL_KEY = 'edge-bankroll'

function loadBankroll(): number {
  const raw = localStorage.getItem(BANKROLL_KEY)
  const n = raw ? Number(raw) : 1250
  return Number.isFinite(n) && n > 0 ? n : 1250
}

interface TradeState {
  trades: Trade[]
  loading: boolean
  filters: TradeFilters
  expandedTradeId: string | null
  shock: ShockEvent | null
  user: MockUser
  bankroll: number
  loadTrades: () => Promise<void>
  setFilter: <K extends keyof TradeFilters>(key: K, value: TradeFilters[K]) => void
  setExpandedTradeId: (id: string | null) => void
  setUserAction: (id: string, action: UserAction) => void
  placeBet: (
    id: string,
    placement: Omit<TradePlacement, 'placedAt' | 'result'> & { placedAt?: Date },
  ) => void
  setBankroll: (amount: number) => void
  setTier: (tier: UserTier) => void
  triggerMockShock: () => void
  dismissShock: () => void
  getVisibleTrades: () => Trade[]
}

const defaultFilters: TradeFilters = {
  sport: 'all',
  betType: 'all',
  userAction: 'all',
  chartContext: 'all',
}

export const useTradeStore = create<TradeState>((set, get) => ({
  trades: [],
  loading: false,
  filters: defaultFilters,
  expandedTradeId: null,
  shock: null,
  bankroll: typeof window !== 'undefined' ? loadBankroll() : 1250,
  user: {
    id: 'mock-user-1',
    email: 'trader@edge.terminal',
    tier: 'free',
  },

  loadTrades: async () => {
    set({ loading: true })
    try {
      const trades = await fetchTrades()
      set({ trades, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  setFilter: (key, value) => {
    set((state) => ({
      filters: { ...state.filters, [key]: value },
    }))
  },

  setExpandedTradeId: (id) => set({ expandedTradeId: id }),

  setUserAction: (id, action) => {
    set((state) => ({
      trades: state.trades.map((t) => {
        if (t.id !== id) return t
        if (action === 'ignored') {
          return { ...t, userAction: action, placement: undefined }
        }
        return { ...t, userAction: action }
      }),
    }))
  },

  placeBet: (id, placement) => {
    set((state) => ({
      trades: state.trades.map((t) =>
        t.id === id
          ? {
              ...t,
              userAction: 'placed' as const,
              // Stay active until event time — settlement is Phase 3
              status: t.status === 'settled' ? t.status : 'active',
              placement: {
                bookName: placement.bookName,
                odds: placement.odds,
                stake: placement.stake,
                placedAt: placement.placedAt ?? new Date(),
              },
            }
          : t,
      ),
    }))
    console.log('[Edge Terminal] Bet placed (mock)', { id, placement })
  },

  setBankroll: (amount) => {
    const next = Math.max(0, amount)
    localStorage.setItem(BANKROLL_KEY, String(next))
    set({ bankroll: next })
  },

  setTier: (tier) => {
    set((state) => ({
      user: { ...state.user, tier },
      filters:
        tier === 'free'
          ? { ...state.filters, chartContext: 'all' }
          : state.filters,
    }))
  },

  triggerMockShock: () => {
    const { trades } = get()
    const trade = trades[0] ?? null
    if (!trade) return

    const from = trade.bookImpliedProbability
    const to = Math.min(0.95, from + 0.08)
    set({
      shock: {
        id: `shock-${Date.now()}`,
        event: `${trade.matchup.away} @ ${trade.matchup.home}`,
        prop: trade.proposition,
        fromProbability: from,
        toProbability: to,
        delta: to - from,
        tradeId: trade.id,
      },
    })
  },

  dismissShock: () => set({ shock: null }),

  getVisibleTrades: () => {
    const { trades, filters } = get()
    return sortByEdgeDesc(filterTrades(trades, filters))
  },
}))
