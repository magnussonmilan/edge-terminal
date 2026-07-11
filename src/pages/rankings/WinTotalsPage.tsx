import { useMemo, useState } from 'react'
import {
  RankingsPageShell,
  RankTable,
  SeasonChips,
} from '@/components/rankings/RankingsShell'
import { getWinTotalsTable, listRankingSeasons } from '@/lib/rankingsData'

export function WinTotalsPage() {
  const seasons = listRankingSeasons()
  const [season, setSeason] = useState(seasons[0] ?? 2024)
  const rows = useMemo(() => getWinTotalsTable(season), [season])

  return (
    <RankingsPageShell
      title="Win totals"
      caveat="Expected wins = sum of v3-independent pre-game win probabilities over the season (direct expectation — no Monte Carlo). Actual wins from final scores. This is the model's own projection, not market season win-total odds (those remain unavailable for SRS priors). Feature parity with a win-totals view — not proof the expectation beats a sportsbook over/under."
    >
      <SeasonChips seasons={seasons} season={season} onChange={setSeason} />
      <RankTable
        headers={[
          'Rank',
          'Team',
          'Expected wins',
          'Actual wins',
          'Δ (act − exp)',
          'Games',
          'Rem. expected',
        ]}
      >
        {rows.map((r) => (
          <tr key={r.team} className="border-b border-slate-100">
            <td className="px-3 py-2 tabular-nums text-slate-500">{r.rank}</td>
            <td className="px-3 py-2 font-medium">{r.team}</td>
            <td className="px-3 py-2 tabular-nums">
              {r.expectedWins.toFixed(1)}
            </td>
            <td className="px-3 py-2 tabular-nums">{r.actualWins}</td>
            <td
              className={`px-3 py-2 tabular-nums ${
                r.delta > 0.5
                  ? 'text-emerald-700'
                  : r.delta < -0.5
                    ? 'text-rose-700'
                    : 'text-slate-700'
              }`}
            >
              {r.delta >= 0 ? '+' : ''}
              {r.delta.toFixed(1)}
            </td>
            <td className="px-3 py-2 tabular-nums text-slate-500">{r.games}</td>
            <td className="px-3 py-2 tabular-nums text-slate-500">
              {r.remainingGames
                ? r.remainingExpected.toFixed(1)
                : '—'}
            </td>
          </tr>
        ))}
      </RankTable>
    </RankingsPageShell>
  )
}
