/**
 * Scan curated pairs against live venue prices (read-only).
 * Detection only — never places orders.
 */

import { detectArbitrage, type ArbOpportunity } from './arbDetector'
import { listCuratedPairs, type MatchedEventPair } from './eventMatcher'
import { fetchKalshiMarket } from './kalshiClient'
import { fetchPolymarketMarket } from './polymarketClient'
import type { MarketPrice } from './marketPrice'

export interface PairScanRow {
  pair: MatchedEventPair
  kalshi: MarketPrice | null
  polymarket: MarketPrice | null
  opportunity: ArbOpportunity | null
  error: string | null
}

export async function scanCuratedPairs(
  pairs: MatchedEventPair[] = listCuratedPairs().filter(
    (p) => (p.sport ?? 'nfl') === 'nfl',
  ),
): Promise<PairScanRow[]> {
  const rows: PairScanRow[] = []

  for (const pair of pairs) {
    try {
      const [kalshi, polymarket] = await Promise.all([
        fetchKalshiMarket(pair.kalshiMarketId),
        fetchPolymarketMarket(
          pair.polymarketMarketId,
          pair.polymarketAlignedOutcome,
          pair.polymarketSlug,
        ),
      ])
      const opportunity = detectArbitrage(kalshi, polymarket, pair)
      rows.push({ pair, kalshi, polymarket, opportunity, error: null })
    } catch (e) {
      rows.push({
        pair,
        kalshi: null,
        polymarket: null,
        opportunity: null,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return rows
}
