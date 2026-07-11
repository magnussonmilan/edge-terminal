import { describe, expect, it } from 'vitest'
import { compareDifferentialDistributions } from './marketBlendDiagnostics'
import type { GamePrediction } from './predictions'

function pred(
  modelSpread: number,
  posted: number,
  playable: boolean,
): GamePrediction {
  return {
    gameId: 'g',
    season: 2023,
    week: 1,
    homeTeam: 'KC',
    awayTeam: 'DET',
    homeRating: 0,
    awayRating: 0,
    modelSpread,
    postedSpread: posted,
    postedSpreadIsHistorical: true,
    restAdjustment: 0,
    primetimeAdjustment: 0,
    starRating: {
      differentialPct: playable ? 8 : 1,
      stars: playable ? 1 : 0,
      playable,
    },
    homeScore: 24,
    awayScore: 20,
    blurb: '',
  }
}

describe('compareDifferentialDistributions', () => {
  it('shows blended diffs much smaller when weight pulls toward market', () => {
    // Independent gaps of 5; blended gaps of 0.75 (as if weight 0.15)
    const independent = [pred(8, 3, true), pred(-2, 3, true)]
    const blended = [pred(3.75, 3, false), pred(2.25, 3, false)]
    const s = compareDifferentialDistributions(independent, blended)
    expect(s.independentMeanAbsDiff).toBeCloseTo(5)
    expect(s.blendedMeanAbsDiff).toBeCloseTo(0.75)
    expect(s.meanAbsDiffRatio).toBeLessThan(0.3)
    expect(s.independentPlayableCount).toBe(2)
    expect(s.blendedPlayableCount).toBe(0)
  })
})
