import { useEffect, useMemo, useState } from 'react'
import {
  fetchStacks,
  filterStacksByTeam,
  FREE_STACK_LIMIT,
  listStackTeams,
  sortByJointHitRate,
  STACK_FINDER_META,
} from '@/lib/stacks'
import type { Stack } from '@/types/stack'
import { StackCard } from '@/components/stack/StackCard'
import { TradeCardSkeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTradeStore } from '@/store/useTradeStore'

export function StacksPage() {
  const [stacks, setStacks] = useState<Stack[]>([])
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<string | 'all'>('all')
  const tier = useTradeStore((s) => s.user.tier)
  const setTier = useTradeStore((s) => s.setTier)
  const isPremium = tier === 'premium'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetchStacks().then((data) => {
      if (!cancelled) {
        setStacks(sortByJointHitRate(data))
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const teams = useMemo(() => listStackTeams(stacks), [stacks])
  const filtered = useMemo(
    () => sortByJointHitRate(filterStacksByTeam(stacks, team)),
    [stacks, team],
  )
  const visible = isPremium ? filtered : filtered.slice(0, FREE_STACK_LIMIT)
  const locked = !isPremium ? filtered.slice(FREE_STACK_LIMIT) : []

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Stack Finder
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Correlated NFL prop pairs from real nflverse game logs (
          {STACK_FINDER_META.seasons.join('–')}). Flat-payout pick&apos;em apps price
          legs independently — these pairs move together. Sorted by joint hit-rate.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Team
        </span>
        <select
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800"
          value={team}
          onChange={(e) => setTeam(e.target.value)}
        >
          <option value="all">All teams</option>
          {teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">
          Min {STACK_FINDER_META.minSampleSize} shared games · illustrative averages, not
          live lines
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <TradeCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => (
              <StackCard key={s.pairKey} stack={s} />
            ))}
          </div>

          {locked.length > 0 && (
            <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-200">
              <div
                className="pointer-events-none grid grid-cols-1 gap-4 p-4 opacity-40 blur-[2px] sm:grid-cols-2 lg:grid-cols-3"
                aria-hidden
              >
                {locked.slice(0, 3).map((s) => (
                  <StackCard key={s.pairKey} stack={s} />
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-white/60 p-6">
                <div className="max-w-sm rounded-lg border border-amber-200 bg-white p-5 text-center shadow-sm">
                  <Badge className="bg-amber-100 text-amber-800 normal-case">
                    Upgrade to Premium — $29.99/mo
                  </Badge>
                  <p className="mt-3 text-sm text-slate-600">
                    Free tier shows the top {FREE_STACK_LIMIT} stacks by joint hit-rate.
                    Unlock the full ranked list.
                  </p>
                  <Button className="mt-4 w-full" onClick={() => setTier('premium')}>
                    Upgrade to Premium — $29.99/mo
                  </Button>
                </div>
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-600">
              No stacks for this team with at least {STACK_FINDER_META.minSampleSize}{' '}
              shared games.
            </p>
          )}
        </>
      )}
    </div>
  )
}
