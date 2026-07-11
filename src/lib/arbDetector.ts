/**
 * Cross-venue arbitrage detection (Kalshi ↔ Polymarket).
 *
 * True arb: after both venues' taker fees, the cost to buy YES on one venue
 * plus the equivalent NO on the other is strictly less than $1 settlement.
 *
 * HARD RULE: never flag a pair with verifiedEquivalent !== true — mismatched
 * resolution rules are the primary way "arb" becomes a real loss.
 *
 * Fee sources (checked 2026-07-10 against published docs):
 * - Kalshi general taker: round_up_cent(0.07 × C × P × (1−P))
 * - Polymarket sports taker: round_5dp(C × 0.05 × p × (1−p))
 */

import { kalshiTakerFeeDollars } from './kalshiClient'
import {
  polymarketTakerFeeDollars,
  POLYMARKET_SPORTS_TAKER_FEE_RATE,
} from './polymarketClient'
import type { MatchedEventPair } from './eventMatcher'
import type { MarketPrice } from './marketPrice'

export type ArbStrategy =
  | 'buy-yes-kalshi-no-polymarket'
  | 'buy-yes-polymarket-no-kalshi'

export interface ArbOpportunity {
  pair: MatchedEventPair
  strategy: ArbStrategy
  /** Combined ask cost of both legs before fees (per $1 contract). */
  grossSpread: number
  kalshiFee: number
  polymarketFee: number
  /** 1 − grossSpread − fees; must be > 0 to flag. */
  netProfitPerDollar: number
  /** Min of available sizes at the two displayed asks, if both known. */
  maxSizeAtDisplayedPrice: number | null
  flaggedAt: Date
  /** Itemized math for the UI — do not hide fees in a single number. */
  breakdown: {
    kalshiLeg: { side: 'yes' | 'no'; price: number; fee: number }
    polymarketLeg: { side: 'yes' | 'no'; price: number; fee: number }
    settlementValue: number
  }
}

const SETTLEMENT = 1

function minLiquidity(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  if (a == null || b == null) return null
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.min(a, b)
}

/**
 * Evaluate one strategy for C=1 contract. Returns null if not profitable
 * after fees (net ≤ 0).
 */
export function evaluateArbLegs(
  kalshiPrice: number,
  polymarketPrice: number,
  strategy: ArbStrategy,
  polymarketFeeRate: number = POLYMARKET_SPORTS_TAKER_FEE_RATE,
  contracts = 1,
): {
  grossSpread: number
  kalshiFee: number
  polymarketFee: number
  netProfitPerDollar: number
  breakdown: ArbOpportunity['breakdown']
} {
  const kalshiFee = kalshiTakerFeeDollars(contracts, kalshiPrice)
  const polymarketFee = polymarketTakerFeeDollars(
    contracts,
    polymarketPrice,
    polymarketFeeRate,
  )
  const grossSpread = kalshiPrice + polymarketPrice
  const totalCost = grossSpread + kalshiFee + polymarketFee
  const netProfitPerDollar = (SETTLEMENT * contracts - totalCost) / contracts

  const kalshiSide: 'yes' | 'no' =
    strategy === 'buy-yes-kalshi-no-polymarket' ? 'yes' : 'no'
  const polySide: 'yes' | 'no' =
    strategy === 'buy-yes-kalshi-no-polymarket' ? 'no' : 'yes'

  return {
    grossSpread,
    kalshiFee,
    polymarketFee,
    netProfitPerDollar,
    breakdown: {
      kalshiLeg: { side: kalshiSide, price: kalshiPrice, fee: kalshiFee },
      polymarketLeg: {
        side: polySide,
        price: polymarketPrice,
        fee: polymarketFee,
      },
      settlementValue: SETTLEMENT,
    },
  }
}

/**
 * True arb detector. Returns null when:
 * - pair.verifiedEquivalent is not true (always — even if math looks great)
 * - neither strategy is profitable after fees
 */
export function detectArbitrage(
  kalshi: MarketPrice,
  polymarket: MarketPrice,
  pair: MatchedEventPair,
  now: Date = new Date(),
): ArbOpportunity | null {
  if (!pair.verifiedEquivalent) {
    return null
  }

  const polyFeeRate =
    polymarket.feeRateHint ?? POLYMARKET_SPORTS_TAKER_FEE_RATE

  const candidates: Array<{
    strategy: ArbStrategy
    kalshiPrice: number
    polymarketPrice: number
    maxSize: number | null
  }> = [
    {
      strategy: 'buy-yes-kalshi-no-polymarket',
      kalshiPrice: kalshi.yesPrice,
      polymarketPrice: polymarket.noPrice,
      maxSize: minLiquidity(kalshi.liquidity, polymarket.noLiquidity),
    },
    {
      strategy: 'buy-yes-polymarket-no-kalshi',
      kalshiPrice: kalshi.noPrice,
      polymarketPrice: polymarket.yesPrice,
      maxSize: minLiquidity(kalshi.noLiquidity, polymarket.liquidity),
    },
  ]

  let best: ArbOpportunity | null = null

  for (const c of candidates) {
    const ev = evaluateArbLegs(
      c.kalshiPrice,
      c.polymarketPrice,
      c.strategy,
      polyFeeRate,
      1,
    )
    if (ev.netProfitPerDollar <= 0) continue
    const opp: ArbOpportunity = {
      pair,
      strategy: c.strategy,
      grossSpread: ev.grossSpread,
      kalshiFee: ev.kalshiFee,
      polymarketFee: ev.polymarketFee,
      netProfitPerDollar: ev.netProfitPerDollar,
      maxSizeAtDisplayedPrice: c.maxSize,
      flaggedAt: now,
      breakdown: ev.breakdown,
    }
    if (!best || opp.netProfitPerDollar > best.netProfitPerDollar) {
      best = opp
    }
  }

  return best
}

/**
 * Scan helper: run detectArbitrage over many pairs. Unverified pairs never
 * appear in the result list.
 */
export function detectArbitrageForPairs(
  snapshots: Array<{
    pair: MatchedEventPair
    kalshi: MarketPrice
    polymarket: MarketPrice
  }>,
  now: Date = new Date(),
): ArbOpportunity[] {
  const out: ArbOpportunity[] = []
  for (const row of snapshots) {
    const hit = detectArbitrage(row.kalshi, row.polymarket, row.pair, now)
    if (hit) out.push(hit)
  }
  return out.sort((a, b) => b.netProfitPerDollar - a.netProfitPerDollar)
}
