/**
 * Ongoing market reversion + cover-probability helpers.
 *
 * Independent of any third-party source code. The product idea — blend an
 * independent model spread with the posted market line, then estimate
 * P(cover) — is reported separately from the fully independent model so we
 * never conflate "beats the market cold" with "adds value on top of the line."
 */

import type { GamePrediction } from './predictions'

/** Default blend weight on the model (rest on market). Fit via calibration. */
export const DEFAULT_MODEL_WEIGHT = 0.35

/**
 * Blend independent model spread with posted market spread.
 * modelWeight ∈ [0,1]: 1 = fully independent, 0 = pure market.
 *
 * Weight may be a global constant (fitModelWeight) or a per-game dynamic
 * value from marketRegression.matchupModelWeight — same blend formula either way.
 */
export function blendWithMarket(
  modelSpread: number,
  marketSpread: number,
  modelWeight: number = DEFAULT_MODEL_WEIGHT,
): number {
  const w = Math.max(0, Math.min(1, modelWeight))
  return w * modelSpread + (1 - w) * marketSpread
}

/**
 * Logistic cover probability from (blended − posted) edge in points.
 * Positive edgeMeans the blend favors the same side more than the posted number
 * (home-perspective: blended > posted → bet home ATS).
 *
 * Coefficients are fit on train seasons only (see fitCoverModel).
 */
export function estimateCoverProbability(
  blendedSpread: number,
  postedSpread: number,
  coeffs: CoverModelCoeffs = DEFAULT_COVER_COEFFS,
): number {
  const edge = blendedSpread - postedSpread
  const z = coeffs.intercept + coeffs.slope * edge
  return 1 / (1 + Math.exp(-z))
}

export interface CoverModelCoeffs {
  intercept: number
  slope: number
}

/** Uninformative prior — slightly > 0.5 intercept so empty fit isn't 50/50 flat. */
export const DEFAULT_COVER_COEFFS: CoverModelCoeffs = {
  intercept: 0.05,
  slope: 0.12,
}

export interface CoverFitRow {
  blendedSpread: number
  postedSpread: number
  /** 1 if model side covered, 0 otherwise. */
  covered: number
}

/**
 * Fit a 1-feature logistic (edge → cover) via Newton steps on train rows only.
 */
export function fitCoverModel(
  rows: CoverFitRow[],
  maxIter = 25,
): CoverModelCoeffs {
  if (rows.length < 30) return { ...DEFAULT_COVER_COEFFS }

  let intercept = 0
  let slope = 0.1

  for (let iter = 0; iter < maxIter; iter++) {
    let g0 = 0
    let g1 = 0
    let h00 = 0
    let h01 = 0
    let h11 = 0

    for (const r of rows) {
      const x = r.blendedSpread - r.postedSpread
      const z = intercept + slope * x
      const p = 1 / (1 + Math.exp(-z))
      const w = p * (1 - p)
      const err = r.covered - p
      g0 += err
      g1 += err * x
      h00 += w
      h01 += w * x
      h11 += w * x * x
    }

    // Ridge for stability
    h00 += 1e-3
    h11 += 1e-3
    const det = h00 * h11 - h01 * h01
    if (Math.abs(det) < 1e-12) break
    const d0 = (h11 * g0 - h01 * g1) / det
    const d1 = (-h01 * g0 + h00 * g1) / det
    intercept += d0
    slope += d1
    if (Math.abs(d0) + Math.abs(d1) < 1e-6) break
  }

  return { intercept, slope }
}

/**
 * Grid-search modelWeight on train ATS win rate of the blended line vs posted.
 * Selection is on train only — caller must score validation separately.
 */
export function fitModelWeight(
  rows: Array<{
    modelSpread: number
    postedSpread: number
    /** Actual home margin. */
    homeMargin: number
  }>,
  candidates: number[] = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65],
): { weight: number; trainWinRate: number } {
  let bestW = DEFAULT_MODEL_WEIGHT
  let bestWr = -1

  for (const w of candidates) {
    let wins = 0
    let n = 0
    for (const r of rows) {
      const blended = blendWithMarket(r.modelSpread, r.postedSpread, w)
      if (Math.abs(blended - r.postedSpread) < 1e-9) continue
      const betHome = blended > r.postedSpread
      const homeCovered = r.homeMargin > r.postedSpread
      if (r.homeMargin === r.postedSpread) continue // push
      n += 1
      if (betHome === homeCovered) wins += 1
    }
    const wr = n > 0 ? wins / n : 0
    if (wr > bestWr) {
      bestWr = wr
      bestW = w
    }
  }

  return { weight: bestW, trainWinRate: bestWr }
}

/**
 * Decouple selection from the blend.
 *
 * Selection: independent model's star rating vs market (genuine disagreement
 * before blending dilutes the differential).
 * Signal: cover probability from the blended spread vs posted — what the
 * blend + cover model are for. Does not re-apply a differential threshold
 * on the already-shrunk blended number.
 */
export function selectAndScoreMarketBlendedGame(
  independent: GamePrediction,
  blendedSpread: number,
  coeffs: CoverModelCoeffs = DEFAULT_COVER_COEFFS,
): { selected: boolean; coverProbability: number | null } {
  const posted = independent.postedSpread
  if (
    posted == null ||
    !independent.postedSpreadIsHistorical ||
    independent.homeScore == null
  ) {
    return { selected: false, coverProbability: null }
  }

  const selected = independent.starRating.playable
  const coverProbability = estimateCoverProbability(
    blendedSpread,
    posted,
    coeffs,
  )
  return { selected, coverProbability }
}
