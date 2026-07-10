/**
 * Retrospective backtest over historical GamePrediction fixtures.
 * Measure what's already there — do not retune the underlying models here.
 */

import type { GamePrediction } from './predictions'

export interface StarLevelResult {
  starLevel: number
  gamesCount: number
  winsAgainstSpread: number
  winRate: number
}

export interface BacktestSummary {
  season: number | 'all'
  totalPlayableGames: number
  starLevelBreakdown: StarLevelResult[]
  overallWinRate: number
  brierScore: number
  roiIfFollowed: number
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

  const starLevels = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
  const starLevelBreakdown: StarLevelResult[] = starLevels.map((starLevel) => {
    const games = scoped.filter((p) => p.starRating.stars === starLevel)
    let wins = 0
    for (const g of games) {
      if (modelCovered(g) === true) wins += 1
    }
    return {
      starLevel,
      gamesCount: games.length,
      winsAgainstSpread: wins,
      winRate: games.length > 0 ? wins / games.length : 0,
    }
  })

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

  return {
    season,
    totalPlayableGames: n,
    starLevelBreakdown,
    overallWinRate,
    brierScore,
    roiIfFollowed,
  }
}

/** Break-even win rate at standard -110 vig. */
export const BREAKEVEN_WIN_RATE = 0.524
