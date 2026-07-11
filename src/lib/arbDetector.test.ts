/**
 * Fee / arb math tests.
 *
 * Polymarket fee assertions use a real captured getClobMarketInfo payload
 * (not invented rates). Kalshi assertions use the published fee-schedule PDF.
 */

import { describe, expect, it } from 'vitest'
import {
  detectArbitrage,
  evaluateArbLegs,
} from './arbDetector'
import { kalshiTakerFeeDollars } from './kalshiClient'
import {
  feeParamsFromClobFd,
  polymarketTakerFeeDollars,
  POLYMARKET_FEE_FALLBACK,
} from './polymarketClient'
import type { MatchedEventPair } from './eventMatcher'
import type { MarketPrice, PolymarketFeeParams } from './marketPrice'

/**
 * Captured 2026-07-10 from live:
 *   GET https://clob.polymarket.com/clob-markets/0x275041c00bde19ef86a3dc1036c204d1c9b8731d24228472966cd9006942fd4f
 *   (Seahawks vs Cowboys NFL moneyline — sports_fees_v2)
 * Response included: "fd":{"r":0.05,"e":1,"to":true}
 *
 * Also matches docs.polymarket.com/trading/fees Sports table:
 *   100 shares @ $0.50 → $1.25 taker fee.
 */
const CAPTURED_NFL_CLOB_FD = { r: 0.05, e: 1, to: true } as const

/**
 * Captured from Gamma feeSchedule on a crypto 15-min market
 * (Bitcoin Up or Down — feeType crypto_15_min / crypto_fees):
 *   {"exponent":2,"rate":0.25,"takerOnly":true,"rebateRate":0.2}
 * Used to regression-test the exponent term when e ≠ 1.
 */
const CAPTURED_CRYPTO_15M_SCHEDULE = {
  rate: 0.25,
  exponent: 2,
  takerOnly: true,
} as const

const NFL_LIVE_FEES: PolymarketFeeParams = {
  ...feeParamsFromClobFd(CAPTURED_NFL_CLOB_FD)!,
}

const CRYPTO_E2_FEES: PolymarketFeeParams = {
  feeRate: CAPTURED_CRYPTO_15M_SCHEDULE.rate,
  exponent: CAPTURED_CRYPTO_15M_SCHEDULE.exponent,
  takerOnly: CAPTURED_CRYPTO_15M_SCHEDULE.takerOnly,
  fromLiveQuery: true,
}

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
  polyFees: PolymarketFeeParams = NFL_LIVE_FEES,
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
    polymarketFee: venue === 'polymarket' ? polyFees : undefined,
  }
}

describe('kalshiTakerFeeDollars (published schedule — unchanged)', () => {
  it('1 contract at $0.50 → ceil(0.07×0.25)=ceil(0.0175)=$0.02', () => {
    expect(kalshiTakerFeeDollars(1, 0.5)).toBe(0.02)
  })

  it('100 contracts at $0.40 → 0.07×100×0.4×0.6 = $1.68', () => {
    expect(kalshiTakerFeeDollars(100, 0.4)).toBe(1.68)
  })

  it('1 contract at $0.10 → ceil(0.0063)=$0.01', () => {
    expect(kalshiTakerFeeDollars(1, 0.1)).toBe(0.01)
  })
})

describe('feeParamsFromClobFd (captured live payload)', () => {
  it('parses the captured NFL getClobMarketInfo fd', () => {
    const p = feeParamsFromClobFd(CAPTURED_NFL_CLOB_FD)
    expect(p).not.toBeNull()
    expect(p!.feeRate).toBe(0.05)
    expect(p!.exponent).toBe(1)
    expect(p!.takerOnly).toBe(true)
    expect(p!.fromLiveQuery).toBe(true)
  })

  it('returns null for missing fd.r', () => {
    expect(feeParamsFromClobFd({ e: 1, to: true })).toBeNull()
    expect(feeParamsFromClobFd(null)).toBeNull()
  })
})

describe('polymarketTakerFeeDollars (live params + exponent)', () => {
  it('NFL captured fd: 100 shares @ $0.50 → $1.25 (docs Sports table)', () => {
    // Hand: C * r * (p*(1-p))^e = 100 * 0.05 * (0.25)^1 = 1.25
    expect(polymarketTakerFeeDollars(100, 0.5, NFL_LIVE_FEES)).toBe(1.25)
  })

  it('NFL captured fd: 1 share @ $0.40 → 0.012', () => {
    // Hand: 1 * 0.05 * (0.4*0.6)^1 = 0.012
    expect(polymarketTakerFeeDollars(1, 0.4, NFL_LIVE_FEES)).toBe(0.012)
  })

  it('applies exponent when e=2 (captured crypto_15_min schedule)', () => {
    // Hand: 100 * 0.25 * (0.25)^2 = 100 * 0.25 * 0.0625 = 1.5625
    expect(polymarketTakerFeeDollars(100, 0.5, CRYPTO_E2_FEES)).toBe(1.5625)
  })

  it('e=2 differs from e=1 at same rate — exponent is not a no-op', () => {
    const e1 = polymarketTakerFeeDollars(100, 0.5, {
      feeRate: 0.25,
      exponent: 1,
      takerOnly: true,
      fromLiveQuery: true,
    })
    const e2 = polymarketTakerFeeDollars(100, 0.5, CRYPTO_E2_FEES)
    // e1: 100*0.25*0.25 = 6.25; e2: 1.5625
    expect(e1).toBe(6.25)
    expect(e2).toBe(1.5625)
    expect(e2).not.toBe(e1)
  })

  it('feeRate 0 → $0', () => {
    expect(
      polymarketTakerFeeDollars(100, 0.5, {
        feeRate: 0,
        exponent: 1,
        takerOnly: true,
        fromLiveQuery: true,
      }),
    ).toBe(0)
  })

  it('fallback constant is clearly marked not-from-live', () => {
    expect(POLYMARKET_FEE_FALLBACK.fromLiveQuery).toBe(false)
  })
})

describe('evaluateArbLegs with live NFL fee params', () => {
  it('profitable: Kalshi YES 0.40 + Poly NO 0.50 after fees', () => {
    // Hand:
    //   gross = 0.90
    //   kalshi = ceil(0.07*0.4*0.6) = 0.02
    //   poly   = 1*0.05*(0.5*0.5)^1 = 0.0125
    //   net = 1 - 0.90 - 0.02 - 0.0125 = 0.0675
    const ev = evaluateArbLegs(
      0.4,
      0.5,
      'buy-yes-kalshi-no-polymarket',
      NFL_LIVE_FEES,
    )
    expect(ev.grossSpread).toBeCloseTo(0.9, 10)
    expect(ev.kalshiFee).toBe(0.02)
    expect(ev.polymarketFee).toBe(0.0125)
    expect(ev.netProfitPerDollar).toBeCloseTo(0.0675, 10)
    expect(ev.breakdown.polymarketFeeParams.feeRate).toBe(0.05)
    expect(ev.breakdown.polymarketFeeParams.exponent).toBe(1)
  })

  it('unprofitable when asks already sum over $1 before fees', () => {
    const ev = evaluateArbLegs(
      0.55,
      0.5,
      'buy-yes-kalshi-no-polymarket',
      NFL_LIVE_FEES,
    )
    expect(ev.netProfitPerDollar).toBeLessThan(0)
  })

  it('fees alone can kill a thin gross edge', () => {
    // Hand: 0.48+0.50=0.98; k=0.02; p=0.0125; net=-0.0125
    const ev = evaluateArbLegs(
      0.48,
      0.5,
      'buy-yes-kalshi-no-polymarket',
      NFL_LIVE_FEES,
    )
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
    const kalshi = price('kalshi', 0.1, 0.95)
    const poly = price('polymarket', 0.95, 0.1)
    expect(detectArbitrage(kalshi, poly, unverified)).toBeNull()
  })

  it('flags verified pair when YES-Kalshi + NO-Poly is profitable after fees', () => {
    const kalshi = price('kalshi', 0.4, 0.65)
    const poly = price('polymarket', 0.6, 0.5)
    const hit = detectArbitrage(kalshi, poly, basePair)
    expect(hit).not.toBeNull()
    expect(hit!.strategy).toBe('buy-yes-kalshi-no-polymarket')
    expect(hit!.netProfitPerDollar).toBeCloseTo(0.0675, 10)
    expect(hit!.breakdown.polymarketFeeParams.fromLiveQuery).toBe(true)
  })

  it('flags the better of two strategies when both clear fees', () => {
    // Strat B: K no 0.30 + P yes 0.40
    //   k fee = ceil(0.07*0.3*0.7)=0.02
    //   p fee = 0.05*(0.4*0.6)=0.012
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

  it('uses per-market fee params from MarketPrice, not a shared global', () => {
    // Same prices; higher feeRate must shrink net profit
    const kalshi = price('kalshi', 0.4, 0.65)
    const polyLow = price('polymarket', 0.6, 0.5, NFL_LIVE_FEES)
    const polyHigh = price('polymarket', 0.6, 0.5, {
      feeRate: 0.2,
      exponent: 1,
      takerOnly: true,
      fromLiveQuery: true,
    })
    const a = detectArbitrage(kalshi, polyLow, basePair)!
    const b = detectArbitrage(kalshi, polyHigh, basePair)!
    expect(a.polymarketFee).toBeLessThan(b.polymarketFee)
    expect(a.netProfitPerDollar).toBeGreaterThan(b.netProfitPerDollar)
  })
})
