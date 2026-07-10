import { describe, expect, it } from 'vitest'
import {
  formatWinRateWithCI,
  wilsonHalfWidth,
  wilsonInterval,
} from './backtest'

describe('wilsonInterval', () => {
  it('returns zeros for empty sample', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 })
  })

  it('is wider than the point estimate at small n', () => {
    const { low, high } = wilsonInterval(17, 23)
    expect(low).toBeLessThan(17 / 23)
    expect(high).toBeGreaterThan(17 / 23)
    expect(low).toBeGreaterThan(0)
    expect(high).toBeLessThan(1)
  })

  it('narrows as n grows at the same rate', () => {
    const small = wilsonInterval(17, 23)
    const large = wilsonInterval(170, 230)
    expect(large.high - large.low).toBeLessThan(small.high - small.low)
  })

  it('half-width matches (high-low)/2', () => {
    const { low, high } = wilsonInterval(100, 200)
    expect(wilsonHalfWidth(100, 200)).toBeCloseTo((high - low) / 2, 10)
  })

  it('formats display string', () => {
    expect(formatWinRateWithCI(0.541, 0.509, 0.573, 210)).toBe(
      '54.1% ± 3.2%, n=210',
    )
  })
})
