/**
 * Preseason team-strength prior.
 *
 * Ideal path: back out strength from sportsbook season win-total futures via
 * an optimizer matching market-implied wins to schedule win probabilities.
 *
 * Data note: free, clean historical win-total odds (over/under + price) are
 * not available the way nflverse game/player files are. We do NOT fabricate
 * placeholder win totals. Until a licensed/historical win-total source is
 * wired, this module falls back to the verified prior-season decay seeder.
 */

import {
  seedFromPriorSeason,
  type TeamRating,
} from './powerRatings'

export type PriorMethod = 'srs-win-totals' | 'prior-season-decay'

export interface PreseasonPriorResult {
  method: PriorMethod
  ratings: Record<string, number>
  note: string
}

export interface WinTotalQuote {
  team: string
  /** Market over/under wins for the season. */
  winTotal: number
  /** American odds on the over, if available. */
  overOdds?: number
}

/**
 * Attempt SRS-style prior from win totals. Returns null when quotes are
 * missing/empty so callers use the decay fallback explicitly.
 */
export function trySrsPriorFromWinTotals(
  _quotes: WinTotalQuote[],
  _scheduleTeamGames: Record<string, number>,
): Record<string, number> | null {
  // Stretch goal blocked on data availability — do not invent quotes.
  if (!_quotes.length) return null
  // A real optimizer would live here once historical win-total odds exist.
  // For now, refuse any non-empty input as unsupported rather than a fake fit.
  return null
}

/**
 * Build preseason team ratings for a season.
 * Prefer SRS when win-total quotes exist and optimize cleanly; otherwise
 * decay prior-season finals (existing, verified path).
 */
export function buildPreseasonPriors(
  priorFinal: Record<string, TeamRating>,
  winTotalQuotes: WinTotalQuote[] = [],
  decay = 0.5,
): PreseasonPriorResult {
  const srs = trySrsPriorFromWinTotals(winTotalQuotes, {})
  if (srs) {
    return {
      method: 'srs-win-totals',
      ratings: srs,
      note: 'SRS prior from market win totals.',
    }
  }

  return {
    method: 'prior-season-decay',
    ratings: seedFromPriorSeason(priorFinal, decay),
    note:
      'Fallback: no free historical win-total odds source wired — using seedFromPriorSeason decay. SRS win-total prior remains a stretch goal blocked on data availability.',
  }
}
