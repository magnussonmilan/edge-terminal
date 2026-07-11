import { describe, expect, it } from 'vitest'
import {
  gamePerformanceMargin,
  gamePerformanceMarginNet,
  nonNetTeamGrade,
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
  it('nonNetTeamGrade is offense minus defense allowed', () => {
    expect(nonNetTeamGrade(10, 3)).toBe(7)
  })

  it('mixes PD with independent non-net WEPA grades (not forced inverse after blend)', () => {
    // Shootout-ish: both teams generate a lot of offense WEPA; defense allowed high too.
    // Grades: home 12-10=+2, away 10-8=+2 — both positive (the non-net point).
    const { homeNet, awayNet } = gamePerformanceMargin(
      game,
      { offenseWepa: 12, defenseWepaAllowed: 10 },
      { offenseWepa: 10, defenseWepaAllowed: 8 },
      0.3,
    )
    // home: 0.3*1 + 0.7*2*0.4 = 0.3 + 0.56 = 0.86
    // away: 0.3*(-1) + 0.7*2*0.4 = -0.3 + 0.56 = 0.26
    expect(homeNet).toBeCloseTo(0.86)
    expect(awayNet).toBeCloseTo(0.26)
    expect(homeNet + awayNet).not.toBeCloseTo(0)
  })

  it('legacy net path forces away = -home', () => {
    const { homeNet, awayNet } = gamePerformanceMarginNet(game, 10, 0, 0.3)
    expect(homeNet).toBeCloseTo(3.1)
    expect(awayNet).toBeCloseTo(-3.1)
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
    expect(neut.final.KC.rating).toBeLessThan(raw.final.KC.rating)
  })
})
