import type { GamePrediction } from '@/lib/predictions'
import type { V3GamePrediction } from '@/lib/predictionsV3'
import type { GameWeather } from '@/lib/weather'
import predictionsData from '@/data/nfl/predictions.json'
import predictionsV3Independent from '@/data/nfl/predictions-v3-independent.json'
import predictionsV3Market from '@/data/nfl/predictions-v3-market.json'
import calibratedV3 from '@/data/nfl/calibrated-v3.json'
import ratingsData from '@/data/nfl/ratings.json'
import metaData from '@/data/nfl/meta.json'
import weatherData from '@/data/nfl/current-week-weather.json'

export const NFL_META = metaData as {
  source: string
  seasons: number[]
  generatedAt: string
  notes: string[]
  gameCount: number
  predictionCount: number
}

export const ALL_PREDICTIONS = predictionsData as GamePrediction[]

/** v3 fully independent (QB-Elo + WEPA) — do not conflate with market blend. */
export const PREDICTIONS_V3_INDEPENDENT =
  predictionsV3Independent as V3GamePrediction[]

/** v3 with ongoing market reversion — answers a different question than independent. */
export const PREDICTIONS_V3_MARKET = predictionsV3Market as V3GamePrediction[]

export type V3CalibrationReport = {
  generatedAt: string
  methodology: string
  actualSplit: {
    trainSeasons: number[]
    validationSeasons: number[]
    note: string
  }
  modelWeight: number
  coverCoeffs: { intercept: number; slope: number }
  verdict: string
  v2: ModelSummary
  v3Independent: ModelSummary
  v3MarketBlended: ModelSummary
}

type ModelSummary = {
  trainWinRate: number
  trainGames: number
  validationWinRate: number
  validationGames: number
  allWinRate: number
  allGames: number
  beatsV2Holdout?: boolean
}

export const CALIBRATED_V3 = calibratedV3 as V3CalibrationReport

type WeatherFile = {
  games?: Array<{
    gameId: string
    outdoor: boolean
    weather: GameWeather | null
  }>
}

const WEATHER_BY_GAME = new Map(
  ((weatherData as WeatherFile).games ?? [])
    .filter((g) => g.outdoor && g.weather)
    .map((g) => [g.gameId, g.weather as GameWeather]),
)

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
  return ALL_PREDICTIONS.filter((p) => p.season === season && p.week === week)
    .map((p) => {
      const weather = WEATHER_BY_GAME.get(p.gameId)
      if (!weather) return p
      return { ...p, weather, weatherAdjustment: p.weatherAdjustment ?? 0 }
    })
    .sort(
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
