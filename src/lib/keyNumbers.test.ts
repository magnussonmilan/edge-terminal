import { describe, expect, it } from 'vitest'
import { calculateStarRating } from './keyNumbers'

describe('calculateStarRating', () => {
  it('deducts one point when the range straddles zero (+1.5 vs −1.5 → 3%, not playable)', () => {
    const result = calculateStarRating(1.5, -1.5)
    expect(result.differentialPct).toBe(3)
    expect(result.playable).toBe(false)
    expect(result.stars).toBe(0)
  })

  it('credits full interior key numbers for 7.5 vs 4.5 → 14%', () => {
    const result = calculateStarRating(7.5, 4.5)
    expect(result.differentialPct).toBe(14)
    expect(result.playable).toBe(true)
    expect(result.stars).toBe(2.5)
  })

  it('half-credits the whole-number endpoint for 4 vs 2.5 → 9.5%', () => {
    const result = calculateStarRating(4, 2.5)
    expect(result.differentialPct).toBe(9.5)
    expect(result.playable).toBe(true)
    expect(result.stars).toBe(1.5)
  })
})
