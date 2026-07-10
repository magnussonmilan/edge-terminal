import { describe, expect, it } from 'vitest'
import { getCurrentNflSeason, isNflSeasonWindow } from './season'

describe('getCurrentNflSeason', () => {
  it('uses calendar year from September rollover', () => {
    expect(getCurrentNflSeason(new Date('2026-09-01T12:00:00Z'))).toBe(2026)
    expect(getCurrentNflSeason(new Date('2026-12-15T12:00:00Z'))).toBe(2026)
  })

  it('keeps Jan/Feb on the prior season year', () => {
    expect(getCurrentNflSeason(new Date('2027-01-10T12:00:00Z'))).toBe(2026)
    expect(getCurrentNflSeason(new Date('2027-02-14T12:00:00Z'))).toBe(2026)
  })

  it('treats Mar–Aug offseason as the upcoming season year', () => {
    expect(getCurrentNflSeason(new Date('2026-03-01T12:00:00Z'))).toBe(2026)
    expect(getCurrentNflSeason(new Date('2026-07-10T12:00:00Z'))).toBe(2026)
    expect(getCurrentNflSeason(new Date('2026-08-31T12:00:00Z'))).toBe(2026)
  })
})

describe('isNflSeasonWindow', () => {
  it('is true Sept–Feb and false Mar–Aug', () => {
    expect(isNflSeasonWindow(new Date('2026-09-05T00:00:00Z'))).toBe(true)
    expect(isNflSeasonWindow(new Date('2027-01-20T00:00:00Z'))).toBe(true)
    expect(isNflSeasonWindow(new Date('2026-07-10T00:00:00Z'))).toBe(false)
  })
})
