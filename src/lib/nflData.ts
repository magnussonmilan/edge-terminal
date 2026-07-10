import type { GamePrediction } from '@/lib/predictions'
import predictionsData from '@/data/nfl/predictions.json'
import ratingsData from '@/data/nfl/ratings.json'
import metaData from '@/data/nfl/meta.json'

export const NFL_META = metaData as {
  source: string
  seasons: number[]
  generatedAt: string
  notes: string[]
  gameCount: number
  predictionCount: number
}

export const ALL_PREDICTIONS = predictionsData as GamePrediction[]

export type RatingsBundle = Record<
  string,
  {
    seed: Record<string, number>
    byWeek: Record<string, Record<string, number>>
  }
>

export const RATINGS = ratingsData as RatingsBundle

export const FREE_PREDICTION_LIMIT = 3

export function listSeasons(): number[] {
  return [...NFL_META.seasons].sort((a, b) => b - a)
}

export function listWeeks(season: number): number[] {
  const weeks = new Set(
    ALL_PREDICTIONS.filter((p) => p.season === season).map((p) => p.week),
  )
  return [...weeks].sort((a, b) => a - b)
}

export function getPredictions(season: number, week: number): GamePrediction[] {
  return ALL_PREDICTIONS.filter((p) => p.season === season && p.week === week).sort(
    (a, b) =>
      b.starRating.stars - a.starRating.stars ||
      b.starRating.differentialPct - a.starRating.differentialPct,
  )
}

/** Rating trajectory for a team across a season (week → rating). */
export function getTeamTrajectory(
  season: number,
  team: string,
): Array<{ week: number; rating: number }> {
  const bundle = RATINGS[String(season)]
  if (!bundle) return []
  const points: Array<{ week: number; rating: number }> = [
    { week: 0, rating: bundle.seed[team] ?? 0 },
  ]
  const weeks = Object.keys(bundle.byWeek)
    .map(Number)
    .sort((a, b) => a - b)
  for (const w of weeks) {
    const r = bundle.byWeek[String(w)]?.[team]
    if (r != null) points.push({ week: w, rating: r })
  }
  return points
}
