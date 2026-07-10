/** American odds helpers for mock book comparison + returns. */

export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`
}

/** Convert American odds to decimal multiplier (includes stake). */
export function americanToDecimal(odds: number): number {
  if (odds > 0) return odds / 100 + 1
  return 100 / Math.abs(odds) + 1
}

/** Total return if the bet wins (stake + profit). */
export function potentialReturn(stake: number, americanOdds: number): number {
  return stake * americanToDecimal(americanOdds)
}

/** Profit only (excludes stake). */
export function potentialProfit(stake: number, americanOdds: number): number {
  return potentialReturn(stake, americanOdds) - stake
}

/**
 * Higher decimal = better for the bettor.
 * Unavailable books sort to the end.
 */
export function compareBooksByOdds(
  a: { odds: number; available: boolean },
  b: { odds: number; available: boolean },
): number {
  if (a.available !== b.available) return a.available ? -1 : 1
  return americanToDecimal(b.odds) - americanToDecimal(a.odds)
}
