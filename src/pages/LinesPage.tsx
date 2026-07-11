import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DEMO_GAME_LINE_EVENTS,
  eventsToBookOdds,
  fetchNflGameLineOdds,
  isOddsAggregatorConfigured,
  type BookOdds,
} from '@/lib/oddsAggregator'
import { buildLineShoppingGroups } from '@/lib/lineShopping'
import {
  findValueBets,
  summarizeValueBetTiers,
  type ValueBet,
} from '@/lib/valueBets'
import { formatAmericanOdds } from '@/lib/odds'
import { getPredictions, listSeasons, listWeeks } from '@/lib/nflData'
import { NFL_FULL_TO_ABBR as TEAM_MAP } from '@/lib/valueBets'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type DataMode = 'live' | 'demo'

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`
}

export function LinesPage() {
  const [rows, setRows] = useState<BookOdds[]>([])
  const [mode, setMode] = useState<DataMode>('demo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)

  const seasons = listSeasons()
  const season = seasons[0] ?? 2024
  const weeks = listWeeks(season)
  const week = weeks[Math.min(4, weeks.length - 1)] ?? 1

  const loadDemo = useCallback(() => {
    setRows(eventsToBookOdds(DEMO_GAME_LINE_EVENTS))
    setMode('demo')
    setError(null)
    setFetchedAt(new Date())
  }, [])

  const refreshLive = useCallback(async () => {
    if (!isOddsAggregatorConfigured()) {
      setError(
        'No Odds API key configured (ODDS_API_KEY / VITE_ODDS_API_KEY). Showing demo sample instead.',
      )
      loadDemo()
      return
    }
    setLoading(true)
    setError(null)
    try {
      const events = await fetchNflGameLineOdds()
      if (events.length === 0) {
        setError(
          'The Odds API returned no NFL events (off-season or empty slate). Showing demo sample.',
        )
        loadDemo()
        return
      }
      setRows(eventsToBookOdds(events))
      setMode('live')
      setFetchedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      loadDemo()
    } finally {
      setLoading(false)
    }
  }, [loadDemo])

  useEffect(() => {
    void refreshLive()
  }, [refreshLive])

  const shopGroups = useMemo(() => buildLineShoppingGroups(rows), [rows])

  const valueBets = useMemo(() => {
    const preds = getPredictions(season, week).map((p) => ({
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      homeTeamFull: TEAM_MAP_REVERSE[p.homeTeam] ?? p.homeTeam,
      awayTeamFull: TEAM_MAP_REVERSE[p.awayTeam] ?? p.awayTeam,
      modelSpread: p.modelSpread,
      postedSpread: p.postedSpread,
      starRating: p.starRating,
    }))
    // Demo odds use KC/LV full names — also inject a synthetic playable join
    // when in demo mode so the Value section can illustrate sharp vs soft copy.
    if (mode === 'demo') {
      preds.unshift({
        homeTeam: 'KC',
        awayTeam: 'LV',
        homeTeamFull: 'Kansas City Chiefs',
        awayTeamFull: 'Las Vegas Raiders',
        modelSpread: -14,
        postedSpread: -7,
        starRating: { differentialPct: 12, stars: 2, playable: true },
      })
    }
    return findValueBets(preds, rows)
  }, [rows, season, week, mode])

  const tierSummary = summarizeValueBetTiers(valueBets)
  const softBets = valueBets.filter((b) => b.bookTier === 'soft')
  const sharpBets = valueBets.filter((b) => b.bookTier === 'sharp')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-xl font-semibold text-slate-900">
          Line shopping &amp; value bets
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Two separate tools. Best Price is arithmetic across books for the same
          bet. Value Bets flags where our model disagrees with a book&apos;s
          price — only when the existing star-rating gate clears — and is only
          as trustworthy as that model.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            onClick={() => void refreshLive()}
            disabled={loading}
          >
            {loading ? 'Fetching…' : 'Refresh odds'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={loadDemo}>
            Load demo sample
          </Button>
          {fetchedAt && (
            <span className="text-xs text-slate-500">
              {mode === 'demo' ? 'Demo sample' : 'Live'} ·{' '}
              {fetchedAt.toLocaleTimeString()}
            </span>
          )}
        </div>
        {error && (
          <p className="mt-3 text-sm text-amber-800" role="status">
            {error}
          </p>
        )}
      </header>

      {/* ——— Best Price ——— */}
      <section className="mb-12 rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Best Price</h2>
          <Badge className="bg-slate-100 text-slate-700 normal-case tracking-normal">
            No model
          </Badge>
        </div>
        <p className="mb-4 max-w-3xl text-sm text-slate-600">
          Same side of the same bet — which book pays more. This is a price
          comparison only. A book may not honor a stale or limited price; check
          the ticket before you bet.
        </p>

        {shopGroups.length === 0 ? (
          <p className="text-sm text-slate-500">No quotes loaded.</p>
        ) : (
          <ul className="space-y-4">
            {shopGroups.map((g) => (
              <li
                key={`${g.eventId}-${g.market}-${g.side}-${g.line ?? ''}`}
                className="rounded-md border border-slate-100 bg-slate-50/80 p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {g.matchup}
                    </p>
                    <p className="text-xs text-slate-500">
                      {g.market}
                      {g.line != null ? ` ${g.line}` : ''} · {g.side}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-800">
                      {g.best.book}{' '}
                      {formatAmericanOdds(g.best.price)}
                    </p>
                    <p className="text-xs text-slate-500">
                      best · {pct(g.best.impliedProbability)} raw implied
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {g.best.allQuotes.map((q) => (
                    <span
                      key={`${q.bookKey}-${q.price}`}
                      className={cn(
                        'rounded border px-2 py-0.5 text-xs',
                        q.book === g.best.book
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-white text-slate-600',
                      )}
                    >
                      {q.book} {formatAmericanOdds(q.price)}
                      {q.bookTier === 'sharp' ? ' · sharp' : ''}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ——— Value Bets ——— */}
      <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-5">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Value Bets</h2>
          <Badge className="border border-amber-300 bg-amber-100 text-amber-950 normal-case tracking-normal">
            Model-based
          </Badge>
        </div>
        <p className="mb-2 max-w-3xl text-sm text-amber-950/90">
          These flags use our calibrated model&apos;s predicted probability vs a
          book&apos;s vig-adjusted price. Only games that already clear the same
          star-rating / playability gate as Predictions and Stacks are shown.
          This project&apos;s own backtests have not shown the model beats a
          sharp closing line — see{' '}
          <Link to="/backtest" className="underline">
            Backtest
          </Link>{' '}
          and{' '}
          <Link to="/how-it-works" className="underline">
            How it works
          </Link>
          . Treat every flag as a model disagreement, not a sure thing.
        </p>
        <p className="mb-4 text-xs text-slate-600">
          Soft-book disagreements can reflect a slow update. Sharp-book
          disagreements (Pinnacle / LowVig / BetOnline) mean our model disagrees
          with an efficient reference — treat those with more skepticism.
          {mode === 'live' && valueBets.length > 0 && (
            <>
              {' '}
              Live tally this fetch: {tierSummary.soft} soft ·{' '}
              {tierSummary.sharp} sharp.
            </>
          )}
        </p>

        <ValueBetGroup
          title="Soft-book disagreements"
          hint="More historically plausible that the book lagged than that we found true edge."
          bets={softBets}
          tone="soft"
        />
        <ValueBetGroup
          title="Sharp-book disagreements"
          hint="Our model disagrees with a line-setting / reduced-juice book — treat with appropriate skepticism."
          bets={sharpBets}
          tone="sharp"
        />
      </section>
    </div>
  )
}

const TEAM_MAP_REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_MAP).map(([full, abbr]) => [abbr, full]),
)

function ValueBetGroup({
  title,
  hint,
  bets,
  tone,
}: {
  title: string
  hint: string
  bets: ValueBet[]
  tone: 'soft' | 'sharp'
}) {
  return (
    <div className="mb-6 last:mb-0">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-600">{hint}</p>
      {bets.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None right now.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {bets.map((b) => (
            <li
              key={`${b.eventId}-${b.bookKey}-${b.side}`}
              className={cn(
                'rounded-md border p-3',
                tone === 'sharp'
                  ? 'border-slate-300 bg-white'
                  : 'border-amber-100 bg-white',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {b.matchup}
                  </p>
                  <p className="text-xs text-slate-600">
                    {b.side} @ {b.book}
                    {tone === 'sharp' ? ' (sharp)' : ' (soft)'}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <p>
                    Model {pct(b.modelProbability)} vs book{' '}
                    {pct(b.bookImpliedProbability)}
                  </p>
                  <p className="font-medium text-slate-800">
                    Edge {b.edgePercent.toFixed(1)} pts · {b.starRating}★
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
