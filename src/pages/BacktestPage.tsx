import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ErrorBar,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import { ALL_PREDICTIONS, listSeasons } from '@/lib/nflData'
import {
  BREAKEVEN_WIN_RATE,
  computeBacktest,
  computeStarSignalDiagnostics,
  type StarLevelResultWithCI,
} from '@/lib/backtest'
import { DEFAULT_SPLIT, scoreSeasons } from '@/lib/calibration'
import { cn } from '@/lib/utils'
import calibrationLog from '@/data/nfl/calibration-log.json'
import calibratedCoeffs from '@/data/nfl/calibrated-coeffs.json'

type LogEntry = {
  step: string
  coefficient: string
  oldValue: number | string
  newValue: number | string
  trainWinRateBefore: number
  trainWinRateAfter: number
  validationWinRateBefore: number
  validationWinRateAfter: number
  note?: string
}

type CalibratedFile = {
  split: { trainSeasons: number[]; validationSeasons: number[] }
  baseline: { trainWinRate: number; validationWinRate: number }
  final: {
    trainWinRate: number
    validationWinRate: number
    allWinRate: number
    brierScore: number
    roiIfFollowed: number
    totalPlayableGames: number
  }
  hfa: number | Record<string, number>
  playerCoeffs: Record<string, number>
  useReplacementAddBack: boolean
}

const LOG = calibrationLog as LogEntry[]
const CALIBRATED = calibratedCoeffs as CalibratedFile

function toStarChartRows(breakdown: StarLevelResultWithCI[]) {
  return breakdown.map((row) => {
    const winRate = Math.round(row.winRate * 1000) / 10
    const low = Math.round(row.wilsonLow * 1000) / 10
    const high = Math.round(row.wilsonHigh * 1000) / 10
    return {
      label: `${row.starLevel}★`,
      winRate,
      games: row.gamesCount,
      wilsonLow: low,
      wilsonHigh: high,
      // Asymmetric ErrorBar offsets relative to winRate
      error: [Math.max(0, winRate - low), Math.max(0, high - winRate)] as [
        number,
        number,
      ],
    }
  })
}

function resolveSeasons(
  season: number | 'all' | 'train' | 'validation',
): number[] | 'all' {
  if (season === 'train') return DEFAULT_SPLIT.trainSeasons
  if (season === 'validation') return DEFAULT_SPLIT.validationSeasons
  if (season === 'all') return 'all'
  return [season]
}

export function BacktestPage() {
  const seasons = listSeasons()
  const [season, setSeason] = useState<number | 'all' | 'train' | 'validation'>(
    'validation',
  )

  const summary = useMemo(() => {
    if (season === 'train') {
      return scoreSeasons(ALL_PREDICTIONS, DEFAULT_SPLIT.trainSeasons)
    }
    if (season === 'validation') {
      return scoreSeasons(ALL_PREDICTIONS, DEFAULT_SPLIT.validationSeasons)
    }
    return computeBacktest(ALL_PREDICTIONS, season)
  }, [season])

  const trainSummary = useMemo(
    () => scoreSeasons(ALL_PREDICTIONS, DEFAULT_SPLIT.trainSeasons),
    [],
  )
  const valSummary = useMemo(
    () => scoreSeasons(ALL_PREDICTIONS, DEFAULT_SPLIT.validationSeasons),
    [],
  )

  const diagnostics = useMemo(() => {
    const seasonsScope = resolveSeasons(season)
    return computeStarSignalDiagnostics(
      ALL_PREDICTIONS,
      seasonsScope,
      summary.starLevelBreakdown,
    )
  }, [season, summary.starLevelBreakdown])

  const winPct = summary.overallWinRate * 100
  const roiPct = summary.roiIfFollowed * 100
  const holdoutBelowBreakEven = valSummary.overallWinRate < BREAKEVEN_WIN_RATE

  const starChart = toStarChartRows(summary.starLevelBreakdown)
  const earlyChart = toStarChartRows(diagnostics.early.breakdown)
  const lateChart = toStarChartRows(diagnostics.late.breakdown)

  const diagnosticClosing = useMemo(
    () => buildDiagnosticClosing(diagnostics, summary.totalPlayableGames),
    [diagnostics, summary.totalPlayableGames],
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Backtest
        </h1>
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Retrospective backtest over nflverse data. Coefficients were fit on
          2022–2023 only; 2024 is holdout. Past performance does not guarantee
          future results.
        </p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SplitCard
          label="Train (2022–2023)"
          winRate={trainSummary.overallWinRate}
          games={trainSummary.totalPlayableGames}
          active={season === 'train'}
          onClick={() => setSeason('train')}
        />
        <SplitCard
          label="Validation holdout (2024)"
          winRate={valSummary.overallWinRate}
          games={valSummary.totalPlayableGames}
          active={season === 'validation'}
          onClick={() => setSeason('validation')}
          emphasize
        />
      </div>

      {holdoutBelowBreakEven ? (
        <p className="mb-4 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Holdout win rate is still below the {(BREAKEVEN_WIN_RATE * 100).toFixed(1)}%
          break-even line. That is a legitimate finding — calibration improved
          transparency, not a claim of edge on unseen data.
        </p>
      ) : trainSummary.overallWinRate < BREAKEVEN_WIN_RATE ? (
        <p className="mb-4 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Holdout (2024) clears the {(BREAKEVEN_WIN_RATE * 100).toFixed(1)}% break-even
          line, but train (2022–2023) does not. Treat the holdout result as
          encouraging, not proven — one season of outperformance is a thin sample.
        </p>
      ) : null}

      {trainSummary.overallWinRate > valSummary.overallWinRate + 0.03 && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Train is meaningfully ahead of validation — treat train-only gains as
          possible overfitting, not improvement.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          View
        </span>
        <Chip
          active={season === 'validation'}
          label="Holdout 2024"
          onClick={() => setSeason('validation')}
        />
        <Chip
          active={season === 'train'}
          label="Train 22–23"
          onClick={() => setSeason('train')}
        />
        <Chip
          active={season === 'all'}
          label="All (mixed)"
          onClick={() => setSeason('all')}
        />
        {seasons.map((s) => (
          <Chip
            key={s}
            active={season === s}
            label={String(s)}
            onClick={() => setSeason(s)}
          />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="ATS win rate"
          value={`${winPct.toFixed(1)}%`}
          hint={`Break-even at −110 is ${(BREAKEVEN_WIN_RATE * 100).toFixed(1)}% · ${summary.totalPlayableGames} playable games`}
          tone={
            summary.overallWinRate >= BREAKEVEN_WIN_RATE ? 'positive' : 'neutral'
          }
        />
        <MetricCard
          label="ROI if followed"
          value={`${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(1)}%`}
          hint="Flat 1-unit bets at −110 on playable signals. 5–10% ROI is a realistic band — not a promise."
          tone={summary.roiIfFollowed >= 0 ? 'positive' : 'loss'}
        />
        <MetricCard
          label="Brier score"
          value={summary.brierScore.toFixed(3)}
          hint="Lower is better. Public benchmarks often land ~0.18–0.20 — context only."
          tone="neutral"
        />
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            summary.overallWinRate >= BREAKEVEN_WIN_RATE
              ? 'bg-edge-positive'
              : 'bg-edge-neutral',
          )}
          style={{ width: `${Math.min(100, winPct)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Bar vs {(BREAKEVEN_WIN_RATE * 100).toFixed(1)}% break-even line
      </p>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Win rate by star level
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Whiskers are 95% Wilson score intervals. Overlapping bars mean the
          buckets are not distinguishable from noise at this sample size.
        </p>
        <StarBarChart data={starChart} height={256} />
        {diagnostics.adjacentOverlapRate >= 0.8 && (
          <p className="mt-3 text-xs text-slate-600">
            {(diagnostics.adjacentOverlapRate * 100).toFixed(0)}% of adjacent
            star buckets have overlapping Wilson intervals in this view — the
            inverted 0.5★ vs 3★ pattern is not statistically resolved.
          </p>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Star-signal diagnostics
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Diagnosis only — no thresholds or coefficients were changed to make
          the chart look better.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Differential vs prediction error
            </p>
            <p className="mt-1 tabular-nums text-xl font-semibold text-slate-900">
              r = {diagnostics.correlationError.correlation.toFixed(3)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {interpretErrorCorrelation(diagnostics.correlationError.correlation)}{' '}
              (n = {diagnostics.correlationError.n})
            </p>
          </div>
          <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Differential vs ATS cover
            </p>
            <p className="mt-1 tabular-nums text-xl font-semibold text-slate-900">
              r = {diagnostics.correlationAts.correlation.toFixed(3)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              {interpretAtsCorrelation(diagnostics.correlationAts.correlation)}{' '}
              (n = {diagnostics.correlationAts.n})
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold text-slate-800">
              Weeks 1–4 (early season)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {diagnostics.early.totalGames} playable games — ratings least
              converged
            </p>
            <StarBarChart data={earlyChart} height={200} compact />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-800">
              Weeks 5+ (later season)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {diagnostics.late.totalGames} playable games — more rating history
            </p>
            <StarBarChart data={lateChart} height={200} compact />
          </div>
        </div>

        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700">
          {diagnosticClosing}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Calibration log</h2>
        <p className="mt-1 text-xs text-slate-500">
          Each step was scored on train and holdout. Selection used train win rate
          (holdout stayed unseen for picking coefficients).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Step</th>
                <th className="py-2 pr-3 font-medium">Coeff</th>
                <th className="py-2 pr-3 font-medium">Old → New</th>
                <th className="py-2 pr-3 font-medium">Train</th>
                <th className="py-2 pr-3 font-medium">Holdout</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {LOG.map((row) => {
                const trainDelta = row.trainWinRateAfter - row.trainWinRateBefore
                const valDelta =
                  row.validationWinRateAfter - row.validationWinRateBefore
                return (
                  <tr key={row.step} className="border-b border-slate-100">
                    <td className="py-2 pr-3 tabular-nums text-slate-700">{row.step}</td>
                    <td className="py-2 pr-3 text-slate-800">{row.coefficient}</td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">
                      {String(row.oldValue)} → {String(row.newValue)}
                    </td>
                    <td
                      className={cn(
                        'py-2 pr-3 tabular-nums',
                        trainDelta > 0.002
                          ? 'text-edge-positive'
                          : trainDelta < -0.002
                            ? 'text-red-600'
                            : 'text-slate-700',
                      )}
                    >
                      {(row.trainWinRateBefore * 100).toFixed(1)}% →{' '}
                      {(row.trainWinRateAfter * 100).toFixed(1)}%
                    </td>
                    <td
                      className={cn(
                        'py-2 pr-3 tabular-nums',
                        valDelta > 0.002
                          ? 'text-edge-positive'
                          : valDelta < -0.002
                            ? 'text-red-600'
                            : 'text-slate-700',
                      )}
                    >
                      {(row.validationWinRateBefore * 100).toFixed(1)}% →{' '}
                      {(row.validationWinRateAfter * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 text-slate-500">{row.note ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          Baseline train {(CALIBRATED.baseline.trainWinRate * 100).toFixed(1)}% /
          holdout {(CALIBRATED.baseline.validationWinRate * 100).toFixed(1)}% → final
          train {(CALIBRATED.final.trainWinRate * 100).toFixed(1)}% / holdout{' '}
          {(CALIBRATED.final.validationWinRate * 100).toFixed(1)}%. Replacement
          add-back: {CALIBRATED.useReplacementAddBack ? 'on' : 'off'}.
        </p>
      </section>

      <p className="mt-6 text-sm text-slate-500">
        New here? Read the{' '}
        <Link to="/how-it-works" className="font-medium text-slate-800 underline">
          How it works
        </Link>{' '}
        walkthrough.
      </p>
    </div>
  )
}

type ChartRow = ReturnType<typeof toStarChartRows>[number]

function StarBarChart({
  data,
  height,
  compact,
}: {
  data: ChartRow[]
  height: number
  compact?: boolean
}) {
  return (
    <div className="mt-3" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: compact ? -16 : -8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: compact ? 10 : 12 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#64748b', fontSize: 11 }}
            unit="%"
            width={compact ? 36 : 40}
          />
          <Tooltip
            formatter={(value, _n, item) => {
              const row = item?.payload as ChartRow | undefined
              if (!row) return [`${value}%`, 'Win rate']
              return [
                `${row.winRate}% (${row.games} games) · 95% CI ${row.wilsonLow}–${row.wilsonHigh}%`,
                'Win rate',
              ]
            }}
          />
          <ReferenceLine
            y={BREAKEVEN_WIN_RATE * 100}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={
              compact
                ? undefined
                : {
                    value: '52.4%',
                    position: 'insideTopRight',
                    fill: '#f59e0b',
                    fontSize: 11,
                  }
            }
          />
          <Bar dataKey="winRate" radius={[4, 4, 0, 0]} maxBarSize={compact ? 28 : 36}>
            {data.map((row) => (
              <Cell
                key={row.label}
                fill={
                  row.games === 0
                    ? '#cbd5e1'
                    : row.winRate >= BREAKEVEN_WIN_RATE * 100
                      ? '#10b981'
                      : '#f59e0b'
                }
              />
            ))}
            <ErrorBar
              dataKey="error"
              width={4}
              strokeWidth={1.25}
              stroke="#334155"
              direction="y"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function interpretErrorCorrelation(r: number): string {
  if (r > 0.15) {
    return 'Positive: larger differentials associate with larger model error — stars may partly measure model noise, not edge.'
  }
  if (r > 0.05) {
    return 'Weakly positive: a mild hint that bigger gaps from the line track noisier spreads, not a strong finding.'
  }
  if (r < -0.1) {
    return 'Negative: larger differentials associate with smaller prediction error — the opposite of a noise story.'
  }
  return 'Near zero: differential size does not clearly track prediction error in this sample.'
}

function interpretAtsCorrelation(r: number): string {
  if (r > 0.1) {
    return 'Positive: larger differentials associate with more ATS covers — the direction a working confidence signal would show.'
  }
  if (r < -0.1) {
    return 'Negative: larger differentials associate with fewer covers — confidence is pointing the wrong way.'
  }
  return 'Near zero: star/differential size is not predicting ATS outcomes in this sample.'
}

function monotonicScore(breakdown: StarLevelResultWithCI[]): number {
  // Spearman-ish: count adjacent pairs where higher stars have higher WR
  let good = 0
  let pairs = 0
  for (let i = 0; i < breakdown.length - 1; i++) {
    const a = breakdown[i]
    const b = breakdown[i + 1]
    if (a.gamesCount < 5 || b.gamesCount < 5) continue
    pairs += 1
    if (b.winRate >= a.winRate - 0.02) good += 1
  }
  return pairs === 0 ? 0.5 : good / pairs
}

function buildDiagnosticClosing(
  d: ReturnType<typeof computeStarSignalDiagnostics>,
  totalGames: number,
): string {
  const parts: string[] = []

  if (d.adjacentOverlapRate >= 0.8) {
    parts.push(
      `Wilson intervals overlap for ${(d.adjacentOverlapRate * 100).toFixed(0)}% of adjacent star buckets (${totalGames} playable games split six ways). Sample size is too small to distinguish these buckets from noise — the inverted low-star vs high-star pattern in a single season is not a resolved finding.`,
    )
  } else {
    parts.push(
      'Some adjacent star buckets have non-overlapping Wilson intervals, so bucket differences may be real — still treat one-season patterns cautiously.',
    )
  }

  const err = d.correlationError.correlation
  const ats = d.correlationAts.correlation
  if (err > 0.1 && Math.abs(ats) < 0.1) {
    parts.push(
      `Differential↔error correlation is weakly positive (r=${err.toFixed(2)}) while differential↔ATS is near zero (r=${ats.toFixed(2)}) — consistent with stars partly reflecting model/market disagreement that is not informative, but the effect is small.`,
    )
  } else if (Math.abs(ats) < 0.1 && Math.abs(err) < 0.1) {
    parts.push(
      `Neither differential↔error (r=${err.toFixed(2)}) nor differential↔ATS (r=${ats.toFixed(2)}) shows a meaningful relationship — the star ladder is not tracking outcomes or error in a clear direction here.`,
    )
  } else {
    parts.push(
      `Correlations: differential↔error r=${err.toFixed(2)}, differential↔ATS r=${ats.toFixed(2)}.`,
    )
  }

  const earlyMono = monotonicScore(d.early.breakdown)
  const lateMono = monotonicScore(d.late.breakdown)
  if (lateMono > earlyMono + 0.25 && lateMono >= 0.6) {
    parts.push(
      `Weeks 5+ look more orderly than weeks 1–4 — early-season rating noise is a plausible contributor; discounting early-week confidence would be a reasonable next experiment.`,
    )
  } else {
    parts.push(
      `Early (weeks 1–4, n=${d.early.totalGames}) and later (weeks 5+, n=${d.late.totalGames}) slices are both scrambled — early-season rating noise alone does not explain the pattern.`,
    )
  }

  parts.push(
    'Worth trying next only after more seasons of data (or a pre-registered larger sample): not retuning star thresholds on this chart. If anything, suppress or down-weight confidence until ratings have more games — but that is a hypothesis to test, not a fix justified by this sample.',
  )

  return parts.join(' ')
}

function SplitCard({
  label,
  winRate,
  games,
  active,
  onClick,
  emphasize,
}: {
  label: string
  winRate: number
  games: number
  active: boolean
  onClick: () => void
  emphasize?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border p-4 text-left transition-colors',
        active
          ? 'border-primary bg-slate-900 text-white'
          : 'border-slate-200 bg-white hover:bg-slate-50',
        emphasize && !active && 'ring-1 ring-amber-200',
      )}
    >
      <p
        className={cn(
          'text-xs font-medium uppercase tracking-wide',
          active ? 'text-slate-300' : 'text-slate-500',
        )}
      >
        {label}
      </p>
      <p className="mt-1 tabular-nums text-2xl font-semibold">
        {(winRate * 100).toFixed(1)}%
      </p>
      <p className={cn('mt-1 text-xs', active ? 'text-slate-400' : 'text-slate-500')}>
        {games} playable games · vs {(BREAKEVEN_WIN_RATE * 100).toFixed(1)}% break-even
      </p>
    </button>
  )
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: 'positive' | 'neutral' | 'loss'
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-1 tabular-nums text-2xl font-semibold',
          tone === 'positive' && 'text-edge-positive',
          tone === 'loss' && 'text-red-600',
          tone === 'neutral' && 'text-slate-900',
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">{hint}</p>
    </div>
  )
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  )
}
