import { describe, expect, it } from 'vitest'
import { blendWithAdjustableWeight, blendWithMarket } from './marketBlend'
import { spreadToWinProb } from './backtest'
import {
  buildUnifiedComparison,
  predictionMarketToVenueQuotes,
  recomputeBlendedModel,
  withBlendWeight,
  type PredictionMarketSnapshot,
} from './unifiedComparison'
import {
  DEMO_GAME_LINE_EVENTS,
  eventsToBookOdds,
} from './oddsAggregator'
import type { MatchedEventPair } from './eventMatcher'
import type { MarketPrice } from './marketPrice'
import { ALL_PREDICTIONS } from './nflData'

describe('blendWithAdjustableWeight', () => {
  it('matches blendWithMarket and clamps to [0,1]', () => {
    expect(blendWithAdjustableWeight(10, 0, 0)).toBe(0)
    expect(blendWithAdjustableWeight(10, 0, 1)).toBe(10)
    expect(blendWithAdjustableWeight(10, 0, 0.15)).toBe(
      blendWithMarket(10, 0, 0.15),
    )
    expect(blendWithAdjustableWeight(10, 0, -1)).toBe(0)
    expect(blendWithAdjustableWeight(10, 0, 2)).toBe(10)
  })
})

describe('recomputeBlendedModel', () => {
  it('live-updates moneyline via spreadToWinProb (same conversion as backtest)', () => {
    const model = 7
    const market = 3
    const w = 0.15
    const r = recomputeBlendedModel(model, market, w, 0.15)
    const expectedSpread = 0.15 * 7 + 0.85 * 3
    expect(r.spread).toBeCloseTo(expectedSpread, 10)
    expect(r.moneylineProbability).toBeCloseTo(
      spreadToWinProb(expectedSpread),
      12,
    )
    expect(r.isCalibratedDefault).toBe(true)
    expect(r.weightUsed).toBe(0.15)
  })

  it('marks non-calibrated weights', () => {
    const r = recomputeBlendedModel(7, 3, 1, 0.15)
    expect(r.isCalibratedDefault).toBe(false)
    expect(r.spread).toBe(7)
  })
})

describe('predictionMarketToVenueQuotes', () => {
  const pair: MatchedEventPair = {
    kalshiMarketId: 'K-TEST',
    polymarketMarketId: '0xabc',
    polymarketAlignedOutcome: 'Seahawks',
    description: 'SEA @ DAL',
    verifiedEquivalent: false,
    verificationNote: 'test unverified',
    homeTeam: 'DAL',
    awayTeam: 'SEA',
    yesSide: 'away',
  }

  function price(venue: 'kalshi' | 'polymarket', yes: number): MarketPrice {
    return {
      venue,
      marketId: 'm',
      title: 't',
      yesPrice: yes,
      noPrice: 1 - yes,
      liquidity: null,
      noLiquidity: null,
      resolutionRules: 'rules',
      resolutionSource: 'src',
      lastUpdated: new Date(),
    }
  }

  it('converts YES=away into home win probability and keeps unverified flag', () => {
    const snap: PredictionMarketSnapshot = {
      pair,
      kalshi: price('kalshi', 0.42),
      polymarket: price('polymarket', 0.4),
    }
    const quotes = predictionMarketToVenueQuotes(snap)
    expect(quotes).toHaveLength(2)
    // P(home) = 1 - P(SEA)
    expect(quotes[0]!.impliedProbability).toBeCloseTo(0.58, 10)
    expect(quotes[0]!.resolutionVerified).toBe(false)
    expect(quotes[0]!.market).toBe('moneyline')
    expect(quotes[0]!.venueType).toBe('prediction_market')
    expect(quotes[1]!.impliedProbability).toBeCloseTo(0.6, 10)
    expect(quotes[1]!.resolutionVerified).toBe(false)
  })

  it('does not omit unverified pairs when prices are missing', () => {
    const quotes = predictionMarketToVenueQuotes({
      pair,
      kalshi: null,
      polymarket: null,
    })
    expect(quotes).toHaveLength(1)
    expect(quotes[0]!.resolutionVerified).toBe(false)
    expect(quotes[0]!.rawPrice).toContain('unavailable')
  })
})

describe('buildUnifiedComparison', () => {
  it('builds moneyline-primary comparison with books for a known game when odds match', () => {
    // Use demo KC vs LV odds — find or skip if no KC/LV prediction exists
    const books = eventsToBookOdds(DEMO_GAME_LINE_EVENTS)
    const sample = ALL_PREDICTIONS.find(
      (p) => p.postedSpread != null && p.homeTeam === 'KC' && p.awayTeam === 'LV',
    )
    if (!sample) {
      // Fall back: any game with posted line, empty books
      const any = ALL_PREDICTIONS.find((p) => p.postedSpread != null)!
      const cmp = buildUnifiedComparison(any.gameId, undefined, { bookOdds: [] })
      expect(cmp).not.toBeNull()
      expect(cmp!.modelBlended.isCalibratedDefault).toBe(true)
      expect(cmp!.modelBlended.weightUsed).toBeCloseTo(0.15, 5)
      expect(cmp!.blendTracksMarketClosely).toBe(true)
      return
    }

    const cmp = buildUnifiedComparison(sample.gameId, 0.15, { bookOdds: books })
    expect(cmp).not.toBeNull()
    expect(cmp!.moneylineVenues.length).toBeGreaterThan(0)
    expect(cmp!.moneylineVenues.every((v) => v.market === 'moneyline')).toBe(
      true,
    )
    expect(cmp!.spreadVenues.every((v) => v.venueType === 'traditional_book')).toBe(
      true,
    )
    // Prediction markets absent unless pair matched
    expect(
      cmp!.moneylineVenues.filter((v) => v.venueType === 'prediction_market'),
    ).toHaveLength(0)
  })

  it('withBlendWeight only changes blended fields', () => {
    const any = ALL_PREDICTIONS.find((p) => p.postedSpread != null)!
    const base = buildUnifiedComparison(any.gameId)!
    const moved = withBlendWeight(base, 1)
    expect(moved.modelBlended.spread).toBeCloseTo(base.modelRaw.spread, 10)
    expect(moved.modelBlended.weightUsed).toBe(1)
    expect(moved.moneylineVenues).toEqual(base.moneylineVenues)
  })
})
