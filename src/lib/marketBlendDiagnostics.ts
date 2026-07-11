/**
 * Diagnostics for market-blend vs independent differential distributions.
 * Used to test whether blending toward market shrinks playable-star samples.
 */

import type { GamePrediction } from './predictions'

export interface DifferentialDistributionSummary {
  independentMeanAbsDiff: number
  blendedMeanAbsDiff: number
  independentMedianAbsDiff: number
  blendedMedianAbsDiff: number
  independentPlayableCount: number
  blendedPlayableCount: number
  blendedGameCount: number
  independentGameCount: number
  /** Fraction of independent mean retained after blend (expect ≈ modelWeight). */
  meanAbsDiffRatio: number
}

function absDiffs(preds: GamePrediction[]): number[] {
  const out: number[] = []
  for (const p of preds) {
    if (p.postedSpread == null || !p.postedSpreadIsHistorical) continue
    out.push(Math.abs(p.modelSpread - p.postedSpread))
  }
  return out
}

function mean(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function median(arr: number[]): number {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function playableCount(preds: GamePrediction[]): number {
  return preds.filter(
    (p) =>
      p.postedSpreadIsHistorical &&
      p.postedSpread != null &&
      p.starRating.playable &&
      p.homeScore != null &&
      p.awayScore != null,
  ).length
}

/**
 * Compare |model − posted| for independent vs market-blended predictions.
 * If blended mean abs diff ≪ independent, star playability is selecting a
 * thin tail after mechanical shrinkage — not a fair comparison to v2.
 */
export function compareDifferentialDistributions(
  independent: GamePrediction[],
  blended: GamePrediction[],
): DifferentialDistributionSummary {
  const iDiffs = absDiffs(independent)
  const bDiffs = absDiffs(blended)
  const iMean = mean(iDiffs)
  const bMean = mean(bDiffs)
  return {
    independentMeanAbsDiff: iMean,
    blendedMeanAbsDiff: bMean,
    independentMedianAbsDiff: median(iDiffs),
    blendedMedianAbsDiff: median(bDiffs),
    independentPlayableCount: playableCount(independent),
    blendedPlayableCount: playableCount(blended),
    blendedGameCount: bDiffs.length,
    independentGameCount: iDiffs.length,
    meanAbsDiffRatio: iMean > 0 ? bMean / iMean : 0,
  }
}
