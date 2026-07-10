import { useEffect, useMemo } from 'react'
import { useTradeStore } from '@/store/useTradeStore'
import { filterTrades, sortByEdgeDesc } from '@/lib/trades'
import { TradeCard } from '@/components/trade-card/TradeCard'
import { FeedFilters } from '@/components/feed/FeedFilters'
import { TradeCardSkeleton } from '@/components/ui/skeleton'
import { ShockBanner } from '@/components/shock/ShockBanner'

export function TradeFeed() {
  const loading = useTradeStore((s) => s.loading)
  const loadTrades = useTradeStore((s) => s.loadTrades)
  const trades = useTradeStore((s) => s.trades)
  const filters = useTradeStore((s) => s.filters)

  const visibleTrades = useMemo(
    () => sortByEdgeDesc(filterTrades(trades, filters)),
    [trades, filters],
  )

  useEffect(() => {
    void loadTrades()
  }, [loadTrades])

  return (
    <div>
      <ShockBanner />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Edge Terminal
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live edges sorted by edge % — we surface opportunities, not guarantees.
          </p>
        </header>

        <div className="mb-6">
          <FeedFilters />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <TradeCardSkeleton key={i} />
            ))}
          </div>
        ) : visibleTrades.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="text-sm text-slate-600">
              No edges found right now. Check back in 2 hours.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTrades.map((trade) => (
              <TradeCard key={trade.id} trade={trade} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
