/**
 * NFL season-year helpers.
 * Season year = calendar year the regular season starts (September).
 * Jan/Feb still belong to the prior season year.
 */

/**
 * Returns the NFL season year for a given date.
 * - Sep–Dec → that calendar year
 * - Jan–Feb → previous calendar year
 * - Mar–Aug (offseason) → upcoming season year (= calendar year)
 */
export function getCurrentNflSeason(now: Date): number {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1 // 1–12
  if (month >= 9) return year
  if (month <= 2) return year - 1
  return year
}

/** True when `now` falls in the Sept–Feb NFL season window (incl. playoffs). */
export function isNflSeasonWindow(now: Date): boolean {
  const month = now.getUTCMonth() + 1
  return month >= 9 || month <= 2
}
