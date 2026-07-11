import { describe, expect, it } from 'vitest'
import { getSportAdapter } from './sportAdapter'
import {
  getCalibratedModelWeight,
  getPredictions,
  listSeasons,
  listWeeks,
} from './nflData'
import { listCuratedPairs } from './eventMatcher'
import { buildUnifiedComparisonFromSportGame } from './unifiedComparison'
import { MLB_META } from './mlbData'

describe('NflSportAdapter', () => {
  const nfl = getSportAdapter('nfl')

  it('wraps existing nflData seasons/weeks/games unchanged', () => {
    expect(nfl.sport).toBe('nfl')
    expect(nfl.hasLivePredictions).toBe(true)
    expect(nfl.supportsMarketBlend).toBe(true)
    expect(nfl.listSeasons()).toEqual(listSeasons())
    expect(nfl.defaultBlendWeight()).toBe(getCalibratedModelWeight())

    const season = listSeasons()[0]!
    const weeks = listWeeks(season)
    expect(nfl.listGroups(season)).toEqual(weeks)

    const week = weeks[0]!
    const fromData = getPredictions(season, week)
    const fromAdapter = nfl.getGamesForComparison(season, week)
    expect(fromAdapter.map((g) => g.gameId)).toEqual(
      fromData.map((p) => p.gameId),
    )
    expect(fromAdapter.every((g) => g.modelSpread != null)).toBe(true)
    expect(fromAdapter.every((g) => Number.isFinite(g.modelHomeWinProb))).toBe(
      true,
    )
  })

  it('lists only NFL curated prediction-market pairs', () => {
    const pairs = nfl.listPredictionMarketPairs()
    expect(pairs.every((p) => (p.sport ?? 'nfl') === 'nfl')).toBe(true)
    expect(pairs.length).toBe(
      listCuratedPairs().filter((p) => (p.sport ?? 'nfl') === 'nfl').length,
    )
  })

  it('buildUnifiedComparisonFromSportGame matches NFL moneyline path', () => {
    const season = 2020
    const games = nfl.getGamesForComparison(season, 5)
    const game =
      games.find((g) => g.homeTeam === 'KC' && g.awayTeam === 'LV') ?? games[0]!
    const cmp = buildUnifiedComparisonFromSportGame(game, {
      calibratedWeight: nfl.defaultBlendWeight(),
      supportsMarketBlend: true,
      extras: { bookOdds: [], predictionMarkets: [] },
    })
    expect(cmp.gameId).toBe(game.gameId)
    expect(cmp.modelRaw.moneylineProbability).toBeCloseTo(
      game.modelHomeWinProb,
      10,
    )
  })
})

describe('MlbSportAdapter', () => {
  const mlb = getSportAdapter('mlb')

  it('exposes real Elo games (not stub) with honest seasonal status', () => {
    expect(mlb.sport).toBe('mlb')
    expect(mlb.hasLivePredictions).toBe(true)
    expect(mlb.supportsMarketBlend).toBe(false)
    expect(mlb.copyrightNotice).toContain('Neil Paine')
    expect(mlb.liveDataStatus.toLowerCase()).toMatch(/seasonal|not.*2026/)
    expect(MLB_META.freshness.status).toBe('seasonal')
    expect(mlb.listSeasons().length).toBeGreaterThan(0)

    const season = mlb.listSeasons()[0]!
    const months = mlb.listGroups(season)
    expect(months.length).toBeGreaterThan(0)
    const games = mlb.getGamesForComparison(season, months[0]!)
    expect(games.length).toBeGreaterThan(0)
    expect(games[0]!.modelSpread).toBeNull()
    expect(games[0]!.modelHomeWinProb).toBeGreaterThan(0)
    expect(games[0]!.modelHomeWinProb).toBeLessThan(1)
  })

  it('builds moneyline-primary comparison without blend', () => {
    const season = 2025
    const months = mlb.listGroups(season)
    const month = months.includes(9) ? 9 : months[0]!
    const games = mlb.getGamesForComparison(season, month)
    const game =
      games.find((g) => g.homeTeam === 'BOS' && g.awayTeam === 'NYY') ??
      games[0]!
    const cmp = buildUnifiedComparisonFromSportGame(game, {
      calibratedWeight: 1,
      supportsMarketBlend: false,
      extras: {
        bookOdds: [],
        predictionMarkets: mlb.listPredictionMarketPairs().map((pair) => ({
          pair,
          kalshi: null,
          polymarket: null,
        })),
      },
    })
    expect(cmp.modelBlended.weightUsed).toBe(1)
    expect(cmp.modelRaw.moneylineProbability).toBeCloseTo(
      game.modelHomeWinProb,
      10,
    )
    if (game.homeTeam === 'BOS' && game.awayTeam === 'NYY') {
      expect(
        cmp.moneylineVenues.some((v) => v.venueType === 'prediction_market'),
      ).toBe(true)
    }
  })
})
