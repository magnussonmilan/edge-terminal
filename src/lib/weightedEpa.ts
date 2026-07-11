/**
 * Context-weighted EPA — independent reimplementation of the general idea
 * “weight plays by situation,” not a port of any third-party source.
 *
 * Input rows match nflverse play-by-play column names (snake_case).
 * Weights are documented multipliers on trust in the raw EPA signal.
 */

export interface RawPlayByPlayRow {
  game_id?: string
  play_id?: string
  season?: string | number
  week?: string | number
  posteam?: string
  defteam?: string
  epa?: string | number
  /** Absolute score differential after the play (or before — we use provided fields). */
  score_differential?: string | number
  /** Seconds remaining in half (nflverse: half_seconds_remaining). */
  half_seconds_remaining?: string | number
  qtr?: string | number
  interception?: string | number
  fumble_lost?: string | number
  fumble?: string | number
  incomplete_pass?: string | number
  touchdown?: string | number
  pass?: string | number
  rush?: string | number
  play_type?: string
  passer_player_id?: string
  passer_player_name?: string
  /** 1 if special teams / no posteam EPA should apply. */
  special_teams_play?: string | number
}

export interface WeightedPlay {
  gameId: string
  team: string
  epa: number
  weight: number
  weightedEpa: number
  passerId: string | null
  passerName: string | null
}

function num(v: string | number | undefined | null, fallback = 0): number {
  if (v == null || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function flag(v: string | number | undefined | null): boolean {
  return num(v, 0) === 1
}

/**
 * Context weight for a single play.
 *
 * Rules (kept simple on purpose):
 * - Skip / zero-weight: no posteam, no EPA, special teams, or non-scrimmage.
 * - Garbage time: |score_diff| > 16 AND < 3:00 left in the half → 0.5
 *   (blowouts late in a half carry less signal for rating updates).
 * - Own-team fumble recovered (fumble but not fumble_lost) → 0.35
 *   (fluky possession noise; don't treat like a clean negative EPA event).
 * - Interception or fumble_lost → 1.1
 *   (slightly amplify true turnovers vs routine incompletes).
 * - Incomplete pass (no INT) → 0.9
 * - Default scrimmage play → 1.0
 */
export function playContextWeight(play: RawPlayByPlayRow): number {
  const posteam = (play.posteam || '').trim()
  if (!posteam) return 0
  if (flag(play.special_teams_play)) return 0

  const playType = (play.play_type || '').toLowerCase()
  if (
    playType === 'kickoff' ||
    playType === 'punt' ||
    playType === 'extra_point' ||
    playType === 'field_goal' ||
    playType === 'no_play'
  ) {
    return 0
  }

  if (play.epa === '' || play.epa == null) return 0

  let w = 1.0

  const scoreDiff = Math.abs(num(play.score_differential))
  const halfLeft = num(play.half_seconds_remaining, 9999)
  // Garbage time: large lead and under 3 minutes in the half
  if (scoreDiff > 16 && halfLeft < 180) {
    w *= 0.5
  }

  if (flag(play.fumble) && !flag(play.fumble_lost)) {
    w *= 0.35
  } else if (flag(play.interception) || flag(play.fumble_lost)) {
    w *= 1.1
  } else if (flag(play.incomplete_pass)) {
    w *= 0.9
  }

  return w
}

export function weightPlay(play: RawPlayByPlayRow): WeightedPlay | null {
  const weight = playContextWeight(play)
  if (weight <= 0) return null
  const epa = num(play.epa)
  const gameId = play.game_id || ''
  const team = (play.posteam || '').trim()
  if (!gameId || !team) return null

  return {
    gameId,
    team,
    epa,
    weight,
    weightedEpa: epa * weight,
    passerId: play.passer_player_id || null,
    passerName: play.passer_player_name || null,
  }
}

export interface TeamWepaComponents {
  /** Sum of weighted EPA while this team had the ball. */
  offenseWepa: number
  /** Sum of weighted EPA allowed while this team was on defense. */
  defenseWepaAllowed: number
}

/**
 * Team total weighted EPA by gameId → team → sum(weightedEpa) (offense only).
 */
export function computeTeamWeightedEpaByGame(
  plays: RawPlayByPlayRow[],
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const raw of plays) {
    const wp = weightPlay(raw)
    if (!wp) continue
    if (!out[wp.gameId]) out[wp.gameId] = {}
    out[wp.gameId][wp.team] = (out[wp.gameId][wp.team] ?? 0) + wp.weightedEpa
  }
  return out
}

/**
 * Per-team offense + defense-allowed weighted EPA by game.
 * Defense allowed uses the same weighted plays attributed to defteam.
 */
export function computeTeamWepaComponentsByGame(
  plays: RawPlayByPlayRow[],
): Record<string, Record<string, TeamWepaComponents>> {
  const out: Record<string, Record<string, TeamWepaComponents>> = {}
  for (const raw of plays) {
    const wp = weightPlay(raw)
    if (!wp) continue
    const defteam = (raw.defteam || '').trim()
    if (!out[wp.gameId]) out[wp.gameId] = {}
    const off = out[wp.gameId][wp.team] ?? {
      offenseWepa: 0,
      defenseWepaAllowed: 0,
    }
    off.offenseWepa += wp.weightedEpa
    out[wp.gameId][wp.team] = off
    if (defteam) {
      const def = out[wp.gameId][defteam] ?? {
        offenseWepa: 0,
        defenseWepaAllowed: 0,
      }
      def.defenseWepaAllowed += wp.weightedEpa
      out[wp.gameId][defteam] = def
    }
  }
  return out
}

/**
 * Passer (QB) total weighted EPA by gameId → passerId → sum(weightedEpa).
 * Only counts plays with a passer_player_id.
 */
export function computeQbWeightedEpaByGame(
  plays: RawPlayByPlayRow[],
): Record<
  string,
  Record<string, { epa: number; weightSum: number; name: string; team: string }>
> {
  const out: Record<
    string,
    Record<string, { epa: number; weightSum: number; name: string; team: string }>
  > = {}
  for (const raw of plays) {
    const wp = weightPlay(raw)
    if (!wp || !wp.passerId) continue
    if (!out[wp.gameId]) out[wp.gameId] = {}
    const prev = out[wp.gameId][wp.passerId] ?? {
      epa: 0,
      weightSum: 0,
      name: wp.passerName || wp.passerId,
      team: wp.team,
    }
    prev.epa += wp.weightedEpa
    prev.weightSum += wp.weight
    prev.team = wp.team
    if (wp.passerName) prev.name = wp.passerName
    out[wp.gameId][wp.passerId] = prev
  }
  return out
}

/**
 * Convert team game weighted-EPA differential into an approximate point margin
 * for rating updates. Empirically ~1 EPA ≈ 0.3–0.5 points of margin in NFL
 * research; we use 0.4 as a transparent constant (fit later if needed).
 */
export const WEPA_TO_POINTS = 0.4

export function wepaDiffToPointMargin(
  homeWepa: number,
  awayWepa: number,
): number {
  return (homeWepa - awayWepa) * WEPA_TO_POINTS
}
