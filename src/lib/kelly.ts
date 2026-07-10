import { americanToDecimal } from '@/lib/odds'

const MAX_FRACTION = 0.2

export interface SuggestedStakeResult {
  /** Dollar stake to show / fill into the input. */
  amount: number
  /** True when the raw formula exceeded the bankroll cap. */
  capped: boolean
  /** Fraction of bankroll before clamping (0–1+). */
  rawFraction: number
}

/**
 * Kelly Criterion (display-only). Formula kept in code comments / this module —
 * UI must label this as "Suggested Stake" only.
 *
 * optimalStake = bankroll * ((odds * winProb - (1 - winProb)) / odds)
 * where `odds` is decimal odds. Clamped to [0, 20% of bankroll].
 */
export function calculateSuggestedStake(
  bankroll: number,
  americanOdds: number,
  winProb: number,
): SuggestedStakeResult {
  if (bankroll <= 0 || winProb <= 0 || winProb >= 1) {
    return { amount: 0, capped: false, rawFraction: 0 }
  }

  const decimalOdds = americanToDecimal(americanOdds)
  // f* = (b*p - q) / b  where b = decimalOdds - 1 (net odds), p = winProb, q = 1-p
  const b = decimalOdds - 1
  if (b <= 0) return { amount: 0, capped: false, rawFraction: 0 }

  const rawFraction = (decimalOdds * winProb - (1 - winProb)) / decimalOdds
  const positiveFraction = Math.max(0, rawFraction)
  const capped = positiveFraction > MAX_FRACTION
  const fraction = Math.min(positiveFraction, MAX_FRACTION)
  const amount = Math.round(bankroll * fraction)

  return { amount, capped, rawFraction: positiveFraction }
}
