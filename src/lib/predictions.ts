/**
 * Combines team power ratings + home field + simplified game factors
 * (rest days + primetime only) into a predicted spread, then scores
 * confidence via the key-number star system.
 *
 * This is a transparent mechanism demo — not a claim of market-beating edge.
 */

import { HOME_FIELD_ADVANTAGE, resolveHfa, type HfaConfig } from './powerRatings'
import { calculateStarRating, type StarRating } from './keyNumbers'
import type { GameResult } from './powerRatings'

const REST_POINT_PER_DAY = 0.15
const REST_CAP = 1.0
const PRIMETIME_HOME_ADJ = 0.25

export interface GamePrediction {
  gameId: string
  season: number
  week: number
  homeTeam: string
  awayTeam: string
  homeRating: number
  awayRating: number
  modelSpread: number
  postedSpread: number | null
  postedSpreadIsHistorical: boolean
  restAdjustment: number
  primetimeAdjustment: number
  starRating: StarRating
  homeScore: number | null
  awayScore: number | null
  blurb: string
}

export function isPrimetime(weekday: string | null, gametime: string | null): boolean {
  const day = (weekday || '').toLowerCase()
  if (day === 'thursday' || day === 'monday') return true
  if (day === 'sunday' && gametime) {
    const [h] = gametime.split(':').map(Number)
    return h >= 19
  }
  return false
}

export function restAdjustmentHome(
  homeRest: number | null,
  awayRest: number | null,
): number {
  if (homeRest == null || awayRest == null) return 0
  const diff = homeRest - awayRest
  const raw = diff * REST_POINT_PER_DAY
  return Math.max(-REST_CAP, Math.min(REST_CAP, raw))
}

export function predictGameSpread(
  homeRating: number,
  awayRating: number,
  game: Pick<
    GameResult,
    'homeRest' | 'awayRest' | 'weekday' | 'gametime' | 'season'
  >,
  hfa: HfaConfig = HOME_FIELD_ADVANTAGE,
): {
  modelSpread: number
  restAdjustment: number
  primetimeAdjustment: number
} {
  const restAdj = restAdjustmentHome(game.homeRest, game.awayRest)
  const ptAdj = isPrimetime(game.weekday, game.gametime) ? PRIMETIME_HOME_ADJ : 0
  const seasonHfa = resolveHfa(hfa, game.season ?? 0)
  const modelSpread = homeRating - awayRating + seasonHfa + restAdj + ptAdj
  return {
    modelSpread,
    restAdjustment: restAdj,
    primetimeAdjustment: ptAdj,
  }
}

export function buildBlurb(prediction: Omit<GamePrediction, 'blurb'>): string {
  const favoredHome = prediction.modelSpread >= 0
  const team = favoredHome ? prediction.homeTeam : prediction.awayTeam
  const mag = Math.abs(prediction.modelSpread).toFixed(1)

  if (prediction.postedSpread == null || !prediction.starRating.playable) {
    return `Our model favors ${team} by ${mag}. This is a transparent rating demo — not a claim that the number beats the market.`
  }

  const delta = (prediction.modelSpread - prediction.postedSpread).toFixed(1)
  const stars = prediction.starRating.stars
  return `Our model favors ${team} by ${mag}, ${delta} points off the line — a ${stars}-star signal. Demo only: mechanism transparency, not a guaranteed winner.`
}

export function buildGamePrediction(
  game: GameResult,
  homeRating: number,
  awayRating: number,
  hfa: HfaConfig = HOME_FIELD_ADVANTAGE,
): GamePrediction {
  const { modelSpread, restAdjustment, primetimeAdjustment } = predictGameSpread(
    homeRating,
    awayRating,
    game,
    hfa,
  )

  const postedSpread = game.spreadLine
  const postedSpreadIsHistorical = postedSpread != null && Number.isFinite(postedSpread)

  const starRating =
    postedSpreadIsHistorical && postedSpread != null
      ? calculateStarRating(modelSpread, postedSpread)
      : { differentialPct: 0, stars: 0, playable: false }

  const base: Omit<GamePrediction, 'blurb'> = {
    gameId: game.gameId,
    season: game.season,
    week: game.week,
    homeTeam: game.homeTeam,
    awayTeam: game.awayTeam,
    homeRating,
    awayRating,
    modelSpread,
    postedSpread: postedSpreadIsHistorical ? postedSpread : null,
    postedSpreadIsHistorical,
    restAdjustment,
    primetimeAdjustment,
    starRating,
    homeScore: game.homeScore,
    awayScore: game.awayScore,
  }

  return { ...base, blurb: buildBlurb(base) }
}

export function ratingBeforeWeek(
  byWeek: Record<number, Record<string, number>>,
  week: number,
  team: string,
  seasonSeed: Record<string, number>,
): number {
  if (week <= 1) return seasonSeed[team] ?? 0
  const prev = byWeek[week - 1]
  if (prev && team in prev) return prev[team]
  for (let w = week - 1; w >= 1; w--) {
    if (byWeek[w] && team in byWeek[w]) return byWeek[w][team]
  }
  return seasonSeed[team] ?? 0
}
