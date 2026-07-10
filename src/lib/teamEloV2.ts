/**
 * v3 team rating engine: score/WEPA performance + QB Elo point delta.
 *
 * Preserves ratingBeforeWeek no-look-ahead discipline from predictions.ts —
 * byWeek snapshots are written AFTER each week's games, and predictions for
 * week W read week W-1 (or season seed).
 */

import {
  HOME_FIELD_ADVANTAGE,
  resolveHfa,
  updateRating,
  type GameResult,
  type HfaConfig,
  type TeamRating,
} from './powerRatings'
import { wepaDiffToPointMargin } from './weightedEpa'
import { qbEloToPointDelta, QB_ELO_REPLACEMENT } from './qbElo'
import { buildPreseasonPriors } from './srsPrior'

export interface QbStartInfo {
  playerId: string
  playerName: string
  elo: number
}

export type QbStartLookup = (
  season: number,
  week: number,
  team: string,
) => QbStartInfo | null

export type TeamWepaLookup = (
  gameId: string,
  team: string,
) => number | null

/**
 * Performance signal for rating update: prefer WEPA-implied margin when both
 * teams have WEPA; else raw score margin. Mix 70/30 when both exist.
 */
export function gamePerformanceMargin(
  game: GameResult,
  homeWepa: number | null,
  awayWepa: number | null,
): { homeNet: number; awayNet: number } {
  const rawHome = game.homeScore - game.awayScore
  if (homeWepa != null && awayWepa != null) {
    const wepaPts = wepaDiffToPointMargin(homeWepa, awayWepa)
    const homeNet = 0.3 * rawHome + 0.7 * wepaPts
    return { homeNet, awayNet: -homeNet }
  }
  return { homeNet: rawHome, awayNet: -rawHome }
}

/**
 * Effective team rating for prediction = base team Elo-points + QB point delta.
 */
export function effectiveTeamRating(
  baseTeamRating: number,
  qbElo: number | null,
): number {
  if (qbElo == null) return baseTeamRating
  return baseTeamRating + qbEloToPointDelta(qbElo)
}

/**
 * QB injury / backup swing in points (starter Elo vs replacement).
 */
export function qbDeltaForTeam(
  starter: QbStartInfo | null,
  backupElo = QB_ELO_REPLACEMENT,
): number {
  if (!starter) return 0
  return qbEloToPointDelta(starter.elo) - qbEloToPointDelta(backupElo)
}

export function processSeasonRatingsV3(
  games: GameResult[],
  initial: Record<string, number>,
  opts: {
    hfa?: HfaConfig
    qbStart?: QbStartLookup
    teamWepa?: TeamWepaLookup
    /** When true, subtract opponent QB delta in TGPL like an injury term. */
    useQbInUpdate?: boolean
  } = {},
): {
  final: Record<string, TeamRating>
  byWeek: Record<number, Record<string, number>>
} {
  const hfa = opts.hfa ?? HOME_FIELD_ADVANTAGE
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
    const homeW =
      opts.teamWepa?.(game.gameId, game.homeTeam) ?? null
    const awayW =
      opts.teamWepa?.(game.gameId, game.awayTeam) ?? null
    const { homeNet, awayNet } = gamePerformanceMargin(game, homeW, awayW)

    const homeRating = ratings[game.homeTeam] ?? 0
    const awayRating = ratings[game.awayTeam] ?? 0

    let homeQbTerm = 0
    let awayQbTerm = 0
    if (opts.useQbInUpdate !== false && opts.qbStart) {
      const hq = opts.qbStart(game.season, game.week, game.homeTeam)
      const aq = opts.qbStart(game.season, game.week, game.awayTeam)
      // Own QB strength helps TGPL; opponent QB hurts (like injury differential sign).
      homeQbTerm = qbDeltaForTeam(hq) - qbDeltaForTeam(aq)
      awayQbTerm = -homeQbTerm
    }

    const homeTgpl =
      homeNet + awayRating + -seasonHfa + homeQbTerm
    const awayTgpl =
      awayNet + homeRating + seasonHfa + awayQbTerm

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

export function seedSeasonV3(
  priorFinal: Record<string, TeamRating>,
): ReturnType<typeof buildPreseasonPriors> {
  return buildPreseasonPriors(priorFinal, [], 0.5)
}
