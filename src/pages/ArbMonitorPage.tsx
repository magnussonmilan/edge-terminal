import { useCallback, useEffect, useState } from 'react'
import { scanCuratedPairs, type PairScanRow } from '@/lib/arbScan'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}¢`
}

function usd(n: number): string {
  return `$${n.toFixed(4)}`
}

export function ArbMonitorPage() {
  const [rows, setRows] = useState<PairScanRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scannedAt, setScannedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await scanCuratedPairs()
      setRows(next)
      setScannedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const flagged = rows.filter((r) => r.opportunity)
  const pending = rows.filter((r) => !r.pair.verifiedEquivalent)
  const verifiedQuiet = rows.filter(
    (r) => r.pair.verifiedEquivalent && !r.opportunity && !r.error,
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Cross-venue arb monitor
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Kalshi vs Polymarket — NFL game winners only. Detection and alerting
          only; there is no execute button. Check your own state&apos;s legal
          status on both platforms before any manual trade. Treat every flag as
          a lead to verify, not a signal to act.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? 'Scanning…' : 'Refresh prices'}
          </Button>
          {scannedAt && (
            <span className="text-xs text-slate-500">
              Last scan {scannedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </header>

      <section className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-medium">Resolution-rule risk</p>
        <p className="mt-1 text-amber-900/90">
          Pairs with <code className="text-xs">verifiedEquivalent: false</code>{' '}
          never produce flags — even if the raw prices look like free money.
          Compare the verbatim rules below before opting a pair in by hand in{' '}
          <code className="text-xs">eventMatcher.ts</code>.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-semibold text-slate-900">
          Flagged opportunities ({flagged.length})
        </h2>
        {flagged.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            None. Either no verified pair is live, or no post-fee edge exists
            right now.
          </p>
        ) : (
          <ul className="mt-3 space-y-4">
            {flagged.map((row) => (
              <OpportunityCard key={row.pair.kalshiMarketId} row={row} />
            ))}
          </ul>
        )}
      </section>

      {verifiedQuiet.length > 0 && (
        <section className="mb-10">
          <h2 className="text-sm font-semibold text-slate-900">
            Verified pairs — no edge ({verifiedQuiet.length})
          </h2>
          <ul className="mt-3 space-y-3">
            {verifiedQuiet.map((row) => (
              <PairRulesCard key={row.pair.kalshiMarketId} row={row} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-slate-900">
          Pending verification ({pending.length})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Shown for human review only — arb detector will not flag these.
        </p>
        <ul className="mt-3 space-y-3">
          {pending.map((row) => (
            <PairRulesCard key={row.pair.kalshiMarketId} row={row} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function OpportunityCard({ row }: { row: PairScanRow }) {
  const opp = row.opportunity!
  const b = opp.breakdown
  return (
    <li className="rounded-lg border border-emerald-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-slate-900">{row.pair.description}</h3>
        <span className="tabular-nums text-sm font-semibold text-emerald-800">
          Net {usd(opp.netProfitPerDollar)} / $1
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Strategy: <code>{opp.strategy}</code>
        {opp.maxSizeAtDisplayedPrice != null
          ? ` · max size ~${opp.maxSizeAtDisplayedPrice}`
          : ''}
      </p>
      <div className="mt-3 grid gap-2 rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-800 sm:grid-cols-2">
        <div>
          Kalshi {b.kalshiLeg.side.toUpperCase()} @ {pct(b.kalshiLeg.price)}
          <br />
          fee {usd(b.kalshiLeg.fee)}
        </div>
        <div>
          Polymarket {b.polymarketLeg.side.toUpperCase()} @{' '}
          {pct(b.polymarketLeg.price)}
          <br />
          fee {usd(b.polymarketLeg.fee)}
        </div>
        <div className="sm:col-span-2 border-t border-slate-200 pt-2">
          gross {usd(opp.grossSpread)} + fees {usd(opp.kalshiFee + opp.polymarketFee)}{' '}
          = cost {usd(opp.grossSpread + opp.kalshiFee + opp.polymarketFee)}
          <br />
          settlement {usd(b.settlementValue)} − cost = net{' '}
          {usd(opp.netProfitPerDollar)}
        </div>
      </div>
      <RulesSideBySide row={row} />
    </li>
  )
}

function PairRulesCard({ row }: { row: PairScanRow }) {
  return (
    <li
      className={cn(
        'rounded-lg border bg-white p-4',
        row.pair.verifiedEquivalent
          ? 'border-slate-200'
          : 'border-amber-200',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium text-slate-900">{row.pair.description}</h3>
        <span
          className={cn(
            'text-xs font-medium',
            row.pair.verifiedEquivalent ? 'text-emerald-700' : 'text-amber-800',
          )}
        >
          {row.pair.verifiedEquivalent ? 'verified' : 'unverified'}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-600">{row.pair.verificationNote}</p>
      {row.error && (
        <p className="mt-2 text-xs text-red-700">Fetch error: {row.error}</p>
      )}
      {row.kalshi && row.polymarket && (
        <p className="mt-2 font-mono text-xs text-slate-500">
          K yes {pct(row.kalshi.yesPrice)} / no {pct(row.kalshi.noPrice)} · P yes{' '}
          {pct(row.polymarket.yesPrice)} / no {pct(row.polymarket.noPrice)}
        </p>
      )}
      <RulesSideBySide row={row} />
    </li>
  )
}

function RulesSideBySide({ row }: { row: PairScanRow }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <RuleBlock
        venue="Kalshi"
        id={row.pair.kalshiMarketId}
        source={row.kalshi?.resolutionSource}
        rules={row.kalshi?.resolutionRules}
      />
      <RuleBlock
        venue="Polymarket"
        id={row.pair.polymarketMarketId}
        source={row.polymarket?.resolutionSource}
        rules={row.polymarket?.resolutionRules}
      />
    </div>
  )
}

function RuleBlock({
  venue,
  id,
  source,
  rules,
}: {
  venue: string
  id: string
  source?: string
  rules?: string
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-800">{venue}</p>
      <p className="mt-0.5 break-all font-mono text-[10px] text-slate-500">{id}</p>
      {source && (
        <p className="mt-2 text-[11px] text-slate-600">
          Source: <span className="break-all">{source}</span>
        </p>
      )}
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-800">
        {rules?.trim() || '(rules not loaded)'}
      </pre>
    </div>
  )
}
