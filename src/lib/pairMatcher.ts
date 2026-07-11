/**
 * Match Kalshi ↔ Polymarket discovered markets by team identity + calendar date.
 * No fuzzy title matching — safer key than string similarity alone.
 */

import type { DiscoveredMarket } from './discoveredMarket'
import { resolveMlbVenueTeam } from './mlbVenueTeams'
import { MLB_FRANCHISES } from './mlbTeamIds'

export interface CandidatePair {
  kalshi: DiscoveredMarket
  polymarket: DiscoveredMarket
  /** Polymarket outcome label aligned to Kalshi YES. */
  polymarketAlignedOutcome: string
}

function teamKey(teams: [string, string], date: string): string {
  return `${teams[0]}|${teams[1]}|${date}`
}

/**
 * Pick the Polymarket outcome string that corresponds to a franchise id.
 */
export function polymarketOutcomeForTeam(
  pm: DiscoveredMarket,
  franchiseId: string,
): string | null {
  if (pm.outcomeLabels) {
    for (const label of pm.outcomeLabels) {
      const id = resolveMlbVenueTeam(label)
      if (id === franchiseId) return label
    }
  }
  // Fall back to franchise current name
  const fr = MLB_FRANCHISES[franchiseId]
  return fr?.currentName ?? null
}

/**
 * Match Kalshi binary game-winner markets to Polymarket moneylines.
 * One candidate pair per Kalshi YES side that shares teams + date with a PM market.
 */
export function matchCandidatePairs(
  kalshi: DiscoveredMarket[],
  polymarket: DiscoveredMarket[],
): CandidatePair[] {
  const pmByKey = new Map<string, DiscoveredMarket[]>()
  for (const pm of polymarket) {
    if (pm.venue !== 'polymarket') continue
    const k = teamKey(pm.teams, pm.gameDate)
    const list = pmByKey.get(k) ?? []
    list.push(pm)
    pmByKey.set(k, list)
  }

  const out: CandidatePair[] = []
  const seen = new Set<string>()

  for (const k of kalshi) {
    if (k.venue !== 'kalshi' || !k.yesTeam) continue
    const key = teamKey(k.teams, k.gameDate)
    const candidates = pmByKey.get(key) ?? []
    for (const pm of candidates) {
      const aligned = polymarketOutcomeForTeam(pm, k.yesTeam)
      if (!aligned) continue
      const id = `${k.marketId}::${pm.marketId}`
      if (seen.has(id)) continue
      seen.add(id)
      out.push({
        kalshi: k,
        polymarket: pm,
        polymarketAlignedOutcome: aligned,
      })
    }
  }

  return out
}

/** Count markets that never joined a pair (for honest reporting). */
export function countUnmatched(
  kalshi: DiscoveredMarket[],
  polymarket: DiscoveredMarket[],
  pairs: CandidatePair[],
): { unmatchedKalshi: number; unmatchedPolymarket: number } {
  const pairedK = new Set(pairs.map((p) => p.kalshi.marketId))
  const pairedP = new Set(pairs.map((p) => p.polymarket.marketId))
  return {
    unmatchedKalshi: kalshi.filter((m) => !pairedK.has(m.marketId)).length,
    unmatchedPolymarket: polymarket.filter((m) => !pairedP.has(m.marketId))
      .length,
  }
}
