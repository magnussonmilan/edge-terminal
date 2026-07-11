/**
 * MLB sport adapter — Neil Paine Elo probs (MIT), not a stub.
 *
 * Copyright (c) 2024 Neil Paine
 * Source: https://github.com/Neil-Paine-1/MLB-WAR-data-historical
 *
 * Freshness is seasonal (not updating into 2026) — see MLB_META.
 */

import {
  getMlbGameById,
  getMlbGamesForMonth,
  listMlbMonths,
  listMlbSeasons,
  MLB_COPYRIGHT,
  mlbLiveDataStatus,
} from '../mlbData'
import { listCuratedPairs } from '../eventMatcher'
import type { SportAdapter, SportGameOption } from '../sportAdapter'
import type { MlbEloGame } from '../mlbTypes'

const MONTH_NAMES = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function toSportGame(g: MlbEloGame): SportGameOption {
  const month = Number(g.date.slice(5, 7))
  return {
    gameId: g.gameId,
    matchup: `${g.awayTeam} @ ${g.homeTeam}`,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    season: g.season,
    week: month,
    date: g.date,
    modelHomeWinProb: g.eloProb1,
    modelSpread: null,
    postedSpread: null,
  }
}

export const mlbSportAdapter: SportAdapter = {
  sport: 'mlb',
  label: 'MLB',
  hasLivePredictions: true,
  liveDataStatus: mlbLiveDataStatus(),
  copyrightNotice: MLB_COPYRIGHT,
  supportsMarketBlend: false,

  listSeasons() {
    return listMlbSeasons()
  },

  listGroups(season: number) {
    return listMlbMonths(season)
  },

  groupLabel(group: number) {
    return MONTH_NAMES[group] ?? `M${group}`
  },

  getGamesForComparison(season: number, group: number) {
    return getMlbGamesForMonth(season, group).map(toSportGame)
  },

  getGame(gameId: string) {
    const g = getMlbGameById(gameId)
    return g ? toSportGame(g) : null
  },

  listPredictionMarketPairs() {
    return listCuratedPairs().filter((p) => p.sport === 'mlb')
  },

  defaultBlendWeight() {
    return 1
  },
}
