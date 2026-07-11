import { useMemo, useState } from 'react'
import {
  RankingsPageShell,
  RankTable,
  SeasonChips,
  WeekChips,
} from '@/components/rankings/RankingsShell'
import {
  getPowerRatings,
  latestWeekForSeason,
  listRankingSeasons,
  listRatingWeeks,
} from '@/lib/rankingsData'

export function PowerRatingsPage() {
  const seasons = listRankingSeasons()
  const [season, setSeason] = useState(seasons[0] ?? 2024)
  const weeks = listRatingWeeks(season)
  const [week, setWeek] = useState(latestWeekForSeason(season))
  const rows = useMemo(
    () => getPowerRatings(season, week),
    [season, week],
  )

  return (
    <RankingsPageShell
      title="Power ratings"
      caveat="Team ratings from the v3 Elo pipeline (QB-neutral team strength + WEPA blend), shown as of the selected week. These are internal strength estimates in point-spread units — not a claim they beat the closing line. Feature parity with a rankings page, not edge parity."
    >
      <SeasonChips
        seasons={seasons}
        season={season}
        onChange={(s) => {
          setSeason(s)
          setWeek(latestWeekForSeason(s))
        }}
      />
      <WeekChips weeks={weeks} week={week} onChange={setWeek} />
      <p className="mb-3 text-xs text-slate-500">
        Snapshot after week {week} games ({rows.length} teams). Pre-game
        ratings for week W use week W−1 (no look-ahead).
      </p>
      <RankTable headers={['Rank', 'Team', 'Rating']}>
        {rows.map((r) => (
          <tr key={r.team} className="border-b border-slate-100">
            <td className="px-3 py-2 tabular-nums text-slate-500">{r.rank}</td>
            <td className="px-3 py-2 font-medium text-slate-900">{r.team}</td>
            <td className="px-3 py-2 tabular-nums text-slate-800">
              {r.rating.toFixed(2)}
            </td>
          </tr>
        ))}
      </RankTable>
    </RankingsPageShell>
  )
}
