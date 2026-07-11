import { useMemo, useState } from 'react'
import {
  RankingsPageShell,
  RankTable,
  SeasonChips,
} from '@/components/rankings/RankingsShell'
import { getEpaTiers, listRankingSeasons } from '@/lib/rankingsData'
import { cn } from '@/lib/utils'

export function EpaTiersPage() {
  const seasons = listRankingSeasons()
  const [season, setSeason] = useState(seasons[0] ?? 2024)
  const rows = useMemo(() => getEpaTiers(season), [season])

  return (
    <RankingsPageShell
      title="EPA tiers"
      caveat="Weighted EPA (WEPA) team grades from the existing play-by-play cache — mean offense WEPA minus defense WEPA allowed. Tiers are quantile labels on that ranking, not a separate model. WEPA coverage is incomplete for some games (calibrate falls back to weekly player-EPA); this is not a claim the tiers beat the market."
    >
      <SeasonChips seasons={seasons} season={season} onChange={setSeason} />
      <RankTable
        headers={[
          'Rank',
          'Team',
          'Tier',
          'Non-net grade',
          'Off WEPA',
          'Def WEPA allowed',
          'Games',
        ]}
      >
        {rows.map((r) => (
          <tr key={r.team} className="border-b border-slate-100">
            <td className="px-3 py-2 tabular-nums text-slate-500">{r.rank}</td>
            <td className="px-3 py-2 font-medium">{r.team}</td>
            <td className="px-3 py-2">
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-xs font-medium',
                  r.tier === 'Elite' && 'bg-emerald-100 text-emerald-900',
                  r.tier === 'Above avg' && 'bg-sky-100 text-sky-900',
                  r.tier === 'Average' && 'bg-slate-100 text-slate-700',
                  r.tier === 'Below avg' && 'bg-amber-100 text-amber-900',
                  r.tier === 'Poor' && 'bg-rose-100 text-rose-900',
                )}
              >
                {r.tier}
              </span>
            </td>
            <td className="px-3 py-2 tabular-nums">
              {r.nonNetGrade.toFixed(2)}
            </td>
            <td className="px-3 py-2 tabular-nums text-slate-600">
              {r.offenseWepa.toFixed(2)}
            </td>
            <td className="px-3 py-2 tabular-nums text-slate-600">
              {r.defenseWepaAllowed.toFixed(2)}
            </td>
            <td className="px-3 py-2 tabular-nums text-slate-500">{r.games}</td>
          </tr>
        ))}
      </RankTable>
    </RankingsPageShell>
  )
}
