/**
 * NFL key-number hit rates (industry-standard margins) and star-rating calculator.
 * Values are numeric lookup only — not reproduced prose from any book.
 */

/** Spread margin → approximate % of games decided by exactly this margin. */
export const KEY_NUMBER_PCT: Record<number, number> = {
  1: 3,
  2: 3,
  3: 8,
  4: 3,
  5: 3,
  6: 5,
  7: 6,
  8: 3,
  9: 2,
  10: 4,
  11: 2,
  12: 2,
  13: 2,
  14: 5,
  15: 2,
  16: 3,
  17: 3,
  18: 3,
}

export interface StarRating {
  differentialPct: number
  /** 0.5 to 3.0 in 0.5 increments; 0 when not playable. */
  stars: number
  playable: boolean
}

const STAR_THRESHOLDS: Array<{ minPct: number; stars: number }> = [
  { minPct: 15, stars: 3.0 },
  { minPct: 13, stars: 2.5 },
  { minPct: 11, stars: 2.0 },
  { minPct: 9, stars: 1.5 },
  { minPct: 7, stars: 1.0 },
  { minPct: 5.5, stars: 0.5 },
]

/**
 * Sum key-number percentages for every integer between the model's predicted
 * spread and the posted spread (half-credit for whole numbers at either end).
 * When the range straddles zero (opposite sides favored), deduct one point's
 * key-number value once (KEY_NUMBER_PCT[1]).
 * Below 5.5% combined → not a playable signal.
 */
export function calculateStarRating(
  modelSpread: number,
  postedSpread: number,
): StarRating {
  const lo = Math.min(modelSpread, postedSpread)
  const hi = Math.max(modelSpread, postedSpread)

  if (Math.abs(hi - lo) < 1e-9) {
    return { differentialPct: 0, stars: 0, playable: false }
  }

  let differentialPct = 0
  const start = Math.ceil(lo)
  const end = Math.floor(hi)

  for (let n = start; n <= end; n++) {
    if (n === 0) continue
    const pct = KEY_NUMBER_PCT[Math.abs(n)] ?? 0
    const atEndpoint = n === start || n === end
    const half =
      atEndpoint &&
      ((n === start && Math.abs(lo - n) < 1e-9) ||
        (n === end && Math.abs(hi - n) < 1e-9))
    differentialPct += half ? pct * 0.5 : pct
  }

  // Opposite sides of the number: deduct one point's value for crossing zero
  if (lo < 0 && hi > 0) {
    differentialPct -= KEY_NUMBER_PCT[1] ?? 0
  }

  differentialPct = Math.max(0, differentialPct)

  const playable = differentialPct >= 5.5
  if (!playable) {
    return { differentialPct, stars: 0, playable: false }
  }

  let stars = 0.5
  for (const t of STAR_THRESHOLDS) {
    if (differentialPct >= t.minPct) {
      stars = t.stars
      break
    }
  }

  return { differentialPct, stars, playable: true }
}

export function formatStars(stars: number): string {
  if (stars <= 0) return '—'
  return `${stars}★`
}
