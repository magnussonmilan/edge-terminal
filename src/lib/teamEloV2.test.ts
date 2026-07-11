import { describe, expect, it } from 'vitest'
import {
  gamePerformanceMargin,
  effectiveTeamRating,
  expectedQbPointMargin,
  processSeasonRatingsV3,
} from './teamEloV2'
import { QB_ELO_REPLACEMENT, qbEloToPointDelta } from './qbElo'
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
    expect(homeNet).toBeCloseTo(3.1)
  })

  it('falls back to raw margin without WEPA', () => {
    const { homeNet } = gamePerformanceMargin(game, null, null)
    expect(homeNet).toBe(1)
  })

  it('adds QB Elo point delta to base team rating via /25 scale', () => {
    const base = 2
    const withQb = effectiveTeamRating(base, QB_ELO_REPLACEMENT + 50)
    expect(withQb).toBeCloseTo(base + 2)
  })

  it('computes expected QB point margin via /25', () => {
    const hq = { playerId: '1', playerName: 'A', elo: QB_ELO_REPLACEMENT + 100 }
    const aq = { playerId: '2', playerName: 'B', elo: QB_ELO_REPLACEMENT }
    expect(expectedQbPointMargin(hq, aq)).toBeCloseTo(4)
  })

  it('nets QB out of team updates so strong home QB does not inflate team rating', () => {
    const hq = { playerId: '1', playerName: 'A', elo: QB_ELO_REPLACEMENT + 75 }
    const aq = { playerId: '2', playerName: 'B', elo: QB_ELO_REPLACEMENT }
    expect(qbEloToPointDelta(hq.elo) - qbEloToPointDelta(aq.elo)).toBeCloseTo(3)

    const neut = processSeasonRatingsV3([game], { KC: 0, DET: 0 }, {
      qbStart: (_s, _w, team) => (team === 'KC' ? hq : aq),
      neutralizeQbInUpdate: true,
    })
    const raw = processSeasonRatingsV3([game], { KC: 0, DET: 0 }, {
      neutralizeQbInUpdate: false,
    })
    // Raw margin +1; neutralized subtracts +3 QB credit → weaker home TGPL
    expect(neut.final.KC.rating).toBeLessThan(raw.final.KC.rating)
  })
})
