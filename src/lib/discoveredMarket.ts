/**
 * Shared shape for markets discovered from Kalshi / Polymarket listing APIs.
 * Read-only — discovery never places orders.
 */

export interface DiscoveredMarket {
  venue: 'kalshi' | 'polymarket'
  marketId: string
  title: string
  /** Normalized franchise IDs (sorted ascending for matching). */
  teams: [string, string]
  /** Calendar date YYYY-MM-DD (game day, not listing creation). */
  gameDate: string
  /** Verbatim resolution rules (same field as arb monitor). */
  resolutionRules: string
  resolutionSource: string
  /**
   * Kalshi: YES team franchise id.
   * Polymarket moneyline: omit (both outcomes live on one market).
   */
  yesTeam?: string
  /** Polymarket outcome labels [team A, team B] when known. */
  outcomeLabels?: [string, string]
  /** Polymarket event slug for reliable re-fetch. */
  eventSlug?: string
  rawTitle?: string
}
