import type { BetType, Sport, UserAction } from '@/types/trade'
import { useTradeStore } from '@/store/useTradeStore'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

const SPORTS: Array<Sport | 'all'> = ['all', 'nba', 'nfl', 'mlb', 'nhl']
const BET_TYPES: Array<BetType | 'all'> = [
  'all',
  'prop',
  'spread',
  'moneyline',
  'total',
]
const ACTIONS: Array<UserAction | 'all'> = [
  'all',
  'ignored',
  'watchlisted',
  'placed',
]

export function FeedFilters() {
  const filters = useTradeStore((s) => s.filters)
  const setFilter = useTradeStore((s) => s.setFilter)
  const user = useTradeStore((s) => s.user)
  const setTier = useTradeStore((s) => s.setTier)
  const bankroll = useTradeStore((s) => s.bankroll)
  const setBankroll = useTradeStore((s) => s.setBankroll)
  const triggerMockShock = useTradeStore((s) => s.triggerMockShock)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Sport
        </span>
        {SPORTS.map((sport) => (
          <FilterChip
            key={sport}
            active={filters.sport === sport}
            onClick={() => setFilter('sport', sport)}
            label={sport === 'all' ? 'All' : sport.toUpperCase()}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Bet type
        </span>
        {BET_TYPES.map((betType) => (
          <FilterChip
            key={betType}
            active={filters.betType === betType}
            onClick={() => setFilter('betType', betType)}
            label={betType === 'all' ? 'All' : betType}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Status
        </span>
        {ACTIONS.map((action) => (
          <FilterChip
            key={action}
            active={filters.userAction === action}
            onClick={() => setFilter('userAction', action)}
            label={
              action === 'all'
                ? 'All'
                : action === 'ignored'
                  ? 'Open'
                  : action
            }
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-slate-200 pt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Dev
        </span>
        <FilterChip
          active={user.tier === 'premium'}
          onClick={() => setTier(user.tier === 'free' ? 'premium' : 'free')}
          label={`Tier: ${user.tier}`}
        />
        <button
          type="button"
          onClick={triggerMockShock}
          className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
        >
          Trigger shock
        </button>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Bankroll
          <Input
            type="number"
            min={1}
            className="h-8 w-24 tabular-nums"
            value={bankroll}
            onChange={(e) => setBankroll(Number(e.target.value) || 0)}
          />
        </label>
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
        active
          ? 'border-primary bg-primary text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
      )}
    >
      {label}
    </button>
  )
}
