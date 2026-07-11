import { describe, expect, it } from 'vitest'
import {
  selectAndScoreMarketBlendedGame,
  blendWithMarket,
  DEFAULT_COVER_COEFFS,
} from './marketBlend'
import type { GamePrediction } from './predictions'

function pred(partial: Partial<GamePrediction>): GamePrediction {
  return {
    gameId: 'g',
    season: 2023,
    week: 1,
    homeTeam: 'KC',
    awayTeam: 'DET',
    homeRating: 0,
    awayRating: 0,
    modelSpread: 7,
    postedSpread: 3,
    postedSpreadIsHistorical: true,
    restAdjustment: 0,
    primetimeAdjustment: 0,
    starRating: { differentialPct: 10, stars: 1.5, playable: true },
    homeScore: 24,
    awayScore: 20,
    blurb: '',
    ...partial,
  }
}

describe('selectAndScoreMarketBlendedGame', () => {
  it('selects from independent playability, not blended differential', () => {
    const independent = pred({
      modelSpread: 7,
      starRating: { differentialPct: 10, stars: 1.5, playable: true },
    })
    // Blended nearly equals market — would fail a blended star threshold
    const blended = blendWithMarket(7, 3, 0.15)
    expect(Math.abs(blended - 3)).toBeLessThan(1)
    const { selected, coverProbability } = selectAndScoreMarketBlendedGame(
      independent,
      blended,
      DEFAULT_COVER_COEFFS,
    )
    expect(selected).toBe(true)
    expect(coverProbability).not.toBeNull()
  })

  it('rejects when independent is not playable even if blend differs', () => {
    const independent = pred({
      starRating: { differentialPct: 1, stars: 0, playable: false },
    })
    const { selected } = selectAndScoreMarketBlendedGame(
      independent,
      10,
      DEFAULT_COVER_COEFFS,
    )
    expect(selected).toBe(false)
  })
})
