/**
 * MLB sport adapter — live 2026 predictions from Stats API backfill + Neil Paine seed.
 *
 * Copyright (c) 2024 Neil Paine (MIT seed)
 * Live results: MLB Stats API (see mlbStatsApi.ts terms)
 */

import {
  getMlbGameById,
  getMlbGamesForMonth,
  getMlbLiveGameById,
  getMlbLiveGamesForMonth,
  hasGenuineLiveMlbPredictions,
  listMlbMonths,
  listMlbSeasons,
  MLB_COPYRIGHT,
  mlbLiveDataStatus,
} from '../mlbData'
import { listCuratedPairs } from '../eventMatcher'
import { listDiscoveredMlbPairs } from '../mlbDiscoveredPairsStore'
import type { SportAdapter, SportGameOption } from '../sportAdapter'
import type { MlbEloGame } from '../mlbTypes'
import type { MlbLivePrediction } from '../mlbEloLive'

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

function fromHistorical(g: MlbEloGame): SportGameOption {
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

function fromLive(g: MlbLivePrediction): SportGameOption {
  const month = Number(g.date.slice(5, 7))
  return {
    gameId: g.gameId,
    matchup: `${g.awayTeam} @ ${g.homeTeam}`,
    homeTeam: g.homeTeam,
    awayTeam: g.awayTeam,
    season: g.season,
    week: month,
    date: g.date,
    modelHomeWinProb: g.modelHomeWinProb,
    modelSpread: null,
    postedSpread: null,
  }
}

export const mlbSportAdapter: SportAdapter = {
  sport: 'mlb',
  label: 'MLB',
  hasLivePredictions: hasGenuineLiveMlbPredictions(),
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
    if (season >= 2026) {
      return getMlbLiveGamesForMonth(season, group).map(fromLive)
    }
    return getMlbGamesForMonth(season, group).map(fromHistorical)
  },

  getGame(gameId: string) {
    const live = getMlbLiveGameById(gameId)
    if (live) return fromLive(live)
    const hist = getMlbGameById(gameId)
    return hist ? fromHistorical(hist) : null
  },

  listPredictionMarketPairs() {
    const curated = listCuratedPairs().filter((p) => p.sport === 'mlb')
    const discovered = listDiscoveredMlbPairs()
    const keys = new Set(
      curated.map((p) => `${p.kalshiMarketId}|${p.polymarketMarketId}`),
    )
    return [
      ...curated,
      ...discovered.filter(
        (p) => !keys.has(`${p.kalshiMarketId}|${p.polymarketMarketId}`),
      ),
    ]
  },

  defaultBlendWeight() {
    return 1
  },
}
