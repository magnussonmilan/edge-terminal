import { useMemo, useState } from 'react'
import {
  RankingsPageShell,
  RankTable,
  SeasonChips,
  WeekChips,
} from '@/components/rankings/RankingsShell'
import {
  getQbRankings,
  listQbSampleSeasons,
  listQbSampleWeeks,
} from '@/lib/rankingsData'

export function QbRankingsPage() {
  const seasons = listQbSampleSeasons()
  const [season, setSeason] = useState(seasons[0] ?? 2016)
  const weeks = listQbSampleWeeks(season)
  const [week, setWeek] = useState(weeks[0] ?? 1)
  const { rows, dataNote } = useMemo(
    () => getQbRankings(season, week),
    [season, week],
  )

  return (
    <RankingsPageShell
      title="QB rankings"
      caveat="QB Elo from the existing qbElo.ts pipeline. Ratings are not a market-beating guarantee — they feed the v3 team adjustment. This page displays stored snapshots; it does not invent a new QB model."
    >
      <SeasonChips
        seasons={seasons}
        season={season}
        onChange={(s) => {
          setSeason(s)
          const w = listQbSampleWeeks(s)
          setWeek(w[0] ?? 1)
        }}
      />
      <WeekChips weeks={weeks} week={week} onChange={setWeek} />
      <p className="mb-3 text-xs text-slate-500">{dataNote}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          No QB snapshots for this season/week in the committed sample.
        </p>
      ) : (
        <RankTable
          headers={['Rank', 'QB', 'Team', 'Elo', '≈ pts vs replacement']}
        >
          {rows.map((r) => (
            <tr key={`${r.playerId}-${r.week}`} className="border-b border-slate-100">
              <td className="px-3 py-2 tabular-nums text-slate-500">{r.rank}</td>
              <td className="px-3 py-2 font-medium text-slate-900">
                {r.playerName}
              </td>
              <td className="px-3 py-2 text-slate-700">{r.team}</td>
              <td className="px-3 py-2 tabular-nums">{r.rating.toFixed(1)}</td>
              <td className="px-3 py-2 tabular-nums text-slate-600">
                {r.pointDelta >= 0 ? '+' : ''}
                {r.pointDelta.toFixed(2)}
              </td>
            </tr>
          ))}
        </RankTable>
      )}
    </RankingsPageShell>
  )
}
