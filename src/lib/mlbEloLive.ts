/**
 * Live MLB Elo — bridge Neil Paine settled checkpoint → Stats API backfill → 2026.
 *
 * Copyright (c) 2024 Neil Paine — seed ratings from mlb-elo-latest.csv (MIT).
 * Live results: MLB Stats API (see mlbStatsApi.ts terms note).
 *
 * No-look-ahead: ratingBeforeGame only reflects games strictly before the
 * target (including DH game 1 before game 2 on the same day).
 */

import type { MlbGameResult } from './mlbStatsApi'
import { groupGamesByTeamChrono, sortGamesChronologically } from './mlbStatsApi'

/** League mean for Elo (classic 538 / Neil Paine scale). */
export const MLB_ELO_MEAN = 1500
/** Home-field Elo boost — verified ~24 from Neil Paine settled rows. */
export const MLB_ELO_HOME_ADV = 24
/**
 * Update K — constant 4 tracks Neil Paine post-game Elo closely on recent
 * settled sample (median |err| ~0.6). Documented approximation — not a claim
 * of bit-identical Neil Paine MOV scaling.
 */
export const MLB_ELO_K = 4
/**
 * Offseason: retain 2/3 of distance from mean (regress 1/3 toward 1500).
 * Same *concept* as NFL seedFromPriorSeason decay; MLB uses mean-reversion
 * because ratings are absolute Elo, not zero-centered spreads.
 */
export const MLB_OFFSEASON_RETAIN = 2 / 3

export interface MlbSeedState {
  team: string
  eloRating: number
  asOfDate: string
}

export interface MlbLivePrediction {
  gameId: string
  gamePk: number
  date: string
  firstPitchIso: string
  season: number
  homeTeam: string
  awayTeam: string
  gameSequenceInDay: number
  homeEloBefore: number
  awayEloBefore: number
  modelHomeWinProb: number
  status: string
  abstractGameState: string
}

export function eloWinProb(
  homeElo: number,
  awayElo: number,
  homeAdv = MLB_ELO_HOME_ADV,
): number {
  const diff = homeElo + homeAdv - awayElo
  return 1 / (1 + 10 ** (-diff / 400))
}

export function applyEloResult(
  homeElo: number,
  awayElo: number,
  homeScore: number,
  awayScore: number,
): { homeElo: number; awayElo: number; homeWinProb: number } {
  const p = eloWinProb(homeElo, awayElo)
  const actual =
    homeScore > awayScore ? 1 : homeScore < awayScore ? 0 : 0.5
  const homeNext = homeElo + MLB_ELO_K * (actual - p)
  const awayNext = awayElo + MLB_ELO_K * (p - actual)
  return { homeElo: homeNext, awayElo: awayNext, homeWinProb: p }
}

export function seedMlb2026FromPriorSeason(
  endOf2025: MlbSeedState[],
  retain = MLB_OFFSEASON_RETAIN,
  mean = MLB_ELO_MEAN,
): MlbSeedState[] {
  return endOf2025.map((s) => ({
    team: s.team,
    eloRating: mean + (s.eloRating - mean) * retain,
    asOfDate: '2026-03-01', // spring training open — logical season start marker
  }))
}

function ratingsMap(seed: MlbSeedState[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const s of seed) m[s.team] = s.eloRating
  return m
}

function asOfMax(seed: MlbSeedState[], fallback: string): string {
  let max = fallback
  for (const s of seed) {
    if (s.asOfDate > max) max = s.asOfDate
  }
  return max
}

/**
 * Carry ratings from the 2025-05-09 checkpoint through real 2025 results.
 */
export function backfillThrough2025Season(
  seed: MlbSeedState[],
  realResults: MlbGameResult[],
): MlbSeedState[] {
  const ratings = ratingsMap(seed)
  const asOf = asOfMax(seed, '2025-05-09')
  const games = sortGamesChronologically(
    realResults.filter(
      (g) =>
        g.gameDate > asOf &&
        g.gameType === 'R' &&
        g.abstractGameState === 'Final' &&
        Number.isFinite(g.homeScore) &&
        Number.isFinite(g.awayScore),
    ),
  )

  let lastDate = asOf
  for (const g of games) {
    const h = ratings[g.homeTeam] ?? MLB_ELO_MEAN
    const a = ratings[g.awayTeam] ?? MLB_ELO_MEAN
    const next = applyEloResult(h, a, g.homeScore, g.awayScore)
    ratings[g.homeTeam] = next.homeElo
    ratings[g.awayTeam] = next.awayElo
    lastDate = g.gameDate
  }

  return Object.entries(ratings)
    .map(([team, eloRating]) => ({ team, eloRating, asOfDate: lastDate }))
    .sort((x, y) => x.team.localeCompare(y.team))
}

/**
 * Apply settled games in chrono order onto a ratings map (mutates copy).
 * Returns updated ratings + last settled date.
 */
export function rollRatingsForward(
  seed: MlbSeedState[],
  settled: MlbGameResult[],
): { ratings: Record<string, number>; asOfDate: string } {
  const ratings = ratingsMap(seed)
  let asOf = asOfMax(seed, '1900-01-01')
  const games = sortGamesChronologically(
    settled.filter(
      (g) =>
        g.abstractGameState === 'Final' &&
        Number.isFinite(g.homeScore) &&
        Number.isFinite(g.awayScore),
    ),
  )
  for (const g of games) {
    const h = ratings[g.homeTeam] ?? MLB_ELO_MEAN
    const a = ratings[g.awayTeam] ?? MLB_ELO_MEAN
    const next = applyEloResult(h, a, g.homeScore, g.awayScore)
    ratings[g.homeTeam] = next.homeElo
    ratings[g.awayTeam] = next.awayElo
    asOf = g.gameDate
  }
  return { ratings, asOfDate: asOf }
}

/**
 * Rating snapshot for a team immediately before a specific game.
 * Only games strictly earlier in chronological order count — including
 * DH game 1 before game 2 on the same date.
 *
 * Walks the full game set (deduped by gamePk) so opponent updates are exact.
 */
export function ratingBeforeGame(
  gamesByTeamChrono: Record<string, MlbGameResult[]>,
  team: string,
  gameDate: string,
  gameSequenceInDay: number,
  seasonSeed: Record<string, number>,
): number {
  const byPk = new Map<number, MlbGameResult>()
  for (const list of Object.values(gamesByTeamChrono)) {
    for (const g of list) byPk.set(g.gamePk, g)
  }
  const ratings: Record<string, number> = { ...seasonSeed }

  for (const g of sortGamesChronologically([...byPk.values()])) {
    const involvesTeam = g.homeTeam === team || g.awayTeam === team
    const isTarget =
      involvesTeam &&
      g.gameDate === gameDate &&
      g.gameSequenceInDay === gameSequenceInDay
    if (isTarget) {
      return ratings[team] ?? MLB_ELO_MEAN
    }

    if (g.abstractGameState !== 'Final') continue
    if (!Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) continue

    const homeElo = ratings[g.homeTeam] ?? MLB_ELO_MEAN
    const awayElo = ratings[g.awayTeam] ?? MLB_ELO_MEAN
    const next = applyEloResult(homeElo, awayElo, g.homeScore, g.awayScore)
    ratings[g.homeTeam] = next.homeElo
    ratings[g.awayTeam] = next.awayElo
  }

  return ratings[team] ?? MLB_ELO_MEAN
}

/**
 * Exact no-look-ahead ratings via a single global chronological walk.
 * Returns Map keyed by `${gamePk}` → { home, away } pre-game Elos.
 */
export function preGameRatingsByGamePk(
  seasonSeed: Record<string, number>,
  settledChrono: MlbGameResult[],
): Map<number, { homeElo: number; awayElo: number }> {
  const ratings = { ...seasonSeed }
  const out = new Map<number, { homeElo: number; awayElo: number }>()
  for (const g of sortGamesChronologically(settledChrono)) {
    if (g.abstractGameState !== 'Final') continue
    if (!Number.isFinite(g.homeScore) || !Number.isFinite(g.awayScore)) continue
    const homeElo = ratings[g.homeTeam] ?? MLB_ELO_MEAN
    const awayElo = ratings[g.awayTeam] ?? MLB_ELO_MEAN
    out.set(g.gamePk, { homeElo, awayElo })
    const next = applyEloResult(homeElo, awayElo, g.homeScore, g.awayScore)
    ratings[g.homeTeam] = next.homeElo
    ratings[g.awayTeam] = next.awayElo
  }
  return out
}

/**
 * ratingBeforeGame using global walk snapshots (correct for doubleheaders).
 */
export function ratingBeforeGameFromSnapshots(
  snapshots: Map<number, { homeElo: number; awayElo: number }>,
  game: MlbGameResult,
  side: 'home' | 'away',
  seasonSeed: Record<string, number>,
): number {
  const snap = snapshots.get(game.gamePk)
  if (snap) return side === 'home' ? snap.homeElo : snap.awayElo
  const team = side === 'home' ? game.homeTeam : game.awayTeam
  return seasonSeed[team] ?? MLB_ELO_MEAN
}

export function predictGame(
  homeElo: number,
  awayElo: number,
): { modelHomeWinProb: number } {
  return { modelHomeWinProb: eloWinProb(homeElo, awayElo) }
}

/**
 * Build predictions for upcoming (non-final) games from current ratings.
 */
export function predictUpcomingGames(
  currentRatings: Record<string, number>,
  upcoming: MlbGameResult[],
): MlbLivePrediction[] {
  const out: MlbLivePrediction[] = []
  for (const g of sortGamesChronologically(upcoming)) {
    if (g.abstractGameState === 'Final') continue
    const homeElo = currentRatings[g.homeTeam] ?? MLB_ELO_MEAN
    const awayElo = currentRatings[g.awayTeam] ?? MLB_ELO_MEAN
    const { modelHomeWinProb } = predictGame(homeElo, awayElo)
    out.push({
      gameId: `mlb-${g.gamePk}`,
      gamePk: g.gamePk,
      date: g.gameDate,
      firstPitchIso: g.gameDateTimeIso,
      season: g.season,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      gameSequenceInDay: g.gameSequenceInDay,
      homeEloBefore: homeElo,
      awayEloBefore: awayElo,
      modelHomeWinProb,
      status: g.status,
      abstractGameState: g.abstractGameState,
    })
  }
  return out
}

export { groupGamesByTeamChrono }
