import { describe, expect, it } from 'vitest'
import {
  blendWithMarket,
  estimateCoverProbability,
  fitCoverModel,
  fitModelWeight,
} from './marketBlend'
import { buildPreseasonPriors } from './srsPrior'

describe('marketBlend', () => {
  it('blends toward market when modelWeight is low', () => {
    expect(blendWithMarket(7, 3, 0)).toBe(3)
    expect(blendWithMarket(7, 3, 1)).toBe(7)
    expect(blendWithMarket(7, 3, 0.5)).toBe(5)
  })

  it('fits cover model slope positive when edge predicts covers', () => {
    const rows = []
    for (let i = 0; i < 80; i++) {
      const edge = (i % 10) - 5
      rows.push({
        blendedSpread: 3 + edge,
        postedSpread: 3,
        covered: edge > 0 ? 1 : 0,
      })
    }
    const coeffs = fitCoverModel(rows)
    expect(coeffs.slope).toBeGreaterThan(0)
    const pHigh = estimateCoverProbability(6, 3, coeffs)
    const pLow = estimateCoverProbability(0, 3, coeffs)
    expect(pHigh).toBeGreaterThan(pLow)
  })

  it('selects a model weight on train rows', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      modelSpread: i % 2 === 0 ? 5 : -5,
      postedSpread: 0,
      homeMargin: i % 2 === 0 ? 7 : -7,
    }))
    const { weight, trainWinRate } = fitModelWeight(rows)
    expect(weight).toBeGreaterThan(0)
    expect(trainWinRate).toBeGreaterThan(0.5)
  })
})

describe('srsPrior fallback', () => {
  it('falls back to prior-season decay without win-total quotes', () => {
    const prior = {
      KC: { team: 'KC', rating: 4, updatedThroughWeek: 18, season: 2022 },
    }
    const res = buildPreseasonPriors(prior, [])
    expect(res.method).toBe('prior-season-decay')
    expect(res.ratings.KC).toBeCloseTo(2)
    expect(res.note.toLowerCase()).toContain('fallback')
  })
})
