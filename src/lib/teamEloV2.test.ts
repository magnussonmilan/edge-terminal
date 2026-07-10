import { describe, expect, it } from 'vitest'
import { gamePerformanceMargin, effectiveTeamRating } from './teamEloV2'
import { QB_ELO_REPLACEMENT } from './qbElo'
import type { GameResult } from './powerRatings'

const game: GameResult = {
  gameId: 'g',
  season: 2023,
  week: 1,
  homeTeam: 'KC',
  awayTeam: 'DET',
  homeScore: 21,
  awayScore: 20,
  spreadLine: -3,
  homeRest: 7,
  awayRest: 7,
  weekday: 'Sunday',
  gametime: '16:25',
}

describe('teamEloV2', () => {
  it('mixes WEPA with score when both sides have WEPA', () => {
    const { homeNet } = gamePerformanceMargin(game, 10, 0)
    // raw margin 1; wepa pts = 10 * 0.4 = 4; mix 0.3*1 + 0.7*4 = 3.1
    expect(homeNet).toBeCloseTo(3.1)
  })

  it('falls back to raw margin without WEPA', () => {
    const { homeNet } = gamePerformanceMargin(game, null, null)
    expect(homeNet).toBe(1)
  })

  it('adds QB Elo point delta to base team rating', () => {
    const base = 2
    const withQb = effectiveTeamRating(base, QB_ELO_REPLACEMENT + 50)
    expect(withQb).toBeCloseTo(base + 2)
  })
})
