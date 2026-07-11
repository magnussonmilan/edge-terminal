/**
 * Curated Kalshi ↔ Polymarket event pairs (NFL game winners only).
 *
 * NOT fuzzy title matching. Every pair is hand-entered. The arb detector
 * refuses to flag any pair where verifiedEquivalent !== true — that flag
 * is an explicit human opt-in after comparing resolution rules side by side.
 */

export interface MatchedEventPair {
  kalshiMarketId: string
  polymarketMarketId: string
  /**
   * Polymarket outcome label that corresponds to Kalshi YES
   * (e.g. Kalshi "Will Seattle win?" ↔ Polymarket "Seahawks").
   */
  polymarketAlignedOutcome: string
  /** Optional Gamma event slug — more reliable than condition_ids filter alone. */
  polymarketSlug?: string
  description: string
  /** Human-checked resolution rules match — starts false; opt-in only. */
  verifiedEquivalent: boolean
  /** Why equivalent, or why not (required documentation). */
  verificationNote: string
  /** Optional team join keys (nflverse abbreviations) for unified comparison. */
  homeTeam?: string
  awayTeam?: string
  /** Which side Kalshi YES / polymarketAlignedOutcome refers to. */
  yesSide?: 'home' | 'away'
}

/**
 * Seed list — intentionally small. Add pairs only after reading both venues'
 * verbatim rules. Default verifiedEquivalent is false.
 *
 * SEA @ DAL (Aug 15 2026 preseason) is listed as an example of a *candidate*
 * pair that looks like the same game but is NOT verified: Kalshi's 48-hour
 * postponement → fair-price rule differs from Polymarket's open-until-complete
 * / cancel-or-tie → 50-50 rule. Do not flip verifiedEquivalent without
 * re-reading both rule texts.
 */
export const CURATED_NFL_GAME_PAIRS: MatchedEventPair[] = [
  {
    kalshiMarketId: 'KXNFLGAME-26AUG15DALSEA-SEA',
    polymarketMarketId:
      '0x275041c00bde19ef86a3dc1036c204d1c9b8731d24228472966cd9006942fd4f',
    polymarketAlignedOutcome: 'Seahawks',
    polymarketSlug: 'nfl-sea-dal-2026-08-16',
    description: 'Seahawks @ Cowboys — Aug 15 2026 (preseason)',
    homeTeam: 'DAL',
    awayTeam: 'SEA',
    yesSide: 'away',
    verifiedEquivalent: false,
    verificationNote:
      'NOT verified. Same scheduled game and both pay ~50/50 on a completed tie, but postponement/cancel rules diverge: Kalshi resolves to a fair market price if the game has not started within 48 hours of the original start; Polymarket stays open until the game is completed, and resolves 50-50 only if canceled entirely (or tied with no make-up). A naive arb across those states is not risk-free. Leave verifiedEquivalent false until a human accepts that residual basis risk — or until rules are confirmed identical for the specific trade window.',
  },
]

export function listCuratedPairs(): MatchedEventPair[] {
  return CURATED_NFL_GAME_PAIRS.map((p) => ({ ...p }))
}

export function listVerifiedPairs(): MatchedEventPair[] {
  return listCuratedPairs().filter((p) => p.verifiedEquivalent)
}

export function getPairByIds(
  kalshiMarketId: string,
  polymarketMarketId: string,
): MatchedEventPair | null {
  const hit = CURATED_NFL_GAME_PAIRS.find(
    (p) =>
      p.kalshiMarketId === kalshiMarketId &&
      p.polymarketMarketId === polymarketMarketId,
  )
  return hit ? { ...hit } : null
}
