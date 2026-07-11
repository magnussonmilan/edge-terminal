/**
 * Hand-verifiable fee / arb math tests.
 *
 * Construct known prices + published fee schedules, compute expected net by
 * hand, assert the functions match. Also assert unverified pairs never flag.
 */

import { describe, expect, it } from 'vitest'
import {
  detectArbitrage,
  evaluateArbLegs,
} from './arbDetector'
import { kalshiTakerFeeDollars } from './kalshiClient'
import { polymarketTakerFeeDollars } from './polymarketClient'
import type { MatchedEventPair } from './eventMatcher'
import type { MarketPrice } from './marketPrice'

const basePair: MatchedEventPair = {
  kalshiMarketId: 'TEST-KALSHI',
  polymarketMarketId: '0xtest',
  polymarketAlignedOutcome: 'TeamA',
  description: 'Test game',
  verifiedEquivalent: true,
  verificationNote: 'Synthetic test pair — rules assumed identical for unit tests only.',
}

function price(
  venue: 'kalshi' | 'polymarket',
  yes: number,
  no: number,
): MarketPrice {
  return {
    venue,
    marketId: venue === 'kalshi' ? 'TEST-K' : 'TEST-P',
    title: 'test',
    yesPrice: yes,
    noPrice: no,
    liquidity: 100,
    noLiquidity: 100,
    resolutionRules: 'test rules',
    resolutionSource: 'test',
    lastUpdated: new Date('2026-07-10T00:00:00Z'),
    feeRateHint: venue === 'polymarket' ? 0.05 : 0.07,
  }
}

describe('kalshiTakerFeeDollars (published schedule)', () => {
  it('1 contract at $0.50 → ceil(0.07×0.25)=ceil(0.0175)=$0.02', () => {
    // Hand: 0.07 * 1 * 0.5 * 0.5 = 0.0175 → round up to next cent = 0.02
    expect(kalshiTakerFeeDollars(1, 0.5)).toBe(0.02)
  })

  it('100 contracts at $0.40 → 0.07×100×0.4×0.6 = $1.68 (exact cent)', () => {
    // Hand: 0.07 * 100 * 0.4 * 0.6 = 1.68
    expect(kalshiTakerFeeDollars(100, 0.4)).toBe(1.68)
  })

  it('1 contract at $0.10 → ceil(0.0063)=$0.01', () => {
    // Hand: 0.07 * 1 * 0.1 * 0.9 = 0.0063 → ceil cent = 0.01
    expect(kalshiTakerFeeDollars(1, 0.1)).toBe(0.01)
  })
})

describe('polymarketTakerFeeDollars (sports schedule)', () => {
  it('100 shares at $0.50 sports → 100×0.05×0.25 = $1.25', () => {
    // Hand: 100 * 0.05 * 0.5 * 0.5 = 1.25
    expect(polymarketTakerFeeDollars(100, 0.5, 0.05)).toBe(1.25)
  })

  it('1 share at $0.40 sports → 0.05×0.4×0.6 = 0.012', () => {
    // Hand: 1 * 0.05 * 0.4 * 0.6 = 0.012 → 5dp = 0.012
    expect(polymarketTakerFeeDollars(1, 0.4, 0.05)).toBe(0.012)
  })

  it('fee-free geopolitics rate 0 → $0', () => {
    expect(polymarketTakerFeeDollars(100, 0.5, 0)).toBe(0)
  })
})

describe('evaluateArbLegs hand cases', () => {
  it('profitable: Kalshi YES 0.40 + Poly NO 0.50 after fees', () => {
    // Hand:
    //   gross = 0.40 + 0.50 = 0.90
    //   kalshi fee = ceil(0.07*0.4*0.6) = ceil(0.0168) = 0.02
    //   poly fee   = 0.05*0.5*0.5 = 0.0125
    //   net = 1 - 0.90 - 0.02 - 0.0125 = 0.0675
    const ev = evaluateArbLegs(0.4, 0.5, 'buy-yes-kalshi-no-polymarket', 0.05)
    expect(ev.grossSpread).toBeCloseTo(0.9, 10)
    expect(ev.kalshiFee).toBe(0.02)
    expect(ev.polymarketFee).toBe(0.0125)
    expect(ev.netProfitPerDollar).toBeCloseTo(0.0675, 10)
  })

  it('unprofitable when asks already sum over $1 before fees', () => {
    // Hand: 0.55 + 0.50 = 1.05 > 1 → net negative even before fees
    const ev = evaluateArbLegs(0.55, 0.5, 'buy-yes-kalshi-no-polymarket', 0.05)
    expect(ev.grossSpread).toBeCloseTo(1.05, 10)
    expect(ev.netProfitPerDollar).toBeLessThan(0)
  })

  it('fees alone can kill a thin gross edge', () => {
    // Hand: asks 0.48 + 0.50 = 0.98 (2¢ gross)
    //   kalshi = ceil(0.07*0.48*0.52)=ceil(0.017472)=0.02
    //   poly   = 0.05*0.5*0.5=0.0125
    //   net = 1 - 0.98 - 0.02 - 0.0125 = -0.0125 < 0
    const ev = evaluateArbLegs(0.48, 0.5, 'buy-yes-kalshi-no-polymarket', 0.05)
    expect(ev.kalshiFee).toBe(0.02)
    expect(ev.polymarketFee).toBe(0.0125)
    expect(ev.netProfitPerDollar).toBeCloseTo(-0.0125, 10)
  })
})

describe('detectArbitrage safety', () => {
  it('returns null for unverified pairs even when math is hugely profitable', () => {
    const unverified: MatchedEventPair = {
      ...basePair,
      verifiedEquivalent: false,
      verificationNote: 'Intentionally unverified — must not flag.',
    }
    // Absurd prices that would be free money if rules matched
    const kalshi = price('kalshi', 0.1, 0.95)
    const poly = price('polymarket', 0.95, 0.1)
    const hit = detectArbitrage(kalshi, poly, unverified)
    expect(hit).toBeNull()
  })

  it('flags verified pair when YES-Kalshi + NO-Poly is profitable after fees', () => {
    const kalshi = price('kalshi', 0.4, 0.65)
    const poly = price('polymarket', 0.6, 0.5)
    const hit = detectArbitrage(kalshi, poly, basePair)
    expect(hit).not.toBeNull()
    expect(hit!.strategy).toBe('buy-yes-kalshi-no-polymarket')
    expect(hit!.netProfitPerDollar).toBeCloseTo(0.0675, 10)
    expect(hit!.breakdown.kalshiLeg.side).toBe('yes')
    expect(hit!.breakdown.polymarketLeg.side).toBe('no')
  })

  it('flags the better of two strategies when both clear fees', () => {
    // Strat A: K yes 0.40 + P no 0.50 → net 0.0675
    // Strat B: K no 0.30 + P yes 0.40 → gross 0.70
    //   k fee = ceil(0.07*0.3*0.7)=ceil(0.0147)=0.02
    //   p fee = 0.05*0.4*0.6=0.012
    //   net = 1-0.70-0.02-0.012 = 0.268
    const kalshi = price('kalshi', 0.4, 0.3)
    const poly = price('polymarket', 0.4, 0.5)
    const hit = detectArbitrage(kalshi, poly, basePair)
    expect(hit).not.toBeNull()
    expect(hit!.strategy).toBe('buy-yes-polymarket-no-kalshi')
    expect(hit!.netProfitPerDollar).toBeCloseTo(0.268, 10)
  })

  it('returns null when verified but neither strategy clears fees', () => {
    const kalshi = price('kalshi', 0.55, 0.55)
    const poly = price('polymarket', 0.55, 0.55)
    expect(detectArbitrage(kalshi, poly, basePair)).toBeNull()
  })
})
