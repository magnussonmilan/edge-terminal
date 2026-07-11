/**
 * Dynamic error-weighted market regression.
 *
 * Inspired by the public methodology description in nfelo's analysis
 * "Using Market Regression to Improve Prediction Accuracy in the NFL"
 * (nfeloapp.com/analysis/..., 2020-11-08) — implemented independently here
 * from the textual description + the confirmed relative_accuracy formula.
 * Not a port of any third-party source code; formulas below are our own
 * coding of that published description.
 *
 * Core idea: track per-team trailing EWMA of squared prediction error for
 * model vs market; convert matchup relative accuracy into a per-game blend
 * weight instead of one global constant.
 */

export interface TeamErrorState {
  team: string
  /** EWMA of squared (actual − predicted) margin errors — variance-like. */
  modelEwmaSquaredError: number
  marketEwmaSquaredError: number
  gamesObserved: number
}

export function emptyTeamErrorState(team: string): TeamErrorState {
  return {
    team,
    modelEwmaSquaredError: 0,
    marketEwmaSquaredError: 0,
    gamesObserved: 0,
  }
}

/**
 * EWMA decay for a half-life of H games: after H updates, prior weight ≈ ½.
 * Chosen over a hard N-game window so older games fade smoothly and we don't
 * need an arbitrary discrete cutoff (the source's "N games" maps cleanly to
 * an EWMA half-life; both are calibrated, not assumed).
 */
export function ewmaDecay(halfLifeGames: number): number {
  const h = Math.max(1, halfLifeGames)
  return Math.pow(0.5, 1 / h)
}

/**
 * Update after each settled game. Squared errors are home-perspective
 * (actualMargin − spread)²; both teams in the game receive that game's
 * prediction error into their trailing EWMA (per-team history of how well
 * model/market did in games they played).
 *
 * Call only AFTER the game — never fold this game into the weight used for it.
 */
export function updateTeamError(
  prior: TeamErrorState,
  actualMargin: number,
  modelSpread: number,
  marketSpread: number,
  halfLifeGames: number,
): TeamErrorState {
  const modelSq = (actualMargin - modelSpread) ** 2
  const marketSq = (actualMargin - marketSpread) ** 2
  const decay = ewmaDecay(halfLifeGames)

  if (prior.gamesObserved <= 0) {
    return {
      team: prior.team,
      modelEwmaSquaredError: modelSq,
      marketEwmaSquaredError: marketSq,
      gamesObserved: 1,
    }
  }

  return {
    team: prior.team,
    modelEwmaSquaredError:
      decay * prior.modelEwmaSquaredError + (1 - decay) * modelSq,
    marketEwmaSquaredError:
      decay * prior.marketEwmaSquaredError + (1 - decay) * marketSq,
    gamesObserved: prior.gamesObserved + 1,
  }
}

/**
 * Relative accuracy for a matchup — CONFIRMED exact formula (from the
 * source article's formula image, nfelo 2020-11-08 analysis):
 *
 *   mean(sqrt(modelErrorHome), sqrt(modelErrorAway))
 *     − mean(sqrt(marketErrorHome), sqrt(marketErrorAway))
 *
 * Take the square root of each team's trailing EWMA *squared* error
 * individually first, THEN average home+away — do not average the raw
 * squared errors and take one sqrt of that average.
 *
 * Negative → model been more accurate lately for these teams.
 * Positive → market has been more accurate.
 */
export function relativeModelAccuracy(
  homeState: TeamErrorState,
  awayState: TeamErrorState,
): number {
  const modelAvg =
    (Math.sqrt(Math.max(0, homeState.modelEwmaSquaredError)) +
      Math.sqrt(Math.max(0, awayState.modelEwmaSquaredError))) /
    2
  const marketAvg =
    (Math.sqrt(Math.max(0, homeState.marketEwmaSquaredError)) +
      Math.sqrt(Math.max(0, awayState.marketEwmaSquaredError))) /
    2
  return modelAvg - marketAvg
}

/**
 * Convert relative accuracy → model blend weight on [0, 1].
 *
 * Clamped-linear (not logistic): weight = clamp(0.5 − ra / normalizer, 0, 1).
 *
 * Why linear: the source describes dividing by a parameter ("Base") and
 * constraining to [0,1] — that reads as affine + clamp, not a sigmoid.
 * At ra=0 → weight 0.5; ra = −normalizer (model much better) → 1;
 * ra = +normalizer → 0. `normalizer` is calibrated (their Base).
 */
export function relativeAccuracyToWeight(
  relativeAccuracy: number,
  normalizer: number,
): number {
  const base = Math.max(1e-6, normalizer)
  const w = 0.5 - relativeAccuracy / base
  return Math.max(0, Math.min(1, w))
}

/** Default calibration seeds — replaced by train grid search. */
export const DEFAULT_REGRESSION_HALFLIFE = 8
export const DEFAULT_REGRESSION_NORMALIZER = 6

export interface RegressionParams {
  halfLifeGames: number
  normalizer: number
  /** Fallback model weight when either team has no trailing history yet. */
  coldStartWeight: number
}

export const DEFAULT_REGRESSION_PARAMS: RegressionParams = {
  halfLifeGames: DEFAULT_REGRESSION_HALFLIFE,
  normalizer: DEFAULT_REGRESSION_NORMALIZER,
  coldStartWeight: 0.15,
}

/**
 * Model weight for a matchup from pre-game trailing states only.
 */
export function matchupModelWeight(
  homeState: TeamErrorState,
  awayState: TeamErrorState,
  params: RegressionParams,
): number {
  if (homeState.gamesObserved < 1 || awayState.gamesObserved < 1) {
    return params.coldStartWeight
  }
  const ra = relativeModelAccuracy(homeState, awayState)
  return relativeAccuracyToWeight(ra, params.normalizer)
}
