import { describe, expect, it } from 'vitest'
import {
  scoreProbabilitySeries,
  verifyEloModelAccuracy,
} from './mlbEloVerification'
import type { MlbEloGame } from './mlbTypes'
import { resolveFranchiseId } from './mlbTeamIds'

function game(
  partial: Partial<MlbEloGame> &
    Pick<MlbEloGame, 'eloProb1' | 'score1' | 'score2' | 'season'>,
): MlbEloGame {
  return {
    gameId: partial.gameId ?? 'g',
    date: partial.date ?? '2020-01-01',
    season: partial.season,
    neutral: false,
    playoff: null,
    homeTeam: partial.homeTeam ?? 'NYY',
    awayTeam: partial.awayTeam ?? 'BOS',
    homeFranchiseId: partial.homeFranchiseId ?? 'NYY',
    awayFranchiseId: partial.awayFranchiseId ?? 'BOS',
    elo1Pre: 1500,
    elo2Pre: 1500,
    eloProb1: partial.eloProb1,
    eloProb2: 1 - partial.eloProb1,
    elo1Post: null,
    elo2Post: null,
    rating1Pre: null,
    rating2Pre: null,
    pitcher1: null,
    pitcher2: null,
    pitcher1Rgs: null,
    pitcher2Rgs: null,
    pitcher1Adj: null,
    pitcher2Adj: null,
    ratingProb1: partial.ratingProb1 ?? null,
    ratingProb2:
      partial.ratingProb1 != null ? 1 - partial.ratingProb1 : null,
    rating1Post: null,
    rating2Post: null,
    score1: partial.score1,
    score2: partial.score2,
  }
}

describe('scoreProbabilitySeries (hand-checked)', () => {
  it('matches hand-computed accuracy and Brier on a 2-game set', () => {
    // Game A: p=0.70, home wins (y=1) → correct; Brier (0.7-1)^2 = 0.09
    // Game B: p=0.40, home loses (y=0) → pred away, correct; Brier (0.4-0)^2 = 0.16
    // Accuracy 2/2 = 1; mean Brier = (0.09+0.16)/2 = 0.125
    const r = scoreProbabilitySeries([0.7, 0.4], [1, 0])
    expect(r.nAccuracy).toBe(2)
    expect(r.accuracy).toBe(1)
    expect(r.brier).toBeCloseTo(0.125, 12)
  })

  it('excludes ties from accuracy but includes them in Brier at y=0.5', () => {
    // p=0.6, tie y=0.5 → Brier (0.6-0.5)^2 = 0.01; no accuracy count
    const r = scoreProbabilitySeries([0.6], [0.5])
    expect(r.nAccuracy).toBe(0)
    expect(r.accuracy).toBe(0)
    expect(r.brier).toBeCloseTo(0.01, 12)
  })

  it('counts a wrong favorite', () => {
    // p=0.8, home loses → incorrect; Brier (0.8-0)^2 = 0.64
    const r = scoreProbabilitySeries([0.8], [0])
    expect(r.accuracy).toBe(0)
    expect(r.brier).toBeCloseTo(0.64, 12)
  })
})

describe('verifyEloModelAccuracy', () => {
  it('reports Elo and rating systems separately on synthetic games', () => {
    const games = [
      game({
        season: 2022,
        eloProb1: 0.7,
        ratingProb1: 0.55,
        score1: 5,
        score2: 3,
      }), // Elo correct, rating correct
      game({
        season: 2022,
        eloProb1: 0.6,
        ratingProb1: 0.4,
        score1: 2,
        score2: 4,
      }), // Elo wrong (favored home), rating correct (favored away)
    ]
    const r = verifyEloModelAccuracy(games, {
      minSeason: 2022,
      maxSeason: 2022,
      label: 'synth-2022',
    })
    expect(r.eraLabel).toBe('synth-2022')
    expect(r.eloN).toBe(2)
    expect(r.eloAccuracy).toBe(0.5)
    // Elo Brier: (0.7-1)^2 + (0.6-0)^2 = 0.09 + 0.36 = 0.45 → /2 = 0.225
    expect(r.eloBrier).toBeCloseTo(0.225, 12)
    expect(r.ratingN).toBe(2)
    expect(r.ratingAccuracy).toBe(1)
    // Rating Brier: (0.55-1)^2 + (0.4-0)^2 = 0.2025 + 0.16 = 0.3625 → /2
    expect(r.ratingBrier).toBeCloseTo(0.18125, 12)
  })

  it('respects era filters', () => {
    const games = [
      game({ season: 1990, eloProb1: 0.9, score1: 1, score2: 0 }),
      game({ season: 2020, eloProb1: 0.9, score1: 0, score2: 1 }),
    ]
    const modern = verifyEloModelAccuracy(games, {
      minSeason: 2000,
      maxSeason: 2025,
    })
    expect(modern.eloN).toBe(1)
    expect(modern.eloAccuracy).toBe(0)
  })

  it('skips unsettled games', () => {
    const games = [
      game({ season: 2020, eloProb1: 0.9, score1: null, score2: null }),
    ]
    const r = verifyEloModelAccuracy(games)
    expect(r.eloN).toBe(0)
    expect(r.n).toBe(0)
  })
})

describe('resolveFranchiseId continuity', () => {
  it('maps Expos-era WSN and MON alias to the same franchise', () => {
    expect(resolveFranchiseId('WSN')).toBe('WSN')
    expect(resolveFranchiseId('MON')).toBe('WSN')
    expect(resolveFranchiseId('wsn')).toBe('WSN')
  })

  it('maps FLA/TBD/ANA to modern franchise ids without inventing new clubs', () => {
    expect(resolveFranchiseId('FLA')).toBe('MIA')
    expect(resolveFranchiseId('TBD')).toBe('TBR')
    expect(resolveFranchiseId('ANA')).toBe('LAA')
  })

  it('does not silently merge unknown extinct codes into modern teams', () => {
    expect(resolveFranchiseId('BL1')).toBe('BL1')
    expect(resolveFranchiseId('bl1')).toBe('BL1')
  })
})
