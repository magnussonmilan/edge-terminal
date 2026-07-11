/**
 * Dump match-count breakdown + verbatim rules for a few needs-review pairs.
 */
import { discoverKalshiMlbMarkets } from '../src/lib/kalshiMarketDiscovery.ts'
import { discoverPolymarketMlbMarkets } from '../src/lib/polymarketMarketDiscovery.ts'
import {
  countUnmatched,
  matchCandidatePairs,
} from '../src/lib/pairMatcher.ts'
import { classifyCandidatePair } from '../src/lib/mlbPairDiscovery.ts'

async function main() {
  const [kalshi, polymarket] = await Promise.all([
    discoverKalshiMlbMarkets(),
    discoverPolymarketMlbMarkets(),
  ])
  const pairs = matchCandidatePairs(kalshi, polymarket)
  const unmatched = countUnmatched(kalshi, polymarket, pairs)

  // How can matched > kalshi?
  const pairsPerKalshi = new Map<string, number>()
  const pairsPerPm = new Map<string, number>()
  const multiKalshi: Array<{ id: string; n: number; pms: string[] }> = []
  for (const p of pairs) {
    pairsPerKalshi.set(
      p.kalshi.marketId,
      (pairsPerKalshi.get(p.kalshi.marketId) ?? 0) + 1,
    )
    pairsPerPm.set(
      p.polymarket.marketId,
      (pairsPerPm.get(p.polymarket.marketId) ?? 0) + 1,
    )
  }
  for (const [id, n] of pairsPerKalshi) {
    if (n > 1) {
      multiKalshi.push({
        id,
        n,
        pms: pairs
          .filter((p) => p.kalshi.marketId === id)
          .map((p) => p.polymarket.eventSlug || p.polymarket.marketId.slice(0, 20)),
      })
    }
  }

  const classified = pairs.map(classifyCandidatePair)
  const needs = classified.filter((c) => c.status === 'needs_review')

  // Deduplicate sample games (one YES side per event) for readable report
  const seenEvents = new Set<string>()
  const samples = []
  for (const item of needs) {
    const ev = item.pair.kalshi.marketId.replace(/-[A-Z]{2,3}$/, '')
    if (seenEvents.has(ev)) continue
    seenEvents.add(ev)
    samples.push(item)
    if (samples.length >= 4) break
  }

  console.log(
    JSON.stringify(
      {
        counts: {
          kalshi: kalshi.length,
          polymarket: polymarket.length,
          matchedPairs: pairs.length,
          uniqueKalshiInPairs: pairsPerKalshi.size,
          uniquePmInPairs: pairsPerPm.size,
          kalshiWithMultiplePmMatches: multiKalshi.length,
          ...unmatched,
          autoApproved: classified.filter((c) => c.status === 'auto_approved')
            .length,
          needsReview: needs.length,
        },
        whyMatchedExceedsKalshi: {
          explanation:
            'matchedCount counts candidate pairs (Kalshi YES market × Polymarket moneyline), not unique Kalshi markets. A Kalshi market can match >1 Polymarket moneyline if multiple PM events share the same franchise-id pair + calendar date.',
          kalshiMarketsMatchedToMultiplePm: multiKalshi,
        },
        samples: samples.map((item) => ({
          description: item.proposed.description,
          kalshiId: item.pair.kalshi.marketId,
          polymarketSlug: item.pair.polymarket.eventSlug,
          gameDate: item.pair.kalshi.gameDate,
          teams: item.pair.kalshi.teams,
          flags: item.flags,
          kalshiRules: item.pair.kalshi.resolutionRules,
          polymarketRules: item.pair.polymarket.resolutionRules,
        })),
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
