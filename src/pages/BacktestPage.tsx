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
import {
  ALL_PREDICTIONS,
  CALIBRATED_V3,
  PREDICTIONS_V3_INDEPENDENT,
  PREDICTIONS_V3_MARKET,
  listSeasons,
} from '@/lib/nflData'
import {
  BREAKEVEN_WIN_RATE,
  computeBacktest,
  computeStarSignalDiagnostics,
  computeStraightUpAccuracy,
  formatWinRateWithCI,
  type StarLevelResultWithCI,
} from '@/lib/backtest'
import { DEFAULT_SPLIT, scoreSeasons } from '@/lib/calibration'
import { cn } from '@/lib/utils'
import calibrationLog from '@/data/nfl/calibration-log.json'
import calibratedCoeffs from '@/data/nfl/calibrated-coeffs.json'
import v3Diagnostics from '@/data/nfl/v3-diagnostics.json'

type FoldLog = {
  trainSeasons: number[]
  valSeason: number
  winRate: number
  brierScore: number
  sampleSize: number
  hfa?: number
}

type CrossFold = {
  meanWinRate: number
  stdWinRate: number
  meanBrier: number
  totalValGames: number
  clearsBreakevenAtMeanMinusOneStd: boolean
  meanMinusOneStd?: number
  breakeven?: number
  folds?: FoldLog[]
}

type CalibratedFile = {
  methodology?: string
  seasons?: number[]
  split: { trainSeasons: number[]; validationSeasons: number[] }
  crossFold?: CrossFold
  folds?: FoldLog[]
  final: {
    trainWinRate?: number
    validationWinRate?: number
    allWinRate: number
    brierScore: number
    roiIfFollowed: number
    totalPlayableGames: number
  }
  hfa: number | Record<string, number>
  playerCoeffs: Record<string, number>
  useReplacementAddBack: boolean
}

type CalibrationLogFile = {
  methodology?: string
  folds?: FoldLog[]
  crossFold?: CrossFold
}

const CALIBRATED = calibratedCoeffs as CalibratedFile
const LOG_FILE = calibrationLog as CalibrationLogFile

const SPLIT = CALIBRATED.split ?? DEFAULT_SPLIT
const CROSS: CrossFold | null = CALIBRATED.crossFold ?? null
const FOLDS: FoldLog[] = Array.isArray(CALIBRATED.folds)
  ? CALIBRATED.folds
  : Array.isArray(LOG_FILE.folds)
    ? LOG_FILE.folds
    : []

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
      ciLabel: formatWinRateWithCI(
        row.winRate,
        row.wilsonLow,
        row.wilsonHigh,
        row.gamesCount,
      ),
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
  if (season === 'train') return SPLIT.trainSeasons
  if (season === 'validation') return SPLIT.validationSeasons
  if (season === 'all') return 'all'
  return [season]
}

export function BacktestPage() {
  const seasons = listSeasons()
  const [season, setSeason] = useState<number | 'all' | 'train' | 'validation'>(
    'all',
  )

  const summary = useMemo(() => {
    if (season === 'train') {
      return scoreSeasons(ALL_PREDICTIONS, SPLIT.trainSeasons)
    }
    if (season === 'validation') {
      return scoreSeasons(ALL_PREDICTIONS, SPLIT.validationSeasons)
    }
    return computeBacktest(ALL_PREDICTIONS, season)
  }, [season])

  const trainSummary = useMemo(
    () => scoreSeasons(ALL_PREDICTIONS, SPLIT.trainSeasons),
    [],
  )
  const valSummary = useMemo(
    () => scoreSeasons(ALL_PREDICTIONS, SPLIT.validationSeasons),
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

  const starChart = toStarChartRows(summary.starLevelBreakdown)
  const earlyChart = toStarChartRows(diagnostics.early.breakdown)
  const lateChart = toStarChartRows(diagnostics.late.breakdown)

  const diagnosticClosing = useMemo(
    () => buildDiagnosticClosing(diagnostics, summary.totalPlayableGames),
    [diagnostics, summary.totalPlayableGames],
  )

  const trainLabel = `Train (${SPLIT.trainSeasons[0]}–${SPLIT.trainSeasons[SPLIT.trainSeasons.length - 1]})`
  const valLabel = `Last season (${SPLIT.validationSeasons.join(', ')})`

  const v3 = CALIBRATED_V3
  const v3Ready = v3.generatedAt !== 'pending'
  const v3Split = v3.actualSplit
  const v3TrainLabel = `${v3Split.trainSeasons[0]}–${v3Split.trainSeasons[v3Split.trainSeasons.length - 1]}`
  const v3ValLabel = v3Split.validationSeasons.join(', ')

  const diagReady =
    (v3Diagnostics as { generatedAt?: string }).generatedAt !== 'pending'

  const suScope = useMemo(() => resolveSeasons(season), [season])
  const suV2 = useMemo(
    () => computeStraightUpAccuracy(ALL_PREDICTIONS, suScope),
    [suScope],
  )
  const suV3Ind = useMemo(
    () => computeStraightUpAccuracy(PREDICTIONS_V3_INDEPENDENT, suScope),
    [suScope],
  )
  const suV3Blend = useMemo(
    () => computeStraightUpAccuracy(PREDICTIONS_V3_MARKET, suScope),
    [suScope],
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Backtest
        </h1>
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Joint ridge calibration with rolling-origin cross-validation
          {CALIBRATED.seasons
            ? ` over ${CALIBRATED.seasons[0]}–${CALIBRATED.seasons[CALIBRATED.seasons.length - 1]}`
            : ''}
          . Primary validation metric is cross-fold mean ± std — not a single
          holdout year. Past performance does not guarantee future results.
        </p>
      </header>

      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Model architecture comparison
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          v2 = power rating + key numbers. v3-independent = QB-Elo + weighted
          EPA (no market blend). v3-market-blended = same ratings with ongoing
          market reversion — a different question than beating the line cold.
          Holdout split for v3: train {v3TrainLabel} / validate {v3ValLabel}.
        </p>
        {!v3Ready ? (
          <p className="mt-3 text-sm text-slate-600">
            Run <code className="rounded bg-slate-100 px-1">npm run calibrate:v3</code>{' '}
            to populate v3 numbers.
          </p>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-3 font-medium">Variant</th>
                    <th className="py-2 pr-3 font-medium">Train ATS</th>
                    <th className="py-2 pr-3 font-medium">Holdout ATS</th>
                    <th className="py-2 font-medium">vs v2 holdout</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-slate-800">
                  <CompareRow
                    name="v2 (power + stars)"
                    trainWr={v3.v2.trainWinRate}
                    trainN={v3.v2.trainGames}
                    valWr={v3.v2.validationWinRate}
                    valN={v3.v2.validationGames}
                    vsV2="baseline"
                  />
                  <CompareRow
                    name="v3 independent"
                    trainWr={v3.v3Independent.trainWinRate}
                    trainN={v3.v3Independent.trainGames}
                    valWr={v3.v3Independent.validationWinRate}
                    valN={v3.v3Independent.validationGames}
                    vsV2={
                      v3.v3Independent.beatsV2Holdout ? 'beats' : 'does not beat'
                    }
                  />
                  <CompareRow
                    name="v3 market-blended"
                    trainWr={v3.v3MarketBlended.trainWinRate}
                    trainN={v3.v3MarketBlended.trainGames}
                    valWr={v3.v3MarketBlended.validationWinRate}
                    valN={v3.v3MarketBlended.validationGames}
                    vsV2={
                      v3.v3MarketBlended.beatsV2Holdout
                        ? 'beats'
                        : 'does not beat'
                    }
                  />
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-slate-700">{v3.verdict}</p>
            <p className="mt-2 text-xs text-slate-500">
              Market blend weight (train-fit): {v3.modelWeight.toFixed(2)}.
              Breakeven at −110 is {(BREAKEVEN_WIN_RATE * 100).toFixed(1)}%.{' '}
              {v3Split.note}
            </p>
          </>
        )}
      </section>

      <section className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Straight-up accuracy (not ATS)
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Did the model favor the side that won the game? This is a different,
          easier bar than ATS — favorites win more often than not. Do not
          compare this percentage to ATS win rate (or to nfelo&apos;s 53.70% ATS
          vs 66.61% Accuracy figures interchangeably).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SuCard
            label="v2"
            accuracy={suV2.accuracy}
            n={suV2.totalGames}
          />
          <SuCard
            label="v3 independent"
            accuracy={suV3Ind.accuracy}
            n={suV3Ind.totalGames}
          />
          <SuCard
            label="v3 market-blended"
            accuracy={suV3Blend.accuracy}
            n={suV3Blend.totalGames}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Scope matches the season chips above (view filter). Model push
          (spread exactly 0) excluded from the denominator.
        </p>
      </section>

      {diagReady && (
        <section className="mb-8 rounded-lg border border-rose-200 bg-rose-50/40 p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            v3 regression diagnostics
          </h2>
          <p className="mt-2 text-sm text-slate-800">
            {(v3Diagnostics as { overall?: string }).overall}
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-slate-700">
            <li>
              {(v3Diagnostics as { marketBlend?: { conclusion?: string } })
                .marketBlend?.conclusion}
            </li>
            <li>
              {
                (
                  v3Diagnostics as {
                    brier?: { overconfidence?: string }
                  }
                ).brier?.overconfidence
              }
            </li>
            <li>
              {
                (
                  v3Diagnostics as {
                    qbVolatility?: { note?: string }
                  }
                ).qbVolatility?.note
              }
            </li>
            <li>
              {
                (
                  v3Diagnostics as {
                    wepa?: { productionNote?: string }
                  }
                ).wepa?.productionNote
              }
            </li>
          </ul>
        </section>
      )}

      {CROSS && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Cross-fold validation WR
          </p>
          <p className="mt-1 tabular-nums text-2xl font-semibold text-slate-900">
            {(CROSS.meanWinRate * 100).toFixed(1)}% ±{' '}
            {(CROSS.stdWinRate * 100).toFixed(1)}pp
          </p>
          <p className="mt-1 text-xs text-slate-500">
            mean − 1σ = {((CROSS.meanWinRate - CROSS.stdWinRate) * 100).toFixed(1)}%
            {' · '}
            {FOLDS.length} folds · {CROSS.totalValGames} val-fold games summed ·
            breakeven {(BREAKEVEN_WIN_RATE * 100).toFixed(1)}%
          </p>
          {!CROSS.clearsBreakevenAtMeanMinusOneStd ? (
            <p className="mt-2 text-sm text-slate-700">
              mean − 1σ does not clear breakeven — no trustworthy edge claimed.
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-700">
              mean − 1σ clears breakeven on this sample — still provisional, not
              a guarantee.
            </p>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <SplitCard
          label={trainLabel}
          winRate={trainSummary.overallWinRate}
          games={trainSummary.totalPlayableGames}
          active={season === 'train'}
          onClick={() => setSeason('train')}
        />
        <SplitCard
          label={valLabel}
          winRate={valSummary.overallWinRate}
          games={valSummary.totalPlayableGames}
          active={season === 'validation'}
          onClick={() => setSeason('validation')}
          emphasize
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          View
        </span>
        <Chip
          active={season === 'all'}
          label="All seasons"
          onClick={() => setSeason('all')}
        />
        <Chip
          active={season === 'train'}
          label="Train window"
          onClick={() => setSeason('train')}
        />
        <Chip
          active={season === 'validation'}
          label="Last season"
          onClick={() => setSeason('validation')}
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
          label="ATS win rate (view)"
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
          Each tier shows Wilson 95% CI as whiskers and as “rate ± half-width,
          n=…”. Overlapping intervals mean buckets are not distinguishable from
          noise.
        </p>
        <StarBarChart data={starChart} height={256} />
        <ul className="mt-3 grid gap-1 sm:grid-cols-2">
          {summary.starLevelBreakdown.map((row) => (
            <li
              key={row.starLevel}
              className="text-xs tabular-nums text-slate-700"
            >
              <span className="font-medium text-slate-900">
                {row.starLevel}★
              </span>{' '}
              {formatWinRateWithCI(
                row.winRate,
                row.wilsonLow,
                row.wilsonHigh,
                row.gamesCount,
              )}
            </li>
          ))}
        </ul>
        {diagnostics.adjacentOverlapRate >= 0.8 && (
          <p className="mt-3 text-xs text-slate-600">
            {(diagnostics.adjacentOverlapRate * 100).toFixed(0)}% of adjacent
            star buckets have overlapping Wilson intervals in this view.
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
          Rolling-origin folds: coeffs fit by joint ridge on train seasons
          (margins), scored on the next unseen season. Selection is not based on
          ATS win rate.
        </p>
        {FOLDS.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Train</th>
                  <th className="py-2 pr-3 font-medium">Val</th>
                  <th className="py-2 pr-3 font-medium">WR</th>
                  <th className="py-2 pr-3 font-medium">Brier</th>
                  <th className="py-2 font-medium">n</th>
                </tr>
              </thead>
              <tbody>
                {FOLDS.map((row) => (
                  <tr
                    key={`${row.valSeason}-${row.trainSeasons.join('-')}`}
                    className="border-b border-slate-100"
                  >
                    <td className="py-2 pr-3 tabular-nums text-slate-700">
                      {row.trainSeasons[0]}
                      {row.trainSeasons.length > 1
                        ? `–${row.trainSeasons[row.trainSeasons.length - 1]}`
                        : ''}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-800">
                      {row.valSeason}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-700">
                      {(row.winRate * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-slate-600">
                      {row.brierScore.toFixed(3)}
                    </td>
                    <td className="py-2 tabular-nums text-slate-600">
                      {row.sampleSize}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            No fold log yet — run{' '}
            <code className="text-slate-700">npm run calibrate</code>.
          </p>
        )}
        {CROSS && (
          <p className="mt-3 text-xs text-slate-400">
            Cross-fold mean {(CROSS.meanWinRate * 100).toFixed(1)}% ±{' '}
            {(CROSS.stdWinRate * 100).toFixed(1)}pp · all-season playable{' '}
            {CALIBRATED.final.totalPlayableGames} · replacement{' '}
            {CALIBRATED.useReplacementAddBack ? 'on' : 'off'}.
          </p>
        )}
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
            formatter={(_value, _n, item) => {
              const row = item?.payload as ChartRow | undefined
              if (!row) return ['—', 'Win rate']
              return [row.ciLabel, 'Win rate']
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
      `Wilson intervals overlap for ${(d.adjacentOverlapRate * 100).toFixed(0)}% of adjacent star buckets (${totalGames} playable games split six ways). Sample size is too small to distinguish these buckets from noise.`,
    )
  } else {
    parts.push(
      'Some adjacent star buckets have non-overlapping Wilson intervals, so bucket differences may be real — still treat single-season patterns cautiously.',
    )
  }

  const err = d.correlationError.correlation
  const ats = d.correlationAts.correlation
  if (err > 0.1 && Math.abs(ats) < 0.1) {
    parts.push(
      `Differential↔error correlation is weakly positive (r=${err.toFixed(2)}) while differential↔ATS is near zero (r=${ats.toFixed(2)}).`,
    )
  } else if (Math.abs(ats) < 0.1 && Math.abs(err) < 0.1) {
    parts.push(
      `Neither differential↔error (r=${err.toFixed(2)}) nor differential↔ATS (r=${ats.toFixed(2)}) shows a meaningful relationship.`,
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
      'Weeks 5+ look more orderly than weeks 1–4 — early-season rating noise is a plausible contributor.',
    )
  } else {
    parts.push(
      `Early (weeks 1–4, n=${d.early.totalGames}) and later (weeks 5+, n=${d.late.totalGames}) slices are both scrambled — early-season rating noise alone does not explain the pattern.`,
    )
  }

  parts.push(
    'Trust cross-fold mean ± std over any single-season star chart before claiming edge.',
  )

  return parts.join(' ')
}

function SuCard({
  label,
  accuracy,
  n,
}: {
  label: string
  accuracy: number
  n: number
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 tabular-nums text-xl font-semibold text-slate-900">
        {(accuracy * 100).toFixed(1)}%
      </p>
      <p className="mt-0.5 text-xs text-slate-500">n={n} decided games</p>
    </div>
  )
}

function CompareRow({
  name,
  trainWr,
  trainN,
  valWr,
  valN,
  vsV2,
}: {
  name: string
  trainWr: number
  trainN: number
  valWr: number
  valN: number
  vsV2: 'baseline' | 'beats' | 'does not beat'
}) {
  const vsLabel =
    vsV2 === 'baseline' ? '—' : vsV2 === 'beats' ? 'beats v2' : 'does not beat v2'
  const vsTone =
    vsV2 === 'beats'
      ? 'text-emerald-700'
      : vsV2 === 'does not beat'
        ? 'text-slate-600'
        : 'text-slate-400'
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2.5 pr-3 font-medium text-slate-900">{name}</td>
      <td className="py-2.5 pr-3">
        {(trainWr * 100).toFixed(1)}%
        <span className="text-slate-400"> · n={trainN}</span>
      </td>
      <td className="py-2.5 pr-3">
        {(valWr * 100).toFixed(1)}%
        <span className="text-slate-400"> · n={valN}</span>
      </td>
      <td className={cn('py-2.5', vsTone)}>{vsLabel}</td>
    </tr>
  )
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
