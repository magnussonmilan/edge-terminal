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
import type { Trade } from '@/types/trade'
import { cn } from '@/lib/utils'

interface PerformanceChartProps {
  trade: Trade
  /** Premium-only context filter — free tier always uses 'all'. */
  chartContext?: 'all' | 'home' | 'away' | 'matchup'
  className?: string
}

export function PerformanceChart({
  trade,
  chartContext = 'all',
  className,
}: PerformanceChartProps) {
  const bookLine =
    Object.values(trade.books).find((b) => b.available)?.spread ??
    trade.historicalData.average

  // Phase 1: mock context filtering by slicing the series (premium gate in parent).
  const games = (() => {
    const all = trade.historicalData.last10Games
    if (chartContext === 'home') return all.filter((_, i) => i % 2 === 0)
    if (chartContext === 'away') return all.filter((_, i) => i % 2 === 1)
    if (chartContext === 'matchup') return all.slice(-5)
    return all
  })()

  const data = games.map((g, i) => ({
    label: `G${i + 1}`,
    value: g.value,
    date: g.date,
    hit: g.value >= bookLine,
  }))

  return (
    <div className={cn('h-48 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            className="tabular-nums"
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 12,
            }}
            formatter={(value) => [value as number, 'Result']}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { date?: string } | undefined
              return row?.date ?? ''
            }}
          />
          <ReferenceLine
            y={bookLine}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{
              value: `Book ${bookLine}`,
              position: 'insideTopRight',
              fill: '#f59e0b',
              fontSize: 11,
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={28}>
            {data.map((entry) => (
              <Cell
                key={entry.label}
                fill={entry.hit ? '#10b981' : '#94a3b8'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
