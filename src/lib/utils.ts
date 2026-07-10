import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert American odds to implied probability (0–1). */
export function americanToImplied(odds: number): number {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

/** Format a 0–1 probability as a percentage string with fixed decimals. */
export function formatPct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

/** Format edge delta (fair − book) as signed percentage points. */
export function formatEdge(edge: number): string {
  const pct = edge * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}
