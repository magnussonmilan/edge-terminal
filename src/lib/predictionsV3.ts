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
import {
  emptyTeamErrorState,
  matchupModelWeight,
  updateTeamError,
  type RegressionParams,
  type TeamErrorState,
} from './marketRegression'
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
  /** Model weight used for this game's blend (static or dynamic). */
  blendModelWeight?: number
  blendMode?: 'static-constant' | 'dynamic-error-weighted'
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
 * `modelWeight` may be a constant or a per-game dynamic weight from
 * marketRegression — only the weight source changes.
 */
export function buildMarketBlendedV3Prediction(
  independent: V3GamePrediction,
  modelWeight: number,
  coverCoeffs: CoverModelCoeffs,
  opts: {
    blendMode?: 'static-constant' | 'dynamic-error-weighted'
  } = {},
): V3GamePrediction {
  const posted = independent.postedSpread
  if (posted == null || !independent.postedSpreadIsHistorical) {
    return {
      ...independent,
      variant: 'v3-market-blended',
      independentSpread: independent.modelSpread,
      playabilityMode: 'independent-selection',
      blendModelWeight: modelWeight,
      blendMode: opts.blendMode ?? 'static-constant',
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
    blendModelWeight: modelWeight,
    blendMode: opts.blendMode ?? 'static-constant',
  }

  const favoredHome = blended >= 0
  const team = favoredHome ? independent.homeTeam : independent.awayTeam
  const mag = Math.abs(blended).toFixed(1)
  const pCover =
    coverProbability != null ? (coverProbability * 100).toFixed(0) : '—'
  const wLabel = modelWeight.toFixed(2)
  const blurb = selected
    ? `Selected via independent disagreement; blended favors ${team} by ${mag} (w=${wLabel}, P(cover)≈${pCover}%).`
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

/**
 * Chronological dynamic blend: weight from trailing per-team errors BEFORE
 * each game (no look-ahead), then update EWMA after the game settles.
 * Selection remains independent-star via buildMarketBlendedV3Prediction.
 */
export function buildDynamicMarketBlendedPredictions(
  independent: V3GamePrediction[],
  coverCoeffs: CoverModelCoeffs,
  params: RegressionParams,
): V3GamePrediction[] {
  const sorted = [...independent].sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season
    if (a.week !== b.week) return a.week - b.week
    return a.gameId.localeCompare(b.gameId)
  })

  const states = new Map<string, TeamErrorState>()
  const out: V3GamePrediction[] = []

  for (const p of sorted) {
    const home =
      states.get(p.homeTeam) ?? emptyTeamErrorState(p.homeTeam)
    const away =
      states.get(p.awayTeam) ?? emptyTeamErrorState(p.awayTeam)

    const w = matchupModelWeight(home, away, params)
    out.push(
      buildMarketBlendedV3Prediction(p, w, coverCoeffs, {
        blendMode: 'dynamic-error-weighted',
      }),
    )

    if (
      p.homeScore != null &&
      p.awayScore != null &&
      p.postedSpread != null &&
      p.postedSpreadIsHistorical
    ) {
      const actualMargin = p.homeScore - p.awayScore
      const modelSpread = p.independentSpread ?? p.modelSpread
      const marketSpread = p.postedSpread
      states.set(
        p.homeTeam,
        updateTeamError(
          home,
          actualMargin,
          modelSpread,
          marketSpread,
          params.halfLifeGames,
        ),
      )
      states.set(
        p.awayTeam,
        updateTeamError(
          away,
          actualMargin,
          modelSpread,
          marketSpread,
          params.halfLifeGames,
        ),
      )
    }
  }

  const byId = new Map(out.map((p) => [p.gameId, p]))
  return independent.map((p) => byId.get(p.gameId) ?? p)
}
