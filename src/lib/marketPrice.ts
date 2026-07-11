/**
 * Shared types for cross-venue prediction-market price reads.
 * Detection / monitoring only — no order placement.
 */

export type Venue = 'kalshi' | 'polymarket'

/**
 * Normalized market snapshot. Prices are probabilities in [0, 1]
 * (dollars per $1 settlement contract).
 *
 * For Polymarket two-outcome moneylines, `yesPrice` is the ask to buy the
 * outcome aligned with the curated Kalshi YES side; `noPrice` is the ask
 * to buy the opposite outcome.
 */
export interface MarketPrice {
  venue: Venue
  marketId: string
  title: string
  yesPrice: number
  noPrice: number
  /** Size available at the displayed YES ask, if the API exposes it. */
  liquidity: number | null
  /** Size available at the displayed NO ask, if exposed. */
  noLiquidity: number | null
  /** Verbatim resolution text — do not paraphrase. */
  resolutionRules: string
  /** Settlement source string from the venue, verbatim when available. */
  resolutionSource: string
  lastUpdated: Date
  /** Optional raw fee-rate hint from the venue (Polymarket sports = 0.05). */
  feeRateHint?: number
}

export function parseDollarProb(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}
