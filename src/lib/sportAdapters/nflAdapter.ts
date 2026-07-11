/**
 * NFL sport adapter — wraps existing nflData / eventMatcher behavior unchanged.
 */

import { spreadToWinProb } from '../backtest'
import { listCuratedPairs } from '../eventMatcher'
import {
  getCalibratedModelWeight,
  getPredictionById,
  getPredictions,
  getV3IndependentById,
  listSeasons,
  listWeeks,
} from '../nflData'
import type { GamePrediction } from '../predictions'
import type { SportAdapter, SportGameOption } from '../sportAdapter'

function resolveModelSpread(pred: GamePrediction): number {
  const v3 = getV3IndependentById(pred.gameId)
  if (v3 && typeof v3.independentSpread === 'number') {
    return v3.independentSpread
  }
  return pred.modelSpread
}

function toSportGame(pred: GamePrediction): SportGameOption {
  const modelSpread = resolveModelSpread(pred)
  return {
    gameId: pred.gameId,
    matchup: `${pred.awayTeam} @ ${pred.homeTeam}`,
    homeTeam: pred.homeTeam,
    awayTeam: pred.awayTeam,
    season: pred.season,
    week: pred.week,
    modelHomeWinProb: spreadToWinProb(modelSpread),
    modelSpread,
    postedSpread: pred.postedSpread,
  }
}

export const nflSportAdapter: SportAdapter = {
  sport: 'nfl',
  label: 'NFL',
  hasLivePredictions: true,
  liveDataStatus:
    'NFL predictions from Edge Terminal score-based power ratings (nflverse historical fixtures).',
  copyrightNotice: null,
  supportsMarketBlend: true,

  listSeasons() {
    return listSeasons()
  },

  listGroups(season: number) {
    return listWeeks(season)
  },

  groupLabel(group: number) {
    return `W${group}`
  },

  getGamesForComparison(season: number, group: number) {
    return getPredictions(season, group).map(toSportGame)
  },

  getGame(gameId: string) {
    const pred = getV3IndependentById(gameId) ?? getPredictionById(gameId)
    return pred ? toSportGame(pred) : null
  },

  listPredictionMarketPairs() {
    return listCuratedPairs().filter((p) => (p.sport ?? 'nfl') === 'nfl')
  },

  defaultBlendWeight() {
    return getCalibratedModelWeight()
  },
}
