/**
 * Score-based weekly power ratings with optional injury differential.
 *
 * HFA is configurable (season map or scalar) — calibrated via scripts/calibrate-model.ts.
 */

export const HOME_FIELD_ADVANTAGE = 2.0
export const CARRY_FORWARD_WEIGHT = 0.9
export const PERFORMANCE_WEIGHT = 0.1

export interface TeamRating {
  team: string
  rating: number
  updatedThroughWeek: number
  season: number
}

export interface GameResult {
  gameId: string
  season: number
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  week: number
  spreadLine: number | null
  homeRest: number | null
  awayRest: number | null
  weekday: string | null
  gametime: string | null
}

export interface InjuryDiffLookup {
  (season: number, week: number, team: string): number
}

export type HfaConfig = number | Record<number, number>

export function resolveHfa(hfa: HfaConfig, season: number): number {
  if (typeof hfa === 'number') return hfa
  return hfa[season] ?? HOME_FIELD_ADVANTAGE
}

/**
 * True Game Performance Level from this team's perspective.
 * injuryDifferential: ownNetInjuryCost - opponentNetInjuryCost.
 */
export function trueGamePerformanceLevel(
  netScore: number,
  opponentRating: number,
  isHome: boolean,
  injuryDifferential = 0,
  hfa = HOME_FIELD_ADVANTAGE,
): number {
  const adj = isHome ? -hfa : hfa
  return netScore + opponentRating + adj + injuryDifferential
}

export function updateRating(oldRating: number, tgpl: number): number {
  return CARRY_FORWARD_WEIGHT * oldRating + PERFORMANCE_WEIGHT * tgpl
}

export function processSeasonRatings(
  games: GameResult[],
  initial: Record<string, number>,
  injuryDiff: InjuryDiffLookup = () => 0,
  hfa: HfaConfig = HOME_FIELD_ADVANTAGE,
): {
  final: Record<string, TeamRating>
  byWeek: Record<number, Record<string, number>>
} {
  const ratings: Record<string, number> = { ...initial }
  const byWeek: Record<number, Record<string, number>> = {}

  const sorted = [...games].sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week
    return a.gameId.localeCompare(b.gameId)
  })

  let currentWeek = -1
  for (const game of sorted) {
    if (game.homeScore == null || game.awayScore == null) continue

    const seasonHfa = resolveHfa(hfa, game.season)
    const homeNet = game.homeScore - game.awayScore
    const awayNet = -homeNet

    const homeRating = ratings[game.homeTeam] ?? 0
    const awayRating = ratings[game.awayTeam] ?? 0

    const homeInj = injuryDiff(game.season, game.week, game.homeTeam)
    const awayInj = injuryDiff(game.season, game.week, game.awayTeam)

    const homeInjTerm = homeInj - awayInj
    const awayInjTerm = awayInj - homeInj

    const homeTgpl = trueGamePerformanceLevel(
      homeNet,
      awayRating,
      true,
      homeInjTerm,
      seasonHfa,
    )
    const awayTgpl = trueGamePerformanceLevel(
      awayNet,
      homeRating,
      false,
      awayInjTerm,
      seasonHfa,
    )

    ratings[game.homeTeam] = updateRating(homeRating, homeTgpl)
    ratings[game.awayTeam] = updateRating(awayRating, awayTgpl)

    if (game.week !== currentWeek) {
      currentWeek = game.week
      byWeek[currentWeek] = { ...ratings }
    } else {
      byWeek[currentWeek] = { ...ratings }
    }
  }

  const season = games[0]?.season ?? 0
  const lastWeek = Math.max(0, ...Object.keys(byWeek).map(Number))
  const final: Record<string, TeamRating> = {}
  for (const [team, rating] of Object.entries(ratings)) {
    final[team] = {
      team,
      rating,
      updatedThroughWeek: lastWeek,
      season,
    }
  }

  return { final, byWeek }
}

export function seedFromPriorSeason(
  priorFinal: Record<string, TeamRating>,
  decay = 0.5,
): Record<string, number> {
  const seed: Record<string, number> = {}
  for (const [team, tr] of Object.entries(priorFinal)) {
    seed[team] = tr.rating * decay
  }
  return seed
}
