/**
 * Per-QB Elo-style ratings (point-spread scale via QB_ELO_TO_POINTS).
 *
 * Inspired by the public FiveThirtyEight NFL / QB-Elo methodology writeups
 * (fivethirtyeight.com methodology pages) — implemented independently here.
 * Do not treat this as a port of any third-party private codebase.
 */

/** Elo points per 1 point of expected game margin (538-style ballpark). */
export const QB_ELO_TO_POINTS = 25

/** League-average QB Elo anchor. */
export const QB_ELO_MEAN = 1500

/** Soft floor for a pure backup / replacement-level starter. */
export const QB_ELO_REPLACEMENT = 1450

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
 *
 * draftPosition: 1 = first overall. Undrafted / unknown → treat as 200+.
 * teamPriorPassingLevel: Elo-scale estimate of the team's recent passing strength.
 *
 * Gap closes faster than linear: early picks start well above team prior;
 * late picks start near team prior / replacement.
 */
export function seedRookieQbRating(
  draftPosition: number,
  teamPriorPassingLevel: number,
): number {
  const pick = Math.max(1, draftPosition || 250)
  // Day-1 #1 overall premium ≈ +120 Elo vs team prior; decays with pick number.
  // Exponential in pick: premium = 120 * exp(-(pick-1)/40)
  const premium = 120 * Math.exp(-(pick - 1) / 40)
  const towardTeam = teamPriorPassingLevel || QB_ELO_MEAN
  // Blend: high picks sit above team prior; late picks hug max(teamPrior, replacement)
  const floor = Math.max(QB_ELO_REPLACEMENT, towardTeam - 40)
  const seeded = towardTeam + premium * (1 - Math.min(1, (pick - 1) / 180))
  return Math.max(floor, Math.min(QB_ELO_MEAN + 200, seeded))
}

/**
 * Veteran update: blend this game's performance with mean-reversion toward
 * the QB's OWN rolling career average (not league average).
 *
 * gamePerformance: Elo-scale value implied by this game's weighted EPA
 *   (see qbGameEpaToEloPerformance).
 * gamesPlayed: career starts before this game — more history → stronger pull
 *   to careerRollingAverage, weaker single-game shock.
 */
export function updateQbRating(
  prior: number,
  gamePerformance: number,
  careerRollingAverage: number,
  gamesPlayed: number,
): number {
  const g = Math.max(0, gamesPlayed)
  // Career pull grows with sample; caps so a single game still moves the needle.
  const careerWeight = Math.min(0.55, 0.08 + g / (g + 24))
  const gameWeight = 0.35
  const priorWeight = Math.max(0.15, 1 - careerWeight - gameWeight)

  const next =
    priorWeight * prior +
    gameWeight * gamePerformance +
    careerWeight * careerRollingAverage

  // Soft clamp to a sane NFL QB band
  return Math.max(1300, Math.min(1900, next))
}

/** Map game weighted-EPA (passer) into an Elo-scale performance observation. */
export function qbGameEpaToEloPerformance(
  weightedEpa: number,
  leagueGameEpaMean = 0,
): number {
  // ~1 WEPA above mean ≈ +8 Elo for that game observation (tunable)
  const delta = (weightedEpa - leagueGameEpaMean) * 8
  return QB_ELO_MEAN + delta
}

/** Convert QB Elo vs replacement into a point-spread contribution. */
export function qbEloToPointDelta(qbElo: number): number {
  return (qbElo - QB_ELO_REPLACEMENT) / QB_ELO_TO_POINTS
}

/**
 * Point delta for starting QB vs a backup/replacement when the starter is out.
 * Used in place of a flat QB-value subtraction for the starting-QB case.
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
