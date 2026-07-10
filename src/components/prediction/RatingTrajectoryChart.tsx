import {
  Line,
  LineChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getTeamTrajectory } from '@/lib/nflData'
import { cn } from '@/lib/utils'

interface RatingTrajectoryChartProps {
  season: number
  homeTeam: string
  awayTeam: string
  className?: string
}

export function RatingTrajectoryChart({
  season,
  homeTeam,
  awayTeam,
  className,
}: RatingTrajectoryChartProps) {
  const home = getTeamTrajectory(season, homeTeam)
  const away = getTeamTrajectory(season, awayTeam)
  const weeks = new Set([...home.map((p) => p.week), ...away.map((p) => p.week)])
  const data = [...weeks]
    .sort((a, b) => a - b)
    .map((week) => ({
      week: week === 0 ? 'W0' : `W${week}`,
      [homeTeam]: home.find((p) => p.week === week)?.rating ?? null,
      [awayTeam]: away.find((p) => p.week === week)?.rating ?? null,
    }))

  return (
    <div className={cn('h-48 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="week"
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
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey={homeTeam}
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey={awayTeam}
            stroke="#1e293b"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
