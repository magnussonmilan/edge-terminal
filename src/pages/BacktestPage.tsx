import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
} from '@/lib/backtest'
import { cn } from '@/lib/utils'

export function BacktestPage() {
  const seasons = listSeasons()
  const [season, setSeason] = useState<number | 'all'>('all')

  const summary = useMemo(
    () => computeBacktest(ALL_PREDICTIONS, season),
    [season],
  )

  const winPct = summary.overallWinRate * 100
  const roiPct = summary.roiIfFollowed * 100
  const suspicious = summary.overallWinRate > 0.6 && summary.totalPlayableGames > 50

  const starChart = summary.starLevelBreakdown.map((row) => ({
    label: `${row.starLevel}★`,
    winRate: Math.round(row.winRate * 1000) / 10,
    games: row.gamesCount,
  }))

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Backtest
        </h1>
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Retrospective backtest over 2022–2024 nflverse data. Past performance in a
          backtest does not guarantee future results.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Season
        </span>
        <Chip active={season === 'all'} label="All" onClick={() => setSeason('all')} />
        {seasons.map((s) => (
          <Chip
            key={s}
            active={season === s}
            label={String(s)}
            onClick={() => setSeason(s)}
          />
        ))}
      </div>

      {suspicious && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Win rate is above the ~55–60% top-end realistic range for this sample size.
          Treat as a check-for-leakage signal before presenting — not a headline claim.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="ATS win rate"
          value={`${winPct.toFixed(1)}%`}
          hint={`Break-even at −110 is ${(BREAKEVEN_WIN_RATE * 100).toFixed(1)}% · ${summary.totalPlayableGames} playable games`}
          tone={summary.overallWinRate >= BREAKEVEN_WIN_RATE ? 'positive' : 'neutral'}
        />
        <MetricCard
          label="ROI if followed"
          value={`${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(1)}%`}
          hint="Flat 1-unit bets at −110 on every playable signal. 5–10% ROI is a realistic band — not a promise."
          tone={summary.roiIfFollowed >= 0 ? 'positive' : 'loss'}
        />
        <MetricCard
          label="Brier score"
          value={summary.brierScore.toFixed(3)}
          hint="Lower is better. Public benchmarks often land ~0.18–0.20 — context only, not a guarantee."
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
          Direct test of whether more stars mean a better signal.
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={starChart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} />
              <YAxis
                domain={[0, 100]}
                tick={{ fill: '#64748b', fontSize: 11 }}
                unit="%"
              />
              <Tooltip
                formatter={(value, _n, item) => {
                  const games = (item?.payload as { games?: number } | undefined)?.games
                  return [`${value}% (${games ?? 0} games)`, 'Win rate']
                }}
              />
              <ReferenceLine
                y={BREAKEVEN_WIN_RATE * 100}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                label={{
                  value: '52.4%',
                  position: 'insideTopRight',
                  fill: '#f59e0b',
                  fontSize: 11,
                }}
              />
              <Bar dataKey="winRate" radius={[4, 4, 0, 0]} maxBarSize={36}>
                {starChart.map((row) => (
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
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <p className="mt-6 text-sm text-slate-500">
        New here? Read the{' '}
        <Link to="/how-it-works" className="font-medium text-slate-800 underline">
          How it works
        </Link>{' '}
        walkthrough for what stars and stacks mean in plain language.
      </p>
    </div>
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
