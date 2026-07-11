import { describe, expect, it } from 'vitest'
import {
  emptyTeamErrorState,
  matchupModelWeight,
  relativeAccuracyToWeight,
  relativeModelAccuracy,
  updateTeamError,
} from './marketRegression'

describe('marketRegression', () => {
  /**
   * Hand-verifiable worked example from the confirmed public formula:
   *   mean(√modelHome, √modelAway) − mean(√marketHome, √marketAway)
   * model={4,9}, market={1,16} → mean(2,3) − mean(1,4) = 2.5 − 2.5 = 0
   *
   * Averaging raw squared errors first then one √ would give
   * √((4+9)/2) − √((1+16)/2) ≈ 2.55 − 2.92 ≠ 0 — this test catches that bug.
   */
  it('relativeModelAccuracy matches confirmed formula (hand-checkable)', () => {
    const home = {
      team: 'HOME',
      modelEwmaSquaredError: 4,
      marketEwmaSquaredError: 1,
      gamesObserved: 10,
    }
    const away = {
      team: 'AWAY',
      modelEwmaSquaredError: 9,
      marketEwmaSquaredError: 16,
      gamesObserved: 10,
    }
    expect(relativeModelAccuracy(home, away)).toBeCloseTo(0)

    const wrongAvgThenSqrt =
      Math.sqrt((4 + 9) / 2) - Math.sqrt((1 + 16) / 2)
    expect(wrongAvgThenSqrt).not.toBeCloseTo(0, 1)
  })

  it('takes sqrt of each team EWMA before averaging (asymmetric case)', () => {
    const home = {
      team: 'KC',
      modelEwmaSquaredError: 16, // rmse 4
      marketEwmaSquaredError: 4, // rmse 2
      gamesObserved: 5,
    }
    const away = {
      team: 'DET',
      modelEwmaSquaredError: 0,
      marketEwmaSquaredError: 0,
      gamesObserved: 5,
    }
    // model: (4+0)/2=2; market: (2+0)/2=1 → ra = 1
    expect(relativeModelAccuracy(home, away)).toBeCloseTo(1)
  })

  it('maps negative relative accuracy to higher model weight (clamped linear)', () => {
    expect(relativeAccuracyToWeight(0, 6)).toBeCloseTo(0.5)
    expect(relativeAccuracyToWeight(-6, 6)).toBeCloseTo(1)
    expect(relativeAccuracyToWeight(6, 6)).toBeCloseTo(0)
    expect(relativeAccuracyToWeight(-100, 6)).toBe(1)
  })

  it('updates EWMA without look-ahead and cold-starts on first game', () => {
    let st = emptyTeamErrorState('KC')
    st = updateTeamError(st, 7, 3, 3, 8)
    expect(st.gamesObserved).toBe(1)
    expect(st.modelEwmaSquaredError).toBeCloseTo(16) // (7-3)^2
    expect(st.marketEwmaSquaredError).toBeCloseTo(16)
  })

  it('uses cold-start weight until both teams have history', () => {
    const home = emptyTeamErrorState('KC')
    const away = emptyTeamErrorState('DET')
    expect(
      matchupModelWeight(home, away, {
        halfLifeGames: 8,
        normalizer: 6,
        coldStartWeight: 0.15,
      }),
    ).toBe(0.15)
  })
})
