import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Stack } from '@/types/stack'
import { propTypeLabel } from '@/lib/correlation'
import { cn } from '@/lib/utils'

interface StackChartProps {
  stack: Stack
  className?: string
}

export function StackChart({ stack, className }: StackChartProps) {
  const labelA = shortName(stack.playerA.name)
  const labelB = shortName(stack.playerB.name)

  const data = stack.gameIds.map((gid, i) => ({
    game: `G${i + 1}`,
    gameId: gid,
    [labelA]: stack.seriesA[i],
    [labelB]: stack.seriesB[i],
  }))

  return (
    <div className={cn('h-52 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="game"
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
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as { gameId?: string } | undefined
              return row?.gameId ?? ''
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) => {
              if (value === labelA) {
                return `${labelA} ${propTypeLabel(stack.playerA.propType)}`
              }
              if (value === labelB) {
                return `${labelB} ${propTypeLabel(stack.playerB.propType)}`
              }
              return value
            }}
          />
          <ReferenceLine
            y={stack.lineA}
            stroke="#10b981"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
          <ReferenceLine
            y={stack.lineB}
            stroke="#1e293b"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
          <Line
            type="monotone"
            dataKey={labelA}
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
          <Line
            type="monotone"
            dataKey={labelB}
            stroke="#1e293b"
            strokeWidth={2}
            dot={{ r: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0][0]}. ${parts[parts.length - 1]}`
}
