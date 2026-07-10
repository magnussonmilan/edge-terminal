/**
 * Train/validation calibration utilities.
 * Train: 2022–2023. Holdout: 2024. Never fit coefficients using holdout outcomes
 * as the selection criterion without also reporting train — and prefer selecting
 * on train when an analytical fit exists (see fitSeasonHfaFromTrain).
 */

import { computeBacktest, type BacktestSummary } from './backtest'
import type { GamePrediction } from './predictions'

export interface CalibrationSplit {
  trainSeasons: number[]
  validationSeasons: number[]
}

export const DEFAULT_SPLIT: CalibrationSplit = {
  trainSeasons: [2022, 2023],
  validationSeasons: [2024],
}

export interface CalibratedCoefficient {
  name: string
  value: number
  /** Win rate on train seasons at this value. */
  trainWinRate: number
  /** Win rate on validation seasons at this value. */
  validationWinRate: number
  /** True when train improved but validation did not vs baseline. */
  overfitWarning: boolean
}

export interface CalibrationLogEntry {
  step: string
  coefficient: string
  oldValue: number | string
  newValue: number | string
  trainWinRateBefore: number
  trainWinRateAfter: number
  validationWinRateBefore: number
  validationWinRateAfter: number
  note?: string
}

/**
 * Grid search over candidate values. Scores each candidate on train and
 * validation. Selects the value with the best **train** win rate (no holdout
 * peeking for selection). Reports validation as a true holdout check.
 *
 * If you need the prompt's "pick best validation" behavior for exploration,
 * pass `selectOn: 'validation'` — the UI will flag that selection used the
 * holdout and validation WR is slightly optimistic.
 */
export function fitCoefficient(
  candidateValues: number[],
  buildPredictions: (value: number) => GamePrediction[],
  split: CalibrationSplit = DEFAULT_SPLIT,
  selectOn: 'train' | 'validation' = 'train',
  baselineValidationWinRate?: number,
  /** On a train/val tie, keep this value (avoids drifting to the first grid point). */
  preferValue?: number,
): CalibratedCoefficient {
  let best: CalibratedCoefficient | null = null

  for (const value of candidateValues) {
    const preds = buildPredictions(value)
    const train = scoreSeasons(preds, split.trainSeasons)
    const validation = scoreSeasons(preds, split.validationSeasons)
    const candidate: CalibratedCoefficient = {
      name: '',
      value,
      trainWinRate: train.overallWinRate,
      validationWinRate: validation.overallWinRate,
      overfitWarning: false,
    }
    const score =
      selectOn === 'train' ? candidate.trainWinRate : candidate.validationWinRate
    const bestScore = best
      ? selectOn === 'train'
        ? best.trainWinRate
        : best.validationWinRate
      : -1
    if (!best || score > bestScore + 1e-12) {
      best = candidate
    } else if (
      best &&
      Math.abs(score - bestScore) <= 1e-12 &&
      preferValue != null
    ) {
      const bestDist = Math.abs(best.value - preferValue)
      const candDist = Math.abs(candidate.value - preferValue)
      if (candDist < bestDist) best = candidate
    }
  }

  if (!best) {
    return {
      name: '',
      value: preferValue ?? candidateValues[0] ?? 0,
      trainWinRate: 0,
      validationWinRate: 0,
      overfitWarning: false,
    }
  }

  if (
    baselineValidationWinRate != null &&
    best.validationWinRate < baselineValidationWinRate
  ) {
    best.overfitWarning = true
  }

  return best
}

export function scoreSeasons(
  predictions: GamePrediction[],
  seasons: number[],
): BacktestSummary {
  const set = new Set(seasons)
  const scoped = predictions.filter((p) => set.has(p.season))
  // computeBacktest with 'all' on already-filtered list
  return computeBacktest(scoped, 'all')
}

export function filterPredictionsBySeasons(
  predictions: GamePrediction[],
  seasons: number[],
): GamePrediction[] {
  const set = new Set(seasons)
  return predictions.filter((p) => set.has(p.season))
}

/**
 * Analytical season HFA from train games only: mean home scoring margin.
 * Applied to holdout without peeking at 2024 residuals.
 */
export function estimateHfaFromHomeMargins(
  margins: number[],
): number {
  if (margins.length === 0) return 2.0
  const mean = margins.reduce((s, v) => s + v, 0) / margins.length
  // Clamp to a sane NFL range
  return Math.max(0.25, Math.min(3.5, Math.round(mean * 4) / 4))
}
