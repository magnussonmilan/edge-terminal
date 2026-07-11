import { useMemo, useState } from 'react'
import {
  RankingsPageShell,
  RankTable,
  SeasonChips,
  pct,
} from '@/components/rankings/RankingsShell'
import { getTeamTendencies, listRankingSeasons } from '@/lib/rankingsData'

export function TendenciesPage() {
  const seasons = listRankingSeasons()
  const [season, setSeason] = useState(seasons[0] ?? 2024)
  const rows = useMemo(() => getTeamTendencies(season), [season])

  return (
    <RankingsPageShell
      title="Tendencies"
      caveat="Game-level situational win rates from already-ingested schedule data (home/away, short rest &lt;7 days, primetime). Down-and-distance pass/run rates are not in the WEPA cache (only EPA totals were persisted from PBP) — those need a separate aggregate artifact, not invented here. Descriptive only; not an edge claim."
    >
      <SeasonChips seasons={seasons} season={season} onChange={setSeason} />
      <RankTable
        headers={[
          'Team',
          'Home W%',
          'Away W%',
          'Short rest W%',
          'Primetime W%',
          'Games',
        ]}
      >
        {rows.map((r) => (
          <tr key={r.team} className="border-b border-slate-100">
            <td className="px-3 py-2 font-medium">{r.team}</td>
            <td className="px-3 py-2 tabular-nums">
              {pct(r.homeWinPct)}
              <span className="text-xs text-slate-400"> ({r.homeGames})</span>
            </td>
            <td className="px-3 py-2 tabular-nums">
              {pct(r.awayWinPct)}
              <span className="text-xs text-slate-400"> ({r.awayGames})</span>
            </td>
            <td className="px-3 py-2 tabular-nums">
              {pct(r.shortRestWinPct)}
              <span className="text-xs text-slate-400">
                {' '}
                ({r.shortRestGames})
              </span>
            </td>
            <td className="px-3 py-2 tabular-nums">
              {pct(r.primetimeWinPct)}
              <span className="text-xs text-slate-400">
                {' '}
                ({r.primetimeGames})
              </span>
            </td>
            <td className="px-3 py-2 tabular-nums text-slate-500">{r.games}</td>
          </tr>
        ))}
      </RankTable>
    </RankingsPageShell>
  )
}
