/**
 * Calibration utilities: rolling-origin CV + joint ridge fit for player-value coeffs.
 *
 * Prefer fitJointCoefficients over one-at-a-time win-rate grid search.
 * Never select coefficients because they improve a single season's ATS win rate.
 */

import { computeBacktest, type BacktestSummary } from './backtest'
import type { GamePrediction } from './predictions'
import {
  DEFAULT_PLAYER_COEFFS,
  type PlayerValueCoeffs,
} from './playerValues'

export interface CalibrationSplit {
  trainSeasons: number[]
  validationSeasons: number[]
}

/** Fallback when calibrated-coeffs.json is missing. Prefer file's split + crossFold. */
export const DEFAULT_SPLIT: CalibrationSplit = {
  trainSeasons: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
  validationSeasons: [2024],
}

/** L2 penalty for joint coefficient fit. Larger → coeffs stay closer to zero / shrink. */
export const RIDGE_LAMBDA = 10

export const PLAYER_COEFF_KEYS: (keyof PlayerValueCoeffs)[] = [
  'qbYpaMult',
  'qbIntMult',
  'qbEpaMult',
  'wrPprMult',
  'wrShareMult',
  'rbYpgDiv',
  'rbTdMult',
]

export interface CalibratedCoefficient {
  name: string
  value: number
  trainWinRate: number
  validationWinRate: number
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

export interface RollingOriginFold {
  trainSeasons: number[]
  valSeason: number
}

export interface FoldResult {
  trainSeasons: number[]
  valSeason: number
  winRate: number
  brierScore: number
  sampleSize: number
  playerCoeffs: PlayerValueCoeffs
  hfa: number
}

export interface CrossFoldSummary {
  meanWinRate: number
  stdWinRate: number
  meanBrier: number
  totalValGames: number
  folds: FoldResult[]
  /** mean − 1·std clears 52.4% break-even */
  clearsBreakevenAtMeanMinusOneStd: boolean
}

/**
 * Rolling-origin folds: train=[s1], val=s2; train=[s1,s2], val=s3; …
 * Requires at least 2 seasons.
 */
export function rollingOriginSplits(seasons: number[]): RollingOriginFold[] {
  const sorted = [...seasons].sort((a, b) => a - b)
  if (sorted.length < 2) return []
  const folds: RollingOriginFold[] = []
  for (let i = 1; i < sorted.length; i++) {
    folds.push({
      trainSeasons: sorted.slice(0, i),
      valSeason: sorted[i],
    })
  }
  return folds
}

export function summarizeCrossFold(
  folds: FoldResult[],
  breakeven = 0.524,
): CrossFoldSummary {
  if (folds.length === 0) {
    return {
      meanWinRate: 0,
      stdWinRate: 0,
      meanBrier: 0,
      totalValGames: 0,
      folds: [],
      clearsBreakevenAtMeanMinusOneStd: false,
    }
  }
  const meanWinRate =
    folds.reduce((s, f) => s + f.winRate, 0) / folds.length
  const meanBrier =
    folds.reduce((s, f) => s + f.brierScore, 0) / folds.length
  const variance =
    folds.reduce((s, f) => s + (f.winRate - meanWinRate) ** 2, 0) /
    folds.length
  const stdWinRate = Math.sqrt(variance)
  const totalValGames = folds.reduce((s, f) => s + f.sampleSize, 0)
  return {
    meanWinRate,
    stdWinRate,
    meanBrier,
    totalValGames,
    folds,
    clearsBreakevenAtMeanMinusOneStd:
      meanWinRate - stdWinRate >= breakeven,
  }
}

/** One training row for joint ridge: home margin ~ features. */
export interface JointFitRow {
  /** Actual home scoring margin. */
  y: number
  /**
   * Predictors aligned with PLAYER_COEFF_KEYS except rbYpgDiv is encoded as
   * the raw ypg differential (coeff recovered as 1/β).
   */
  x: number[]
}

export interface TeamSkillFeatures {
  qbYpa: number
  qbInt: number
  qbEpa: number
  wrPpr: number
  wrShare: number
  rbYpg: number
  rbTd: number
}

const ZERO_FEATURES: TeamSkillFeatures = {
  qbYpa: 0,
  qbInt: 0,
  qbEpa: 0,
  wrPpr: 0,
  wrShare: 0,
  rbYpg: 0,
  rbTd: 0,
}

/**
 * Aggregate season player-stat rows into the raw components that
 * PlayerValueCoeffs multiply (before clamps).
 */
export function teamSkillFeaturesFromRows(
  rows: Array<Record<string, string>>,
  team: string,
): TeamSkillFeatures {
  const teamRows = rows.filter(
    (r) => (r.recent_team || r.team) === team,
  )
  if (teamRows.length === 0) return { ...ZERO_FEATURES }

  let bestQb: {
    attempts: number
    ypa: number
    intRate: number
    epaPerPlay: number
  } | null = null

  let wrPpr = 0
  let wrShare = 0
  let rbYpg = 0
  let rbTd = 0

  for (const row of teamRows) {
    const pos = (row.position || '').toUpperCase()
    const games = Number(row.games) || 0
    if (games <= 0) continue

    if (pos === 'QB') {
      const attempts = Number(row.attempts) || 0
      if (attempts < 50) continue
      const ypa = (Number(row.passing_yards) || 0) / attempts
      const intRate = (Number(row.interceptions) || 0) / attempts
      const epaPerPlay = (Number(row.passing_epa) || 0) / attempts
      if (!bestQb || attempts > bestQb.attempts) {
        bestQb = { attempts, ypa, intRate, epaPerPlay }
      }
    } else if ((pos === 'WR' || pos === 'TE') && Number(row.targets) >= 20) {
      const pprPerGame =
        ((Number(row.receptions) || 0) +
          (Number(row.receiving_yards) || 0) / 10 +
          (Number(row.receiving_tds) || 0) * 6) /
        games
      wrPpr += pprPerGame
      wrShare += Number(row.target_share) || 0
    } else if (pos === 'RB' && Number(row.carries) >= 40) {
      rbYpg += (Number(row.rushing_yards) || 0) / games
      rbTd += (Number(row.rushing_tds) || 0) / games
    }
  }

  return {
    qbYpa: bestQb ? bestQb.ypa - 7.0 : 0,
    qbInt: bestQb ? -(bestQb.intRate - 0.025) : 0,
    qbEpa: bestQb ? bestQb.epaPerPlay : 0,
    wrPpr,
    wrShare,
    rbYpg,
    rbTd,
  }
}

export function featuresToVector(f: TeamSkillFeatures): number[] {
  return [f.qbYpa, f.qbInt, f.qbEpa, f.wrPpr, f.wrShare, f.rbYpg, f.rbTd]
}

/**
 * Build joint-fit rows: y = home margin, x = home − away skill feature diffs.
 */
export function buildJointFitRows(
  games: Array<{
    homeTeam: string
    awayTeam: string
    homeScore: number
    awayScore: number
    season: number
  }>,
  seasonStats: Record<number, Array<Record<string, string>>>,
): JointFitRow[] {
  const cache = new Map<string, TeamSkillFeatures>()
  const get = (season: number, team: string) => {
    const key = `${season}:${team}`
    if (cache.has(key)) return cache.get(key)!
    const rows = seasonStats[season] ?? []
    const f = teamSkillFeaturesFromRows(rows, team)
    cache.set(key, f)
    return f
  }

  const out: JointFitRow[] = []
  for (const g of games) {
    const home = featuresToVector(get(g.season, g.homeTeam))
    const away = featuresToVector(get(g.season, g.awayTeam))
    const x = home.map((h, i) => h - away[i])
    out.push({
      y: g.homeScore - g.awayScore,
      x,
    })
  }
  return out
}

/**
 * Joint ridge regression of home margin on skill-feature differentials.
 * Maps β back to PlayerValueCoeffs (rbYpgDiv = 1/β_rbYpg).
 */
export function fitJointCoefficients(
  rows: JointFitRow[],
  lambda: number = RIDGE_LAMBDA,
): PlayerValueCoeffs {
  const p = PLAYER_COEFF_KEYS.length
  if (rows.length < p + 1) {
    return { ...DEFAULT_PLAYER_COEFFS }
  }

  // Design matrix with intercept column; do not penalize intercept.
  const dim = p + 1
  const xtx: number[][] = Array.from({ length: dim }, () =>
    Array(dim).fill(0),
  )
  const xty: number[] = Array(dim).fill(0)

  for (const row of rows) {
    const xi = [1, ...row.x]
    for (let i = 0; i < dim; i++) {
      xty[i] += xi[i] * row.y
      for (let j = 0; j < dim; j++) {
        xtx[i][j] += xi[i] * xi[j]
      }
    }
  }

  for (let i = 1; i < dim; i++) {
    xtx[i][i] += lambda
  }

  const beta = solveLinearSystem(
    xtx.map((r) => [...r]),
    [...xty],
  )
  if (!beta) return { ...DEFAULT_PLAYER_COEFFS }

  // beta[0] = intercept (unused for coeffs); beta[1..] map to features
  const b = beta.slice(1)
  const rbYpgBeta = b[5]
  const rbYpgDiv =
    Math.abs(rbYpgBeta) < 1e-6
      ? DEFAULT_PLAYER_COEFFS.rbYpgDiv
      : clamp(1 / rbYpgBeta, 20, 80)

  return {
    qbYpaMult: clamp(b[0], 0.05, 1.2),
    qbIntMult: clamp(b[1], 5, 40),
    qbEpaMult: clamp(b[2], 0.2, 4),
    wrPprMult: clamp(b[3], 0.02, 0.35),
    wrShareMult: clamp(b[4], 0.5, 4),
    rbYpgDiv,
    rbTdMult: clamp(b[6], 0.05, 1.2),
  }
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo
  return Math.max(lo, Math.min(hi, n))
}

/** Gaussian elimination with partial pivoting. Returns null if singular. */
export function solveLinearSystem(
  a: number[][],
  b: number[],
): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    if (pivot !== col) {
      const tmp = m[col]
      m[col] = m[pivot]
      m[pivot] = tmp
    }
    const div = m[col][col]
    for (let j = col; j <= n; j++) m[col][j] /= div
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col]
      for (let j = col; j <= n; j++) m[r][j] -= f * m[col][j]
    }
  }

  return m.map((row) => row[n])
}

/**
 * @deprecated Prefer fitJointCoefficients (ridge on margins) + rollingOriginSplits.
 * Kept for diagnostics / comparison only — do not use to select production coeffs.
 */
export function fitCoefficient(
  candidateValues: number[],
  buildPredictions: (value: number) => GamePrediction[],
  split: CalibrationSplit = DEFAULT_SPLIT,
  selectOn: 'train' | 'validation' = 'train',
  baselineValidationWinRate?: number,
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
  return computeBacktest(scoped, 'all')
}

export function filterPredictionsBySeasons(
  predictions: GamePrediction[],
  seasons: number[],
): GamePrediction[] {
  const set = new Set(seasons)
  return predictions.filter((p) => set.has(p.season))
}

export function estimateHfaFromHomeMargins(margins: number[]): number {
  if (margins.length === 0) return 2.0
  const mean = margins.reduce((s, v) => s + v, 0) / margins.length
  return Math.max(0.25, Math.min(3.5, Math.round(mean * 4) / 4))
}
