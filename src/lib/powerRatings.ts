/**
 * Score-based weekly power ratings with optional injury differential.
 *
 * Simplified subset of a full handicapping system:
 * - Score differential + opponent rating + home-field adjustment
 * - Formula-driven injury differential (see playerValues.ts)
 * - Rest / primetime applied at prediction time (predictions.ts), not here
 *
 * v2 (not implemented): compounding/exponential stack-injury logic when
 * multiple players at the same position are out in the same week.
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
  /** Home-team perspective: positive = home favored. Null if unavailable. */
  spreadLine: number | null
  homeRest: number | null
  awayRest: number | null
  weekday: string | null
  gametime: string | null
}

export interface InjuryDiffLookup {
  /** Key: `${season}-${week}-${team}` → injury differential contribution for TGPL. */
  (season: number, week: number, team: string): number
}

/**
 * True Game Performance Level from this team's perspective.
 * injuryDifferential: ownValueLost - opponentValueLost (see playerValues).
 */
export function trueGamePerformanceLevel(
  netScore: number,
  opponentRating: number,
  isHome: boolean,
  injuryDifferential = 0,
): number {
  const hfa = isHome ? -HOME_FIELD_ADVANTAGE : HOME_FIELD_ADVANTAGE
  return netScore + opponentRating + hfa + injuryDifferential
}

export function updateRating(oldRating: number, tgpl: number): number {
  return CARRY_FORWARD_WEIGHT * oldRating + PERFORMANCE_WEIGHT * tgpl
}

/**
 * Process a season's games in chronological order, updating both teams after each game.
 * Seeds from `initial` (prior season finals or zeros).
 */
export function processSeasonRatings(
  games: GameResult[],
  initial: Record<string, number>,
  injuryDiff: InjuryDiffLookup = () => 0,
): {
  final: Record<string, TeamRating>
  /** After each week: team → rating */
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

    const homeNet = game.homeScore - game.awayScore
    const awayNet = -homeNet

    const homeRating = ratings[game.homeTeam] ?? 0
    const awayRating = ratings[game.awayTeam] ?? 0

    const homeInj = injuryDiff(game.season, game.week, game.homeTeam)
    const awayInj = injuryDiff(game.season, game.week, game.awayTeam)

    // own lost − opponent lost
    const homeInjTerm = homeInj - awayInj
    const awayInjTerm = awayInj - homeInj

    const homeTgpl = trueGamePerformanceLevel(
      homeNet,
      awayRating,
      true,
      homeInjTerm,
    )
    const awayTgpl = trueGamePerformanceLevel(
      awayNet,
      homeRating,
      false,
      awayInjTerm,
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

/** Carry prior-season finals forward as next season's week-0 seeds (decay optional). */
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
