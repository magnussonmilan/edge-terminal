/**
 * MLB market-pair review queue — auto-approved vs needs-human-review.
 * Safety: unverified pairs never become arb-worthy until zero flags or human promote.
 */
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  runMlbMarketDiscovery,
  savePromotedMlbPair,
  type MlbDiscoveryReport,
  type ReviewQueueItem,
} from '@/lib/mlbPairDiscovery'
import { setSessionAutoApprovedMlbPairs } from '@/lib/mlbDiscoveredPairsStore'
import type { RulesFlag } from '@/lib/rulesDiffChecker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function MlbPairReviewPage() {
  const [report, setReport] = useState<MlbDiscoveryReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set())

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await runMlbMarketDiscovery()
      setSessionAutoApprovedMlbPairs(
        next.autoApproved.map((i) => i.proposed),
      )
      setReport(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const promote = (item: ReviewQueueItem) => {
    savePromotedMlbPair(item.proposed)
    setPromotedIds((prev) => {
      const n = new Set(prev)
      n.add(`${item.proposed.kalshiMarketId}|${item.proposed.polymarketMarketId}`)
      return n
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          MLB market pair review
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Auto-discovers Kalshi <code className="text-xs">KXMLBGAME</code> and
          Polymarket MLB moneylines, matches on team + date, then
          pattern-diffs resolution rules. Only zero-flag pairs are
          auto-approved. Any flag stays unverified until you promote it —
          same arb gate as before.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={() => void run()} disabled={loading}>
            {loading ? 'Discovering…' : 'Run discovery'}
          </Button>
          <Link
            to="/compare?sport=mlb"
            className="text-sm text-slate-600 underline"
          >
            MLB Compare
          </Link>
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </header>

      {report && (
        <section className="mb-8 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Last scan</p>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(report.scannedAt).toLocaleString()}
          </p>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            <li>Kalshi markets parsed: {report.kalshiCount}</li>
            <li>Polymarket moneylines: {report.polymarketCount}</li>
            <li>Matched (team+date): {report.matchedCount}</li>
            <li>Unmatched Kalshi: {report.unmatchedKalshi}</li>
            <li>Unmatched Polymarket: {report.unmatchedPolymarket}</li>
            <li className="text-emerald-800">
              Auto-approved: {report.autoApproved.length}
            </li>
            <li className="text-amber-900">
              Needs review: {report.needsReview.length}
            </li>
          </ul>
          {report.matchedCount > 0 &&
            report.autoApproved.length === 0 &&
            report.needsReview.length === report.matchedCount && (
              <p className="mt-3 text-xs text-amber-900">
                Every matched pair was flagged. That usually means Kalshi and
                Polymarket MLB postponement language differs systematically —
                not a bug in matching. Do not loosen flag criteria to inflate
                the approval rate.
              </p>
            )}
        </section>
      )}

      <QueueSection
        title={`Auto-approved (no rules flags detected) (${report?.autoApproved.length ?? 0})`}
        empty="Run discovery to populate. Zero-flag pairs land here with verifiedEquivalent: true."
        items={report?.autoApproved ?? []}
        variant="approved"
      />

      <QueueSection
        title={`Needs review (${report?.needsReview.length ?? 0} pairs)`}
        empty="No flagged pairs yet."
        items={report?.needsReview ?? []}
        variant="review"
        promotedIds={promotedIds}
        onPromote={promote}
      />
    </div>
  )
}

function QueueSection({
  title,
  empty,
  items,
  variant,
  promotedIds,
  onPromote,
}: {
  title: string
  empty: string
  items: ReviewQueueItem[]
  variant: 'approved' | 'review'
  promotedIds?: Set<string>
  onPromote?: (item: ReviewQueueItem) => void
}) {
  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-4">
          {items.map((item) => (
            <ReviewCard
              key={`${item.proposed.kalshiMarketId}-${item.proposed.polymarketMarketId}`}
              item={item}
              variant={variant}
              promoted={
                promotedIds?.has(
                  `${item.proposed.kalshiMarketId}|${item.proposed.polymarketMarketId}`,
                ) ?? false
              }
              onPromote={onPromote}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function ReviewCard({
  item,
  variant,
  promoted,
  onPromote,
}: {
  item: ReviewQueueItem
  variant: 'approved' | 'review'
  promoted: boolean
  onPromote?: (item: ReviewQueueItem) => void
}) {
  const { pair, flags, proposed } = item
  return (
    <li
      className={cn(
        'rounded-lg border p-4',
        variant === 'approved'
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-amber-200 bg-amber-50/40',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {proposed.description}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Kalshi <code className="text-[11px]">{pair.kalshi.marketId}</code>
            {' · '}
            Polymarket{' '}
            <code className="text-[11px]">
              {pair.polymarket.marketId.slice(0, 18)}…
            </code>
            {' · '}YES ↔ {proposed.polymarketAlignedOutcome}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            verifiedEquivalent:{' '}
            <span className="font-medium">
              {proposed.verifiedEquivalent || promoted ? 'true' : 'false'}
            </span>
            {promoted ? ' (human-promoted locally)' : null}
          </p>
        </div>
        {variant === 'review' && onPromote && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={promoted}
            onClick={() => onPromote(item)}
          >
            {promoted ? 'Promoted' : 'Promote to verified'}
          </Button>
        )}
      </div>

      {flags.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {flags.map((f, i) => (
            <FlagRow key={`${f.category}-${i}`} flag={f} />
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RulesBlock venue="Kalshi" text={pair.kalshi.resolutionRules} />
        <RulesBlock
          venue="Polymarket"
          text={pair.polymarket.resolutionRules}
        />
      </div>
    </li>
  )
}

function FlagRow({ flag }: { flag: RulesFlag }) {
  return (
    <li
      className={cn(
        'rounded-md border px-2.5 py-1.5 text-xs',
        flag.severity === 'blocking'
          ? 'border-red-300 bg-red-50 text-red-950'
          : 'border-slate-200 bg-white text-slate-700',
      )}
    >
      <span className="font-semibold uppercase tracking-wide">
        {flag.severity}
      </span>
      <span className="mx-1.5 text-slate-400">·</span>
      <span className="font-medium">{flag.category}</span>
      <p className="mt-0.5 leading-relaxed">{flag.description}</p>
    </li>
  )
}

function RulesBlock({ venue, text }: { venue: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {venue} rules (verbatim)
      </p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
        {text || '(empty)'}
      </pre>
    </div>
  )
}
