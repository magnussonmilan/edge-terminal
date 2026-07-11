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

  it('exposes genuine live 2026 predictions via Stats API backfill', () => {
    expect(mlb.sport).toBe('mlb')
    expect(mlb.hasLivePredictions).toBe(true)
    expect(mlb.supportsMarketBlend).toBe(false)
    expect(mlb.copyrightNotice).toContain('Neil Paine')
    expect(mlb.liveDataStatus.toLowerCase()).toMatch(/live via mlb stats api/)
    expect(mlb.liveDataStatus).toMatch(/ratings updated through/)
    expect(MLB_META.freshness.status).toBe('seasonal') // historical Neil Paine meta unchanged
    expect(mlb.listSeasons()).toContain(2026)

    const months = mlb.listGroups(2026)
    expect(months.length).toBeGreaterThan(0)
    const games = mlb.getGamesForComparison(2026, months[0]!)
    expect(games.length).toBeGreaterThan(0)
    expect(games[0]!.gameId.startsWith('mlb-')).toBe(true)
    expect(games[0]!.modelSpread).toBeNull()
    expect(games[0]!.modelHomeWinProb).toBeGreaterThan(0)
    expect(games[0]!.modelHomeWinProb).toBeLessThan(1)
  })

  it('builds moneyline-primary comparison for a live 2026 game', () => {
    const months = mlb.listGroups(2026)
    const month = months[0]!
    const games = mlb.getGamesForComparison(2026, month)
    const game = games[0]!
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
    expect(cmp.season).toBe(2026)
  })
})
