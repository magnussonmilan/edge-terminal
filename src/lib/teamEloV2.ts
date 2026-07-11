/**
 * v3 team rating engine: QB-neutral team updates + QB Elo overlay at predict time.
 *
 * Structural rule (overconfidence fix): game score/WEPA already embeds the
 * starting QBs' contribution. Team ratings therefore update off a QB-neutral
 * performance signal (observed margin minus expected QB point differential).
 * QB-Elo is added only at prediction via effectiveTeamRating — the sole
 * explicit QB source. Do not also inject QB into TGPL on top of raw margin.
 *
 * Scale (Hypothesis B check): qbEloToPointDelta uses (elo − replacement) / 25
 * (538-style). Differentials are in point-spread units, not raw Elo.
 *
 * Non-net grades: each team is graded from its own offense WEPA minus defense
 * WEPA allowed — not forced to `awayNet = -homeNet` after the blend. Per
 * published nfelo analysis ("What's the Best NFL Game Grade?"), independent
 * per-team grades predict future performance better than zero-sum net margin.
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
import {
  WEPA_TO_POINTS,
  type TeamWepaComponents,
} from './weightedEpa'
import { qbEloToPointDelta, QB_ELO_REPLACEMENT } from './qbElo'
import { buildPreseasonPriors } from './srsPrior'

export type { TeamWepaComponents }

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
) => TeamWepaComponents | null

/** Default share on point differential; rest on WEPA grade. Calibrated on train. */
export const DEFAULT_PD_WEIGHT = 0.3

let activePdWeight = DEFAULT_PD_WEIGHT

export function getPdWeight(): number {
  return activePdWeight
}

export function setPdWeight(w: number): void {
  activePdWeight = Math.max(0, Math.min(1, w))
}

export function resetPdWeight(): void {
  activePdWeight = DEFAULT_PD_WEIGHT
}

/**
 * Non-net team grade: each team's own offensive output minus defensive
 * output allowed, computed independently — NOT forced to sum to zero
 * against the opponent. Per nfelo's published finding, this predicts
 * future performance better than a net/zero-sum margin.
 */
export function nonNetTeamGrade(
  offenseWepa: number,
  defenseWepaAllowed: number,
): number {
  return offenseWepa - defenseWepaAllowed
}

/**
 * Performance signal for rating update.
 *
 * When both sides have WEPA components: blend point differential with each
 * team's own non-net WEPA grade (scaled to points). Home and away grades are
 * computed independently — away is not forced to `-home`.
 *
 * pdWeight ∈ [0,1]: weight on raw point differential (rest on WEPA).
 */
export function gamePerformanceMargin(
  game: GameResult,
  homeWepa: TeamWepaComponents | null,
  awayWepa: TeamWepaComponents | null,
  pdWeight: number = activePdWeight,
): { homeNet: number; awayNet: number } {
  const rawHome = game.homeScore - game.awayScore
  const pd = Math.max(0, Math.min(1, pdWeight))
  const wepaW = 1 - pd

  if (homeWepa != null && awayWepa != null) {
    const homeGrade = nonNetTeamGrade(
      homeWepa.offenseWepa,
      homeWepa.defenseWepaAllowed,
    )
    const awayGrade = nonNetTeamGrade(
      awayWepa.offenseWepa,
      awayWepa.defenseWepaAllowed,
    )
    return {
      homeNet: pd * rawHome + wepaW * homeGrade * WEPA_TO_POINTS,
      awayNet: pd * -rawHome + wepaW * awayGrade * WEPA_TO_POINTS,
    }
  }
  return { homeNet: rawHome, awayNet: -rawHome }
}

/**
 * Legacy net-margin path (pre non-net): force awayNet = -homeNet after blend.
 * Kept for staged before/after calibration only.
 */
export function gamePerformanceMarginNet(
  game: GameResult,
  homeOffenseWepa: number | null,
  awayOffenseWepa: number | null,
  pdWeight = 0.3,
): { homeNet: number; awayNet: number } {
  const rawHome = game.homeScore - game.awayScore
  if (homeOffenseWepa != null && awayOffenseWepa != null) {
    const wepaPts =
      (homeOffenseWepa - awayOffenseWepa) * WEPA_TO_POINTS
    const homeNet = pdWeight * rawHome + (1 - pdWeight) * wepaPts
    return { homeNet, awayNet: -homeNet }
  }
  return { homeNet: rawHome, awayNet: -rawHome }
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

/**
 * Expected home-perspective point contribution from the two starting QBs.
 * Used to strip implicit QB credit from observed margin.
 */
export function expectedQbPointMargin(
  homeQb: QbStartInfo | null,
  awayQb: QbStartInfo | null,
): number {
  return qbDeltaForTeam(homeQb) - qbDeltaForTeam(awayQb)
}

/**
 * Effective team rating for prediction = QB-neutral team rating + QB point delta.
 */
export function effectiveTeamRating(
  baseTeamRating: number,
  qbElo: number | null,
): number {
  if (qbElo == null) return baseTeamRating
  return baseTeamRating + qbEloToPointDelta(qbElo)
}

export function processSeasonRatingsV3(
  games: GameResult[],
  initial: Record<string, number>,
  opts: {
    hfa?: HfaConfig
    qbStart?: QbStartLookup
    teamWepa?: TeamWepaLookup
    /**
     * When true (default): strip expected QB point margin from the observed
     * performance before the team update (QB-neutral team ratings).
     * When false: update off raw margin/WEPA with no QB netting (legacy).
     */
    neutralizeQbInUpdate?: boolean
    /** Point-differential blend weight (rest on WEPA). Default: activePdWeight. */
    pdWeight?: number
    /**
     * When true: use legacy net-margin (away = -home) for staged A/B tests.
     * Default false (non-net independent grades).
     */
    useNetMargin?: boolean
  } = {},
): {
  final: Record<string, TeamRating>
  byWeek: Record<number, Record<string, number>>
} {
  const hfa = opts.hfa ?? HOME_FIELD_ADVANTAGE
  const neutralize = opts.neutralizeQbInUpdate !== false
  const pdWeight = opts.pdWeight ?? activePdWeight
  const useNet = opts.useNetMargin === true
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
    const homeW = opts.teamWepa?.(game.gameId, game.homeTeam) ?? null
    const awayW = opts.teamWepa?.(game.gameId, game.awayTeam) ?? null

    let homeNet: number
    let awayNet: number
    if (useNet) {
      const net = gamePerformanceMarginNet(
        game,
        homeW?.offenseWepa ?? null,
        awayW?.offenseWepa ?? null,
        pdWeight,
      )
      homeNet = net.homeNet
      awayNet = net.awayNet
    } else {
      const perf = gamePerformanceMargin(game, homeW, awayW, pdWeight)
      homeNet = perf.homeNet
      awayNet = perf.awayNet
    }

    // Hypothesis A fix: net out expected QB contribution so team ratings stay
    // QB-neutral. Do NOT add a separate qbTerm on top of the raw margin.
    if (neutralize && opts.qbStart) {
      const hq = opts.qbStart(game.season, game.week, game.homeTeam)
      const aq = opts.qbStart(game.season, game.week, game.awayTeam)
      const qbMargin = expectedQbPointMargin(hq, aq)
      homeNet -= qbMargin
      awayNet += qbMargin
    }

    const homeRating = ratings[game.homeTeam] ?? 0
    const awayRating = ratings[game.awayTeam] ?? 0

    const homeTgpl = homeNet + awayRating + -seasonHfa
    const awayTgpl = awayNet + homeRating + seasonHfa

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
