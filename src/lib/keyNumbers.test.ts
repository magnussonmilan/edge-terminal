import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  calculateStarRating,
  calculateStarRatingWalters,
  setStarRatingMode,
} from './keyNumbers'
import {
  fitMarginDistribution,
  marginProbabilityMass,
  probabilityBetween,
  resetMarginDistParams,
  setMarginDistParams,
  DEFAULT_MARGIN_DIST_PARAMS,
} from './marginDistribution'

describe('calculateStarRatingWalters', () => {
  it('deducts one point when the range straddles zero (+1.5 vs −1.5 → 3%, not playable)', () => {
    const result = calculateStarRatingWalters(1.5, -1.5)
    expect(result.differentialPct).toBe(3)
    expect(result.playable).toBe(false)
    expect(result.stars).toBe(0)
  })

  it('credits full interior key numbers for 7.5 vs 4.5 → 14%', () => {
    const result = calculateStarRatingWalters(7.5, 4.5)
    expect(result.differentialPct).toBe(14)
    expect(result.playable).toBe(true)
    expect(result.stars).toBe(2.5)
  })

  it('half-credits the whole-number endpoint for 4 vs 2.5 → 9.5%', () => {
    const result = calculateStarRatingWalters(4, 2.5)
    expect(result.differentialPct).toBe(9.5)
    expect(result.playable).toBe(true)
    expect(result.stars).toBe(1.5)
  })
})

describe('fitted margin distribution', () => {
  beforeEach(() => {
    resetMarginDistParams()
    setStarRatingMode('fitted')
  })
  afterEach(() => {
    resetMarginDistParams()
    setStarRatingMode('fitted')
  })

  it('puts more mass near the predicted spread than far away', () => {
    const mass = marginProbabilityMass(-3)
    expect(mass.get(-3)!).toBeGreaterThan(mass.get(-20)!)
  })

  it('probabilityBetween is symmetric in lo/hi order', () => {
    const a = probabilityBetween(-3, 4.5, 7.5)
    const b = probabilityBetween(-3, 7.5, 4.5)
    expect(a).toBeCloseTo(b)
  })

  it('fitMarginDistribution returns finite MSE on synthetic data', () => {
    const rows = []
    for (let i = 0; i < 400; i++) {
      const posted = -3 + (i % 7) * 0.5
      // margins cluster near posted with key-number bump at 3
      const homeMargin = Math.round(posted + ((i % 5) - 2))
      rows.push({ postedSpread: posted, homeMargin })
    }
    const { params, trainMse } = fitMarginDistribution(rows)
    expect(Number.isFinite(trainMse)).toBe(true)
    expect(params.baseScale).toBeGreaterThan(0)
  })

  it('calculateStarRating in fitted mode returns a finite differential', () => {
    setMarginDistParams(DEFAULT_MARGIN_DIST_PARAMS)
    const r = calculateStarRating(7.5, 4.5)
    expect(r.differentialPct).toBeGreaterThan(0)
    expect(Number.isFinite(r.differentialPct)).toBe(true)
  })
})
