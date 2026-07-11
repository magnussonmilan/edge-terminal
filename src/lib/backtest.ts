/**
 * Retrospective backtest over historical GamePrediction fixtures.
 * Measure what's already there — do not retune the underlying models here.
 */

import { pearsonCorrelation } from './correlation'
import type { GamePrediction } from './predictions'

export interface StarLevelResult {
  starLevel: number
  gamesCount: number
  winsAgainstSpread: number
  winRate: number
}

export interface StarLevelResultWithCI extends StarLevelResult {
  wilsonLow: number
  wilsonHigh: number
}

export interface BacktestSummary {
  season: number | 'all'
  totalPlayableGames: number
  starLevelBreakdown: StarLevelResultWithCI[]
  overallWinRate: number
  brierScore: number
  roiIfFollowed: number
  /** Straight-up winner accuracy — separate from ATS; not comparable to ATS %. */
  straightUp?: AccuracySummary
}

export const STAR_LEVELS = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0] as const

/**
 * Wilson score interval for a binomial proportion — better than normal
 * approximation at small n, which is what you have per star bucket.
 */
export function wilsonInterval(
  wins: number,
  n: number,
  z = 1.96,
): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 0 }
  const p = wins / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = p + z2 / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)
  return {
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
  }
}

/** Half-width of the Wilson interval (for "54.1% ± 3.2%" display). */
export function wilsonHalfWidth(wins: number, n: number, z = 1.96): number {
  const { low, high } = wilsonInterval(wins, n, z)
  return (high - low) / 2
}

/** e.g. "54.1% ± 3.2%, n=210" */
export function formatWinRateWithCI(
  winRate: number,
  wilsonLow: number,
  wilsonHigh: number,
  n: number,
): string {
  const pct = (winRate * 100).toFixed(1)
  const half = (((wilsonHigh - wilsonLow) / 2) * 100).toFixed(1)
  return `${pct}% ± ${half}%, n=${n}`
}

function withWilson(row: StarLevelResult): StarLevelResultWithCI {
  const { low, high } = wilsonInterval(row.winsAgainstSpread, row.gamesCount)
  return { ...row, wilsonLow: low, wilsonHigh: high }
}

export function isPlayableSettled(p: GamePrediction): boolean {
  return (
    p.postedSpreadIsHistorical &&
    p.postedSpread != null &&
    p.starRating.playable &&
    p.homeScore != null &&
    p.awayScore != null
  )
}

export function buildStarLevelBreakdown(
  predictions: GamePrediction[],
): StarLevelResultWithCI[] {
  return STAR_LEVELS.map((starLevel) => {
    const games = predictions.filter((p) => p.starRating.stars === starLevel)
    let wins = 0
    for (const g of games) {
      if (modelCovered(g) === true) wins += 1
    }
    return withWilson({
      starLevel,
      gamesCount: games.length,
      winsAgainstSpread: wins,
      winRate: games.length > 0 ? wins / games.length : 0,
    })
  })
}

/** True when two adjacent buckets' Wilson intervals overlap. */
export function adjacentIntervalsOverlap(
  a: StarLevelResultWithCI,
  b: StarLevelResultWithCI,
): boolean {
  if (a.gamesCount === 0 || b.gamesCount === 0) return true
  return a.wilsonLow <= b.wilsonHigh && b.wilsonLow <= a.wilsonHigh
}

/** ~3-point favorite ≈ 60% win probability (NFL-scale logistic anchor). */
export function spreadToWinProb(homeSpread: number): number {
  // Positive homeSpread = home favored by that many points
  const k = Math.log(0.6 / 0.4) / 3 // so +3 → 0.60
  return 1 / (1 + Math.exp(-k * homeSpread))
}

/**
 * Did the model-favored side cover the posted (home-perspective) spread?
 * If modelSpread > postedSpread → bet home ATS; else bet away ATS.
 * Push (exact margin) counts as a loss for flat -110 ROI.
 */
export function modelCovered(prediction: GamePrediction): boolean | null {
  if (
    prediction.homeScore == null ||
    prediction.awayScore == null ||
    prediction.postedSpread == null ||
    !prediction.postedSpreadIsHistorical
  ) {
    return null
  }

  const actualMargin = prediction.homeScore - prediction.awayScore
  const posted = prediction.postedSpread
  if (actualMargin === posted) return false

  const betHome = prediction.modelSpread > posted
  const homeCovered = actualMargin > posted
  return betHome ? homeCovered : !homeCovered
}

export function computeBacktest(
  predictions: GamePrediction[],
  season: number | 'all' = 'all',
): BacktestSummary {
  const scoped = predictions.filter((p) => {
    if (!p.postedSpreadIsHistorical || p.postedSpread == null) return false
    if (!p.starRating.playable) return false
    if (p.homeScore == null || p.awayScore == null) return false
    if (season !== 'all' && p.season !== season) return false
    return true
  })

  const starLevelBreakdown = buildStarLevelBreakdown(scoped)

  let wins = 0
  let brierSum = 0
  for (const p of scoped) {
    if (modelCovered(p) === true) wins += 1
    const modelHomeWinProb = spreadToWinProb(p.modelSpread)
    const actualHomeWin = (p.homeScore ?? 0) > (p.awayScore ?? 0) ? 1 : 0
    // Treat ties as 0.5 for Brier (rare in NFL with OT, but safe)
    const actual =
      (p.homeScore ?? 0) === (p.awayScore ?? 0) ? 0.5 : actualHomeWin
    brierSum += (modelHomeWinProb - actual) ** 2
  }

  const n = scoped.length
  const overallWinRate = n > 0 ? wins / n : 0
  const brierScore = n > 0 ? brierSum / n : 0

  // Flat 1u at -110: win +0.909..., loss -1. ROI = net / stakes
  const profit = wins * (100 / 110) + (n - wins) * -1
  const roiIfFollowed = n > 0 ? profit / n : 0

  const straightUp = computeStraightUpAccuracy(predictions, season)

  return {
    season,
    totalPlayableGames: n,
    starLevelBreakdown,
    overallWinRate,
    brierScore,
    roiIfFollowed,
    straightUp,
  }
}

/** Break-even win rate at standard -110 vig. */
export const BREAKEVEN_WIN_RATE = 0.524

export interface AccuracySummary {
  totalGames: number
  correctPicks: number
  accuracy: number
  pushGames: number
}

/**
 * Straight-up winner accuracy: did the model favor the side that won?
 * Excludes modelSpread === 0 (no side favored) from the denominator.
 * This is a different, easier bar than ATS — favorites win more often than not.
 * Do not compare this % to ATS win rate.
 */
export function computeStraightUpAccuracy(
  predictions: GamePrediction[],
  season: number | 'all' | number[] = 'all',
): AccuracySummary {
  const seasonSet =
    season === 'all'
      ? null
      : new Set(Array.isArray(season) ? season : [season])

  let correct = 0
  let decided = 0
  let pushes = 0

  for (const p of predictions) {
    if (p.homeScore == null || p.awayScore == null) continue
    if (seasonSet && !seasonSet.has(p.season)) continue
    if (p.homeScore === p.awayScore) continue // game tie — skip

    if (Math.abs(p.modelSpread) < 1e-9) {
      pushes += 1
      continue
    }

    const modelHome = p.modelSpread > 0
    const homeWon = p.homeScore > p.awayScore
    decided += 1
    if (modelHome === homeWon) correct += 1
  }

  return {
    totalGames: decided,
    correctPicks: correct,
    accuracy: decided > 0 ? correct / decided : 0,
    pushGames: pushes,
  }
}

function filterPlayable(
  predictions: GamePrediction[],
  seasons: number[] | 'all',
  weekMin?: number,
  weekMax?: number,
): GamePrediction[] {
  const seasonSet = seasons === 'all' ? null : new Set(seasons)
  return predictions.filter((p) => {
    if (!isPlayableSettled(p)) return false
    if (seasonSet && !seasonSet.has(p.season)) return false
    if (weekMin != null && p.week < weekMin) return false
    if (weekMax != null && p.week > weekMax) return false
    return true
  })
}

/**
 * For each playable game, pair differentialPct with |modelSpread − actualMargin|.
 * Positive r: bigger gap from the line ↔ larger model error (stars may track noise).
 */
export function differentialVsErrorCorrelation(
  predictions: GamePrediction[],
  seasons: number[] | 'all' = 'all',
): { correlation: number; n: number } {
  const scoped = filterPlayable(predictions, seasons)
  const diffs: number[] = []
  const errors: number[] = []
  for (const p of scoped) {
    const actualMargin = (p.homeScore ?? 0) - (p.awayScore ?? 0)
    diffs.push(p.starRating.differentialPct)
    errors.push(Math.abs(p.modelSpread - actualMargin))
  }
  return {
    correlation: pearsonCorrelation(diffs, errors),
    n: diffs.length,
  }
}

/**
 * Point-biserial via Pearson: differentialPct vs ATS win (1/0).
 * Positive r would mean larger differentials associate with more covers.
 */
export function differentialVsAtsCorrelation(
  predictions: GamePrediction[],
  seasons: number[] | 'all' = 'all',
): { correlation: number; n: number } {
  const scoped = filterPlayable(predictions, seasons)
  const diffs: number[] = []
  const outcomes: number[] = []
  for (const p of scoped) {
    const covered = modelCovered(p)
    if (covered == null) continue
    diffs.push(p.starRating.differentialPct)
    outcomes.push(covered ? 1 : 0)
  }
  return {
    correlation: pearsonCorrelation(diffs, outcomes),
    n: diffs.length,
  }
}

export function computeStarBreakdownByWeekRange(
  predictions: GamePrediction[],
  seasons: number[] | 'all',
  weekMin: number,
  weekMax: number,
): { breakdown: StarLevelResultWithCI[]; totalGames: number } {
  const scoped = filterPlayable(predictions, seasons, weekMin, weekMax)
  return {
    breakdown: buildStarLevelBreakdown(scoped),
    totalGames: scoped.length,
  }
}

export interface StarSignalDiagnostics {
  seasons: number[] | 'all'
  correlationError: { correlation: number; n: number }
  correlationAts: { correlation: number; n: number }
  early: { breakdown: StarLevelResultWithCI[]; totalGames: number }
  late: { breakdown: StarLevelResultWithCI[]; totalGames: number }
  /** Fraction of adjacent star-bucket pairs whose Wilson CIs overlap (current view). */
  adjacentOverlapRate: number
}

export function computeStarSignalDiagnostics(
  predictions: GamePrediction[],
  seasons: number[] | 'all',
  fullBreakdown: StarLevelResultWithCI[],
): StarSignalDiagnostics {
  let overlapPairs = 0
  let pairCount = 0
  for (let i = 0; i < fullBreakdown.length - 1; i++) {
    const a = fullBreakdown[i]
    const b = fullBreakdown[i + 1]
    if (a.gamesCount === 0 && b.gamesCount === 0) continue
    pairCount += 1
    if (adjacentIntervalsOverlap(a, b)) overlapPairs += 1
  }

  return {
    seasons,
    correlationError: differentialVsErrorCorrelation(predictions, seasons),
    correlationAts: differentialVsAtsCorrelation(predictions, seasons),
    early: computeStarBreakdownByWeekRange(predictions, seasons, 1, 4),
    late: computeStarBreakdownByWeekRange(predictions, seasons, 5, 22),
    adjacentOverlapRate: pairCount > 0 ? overlapPairs / pairCount : 1,
  }
}
