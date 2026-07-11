/**
 * Unified model vs all venues — moneyline/probability primary.
 *
 * Attribution / honesty: blend slider defaults to calibrated-v3 weight (0.15).
 * Project backtests found blending mostly recalibrates confidence, not ATS side.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getCalibratedModelWeight,
  getPredictions,
  listSeasons,
  listWeeks,
} from '@/lib/nflData'
import {
  DEMO_GAME_LINE_EVENTS,
  eventsToBookOdds,
  fetchNflGameLineOdds,
  isOddsAggregatorConfigured,
  type BookOdds,
} from '@/lib/oddsAggregator'
import { scanCuratedPairs, type PairScanRow } from '@/lib/arbScan'
import {
  buildUnifiedComparison,
  withBlendWeight,
  type UnifiedGameComparison,
} from '@/lib/unifiedComparison'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function pct(p: number): string {
  if (!Number.isFinite(p)) return '—'
  return `${(p * 100).toFixed(1)}%`
}

export function ComparePage() {
  const calibrated = getCalibratedModelWeight()
  const seasons = listSeasons()
  const [season, setSeason] = useState(2020)
  const weeks = listWeeks(season)
  const [week, setWeek] = useState(5)
  const games = useMemo(() => getPredictions(season, week), [season, week])
  const [gameId, setGameId] = useState<string>('')
  const [weight, setWeight] = useState(calibrated)
  const [bookOdds, setBookOdds] = useState<BookOdds[]>(() =>
    eventsToBookOdds(DEMO_GAME_LINE_EVENTS),
  )
  const [oddsMode, setOddsMode] = useState<'demo' | 'live'>('demo')
  const [pmRows, setPmRows] = useState<PairScanRow[]>([])
  const [pmError, setPmError] = useState<string | null>(null)
  const [loadingOdds, setLoadingOdds] = useState(false)

  // Keep selection when possible; prefer demos that join books / PM pairs
  useEffect(() => {
    if (!games.length) {
      setGameId('')
      return
    }
    setGameId((prev) => {
      if (prev && games.some((g) => g.gameId === prev)) return prev
      const preferred =
        games.find((g) => g.homeTeam === 'KC' && g.awayTeam === 'LV') ??
        games.find((g) => g.homeTeam === 'DAL' && g.awayTeam === 'SEA') ??
        games.find((g) => g.postedSpread != null) ??
        games[0]
      return preferred?.gameId ?? ''
    })
  }, [games])

  const refreshPm = useCallback(async () => {
    setPmError(null)
    try {
      const rows = await scanCuratedPairs()
      setPmRows(rows)
    } catch (e) {
      setPmError(e instanceof Error ? e.message : String(e))
      setPmRows([])
    }
  }, [])

  useEffect(() => {
    void refreshPm()
  }, [refreshPm])

  const refreshLiveOdds = useCallback(async () => {
    if (!isOddsAggregatorConfigured()) {
      setBookOdds(eventsToBookOdds(DEMO_GAME_LINE_EVENTS))
      setOddsMode('demo')
      return
    }
    setLoadingOdds(true)
    try {
      const events = await fetchNflGameLineOdds()
      if (events.length === 0) {
        setBookOdds(eventsToBookOdds(DEMO_GAME_LINE_EVENTS))
        setOddsMode('demo')
      } else {
        setBookOdds(eventsToBookOdds(events))
        setOddsMode('live')
      }
    } catch {
      setBookOdds(eventsToBookOdds(DEMO_GAME_LINE_EVENTS))
      setOddsMode('demo')
    } finally {
      setLoadingOdds(false)
    }
  }, [])

  const baseComparison = useMemo(() => {
    if (!gameId) return null
    return buildUnifiedComparison(gameId, calibrated, {
      bookOdds,
      predictionMarkets: pmRows.map((r) => ({
        pair: r.pair,
        kalshi: r.kalshi,
        polymarket: r.polymarket,
      })),
    })
  }, [gameId, calibrated, bookOdds, pmRows])

  const comparison: UnifiedGameComparison | null = useMemo(() => {
    if (!baseComparison) return null
    return withBlendWeight(baseComparison, weight)
  }, [baseComparison, weight])

  const resetCalibrated = () => setWeight(calibrated)

  const jumpDemoBooks = () => {
    setSeason(2020)
    setWeek(5)
    setBookOdds(eventsToBookOdds(DEMO_GAME_LINE_EVENTS))
    setOddsMode('demo')
  }

  const jumpPmCandidate = () => {
    // Historical SEA @ DAL so curated (unverified) pair can join by team keys
    setSeason(2009)
    setWeek(8)
  }

  const traditionalMl = (comparison?.moneylineVenues ?? []).filter(
    (v) => v.venueType === 'traditional_book',
  )
  const predictionMl = (comparison?.moneylineVenues ?? []).filter(
    (v) => v.venueType === 'prediction_market',
  )
  const sharp = traditionalMl.filter((v) => v.bookTier === 'sharp')
  const soft = traditionalMl.filter((v) => v.bookTier === 'soft')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Model vs all markets
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          One game, one axis that works everywhere: win probability
          (moneyline-equivalent). Traditional books, Kalshi, and Polymarket
          only compare cleanly on that field — spreads/totals stay secondary
          and books-only.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-500">
          Season
          <select
            className="mt-1 block rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Week
          <select
            className="mt-1 block rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[14rem] flex-1 text-xs font-medium text-slate-500">
          Game
          <select
            className="mt-1 block w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
          >
            {games.map((g) => (
              <option key={g.gameId} value={g.gameId}>
                {g.awayTeam} @ {g.homeTeam}
                {g.postedSpread != null ? ` (line ${g.postedSpread})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={jumpDemoBooks}>
          Demo books (2020 W5 KC vs LV)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={jumpPmCandidate}
        >
          PM candidate (2009 W8 SEA @ DAL)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loadingOdds}
          onClick={() => void refreshLiveOdds()}
        >
          {loadingOdds ? 'Fetching…' : 'Refresh book odds'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void refreshPm()}
        >
          Refresh Kalshi/Polymarket
        </Button>
        <span className="self-center text-xs text-slate-500">
          Odds: {oddsMode}
        </span>
      </div>

      {!comparison ? (
        <p className="text-sm text-slate-500">Select a game to compare.</p>
      ) : (
        <>
          {/* Blend slider */}
          <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Blend weight
              </h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={resetCalibrated}
              >
                Reset to calibrated ({Math.round(calibrated * 100)}%)
              </Button>
            </div>
            <p className="mt-2 text-sm text-amber-950/90">
              Blend weight changes confidence calibration more than it changes
              which side the model favors — see{' '}
              <Link to="/backtest" className="underline">
                Backtest
              </Link>{' '}
              for the verified comparison.
            </p>
            {comparison.blendTracksMarketClosely && (
              <p className="mt-2 text-xs text-slate-600">
                Calibrated weight is only {Math.round(calibrated * 100)}% model
                / {Math.round((1 - calibrated) * 100)}% market — the blended
                row stays close to the market line across most of this slider.
                That is expected from calibration, not a hidden edge.
              </p>
            )}
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Pure market (0%)</span>
                <span className="font-medium text-emerald-800">
                  Calibrated {Math.round(calibrated * 100)}% ← recommended
                </span>
                <span>Pure model (100%)</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(weight * 100)}
                onChange={(e) => setWeight(Number(e.target.value) / 100)}
                className="w-full accent-slate-800"
                aria-label="Model vs market blend weight"
              />
              <p className="mt-2 text-sm text-slate-700">
                Using{' '}
                <span className="font-semibold">
                  {Math.round(comparison.modelBlended.weightUsed * 100)}% model
                </span>
                {comparison.modelBlended.isCalibratedDefault
                  ? ' (calibrated default)'
                  : ' (override)'}
                {' · '}
                blended spread {comparison.modelBlended.spread.toFixed(2)} · P(home
                win) {pct(comparison.modelBlended.moneylineProbability)}
              </p>
            </div>
          </section>

          {/* Primary: moneyline */}
          <section className="mb-10">
            <h2 className="text-lg font-semibold text-slate-900">
              Win probability (primary)
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {comparison.matchup} · home-win probability · posted line{' '}
              {comparison.postedSpread ?? '—'}
            </p>

            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
              <ModelRow
                label="Model (raw)"
                prob={comparison.modelRaw.moneylineProbability}
                detail={`spread ${comparison.modelRaw.spread.toFixed(2)}`}
                emphasize
              />
              <ModelRow
                label={
                  comparison.modelBlended.isCalibratedDefault
                    ? 'Model (blended · calibrated)'
                    : 'Model (blended · override)'
                }
                prob={comparison.modelBlended.moneylineProbability}
                detail={`spread ${comparison.modelBlended.spread.toFixed(2)} · w=${comparison.modelBlended.weightUsed.toFixed(2)}`}
                emphasize
                blended
              />
            </div>

            <h3 className="mt-6 text-sm font-semibold text-slate-800">
              Traditional books — sharp
            </h3>
            <VenueList quotes={sharp} empty="No sharp moneyline quotes for this matchup." />

            <h3 className="mt-4 text-sm font-semibold text-slate-800">
              Traditional books — soft
            </h3>
            <VenueList quotes={soft} empty="No soft moneyline quotes for this matchup." />

            <h3 className="mt-6 text-sm font-semibold text-slate-800">
              Prediction markets
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Same verifiedEquivalent gate as the arb monitor — unverified pairs
              stay visible and flagged, never treated as confirmed equivalent.
            </p>
            {pmError && (
              <p className="mt-2 text-xs text-amber-800">{pmError}</p>
            )}
            <VenueList
              quotes={predictionMl}
              empty="No curated Kalshi/Polymarket pair matches this game’s teams."
              predictionStyle
            />
          </section>

          {/* Secondary: spread / total */}
          <section className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-5">
            <h2 className="text-sm font-semibold text-slate-700">
              Spread &amp; total (secondary · traditional books only)
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Kalshi/Polymarket have no spread/total analogue here — kept out of
              the primary list on purpose.
            </p>
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Spread (home)
            </h3>
            <VenueList
              quotes={comparison.spreadVenues}
              empty="No spread quotes."
              compact
            />
            <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Total (over)
            </h3>
            <VenueList
              quotes={comparison.totalVenues}
              empty="No total quotes."
              compact
            />
          </section>
        </>
      )}
    </div>
  )
}

function ModelRow({
  label,
  prob,
  detail,
  emphasize,
  blended,
}: {
  label: string
  prob: number
  detail: string
  emphasize?: boolean
  blended?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 last:border-0',
        blended && 'bg-emerald-50/60',
      )}
    >
      <div>
        <p
          className={cn(
            'text-sm text-slate-800',
            emphasize && 'font-medium',
          )}
        >
          {label}
        </p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <p className="text-base font-semibold tabular-nums text-slate-900">
        {pct(prob)}
      </p>
    </div>
  )
}

function VenueList({
  quotes,
  empty,
  predictionStyle,
  compact,
}: {
  quotes: UnifiedGameComparison['moneylineVenues']
  empty: string
  predictionStyle?: boolean
  compact?: boolean
}) {
  if (quotes.length === 0) {
    return <p className="mt-2 text-sm text-slate-500">{empty}</p>
  }
  return (
    <ul className="mt-2 space-y-2">
      {quotes.map((q, i) => (
        <li
          key={`${q.venue}-${q.rawPrice}-${i}`}
          className={cn(
            'flex flex-wrap items-start justify-between gap-2 rounded-md border px-3 py-2',
            predictionStyle
              ? q.resolutionVerified
                ? 'border-sky-200 bg-sky-50/50'
                : 'border-amber-200 bg-amber-50/70'
              : 'border-slate-100 bg-white',
            compact && 'py-1.5',
          )}
        >
          <div>
            <p className="text-sm font-medium text-slate-900">
              {q.venue}
              {q.bookTier ? (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {q.bookTier}
                </span>
              ) : null}
            </p>
            <p className="text-xs text-slate-500">{q.rawPrice}</p>
            {q.venueType === 'prediction_market' && (
              <p
                className={cn(
                  'mt-0.5 text-xs',
                  q.resolutionVerified ? 'text-emerald-700' : 'text-amber-800',
                )}
              >
                {q.resolutionVerified
                  ? 'resolution verified'
                  : 'resolution unverified — same gate as Arb monitor'}
              </p>
            )}
          </div>
          <p className="text-sm font-semibold tabular-nums text-slate-900">
            {pct(q.impliedProbability)}
          </p>
        </li>
      ))}
    </ul>
  )
}
