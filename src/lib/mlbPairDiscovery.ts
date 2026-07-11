/**
 * Orchestrate MLB market discovery → match → rules-diff → review queue.
 * Auto-approve only when rules-diff returns zero flags.
 * Never softens the verifiedEquivalent gate for arb detection.
 */

import { discoverKalshiMlbMarkets } from './kalshiMarketDiscovery'
import { discoverPolymarketMlbMarkets } from './polymarketMarketDiscovery'
import {
  countUnmatched,
  matchCandidatePairs,
  type CandidatePair,
} from './pairMatcher'
import { diffResolutionRules, type RulesFlag } from './rulesDiffChecker'
import type { MatchedEventPair } from './eventMatcher'

export type ReviewQueueStatus = 'auto_approved' | 'needs_review'

export interface ReviewQueueItem {
  status: ReviewQueueStatus
  flags: RulesFlag[]
  pair: CandidatePair
  /** Proposed MatchedEventPair — verifiedEquivalent true only if auto_approved. */
  proposed: MatchedEventPair
}

export interface MlbDiscoveryReport {
  scannedAt: string
  kalshiCount: number
  polymarketCount: number
  matchedCount: number
  unmatchedKalshi: number
  unmatchedPolymarket: number
  autoApproved: ReviewQueueItem[]
  needsReview: ReviewQueueItem[]
}

function proposedFromCandidate(
  c: CandidatePair,
  flags: RulesFlag[],
): MatchedEventPair {
  const auto = flags.length === 0
  const [t0, t1] = c.kalshi.teams
  const yes = c.kalshi.yesTeam!
  // Infer home/away roughly: Polymarket ordering unavailable here — leave yesSide
  // as away if yes team sorts second alphabetically? Better: omit unless known.
  return {
    kalshiMarketId: c.kalshi.marketId,
    polymarketMarketId: c.polymarket.marketId,
    polymarketAlignedOutcome: c.polymarketAlignedOutcome,
    polymarketSlug: c.polymarket.eventSlug,
    description: `${c.kalshi.title} · ${c.kalshi.gameDate} (${t0}/${t1})`,
    homeTeam: t0, // stable but not necessarily true home — join key for Compare
    awayTeam: t1,
    yesSide: yes === t0 ? 'home' : 'away',
    sport: 'mlb',
    verifiedEquivalent: auto,
    verificationNote: auto
      ? 'Auto-approved: automated rules-diff found zero known risk flags. Still detection-only — human may revoke.'
      : `Needs human review: ${flags.map((f) => `[${f.severity}/${f.category}] ${f.description}`).join(' ')}`,
  }
}

export function classifyCandidatePair(c: CandidatePair): ReviewQueueItem {
  const flags = diffResolutionRules(
    c.kalshi.resolutionRules,
    c.polymarket.resolutionRules,
  )
  const status: ReviewQueueStatus =
    flags.length === 0 ? 'auto_approved' : 'needs_review'
  return {
    status,
    flags,
    pair: c,
    proposed: proposedFromCandidate(c, flags),
  }
}

/**
 * Full discovery pipeline against live APIs.
 */
export async function runMlbMarketDiscovery(): Promise<MlbDiscoveryReport> {
  const [kalshi, polymarket] = await Promise.all([
    discoverKalshiMlbMarkets(),
    discoverPolymarketMlbMarkets(),
  ])
  const matched = matchCandidatePairs(kalshi, polymarket)
  const unmatched = countUnmatched(kalshi, polymarket, matched)
  const classified = matched.map(classifyCandidatePair)

  return {
    scannedAt: new Date().toISOString(),
    kalshiCount: kalshi.length,
    polymarketCount: polymarket.length,
    matchedCount: matched.length,
    unmatchedKalshi: unmatched.unmatchedKalshi,
    unmatchedPolymarket: unmatched.unmatchedPolymarket,
    autoApproved: classified.filter((i) => i.status === 'auto_approved'),
    needsReview: classified.filter((i) => i.status === 'needs_review'),
  }
}

const PROMOTE_STORAGE_KEY = 'edge-terminal.mlb-promoted-pairs'

/** Human-promoted pairs persisted in localStorage (browser only). */
export function loadPromotedMlbPairs(): MatchedEventPair[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(PROMOTE_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MatchedEventPair[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePromotedMlbPair(pair: MatchedEventPair): void {
  if (typeof localStorage === 'undefined') return
  const existing = loadPromotedMlbPairs().filter(
    (p) =>
      !(
        p.kalshiMarketId === pair.kalshiMarketId &&
        p.polymarketMarketId === pair.polymarketMarketId
      ),
  )
  existing.push({
    ...pair,
    verifiedEquivalent: true,
    verificationNote: `${pair.verificationNote} | Human-promoted after rules review ${new Date().toISOString()}`,
  })
  localStorage.setItem(PROMOTE_STORAGE_KEY, JSON.stringify(existing))
}

export function revokePromotedMlbPair(
  kalshiMarketId: string,
  polymarketMarketId: string,
): void {
  if (typeof localStorage === 'undefined') return
  const next = loadPromotedMlbPairs().filter(
    (p) =>
      !(
        p.kalshiMarketId === kalshiMarketId &&
        p.polymarketMarketId === polymarketMarketId
      ),
  )
  localStorage.setItem(PROMOTE_STORAGE_KEY, JSON.stringify(next))
}
