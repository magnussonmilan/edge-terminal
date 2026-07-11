/**
 * Fitted margin-probability distribution for star ratings / cover probs.
 *
 * Inspired by nfelo "Margin Probabilities from NFL Spreads" (2020-11-01) —
 * independent reimplementation from the published description, not a port.
 *
 * Model:
 *   1. Laplace baseline centered on the predicted spread
 *   2. Gaussian bumps at key numbers (3, 7, 10, 14, …) whose weight falls
 *      off with distance between |predicted spread| and the key number
 *   3. Asymmetry: overweight outcomes on the opposite side of the favorite,
 *      dampened when |spread| is near zero (binary win/loss nature of games)
 *
 * Parameters are fit on train-only historical (spread, margin) pairs by
 * minimizing squared error vs observed margin frequencies.
 */

/** Key margins that historically attract extra probability mass. */
export const MARGIN_KEY_NUMBERS = [3, 7, 10, 14, 17, 21] as const

export interface MarginDistParams {
  /** Laplace scale (points) for the baseline density. */
  baseScale: number
  /** Peak weight added at each key-number bump (before falloff). */
  bumpWeight: number
  /** Gaussian σ for bump width around each key number. */
  bumpWidth: number
  /** How fast bump weight decays as |spread| moves away from the key. */
  bumpFalloff: number
  /** Extra multiplicative weight on the underdog side of the spread. */
  asymmetryMagnitude: number
  /** Scale (points) controlling how fast asymmetry grows with |spread|. */
  asymmetryDamp: number
}

/** Pre-fit defaults — roughly Walters-like mass near 3/7 before calibration. */
export const DEFAULT_MARGIN_DIST_PARAMS: MarginDistParams = {
  baseScale: 11,
  bumpWeight: 0.04,
  bumpWidth: 0.85,
  bumpFalloff: 6,
  asymmetryMagnitude: 0.15,
  asymmetryDamp: 4,
}

let activeParams: MarginDistParams = { ...DEFAULT_MARGIN_DIST_PARAMS }

export function getMarginDistParams(): MarginDistParams {
  return { ...activeParams }
}

export function setMarginDistParams(partial: Partial<MarginDistParams>): void {
  activeParams = { ...activeParams, ...partial }
}

export function resetMarginDistParams(): void {
  activeParams = { ...DEFAULT_MARGIN_DIST_PARAMS }
}

function unnormalizedDensity(
  margin: number,
  predictedSpread: number,
  params: MarginDistParams,
): number {
  const scale = Math.max(0.5, params.baseScale)
  let d = Math.exp(-Math.abs(margin - predictedSpread) / scale) / (2 * scale)

  const absSpread = Math.abs(predictedSpread)
  for (const k of MARGIN_KEY_NUMBERS) {
    const fall = Math.exp(-Math.abs(absSpread - k) / Math.max(0.5, params.bumpFalloff))
    const w = params.bumpWeight * fall
    if (w <= 1e-12) continue
    const width = Math.max(0.25, params.bumpWidth)
    d += w * Math.exp(-0.5 * ((margin - k) / width) ** 2)
    d += w * Math.exp(-0.5 * ((margin + k) / width) ** 2)
  }

  const favSign = Math.sign(predictedSpread)
  if (favSign !== 0 && Math.sign(margin) === -favSign) {
    const damp =
      1 - Math.exp(-Math.abs(predictedSpread) / Math.max(0.5, params.asymmetryDamp))
    d *= 1 + Math.max(0, params.asymmetryMagnitude) * damp
  }

  return Math.max(0, d)
}

const MARGIN_LO = -45
const MARGIN_HI = 45

/** Probability mass at each integer margin in [MARGIN_LO, MARGIN_HI]. */
export function marginProbabilityMass(
  predictedSpread: number,
  params: MarginDistParams = activeParams,
): Map<number, number> {
  const raw = new Map<number, number>()
  let sum = 0
  for (let m = MARGIN_LO; m <= MARGIN_HI; m++) {
    const d = unnormalizedDensity(m, predictedSpread, params)
    raw.set(m, d)
    sum += d
  }
  if (sum <= 0) {
    raw.set(0, 1)
    return raw
  }
  for (const [m, d] of raw) raw.set(m, d / sum)
  return raw
}

/**
 * Sum of probability mass for integer margins in (lo, hi], with half-credit
 * when an endpoint lands exactly on a whole number (matches Walters-table
 * star-rating convention).
 */
export function probabilityBetween(
  predictedSpread: number,
  lo: number,
  hi: number,
  params: MarginDistParams = activeParams,
): number {
  if (hi < lo) return probabilityBetween(predictedSpread, hi, lo, params)
  if (Math.abs(hi - lo) < 1e-12) return 0

  const mass = marginProbabilityMass(predictedSpread, params)
  let p = 0
  const start = Math.ceil(lo)
  const end = Math.floor(hi)

  for (let n = start; n <= end; n++) {
    if (n === 0) continue
    const atEndpoint =
      (n === start && Math.abs(lo - n) < 1e-9) ||
      (n === end && Math.abs(hi - n) < 1e-9)
    const m = mass.get(n) ?? 0
    p += atEndpoint ? m * 0.5 : m
  }
  return Math.max(0, p)
}

/**
 * P(home covers the posted number) under the fitted margin model centered
 * on `predictedSpread` (home-perspective expected margin).
 * Cover = home_margin > postedSpread (pushes excluded → 0.5 mass ignored).
 */
export function coverProbabilityFromMargins(
  predictedSpread: number,
  postedSpread: number,
  params: MarginDistParams = activeParams,
): number {
  const mass = marginProbabilityMass(predictedSpread, params)
  let cover = 0
  let push = 0
  for (const [m, p] of mass) {
    if (m > postedSpread) cover += p
    else if (Math.abs(m - postedSpread) < 1e-9) push += p
  }
  // Redistribute push 50/50
  return cover + 0.5 * push
}

export interface MarginFitRow {
  /** Closing / posted home spread (negative = home favored). */
  postedSpread: number
  /** Actual home margin (homeScore − awayScore). */
  homeMargin: number
}

/**
 * Fit margin-distribution params on train rows by minimizing squared error
 * between modeled and empirical margin frequencies, binned by rounded spread.
 */
export function fitMarginDistribution(
  rows: MarginFitRow[],
  seed: MarginDistParams = DEFAULT_MARGIN_DIST_PARAMS,
): { params: MarginDistParams; trainMse: number } {
  const usable = rows.filter(
    (r) =>
      Number.isFinite(r.postedSpread) &&
      Number.isFinite(r.homeMargin) &&
      Math.abs(r.homeMargin) <= 45,
  )
  if (usable.length < 200) {
    return { params: { ...seed }, trainMse: Infinity }
  }

  // Empirical: for each rounded spread bucket, frequency of each integer margin
  const buckets = new Map<number, Map<number, number>>()
  for (const r of usable) {
    const sp = Math.round(r.postedSpread * 2) / 2 // half-point buckets
    const m = Math.round(r.homeMargin)
    if (!buckets.has(sp)) buckets.set(sp, new Map())
    const bm = buckets.get(sp)!
    bm.set(m, (bm.get(m) ?? 0) + 1)
  }
  const bucketTotals = new Map<number, number>()
  for (const [sp, bm] of buckets) {
    let t = 0
    for (const c of bm.values()) t += c
    bucketTotals.set(sp, t)
  }

  function mse(params: MarginDistParams): number {
    let err = 0
    let n = 0
    for (const [sp, bm] of buckets) {
      const total = bucketTotals.get(sp) ?? 1
      const model = marginProbabilityMass(sp, params)
      // Compare on margins that appear empirically or have model mass
      const margins = new Set<number>([...bm.keys(), ...model.keys()])
      for (const m of margins) {
        if (m < MARGIN_LO || m > MARGIN_HI) continue
        const emp = (bm.get(m) ?? 0) / total
        const mod = model.get(m) ?? 0
        err += (emp - mod) ** 2
        n += 1
      }
    }
    return n > 0 ? err / n : Infinity
  }

  let best = { ...seed }
  let bestMse = mse(best)

  const grids: Array<{ key: keyof MarginDistParams; candidates: number[] }> = [
    { key: 'baseScale', candidates: [8, 9, 10, 11, 12, 13, 14] },
    { key: 'bumpWeight', candidates: [0.01, 0.02, 0.04, 0.06, 0.08, 0.1] },
    { key: 'bumpWidth', candidates: [0.5, 0.7, 0.85, 1.0, 1.3] },
    { key: 'bumpFalloff', candidates: [3, 4, 6, 8, 10] },
    { key: 'asymmetryMagnitude', candidates: [0, 0.05, 0.1, 0.15, 0.25, 0.35] },
    { key: 'asymmetryDamp', candidates: [2, 3, 4, 6, 8] },
  ]

  for (let round = 0; round < 3; round++) {
    let improved = false
    for (const grid of grids) {
      for (const c of grid.candidates) {
        if (c === best[grid.key]) continue
        const trial = { ...best, [grid.key]: c }
        const e = mse(trial)
        if (e < bestMse - 1e-12) {
          best = trial
          bestMse = e
          improved = true
        }
      }
    }
    if (!improved) break
  }

  return { params: best, trainMse: bestMse }
}
