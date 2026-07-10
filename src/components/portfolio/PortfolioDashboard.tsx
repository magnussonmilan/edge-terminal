import { useMemo } from 'react'
import type { BetType, Trade } from '@/types/trade'
import { useTradeStore } from '@/store/useTradeStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  computePortfolio,
  countSettledResults,
  formatUsd,
  formatUsdPrecise,
} from '@/lib/portfolio'
import { calculateSuggestedStake } from '@/lib/kelly'
import { cn, formatPct } from '@/lib/utils'

const BET_TYPE_ORDER: BetType[] = ['prop', 'spread', 'moneyline', 'total']

export function PortfolioDashboard() {
  const trades = useTradeStore((s) => s.trades)
  const bankroll = useTradeStore((s) => s.bankroll)
  const user = useTradeStore((s) => s.user)
  const setTier = useTradeStore((s) => s.setTier)
  const isPremium = user.tier === 'premium'

  const portfolio = useMemo(
    () => computePortfolio(trades, bankroll, user.id),
    [trades, bankroll, user.id],
  )
  const counts = useMemo(() => countSettledResults(trades), [trades])

  const sampleTrade = useMemo(
    () => trades.find((t) => t.status === 'active' && t.userAction !== 'placed'),
    [trades],
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Portfolio</h1>
      <p className="mt-1 text-sm text-slate-500">
        Derived from your placed trades — we track results, not guarantees.
      </p>

      <div className="mt-8 space-y-4">
        <FreeSummary
          bankroll={bankroll}
          totalRisked={portfolio.totalRisked}
          wins={counts.wins}
          losses={counts.losses}
          openPlaced={counts.openPlaced}
        />

        {isPremium ? (
          <PremiumPanel portfolio={portfolio} sampleTrade={sampleTrade} bankroll={bankroll} />
        ) : (
          <LockedPremiumPreview
            portfolio={portfolio}
            sampleTrade={sampleTrade}
            bankroll={bankroll}
            onUpgrade={() => setTier('premium')}
          />
        )}
      </div>
    </div>
  )
}

function FreeSummary({
  bankroll,
  totalRisked,
  wins,
  losses,
  openPlaced,
}: {
  bankroll: number
  totalRisked: number
  wins: number
  losses: number
  openPlaced: number
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Current bankroll
      </p>
      <p className="mt-1 tabular-nums text-3xl font-semibold text-slate-900">
        {formatUsdPrecise(bankroll)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total risked" value={formatUsd(totalRisked)} />
        <Stat label="Wins" value={String(wins)} valueClass="text-edge-positive" />
        <Stat label="Losses" value={String(losses)} valueClass="text-red-600" />
        <Stat label="Open" value={String(openPlaced)} valueClass="text-edge-neutral" />
      </div>
    </div>
  )
}

function PremiumPanel({
  portfolio,
  sampleTrade,
  bankroll,
}: {
  portfolio: ReturnType<typeof computePortfolio>
  sampleTrade: Trade | undefined
  bankroll: number
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">ROI</p>
        <p
          className={cn(
            'mt-1 tabular-nums text-4xl font-semibold',
            portfolio.roi >= 0 ? 'text-edge-positive' : 'text-red-600',
          )}
        >
          {portfolio.roi >= 0 ? '+' : ''}
          {(portfolio.roi * 100).toFixed(1)}%
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Gross returns {formatUsdPrecise(portfolio.totalWins)} on{' '}
          {formatUsdPrecise(portfolio.totalRisked)} risked
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <StreakPill
            label="Win streak"
            value={portfolio.winStreak}
            tone={portfolio.winStreak > 0 ? 'positive' : 'neutral'}
          />
          <StreakPill
            label="Loss streak"
            value={portfolio.lossStreak}
            tone={portfolio.lossStreak > 0 ? 'loss' : 'neutral'}
          />
        </div>
      </div>

      <YieldByBetType portfolio={portfolio} />

      <SuggestedStakeCard sampleTrade={sampleTrade} bankroll={bankroll} />
    </div>
  )
}

function LockedPremiumPreview({
  portfolio,
  sampleTrade,
  bankroll,
  onUpgrade,
}: {
  portfolio: ReturnType<typeof computePortfolio>
  sampleTrade: Trade | undefined
  bankroll: number
  onUpgrade: () => void
}) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200">
      <div
        className="pointer-events-none select-none space-y-4 p-5 opacity-40 blur-[2px]"
        aria-hidden
      >
        <PremiumPanel portfolio={portfolio} sampleTrade={sampleTrade} bankroll={bankroll} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 p-6">
        <div className="max-w-sm rounded-lg border border-amber-200 bg-white p-5 text-center shadow-sm">
          <Badge className="bg-amber-100 text-amber-800 normal-case">
            Upgrade to Premium — $29.99/mo
          </Badge>
          <p className="mt-3 text-sm text-slate-600">
            Unlock ROI, yield by bet type, streaks, and suggested stake sizing.
          </p>
          <Button className="mt-4 w-full" onClick={onUpgrade}>
            Upgrade to Premium — $29.99/mo
          </Button>
        </div>
      </div>
    </div>
  )
}

function YieldByBetType({
  portfolio,
}: {
  portfolio: ReturnType<typeof computePortfolio>
}) {
  const rows = BET_TYPE_ORDER.map((betType) => {
    const row = portfolio.yieldByBetType[betType]
    return { betType, row }
  }).filter((r) => r.row)

  const maxAbsRoi = Math.max(
    0.01,
    ...rows.map((r) => Math.abs(r.row?.roi ?? 0)),
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-800">Yield by bet type</p>
      <p className="mt-1 text-xs text-slate-500">
        Share of results across the bet types you have placed.
      </p>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No settled bets yet.</p>
        ) : (
          rows.map(({ betType, row }) => {
            if (!row) return null
            const width = `${Math.max(8, (Math.abs(row.roi) / maxAbsRoi) * 100)}%`
            const positive = row.roi >= 0
            return (
              <div key={betType}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="capitalize text-slate-600">
                    {betType}{' '}
                    <span className="text-slate-400">({row.betsPlaced})</span>
                  </span>
                  <span
                    className={cn(
                      'tabular-nums font-medium',
                      positive ? 'text-edge-positive' : 'text-red-600',
                    )}
                  >
                    {positive ? '+' : ''}
                    {(row.roi * 100).toFixed(1)}% · {formatPct(row.winRate, 0)} win
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-100">
                  <div
                    className={cn(
                      'h-full rounded transition-all duration-300 ease-out',
                      positive ? 'bg-edge-positive' : 'bg-red-400',
                    )}
                    style={{ width }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SuggestedStakeCard({
  sampleTrade,
  bankroll,
}: {
  sampleTrade: Trade | undefined
  bankroll: number
}) {
  if (!sampleTrade) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold text-slate-800">Suggested Stake</p>
        <p className="mt-2 text-sm text-slate-500">
          No open trades to size right now. Check the feed for new edges.
        </p>
      </div>
    )
  }

  const book = Object.entries(sampleTrade.books).find(([, b]) => b.available)
  if (!book) return null

  const suggested = calculateSuggestedStake(
    bankroll,
    book[1].currentOdds,
    sampleTrade.fairValueProbability,
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold text-slate-800">Suggested Stake</p>
      <p className="mt-1 text-xs text-slate-500">{sampleTrade.proposition}</p>
      <p className="mt-3 tabular-nums text-2xl font-semibold text-slate-900">
        {formatUsdPrecise(suggested.amount)}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Based on your bankroll and how often we expect this to hit, a disciplined stake is{' '}
        {formatUsdPrecise(suggested.amount)}.
        {suggested.capped ? ' Capped at 20% of bankroll for safety.' : ''}
      </p>
    </div>
  )
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn('tabular-nums text-lg font-medium text-slate-800', valueClass)}>
        {value}
      </p>
    </div>
  )
}

function StreakPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'positive' | 'loss' | 'neutral'
}) {
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2',
        tone === 'positive' && 'border-emerald-200 bg-emerald-50',
        tone === 'loss' && 'border-red-200 bg-red-50',
        tone === 'neutral' && 'border-slate-200 bg-slate-50',
      )}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          'tabular-nums text-lg font-semibold',
          tone === 'positive' && 'text-edge-positive',
          tone === 'loss' && 'text-red-600',
          tone === 'neutral' && 'text-slate-700',
        )}
      >
        {value}
      </p>
    </div>
  )
}
