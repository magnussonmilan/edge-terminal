import { useMemo, useState } from 'react'
import {
  FREE_STACK_LIMIT,
  getStacks,
  listSeasons,
  listWeeks,
} from '@/lib/nflData'
import { StackCard } from '@/components/stack/StackCard'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTradeStore } from '@/store/useTradeStore'
import { cn } from '@/lib/utils'

export function StacksPage() {
  const seasons = listSeasons()
  const [season, setSeason] = useState(seasons[0] ?? 2024)
  const weeks = listWeeks(season)
  const [week, setWeek] = useState<number | 'all'>('all')
  const tier = useTradeStore((s) => s.user.tier)
  const setTier = useTradeStore((s) => s.setTier)
  const isPremium = tier === 'premium'

  const stacks = useMemo(
    () => getStacks(season, week === 'all' ? undefined : week),
    [season, week],
  )
  const visible = isPremium ? stacks : stacks.slice(0, FREE_STACK_LIMIT)
  const locked = !isPremium ? stacks.slice(FREE_STACK_LIMIT) : []

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Stack Finder
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Correlation stacks for prop pairs. Independent from power ratings — when a
          stack&apos;s game also has a high-confidence prediction, we show a game-star
          badge.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Season
        </span>
        {seasons.map((s) => (
          <Chip
            key={s}
            active={season === s}
            label={String(s)}
            onClick={() => {
              setSeason(s)
              setWeek('all')
            }}
          />
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Week
        </span>
        <Chip active={week === 'all'} label="All" onClick={() => setWeek('all')} />
        {weeks.map((w) => (
          <Chip
            key={w}
            active={week === w}
            label={`W${w}`}
            onClick={() => setWeek(w)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => (
          <StackCard key={s.id} stack={s} />
        ))}
      </div>

      {locked.length > 0 && (
        <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-200">
          <div
            className="pointer-events-none grid grid-cols-1 gap-4 p-4 opacity-40 blur-[2px] sm:grid-cols-2 lg:grid-cols-3"
            aria-hidden
          >
            {locked.slice(0, 3).map((s) => (
              <StackCard key={s.id} stack={s} />
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 p-6">
            <div className="max-w-sm rounded-lg border border-amber-200 bg-white p-5 text-center shadow-sm">
              <Badge className="bg-amber-100 text-amber-800 normal-case">
                Upgrade to Premium — $29.99/mo
              </Badge>
              <p className="mt-3 text-sm text-slate-600">
                Free tier shows {FREE_STACK_LIMIT} stacks. Unlock the rest.
              </p>
              <Button className="mt-4 w-full" onClick={() => setTier('premium')}>
                Upgrade to Premium — $29.99/mo
              </Button>
            </div>
          </div>
        </div>
      )}

      {stacks.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-600">
          No stacks for this filter. High-star games seed the demo stack list.
        </p>
      )}
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
