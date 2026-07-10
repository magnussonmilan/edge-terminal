import { formatDistanceToNow } from 'date-fns'
import type { Trade } from '@/types/trade'
import { cn } from '@/lib/utils'
import { PerformanceChart } from '@/components/chart/PerformanceChart'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PlaceBetModal } from '@/components/bet/PlaceBetModal'
import { useTradeStore } from '@/store/useTradeStore'
import { formatAmericanOdds } from '@/lib/odds'

interface TradeCardExpandedProps {
  trade: Trade
}

export function TradeCardExpanded({ trade }: TradeCardExpandedProps) {
  const { user, filters, setFilter, setUserAction } = useTradeStore()
  const isPremium = user.tier === 'premium'
  const lastUpdated = Object.values(trade.books)
    .map((b) => b.lastUpdated)
    .sort((a, b) => b.getTime() - a.getTime())[0]

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4 text-left">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Last 10 games
          </p>
          <p className="text-xs text-slate-400">
            Refresh: {isPremium ? 'Priority' : 'Standard'}
          </p>
        </div>

        <div className="mb-2 flex flex-wrap gap-2">
          {(['all', 'home', 'away', 'matchup'] as const).map((ctx) => {
            const locked = !isPremium && ctx !== 'all'
            return (
              <button
                key={ctx}
                type="button"
                disabled={locked}
                onClick={() => setFilter('chartContext', ctx)}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs capitalize transition-colors',
                  filters.chartContext === ctx && isPremium
                    ? 'border-primary bg-primary text-white'
                    : ctx === 'all' && filters.chartContext === 'all'
                      ? 'border-primary bg-primary text-white'
                      : 'border-slate-200 bg-white text-slate-600',
                  locked && 'cursor-not-allowed opacity-50',
                )}
                title={locked ? 'Upgrade to Premium — $29.99/mo' : undefined}
              >
                {ctx}
                {locked ? ' 🔒' : ''}
              </button>
            )
          })}
        </div>

        {!isPremium && (
          <p className="mb-2 text-xs text-amber-600">
            Upgrade to Premium — $29.99/mo for Home/Away & matchup filters
          </p>
        )}

        <PerformanceChart
          trade={trade}
          chartContext={isPremium ? filters.chartContext : 'all'}
        />
      </div>

      <p className="text-sm leading-relaxed text-slate-600">{trade.rationale}</p>

      <p className="text-xs text-slate-400">
        Last Updated{' '}
        <span className="tabular-nums text-slate-600">
          {lastUpdated
            ? formatDistanceToNow(lastUpdated, { addSuffix: true })
            : 'just now'}
        </span>
      </p>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Odds across books
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(trade.books).map(([name, book]) => (
            <div
              key={name}
              className={cn(
                'rounded-md border border-slate-200 px-3 py-2',
                !book.available && 'opacity-50',
              )}
            >
              <p className="text-xs text-slate-500">{name}</p>
              <p className="tabular-nums text-sm font-semibold text-slate-900">
                {formatAmericanOdds(book.currentOdds)}
              </p>
              <p className="tabular-nums text-xs text-slate-400">
                Line {book.spread}
                {!book.available ? ' · unavailable' : ''}
              </p>
            </div>
          ))}
        </div>
      </div>

      {trade.placement && trade.userAction === 'placed' && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <span className="font-medium">Your bet:</span>{' '}
          <span className="tabular-nums">
            ${trade.placement.stake.toFixed(0)} @ {trade.placement.bookName}{' '}
            {formatAmericanOdds(trade.placement.odds)}
          </span>
          {trade.placement.result && (
            <span className="ml-2 capitalize">· {trade.placement.result}</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <PlaceBetModal trade={trade} />

        <Button
          variant={trade.userAction === 'watchlisted' ? 'default' : 'outline'}
          className="flex-1 sm:flex-none"
          disabled={trade.userAction === 'placed'}
          onClick={() =>
            setUserAction(
              trade.id,
              trade.userAction === 'watchlisted' ? 'ignored' : 'watchlisted',
            )
          }
        >
          {trade.userAction === 'watchlisted'
            ? 'Tracking'
            : trade.userAction === 'placed'
              ? 'Placed'
              : 'Track This Trade'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-slate-100 text-slate-600 normal-case">
          Confidence{' '}
          <span className="tabular-nums ml-1">
            {(trade.confidence * 100).toFixed(0)}%
          </span>
        </Badge>
        <ActionBadge action={trade.userAction} status={trade.status} />
      </div>
    </div>
  )
}

function ActionBadge({
  action,
  status,
}: {
  action: Trade['userAction']
  status: Trade['status']
}) {
  if (status === 'settled') {
    return (
      <Badge className="bg-slate-800 text-white normal-case">Settled</Badge>
    )
  }
  if (action === 'placed') {
    return (
      <Badge className="bg-emerald-50 text-edge-positive normal-case">Placed</Badge>
    )
  }
  if (action === 'watchlisted') {
    return (
      <Badge className="bg-amber-50 text-amber-800 normal-case">Watchlisted</Badge>
    )
  }
  return (
    <Badge className="bg-slate-50 text-slate-500 normal-case">Open</Badge>
  )
}
