/**
 * Session + localStorage store for discovered / promoted MLB pairs.
 */

import type { MatchedEventPair } from './eventMatcher'
import { loadPromotedMlbPairs } from './mlbPairDiscovery'

let sessionAutoApproved: MatchedEventPair[] = []

export function setSessionAutoApprovedMlbPairs(
  pairs: MatchedEventPair[],
): void {
  sessionAutoApproved = pairs.map((p) => ({ ...p }))
}

export function listDiscoveredMlbPairs(): MatchedEventPair[] {
  const promoted = loadPromotedMlbPairs()
  const promotedKeys = new Set(
    promoted.map((p) => `${p.kalshiMarketId}|${p.polymarketMarketId}`),
  )
  const auto = sessionAutoApproved.filter(
    (p) => !promotedKeys.has(`${p.kalshiMarketId}|${p.polymarketMarketId}`),
  )
  return [...auto, ...promoted]
}
