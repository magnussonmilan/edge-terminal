import { describe, expect, it } from 'vitest'
import {
  QB_ELO_MEAN,
  QB_ELO_REPLACEMENT,
  qbEloToPointDelta,
  seedRookieQbRating,
  updateQbRating,
} from './qbElo'

describe('qbElo', () => {
  it('seeds #1 overall above a late-round pick toward the same team prior', () => {
    const teamPrior = 1520
    const first = seedRookieQbRating(1, teamPrior)
    const late = seedRookieQbRating(180, teamPrior)
    expect(first).toBeGreaterThan(late)
    expect(first).toBeGreaterThan(teamPrior)
  })

  it('mean-reverts veterans toward their own career average', () => {
    const prior = 1600
    const career = 1580
    // Strongly negative game observation on Elo scale
    const badGame = 1400
    const next = updateQbRating(prior, badGame, career, 40)
    // Should move down from prior but not collapse to league mean
    expect(next).toBeLessThan(prior)
    expect(next).toBeGreaterThan(QB_ELO_MEAN)
  })

  it('maps Elo above replacement into positive point delta', () => {
    expect(qbEloToPointDelta(QB_ELO_REPLACEMENT)).toBeCloseTo(0)
    expect(qbEloToPointDelta(QB_ELO_REPLACEMENT + 25)).toBeCloseTo(1)
  })
})
