import { useMemo, useState } from 'react'
import {
  RankingsPageShell,
  RankTable,
  SeasonChips,
} from '@/components/rankings/RankingsShell'
import { getSosTable, listRankingSeasons } from '@/lib/rankingsData'

export function SosPage() {
  const seasons = listRankingSeasons()
  const [season, setSeason] = useState(seasons[0] ?? 2024)
  const rows = useMemo(() => getSosTable(season), [season])

  return (
    <RankingsPageShell
      title="Strength of schedule"
      caveat="Average opponent power rating (v3) at game time — derived from ratings already in the pipeline plus the historical schedule. Higher = tougher slate. Historical seasons are fully settled, so remaining SOS is usually empty. Not a betting signal by itself."
    >
      <SeasonChips seasons={seasons} season={season} onChange={setSeason} />
      <RankTable
        headers={[
          'Rank',
          'Team',
          'Past SOS (opp rating)',
          'Past games',
          'Remaining SOS',
          'Rem. games',
        ]}
      >
        {rows.map((r) => (
          <tr key={r.team} className="border-b border-slate-100">
            <td className="px-3 py-2 tabular-nums text-slate-500">{r.rank}</td>
            <td className="px-3 py-2 font-medium">{r.team}</td>
            <td className="px-3 py-2 tabular-nums">
              {r.pastOppAvg != null ? r.pastOppAvg.toFixed(2) : '—'}
            </td>
            <td className="px-3 py-2 tabular-nums text-slate-500">
              {r.pastGames}
            </td>
            <td className="px-3 py-2 tabular-nums">
              {r.remainingOppAvg != null ? r.remainingOppAvg.toFixed(2) : '—'}
            </td>
            <td className="px-3 py-2 tabular-nums text-slate-500">
              {r.remainingGames}
            </td>
          </tr>
        ))}
      </RankTable>
    </RankingsPageShell>
  )
}
