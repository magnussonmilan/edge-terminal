import { describe, expect, it } from 'vitest'
import {
  computeStraightUpAccuracy,
  computeMeanAbsoluteError,
} from './backtest'
import type { GamePrediction } from './predictions'

function base(partial: Partial<GamePrediction>): GamePrediction {
  return {
    gameId: 'g',
    season: 2023,
    week: 1,
    homeTeam: 'KC',
    awayTeam: 'DET',
    homeRating: 0,
    awayRating: 0,
    modelSpread: 3,
    postedSpread: -3,
    postedSpreadIsHistorical: true,
    restAdjustment: 0,
    primetimeAdjustment: 0,
    starRating: { differentialPct: 8, stars: 1, playable: true },
    homeScore: 24,
    awayScore: 20,
    blurb: '',
    ...partial,
  }
}

describe('computeStraightUpAccuracy', () => {
  it('counts correct favorite picks and excludes model pushes', () => {
    const preds = [
      base({ modelSpread: 3, homeScore: 27, awayScore: 20 }),
      base({ modelSpread: -4, homeScore: 10, awayScore: 17 }),
      base({ modelSpread: 2, homeScore: 14, awayScore: 21 }),
      base({ modelSpread: 0, homeScore: 20, awayScore: 17 }),
    ]
    const s = computeStraightUpAccuracy(preds)
    expect(s.pushGames).toBe(1)
    expect(s.totalGames).toBe(3)
    expect(s.correctPicks).toBe(2)
    expect(s.accuracy).toBeCloseTo(2 / 3)
  })
})

describe('computeMeanAbsoluteError', () => {
  it('averages |modelSpread − actual margin|', () => {
    const preds = [
      base({ modelSpread: 3, homeScore: 27, awayScore: 20 }), // |3-7|=4
      base({ modelSpread: -3, homeScore: 10, awayScore: 17 }), // |-3-(-7)|=4
    ]
    const m = computeMeanAbsoluteError(preds)
    expect(m.n).toBe(2)
    expect(m.mae).toBeCloseTo(4)
  })
})
