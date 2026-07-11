import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/rankings/power', label: 'Power ratings' },
  { to: '/rankings/qb', label: 'QB rankings' },
  { to: '/rankings/epa', label: 'EPA tiers' },
  { to: '/rankings/sos', label: 'Strength of schedule' },
  { to: '/rankings/tendencies', label: 'Tendencies' },
  { to: '/rankings/win-totals', label: 'Win totals' },
] as const

export function RankingsSubnav() {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 pb-3">
      {LINKS.map((l) => (
        <NavLink
          key={l.to}
          to={l.to}
          className={({ isActive }) =>
            cn(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          {l.label}
        </NavLink>
      ))}
    </div>
  )
}

export function RankingsPageShell({
  title,
  caveat,
  children,
}: {
  title: string
  caveat: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <RankingsSubnav />
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        {caveat}
      </p>
      <div className="mt-6">{children}</div>
    </div>
  )
}

export function SeasonChips({
  seasons,
  season,
  onChange,
}: {
  seasons: number[]
  season: number
  onChange: (s: number) => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Season
      </span>
      {seasons.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={cn(
            'rounded-md px-2.5 py-1 text-sm font-medium',
            season === s
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
          )}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

export function WeekChips({
  weeks,
  week,
  onChange,
}: {
  weeks: number[]
  week: number
  onChange: (w: number) => void
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Week
      </span>
      {weeks.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onChange(w)}
          className={cn(
            'rounded-md px-2 py-1 text-xs font-medium',
            week === w
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
          )}
        >
          {w}
        </button>
      ))}
    </div>
  )
}

export function RankTable({
  headers,
  children,
}: {
  headers: string[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function pct(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return '—'
  return `${(x * 100).toFixed(1)}%`
}
