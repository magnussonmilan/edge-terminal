import { ChevronDown } from 'lucide-react'
import type { Trade } from '@/types/trade'
import { cn, formatEdge, formatPct } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { TradeCardExpanded } from './TradeCardExpanded'
import { useTradeStore } from '@/store/useTradeStore'

const SPORT_COLORS: Record<Trade['sport'], string> = {
  nba: 'bg-orange-100 text-orange-800',
  nfl: 'bg-green-100 text-green-800',
  mlb: 'bg-red-100 text-red-800',
  nhl: 'bg-blue-100 text-blue-800',
}

interface TradeCardProps {
  trade: Trade
}

export function TradeCard({ trade }: TradeCardProps) {
  const expandedTradeId = useTradeStore((s) => s.expandedTradeId)
  const setExpandedTradeId = useTradeStore((s) => s.setExpandedTradeId)
  const expanded = expandedTradeId === trade.id
  const positiveEdge = trade.edgePercentage >= 0.05

  return (
    <article
      className={cn(
        'rounded-lg border bg-white text-left shadow-sm transition-all duration-300 ease-out',
        trade.userAction === 'placed' && trade.status === 'active'
          ? 'border-emerald-300'
          : trade.userAction === 'watchlisted'
            ? 'border-amber-300'
            : trade.status === 'settled'
              ? 'border-slate-200 opacity-80'
              : 'border-slate-200',
        expanded && 'ring-1 ring-slate-300',
      )}
    >
      <button
        type="button"
        className="w-full p-4 text-left"
        onClick={() => setExpandedTradeId(expanded ? null : trade.id)}
        aria-expanded={expanded}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className={SPORT_COLORS[trade.sport]}>{trade.sport}</Badge>
            <LifecycleBadge trade={trade} />
            {(trade.bestLineHome || trade.bestLineAway) && (
              <Badge className="bg-violet-50 text-violet-800 normal-case">
                {trade.bestLineHome
                  ? `Best home: ${trade.bestLineHome.bookmaker} ${formatSpreadPoint(trade.bestLineHome.point)}`
                  : `Best away: ${trade.bestLineAway!.bookmaker} ${formatSpreadPoint(trade.bestLineAway!.point)}`}
              </Badge>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ease-out',
              expanded && 'rotate-180',
            )}
          />
        </div>

        <p className="text-sm text-slate-500">
          {trade.matchup.away} @ {trade.matchup.home}
        </p>
        <h3 className="mt-1 text-base font-semibold text-slate-900">
          {trade.proposition}
        </h3>

        <div className="mt-3 flex flex-wrap items-end gap-4">
          <Metric
            label="Fair value"
            value={formatPct(trade.fairValueProbability)}
          />
          <Metric
            label="Book line"
            value={formatPct(trade.bookImpliedProbability)}
          />
          <div>
            <p className="text-xs text-slate-500">Edge</p>
            <p
              className={cn(
                'tabular-nums text-lg font-semibold',
                positiveEdge ? 'text-edge-positive' : 'text-edge-neutral',
              )}
            >
              {formatEdge(trade.edgePercentage)}
            </p>
          </div>
        </div>
      </button>

      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">
            <TradeCardExpanded trade={trade} />
          </div>
        </div>
      </div>
    </article>
  )
}

function formatSpreadPoint(point: number): string {
  if (point > 0) return `+${point}`
  return String(point)
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular-nums text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}

function LifecycleBadge({ trade }: { trade: Trade }) {
  if (trade.status === 'settled') {
    const result = trade.placement?.result
    return (
      <Badge
        className={cn(
          'normal-case',
          result === 'won'
            ? 'bg-emerald-50 text-edge-positive'
            : result === 'lost'
              ? 'bg-red-50 text-red-600'
              : 'bg-slate-100 text-slate-600',
        )}
      >
        {result === 'won' ? 'Won' : result === 'lost' ? 'Lost' : 'Settled'}
      </Badge>
    )
  }
  if (trade.userAction === 'placed') {
    return <Badge className="bg-emerald-50 text-edge-positive normal-case">Placed</Badge>
  }
  if (trade.userAction === 'watchlisted') {
    return <Badge className="bg-amber-50 text-amber-800 normal-case">Watching</Badge>
  }
  return null
}
