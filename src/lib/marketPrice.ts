/**
 * Shared types for cross-venue prediction-market price reads.
 * Detection / monitoring only — no order placement.
 */

export type Venue = 'kalshi' | 'polymarket'

/**
 * Per-market Polymarket fee curve from CLOB getClobMarketInfo (`fd`).
 * Docs: https://docs.polymarket.com/trading/fees
 * Endpoint: GET https://clob.polymarket.com/clob-markets/{condition_id}
 *   → fd: { r: feeRate, e: exponent, to: takerOnly }
 */
export interface PolymarketFeeParams {
  /** fd.r — fee rate */
  feeRate: number
  /** fd.e — fee curve exponent */
  exponent: number
  /** fd.to — fees apply to takers only */
  takerOnly: boolean
  /** true when params came from live getClobMarketInfo; false = fallback */
  fromLiveQuery: boolean
}

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
  /** Live per-market Polymarket fee curve (preferred over any global constant). */
  polymarketFee?: PolymarketFeeParams
}

export function parseDollarProb(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(1, n))
}
