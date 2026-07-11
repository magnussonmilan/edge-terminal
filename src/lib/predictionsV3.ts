/**
 * v3 prediction helpers: team rating + QB Elo delta → independent spread,
 * optional market blend. Preserves ratingBeforeWeek no-look-ahead.
 */

import {
  buildGamePrediction,
  predictGameSpread,
  ratingBeforeWeek,
  type GamePrediction,
} from './predictions'
import { calculateStarRating } from './keyNumbers'
import {
  blendWithMarket,
  estimateCoverProbability,
  selectAndScoreMarketBlendedGame,
  type CoverModelCoeffs,
} from './marketBlend'
import { effectiveTeamRating, type QbStartInfo } from './teamEloV2'
import type { GameResult, HfaConfig } from './powerRatings'
import { HOME_FIELD_ADVANTAGE } from './powerRatings'

export type ModelVariant = 'v2' | 'v3-independent' | 'v3-market-blended'

export interface V3GamePrediction extends GamePrediction {
  variant: ModelVariant
  /** Independent model spread before any market blend. */
  independentSpread?: number
  /** Fit cover probability for blended vs posted (market variant only). */
  coverProbability?: number
  homeQbElo?: number | null
  awayQbElo?: number | null
  /** How playability was decided for market-blended rows. */
  playabilityMode?: 'legacy-blended-stars' | 'independent-selection'
}

export function buildIndependentV3Prediction(
  game: GameResult,
  baseHomeRating: number,
  baseAwayRating: number,
  homeQb: QbStartInfo | null,
  awayQb: QbStartInfo | null,
  hfa: HfaConfig = HOME_FIELD_ADVANTAGE,
): V3GamePrediction {
  const homeRating = effectiveTeamRating(baseHomeRating, homeQb?.elo ?? null)
  const awayRating = effectiveTeamRating(baseAwayRating, awayQb?.elo ?? null)
  const pred = buildGamePrediction(game, homeRating, awayRating, hfa)
  return {
    ...pred,
    variant: 'v3-independent',
    independentSpread: pred.modelSpread,
    homeQbElo: homeQb?.elo ?? null,
    awayQbElo: awayQb?.elo ?? null,
  }
}

/**
 * Legacy market-blended: playability from star rating on the *blended* spread
 * (mechanically shrinks sample as modelWeight → market). Kept for before/after.
 */
export function buildMarketBlendedV3PredictionLegacy(
  independent: V3GamePrediction,
  modelWeight: number,
  coverCoeffs: CoverModelCoeffs,
): V3GamePrediction {
  const posted = independent.postedSpread
  if (posted == null || !independent.postedSpreadIsHistorical) {
    return {
      ...independent,
      variant: 'v3-market-blended',
      independentSpread: independent.modelSpread,
      playabilityMode: 'legacy-blended-stars',
    }
  }

  const independentSpread =
    independent.independentSpread ?? independent.modelSpread
  const blended = blendWithMarket(independentSpread, posted, modelWeight)
  const starRating = calculateStarRating(blended, posted)
  const coverProbability = estimateCoverProbability(
    blended,
    posted,
    coverCoeffs,
  )

  const base: Omit<V3GamePrediction, 'blurb'> = {
    ...independent,
    variant: 'v3-market-blended',
    modelSpread: blended,
    independentSpread,
    starRating,
    coverProbability,
    playabilityMode: 'legacy-blended-stars',
  }

  const favoredHome = blended >= 0
  const team = favoredHome ? independent.homeTeam : independent.awayTeam
  const mag = Math.abs(blended).toFixed(1)
  const blurb = starRating.playable
    ? `Legacy blend favors ${team} by ${mag} (playability from blended differential).`
    : `Legacy blend ${mag} for ${team} — not playable on blended differential.`

  return { ...base, blurb }
}

/**
 * Redesigned market-blended: select on independent star disagreement, score
 * with blended spread + coverProbability (no second differential threshold).
 */
export function buildMarketBlendedV3Prediction(
  independent: V3GamePrediction,
  modelWeight: number,
  coverCoeffs: CoverModelCoeffs,
): V3GamePrediction {
  const posted = independent.postedSpread
  if (posted == null || !independent.postedSpreadIsHistorical) {
    return {
      ...independent,
      variant: 'v3-market-blended',
      independentSpread: independent.modelSpread,
      playabilityMode: 'independent-selection',
    }
  }

  const independentSpread =
    independent.independentSpread ?? independent.modelSpread
  const blended = blendWithMarket(independentSpread, posted, modelWeight)
  const { selected, coverProbability } = selectAndScoreMarketBlendedGame(
    independent,
    blended,
    coverCoeffs,
  )

  // Preserve independent star magnitudes for diagnostics; playable follows selection.
  const starRating = {
    ...independent.starRating,
    playable: selected,
  }

  const base: Omit<V3GamePrediction, 'blurb'> = {
    ...independent,
    variant: 'v3-market-blended',
    modelSpread: blended,
    independentSpread,
    starRating,
    coverProbability: coverProbability ?? undefined,
    playabilityMode: 'independent-selection',
  }

  const favoredHome = blended >= 0
  const team = favoredHome ? independent.homeTeam : independent.awayTeam
  const mag = Math.abs(blended).toFixed(1)
  const pCover =
    coverProbability != null ? (coverProbability * 100).toFixed(0) : '—'
  const blurb = selected
    ? `Selected via independent disagreement; blended favors ${team} by ${mag} (P(cover)≈${pCover}%).`
    : `Not selected — independent model lacks a playable star vs the market.`

  return { ...base, blurb }
}

export function ratingsForGameWeek(
  byWeek: Record<number, Record<string, number>>,
  seasonSeed: Record<string, number>,
  week: number,
  homeTeam: string,
  awayTeam: string,
): { home: number; away: number } {
  return {
    home: ratingBeforeWeek(byWeek, week, homeTeam, seasonSeed),
    away: ratingBeforeWeek(byWeek, week, awayTeam, seasonSeed),
  }
}

/** Re-export for scripts that only need the spread math. */
export { predictGameSpread, ratingBeforeWeek }
