import { describe, expect, it } from 'vitest'
import {
  computeTeamWeightedEpaByGame,
  playContextWeight,
  weightPlay,
  type RawPlayByPlayRow,
} from './weightedEpa'

const base: RawPlayByPlayRow = {
  game_id: 'g1',
  posteam: 'KC',
  epa: 0.5,
  score_differential: 0,
  half_seconds_remaining: 1200,
  play_type: 'pass',
}

describe('weightedEpa', () => {
  it('defaults to weight 1 for ordinary plays', () => {
    expect(playContextWeight(base)).toBe(1)
    const w = weightPlay(base)!
    expect(w.weightedEpa).toBeCloseTo(0.5)
  })

  it('discounts garbage time', () => {
    const w = playContextWeight({
      ...base,
      score_differential: 21,
      half_seconds_remaining: 90,
    })
    expect(w).toBe(0.5)
  })

  it('heavily discounts own-team recovered fumbles', () => {
    const w = playContextWeight({
      ...base,
      fumble: 1,
      fumble_lost: 0,
    })
    expect(w).toBeCloseTo(0.35)
  })

  it('aggregates team WEPA by game', () => {
    const plays: RawPlayByPlayRow[] = [
      { ...base, epa: 1 },
      { ...base, epa: -0.5, posteam: 'LV' },
      { ...base, epa: 0.5, score_differential: 24, half_seconds_remaining: 60 },
    ]
    const byGame = computeTeamWeightedEpaByGame(plays)
    expect(byGame.g1.KC).toBeCloseTo(1 + 0.5 * 0.5)
    expect(byGame.g1.LV).toBeCloseTo(-0.5)
  })
})
