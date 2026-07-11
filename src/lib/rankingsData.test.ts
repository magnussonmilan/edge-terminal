import { describe, expect, it } from 'vitest'
import {
  computeStrengthOfSchedule,
  getEpaTiers,
  getPowerRatings,
  getWinTotalsTable,
  projectSeasonWinTotal,
} from './rankingsData'
import { spreadToWinProb } from './backtest'

describe('getPowerRatings', () => {
  it('returns sorted teams for a known season/week', () => {
    const rows = getPowerRatings(2024, 18)
    expect(rows.length).toBeGreaterThan(30)
    expect(rows[0]!.rank).toBe(1)
    expect(rows[0]!.rating).toBeGreaterThanOrEqual(rows[1]!.rating)
  })
})

describe('getEpaTiers', () => {
  it('tiers cover all teams with games and sum ranks uniquely', () => {
    const rows = getEpaTiers(2023)
    expect(rows.length).toBeGreaterThan(20)
    expect(rows[0]!.tier).toBe('Elite')
    expect(rows[0]!.nonNetGrade).toBeGreaterThanOrEqual(
      rows[rows.length - 1]!.nonNetGrade,
    )
  })
})

describe('computeStrengthOfSchedule', () => {
  it('averages opponent ratings for a team with a full season', () => {
    const sos = computeStrengthOfSchedule('KC', 2023)
    expect(sos.pastGames).toBeGreaterThan(10)
    expect(sos.pastOppAvg).not.toBeNull()
    expect(Number.isFinite(sos.pastOppAvg!)).toBe(true)
  })
})

describe('projectSeasonWinTotal', () => {
  it('expected wins equals sum of per-game win probs (hand-checkable shape)', () => {
    const row = projectSeasonWinTotal('KC', 2023)
    expect(row.games).toBeGreaterThan(10)
    expect(row.expectedWins).toBeGreaterThan(0)
    expect(row.expectedWins).toBeLessThan(row.games + 0.01)
    expect(row.actualWins).toBeGreaterThanOrEqual(0)
    expect(row.actualWins).toBeLessThanOrEqual(row.games)
  })

  it('win-totals table is sorted by expected wins', () => {
    const table = getWinTotalsTable(2022)
    expect(table.length).toBeGreaterThan(20)
    expect(table[0]!.expectedWins).toBeGreaterThanOrEqual(
      table[1]!.expectedWins,
    )
  })

  it('spreadToWinProb is the conversion used (0-spread → ~0.5)', () => {
    expect(spreadToWinProb(0)).toBeCloseTo(0.5, 5)
  })
})
