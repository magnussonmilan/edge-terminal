/**
 * Per-QB Elo-style ratings (point-spread scale via QB_ELO_TO_POINTS).
 *
 * Inspired by the public FiveThirtyEight NFL / QB-Elo methodology writeups
 * (fivethirtyeight.com methodology pages) — implemented independently here.
 * Do not treat this as a port of any third-party private codebase.
 *
 * ---------------------------------------------------------------------------
 * Tunable inventory (calibrated via scripts/calibrate-v3-model.ts on train
 * only; validation never selects). Defaults below are the pre-calibration
 * assumptions.
 *
 *   gameWeight            — per-game K-factor: weight on this game's Elo
 *                           performance observation in updateQbRating (was 0.35)
 *   careerWeightCap       — max pull toward the QB's own rolling career avg
 *                           (was 0.55); grows with gamesPlayed toward this cap
 *   careerSampleHalfLife  — gamesPlayed scale in careerWeight =
 *                           min(cap, 0.08 + g/(g+halfLife)) (was 24)
 *   rookiePremiumMax      — Elo premium for #1 overall vs team prior (was 120)
 *   rookieDecayPickScale  — exponential pick decay for that premium:
 *                           exp(-(pick-1)/scale) (was 40)
 *   wepaToEloScale        — WEPA → game Elo observation: mean + scale*WEPA
 *                           (was 8)
 *   cpoeToEloScale        — CPOE (completion % over expected) → Elo add-on
 *                           (was 0 — off until calibrated; nfelo research
 *                           found CPOE stable YoY, R²≈0.226)
 *
 * Not tuned here (scale anchors, verified separately):
 *   QB_ELO_TO_POINTS, QB_ELO_MEAN, QB_ELO_REPLACEMENT
 * ---------------------------------------------------------------------------
 */

/** Elo points per 1 point of expected game margin (538-style ballpark). */
export const QB_ELO_TO_POINTS = 25

/** League-average QB Elo anchor. */
export const QB_ELO_MEAN = 1500

/** Soft floor for a pure backup / replacement-level starter. */
export const QB_ELO_REPLACEMENT = 1450

export interface QbEloParams {
  gameWeight: number
  careerWeightCap: number
  careerSampleHalfLife: number
  rookiePremiumMax: number
  rookieDecayPickScale: number
  wepaToEloScale: number
  /** Elo points per 1 CPOE percentage-point (0 = disabled). */
  cpoeToEloScale: number
}

/** Pre-calibration defaults (historical assumed values). */
export const DEFAULT_QB_ELO_PARAMS: QbEloParams = {
  gameWeight: 0.35,
  careerWeightCap: 0.55,
  careerSampleHalfLife: 24,
  rookiePremiumMax: 120,
  rookieDecayPickScale: 40,
  wepaToEloScale: 8,
  cpoeToEloScale: 0,
}

/** Mutable active params — set by calibration before rebuilding ratings. */
let activeParams: QbEloParams = { ...DEFAULT_QB_ELO_PARAMS }

export function getQbEloParams(): QbEloParams {
  return { ...activeParams }
}

export function setQbEloParams(partial: Partial<QbEloParams>): void {
  activeParams = { ...activeParams, ...partial }
}

export function resetQbEloParams(): void {
  activeParams = { ...DEFAULT_QB_ELO_PARAMS }
}

export interface QbRating {
  playerId: string
  playerName: string
  team: string
  season: number
  week: number
  rating: number
}

/**
 * Seed a rookie QB's initial Elo from draft position, decaying exponentially
 * toward the team's prior passing-game level (not a flat league constant).
 */
export function seedRookieQbRating(
  draftPosition: number,
  teamPriorPassingLevel: number,
  params: QbEloParams = activeParams,
): number {
  const pick = Math.max(1, draftPosition || 250)
  const premium =
    params.rookiePremiumMax *
    Math.exp(-(pick - 1) / params.rookieDecayPickScale)
  const towardTeam = teamPriorPassingLevel || QB_ELO_MEAN
  const floor = Math.max(QB_ELO_REPLACEMENT, towardTeam - 40)
  const seeded =
    towardTeam + premium * (1 - Math.min(1, (pick - 1) / 180))
  return Math.max(floor, Math.min(QB_ELO_MEAN + 200, seeded))
}

/**
 * Veteran update: blend this game's performance with mean-reversion toward
 * the QB's OWN rolling career average (not league average).
 */
export function updateQbRating(
  prior: number,
  gamePerformance: number,
  careerRollingAverage: number,
  gamesPlayed: number,
  params: QbEloParams = activeParams,
): number {
  const g = Math.max(0, gamesPlayed)
  const half = Math.max(1, params.careerSampleHalfLife)
  const careerWeight = Math.min(
    params.careerWeightCap,
    0.08 + g / (g + half),
  )
  const gameWeight = Math.max(0.05, Math.min(0.6, params.gameWeight))
  const priorWeight = Math.max(0.15, 1 - careerWeight - gameWeight)

  const next =
    priorWeight * prior +
    gameWeight * gamePerformance +
    careerWeight * careerRollingAverage

  return Math.max(1300, Math.min(1900, next))
}

/** Map game weighted-EPA (passer) into an Elo-scale performance observation. */
export function qbGameEpaToEloPerformance(
  weightedEpa: number,
  leagueGameEpaMean = 0,
  params: QbEloParams = activeParams,
  cpoe: number | null = null,
): number {
  const delta = (weightedEpa - leagueGameEpaMean) * params.wepaToEloScale
  const cpoeDelta =
    cpoe != null && Number.isFinite(cpoe)
      ? cpoe * params.cpoeToEloScale
      : 0
  return QB_ELO_MEAN + delta + cpoeDelta
}

/** Convert QB Elo vs replacement into a point-spread contribution. */
export function qbEloToPointDelta(qbElo: number): number {
  return (qbElo - QB_ELO_REPLACEMENT) / QB_ELO_TO_POINTS
}

/**
 * Point delta for starting QB vs a backup/replacement when the starter is out.
 */
export function qbInjuryPointSwing(
  starterElo: number,
  backupElo: number = QB_ELO_REPLACEMENT,
): number {
  return Math.max(0, qbEloToPointDelta(starterElo) - qbEloToPointDelta(backupElo))
}

export function rollingCareerAverage(
  history: number[],
  fallback = QB_ELO_MEAN,
): number {
  if (history.length === 0) return fallback
  return history.reduce((s, v) => s + v, 0) / history.length
}
