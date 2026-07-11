/**
 * Display helpers for feature-parity ranking pages.
 * Surfaces already-computed fixtures — no nfelo code, no new model.
 */

import ratingsV3Data from '@/data/nfl/ratings-v3.json'
import gamesData from '@/data/nfl/games.json'
import wepaCacheData from '@/data/nfl/team-wepa-pbp-cache.json'
import qbSampleData from '@/data/nfl/qb-ratings-v3-sample.json'
import { PREDICTIONS_V3_INDEPENDENT } from './nflData'
import { spreadToWinProb } from './backtest'
import { isPrimetime } from './predictions'
import type { GameResult } from './powerRatings'
import type { QbRating } from './qbElo'
import type { RatingsBundle } from './nflData'
import type { TeamWepaComponents } from './weightedEpa'

export const RATINGS_V3 = ratingsV3Data as RatingsBundle
export const GAMES = gamesData as GameResult[]
export const QB_RATINGS_SAMPLE = qbSampleData as QbRating[]

const WEPA_CACHE = wepaCacheData as {
  seasons: number[]
  rows: Record<string, TeamWepaComponents>
}

export function listRankingSeasons(): number[] {
  return Object.keys(RATINGS_V3)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)
}

export function latestWeekForSeason(season: number): number {
  const bundle = RATINGS_V3[String(season)]
  if (!bundle) return 1
  const weeks = Object.keys(bundle.byWeek)
    .map(Number)
    .sort((a, b) => a - b)
  return weeks[weeks.length - 1] ?? 1
}

export function listRatingWeeks(season: number): number[] {
  const bundle = RATINGS_V3[String(season)]
  if (!bundle) return []
  return Object.keys(bundle.byWeek)
    .map(Number)
    .sort((a, b) => a - b)
}

/** Ratings as of end of `week` (byWeek[week] written after that week's games). */
export function getPowerRatings(
  season: number,
  week: number,
): Array<{ rank: number; team: string; rating: number }> {
  const bundle = RATINGS_V3[String(season)]
  if (!bundle) return []
  const map = bundle.byWeek[String(week)] ?? bundle.seed
  return Object.entries(map)
    .map(([team, rating]) => ({ team, rating }))
    .sort((a, b) => b.rating - a.rating)
    .map((row, i) => ({ rank: i + 1, ...row }))
}

export function getQbRankings(
  season: number,
  week: number,
): {
  rows: Array<QbRating & { rank: number; pointDelta: number }>
  dataNote: string
} {
  const rows = QB_RATINGS_SAMPLE.filter(
    (r) => r.season === season && r.week === week,
  )
    .slice()
    .sort((a, b) => b.rating - a.rating)
    .map((r, i) => ({
      ...r,
      rank: i + 1,
      pointDelta: (r.rating - 1450) / 25,
    }))

  const seasons = [...new Set(QB_RATINGS_SAMPLE.map((r) => r.season))].sort()
  const weeks = [...new Set(QB_RATINGS_SAMPLE.map((r) => r.week))].sort(
    (a, b) => a - b,
  )
  return {
    rows,
    dataNote: `Committed sample covers seasons ${seasons[0]}–${seasons[seasons.length - 1]}, weeks ${weeks.join(' & ')} only (${QB_RATINGS_SAMPLE.length} starter snapshots). Full weekly QB Elo is computed at calibrate time but not all snapshots are checked into the SPA fixture.`,
  }
}

export function listQbSampleSeasons(): number[] {
  return [...new Set(QB_RATINGS_SAMPLE.map((r) => r.season))].sort(
    (a, b) => b - a,
  )
}

export function listQbSampleWeeks(season: number): number[] {
  return [
    ...new Set(
      QB_RATINGS_SAMPLE.filter((r) => r.season === season).map((r) => r.week),
    ),
  ].sort((a, b) => a - b)
}

export interface EpaTierRow {
  rank: number
  team: string
  offenseWepa: number
  defenseWepaAllowed: number
  nonNetGrade: number
  games: number
  tier: 'Elite' | 'Above avg' | 'Average' | 'Below avg' | 'Poor'
}

function tierFromRank(rank: number, n: number): EpaTierRow['tier'] {
  const p = n <= 1 ? 0 : (rank - 1) / (n - 1)
  if (p <= 0.2) return 'Elite'
  if (p <= 0.4) return 'Above avg'
  if (p <= 0.6) return 'Average'
  if (p <= 0.8) return 'Below avg'
  return 'Poor'
}

/** Season EPA tiers from per-game WEPA cache (mean non-net grade). */
export function getEpaTiers(season: number): EpaTierRow[] {
  const acc = new Map<
    string,
    { off: number; def: number; n: number }
  >()
  const prefix = `${season}_`
  for (const [key, comps] of Object.entries(WEPA_CACHE.rows)) {
    if (!key.startsWith(prefix)) continue
    // key = {gameId}_{team} ; gameId = season_week_away_home
    const parts = key.split('_')
    const team = parts[parts.length - 1]!
    if (team.length > 3) continue
    const cur = acc.get(team) ?? { off: 0, def: 0, n: 0 }
    cur.off += comps.offenseWepa
    cur.def += comps.defenseWepaAllowed
    cur.n += 1
    acc.set(team, cur)
  }

  const rows = [...acc.entries()]
    .filter(([, v]) => v.n > 0)
    .map(([team, v]) => {
      const offenseWepa = v.off / v.n
      const defenseWepaAllowed = v.def / v.n
      return {
        team,
        offenseWepa,
        defenseWepaAllowed,
        nonNetGrade: offenseWepa - defenseWepaAllowed,
        games: v.n,
      }
    })
    .sort((a, b) => b.nonNetGrade - a.nonNetGrade)

  return rows.map((r, i) => ({
    rank: i + 1,
    ...r,
    tier: tierFromRank(i + 1, rows.length),
  }))
}

/**
 * Strength of schedule: average opponent rating.
 * Past = games with scores; remaining = unscored (empty in historical fixtures).
 */
export function computeStrengthOfSchedule(
  team: string,
  season: number,
): {
  team: string
  pastOppAvg: number | null
  pastGames: number
  remainingOppAvg: number | null
  remainingGames: number
} {
  const bundle = RATINGS_V3[String(season)]
  const seasonGames = GAMES.filter(
    (g) =>
      g.season === season &&
      (g.homeTeam === team || g.awayTeam === team),
  )

  function oppRating(g: GameResult): number | null {
    const opp = g.homeTeam === team ? g.awayTeam : g.homeTeam
    // Use rating entering the week (week-1), else seed
    const beforeWeek = g.week - 1
    const map =
      beforeWeek >= 1
        ? bundle?.byWeek[String(beforeWeek)]
        : bundle?.seed
    const fallback = bundle?.seed
    const r = map?.[opp] ?? fallback?.[opp]
    return r != null ? r : null
  }

  const past: number[] = []
  const remaining: number[] = []
  for (const g of seasonGames) {
    const r = oppRating(g)
    if (r == null) continue
    const settled =
      g.homeScore != null &&
      g.awayScore != null &&
      Number.isFinite(g.homeScore) &&
      Number.isFinite(g.awayScore)
    if (settled) past.push(r)
    else remaining.push(r)
  }

  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null

  return {
    team,
    pastOppAvg: avg(past),
    pastGames: past.length,
    remainingOppAvg: avg(remaining),
    remainingGames: remaining.length,
  }
}

export function getSosTable(season: number): Array<{
  rank: number
  team: string
  pastOppAvg: number | null
  pastGames: number
  remainingOppAvg: number | null
  remainingGames: number
}> {
  const teams = new Set<string>()
  for (const g of GAMES) {
    if (g.season !== season) continue
    teams.add(g.homeTeam)
    teams.add(g.awayTeam)
  }
  const rows = [...teams]
    .map((t) => computeStrengthOfSchedule(t, season))
    .filter((r) => r.pastGames > 0)
    .sort((a, b) => (b.pastOppAvg ?? -999) - (a.pastOppAvg ?? -999))
    .map((r, i) => ({ rank: i + 1, ...r }))
  return rows
}

export interface TeamTendencyRow {
  team: string
  games: number
  homeWinPct: number
  awayWinPct: number
  homeGames: number
  awayGames: number
  shortRestWinPct: number | null
  shortRestGames: number
  primetimeWinPct: number | null
  primetimeGames: number
}

/** Game-level tendencies from games.json (not down/distance PBP — that isn't cached). */
export function getTeamTendencies(season: number): TeamTendencyRow[] {
  const byTeam = new Map<
    string,
    {
      homeW: number
      homeN: number
      awayW: number
      awayN: number
      shortW: number
      shortN: number
      ptW: number
      ptN: number
    }
  >()

  function bucket(team: string) {
    let b = byTeam.get(team)
    if (!b) {
      b = {
        homeW: 0,
        homeN: 0,
        awayW: 0,
        awayN: 0,
        shortW: 0,
        shortN: 0,
        ptW: 0,
        ptN: 0,
      }
      byTeam.set(team, b)
    }
    return b
  }

  for (const g of GAMES) {
    if (g.season !== season) continue
    if (g.homeScore === g.awayScore) continue
    const homeWin = g.homeScore > g.awayScore

    const hb = bucket(g.homeTeam)
    hb.homeN += 1
    if (homeWin) hb.homeW += 1
    if (g.homeRest != null && g.homeRest < 7) {
      hb.shortN += 1
      if (homeWin) hb.shortW += 1
    }
    if (isPrimetime(g.weekday, g.gametime)) {
      hb.ptN += 1
      if (homeWin) hb.ptW += 1
    }

    const ab = bucket(g.awayTeam)
    ab.awayN += 1
    if (!homeWin) ab.awayW += 1
    if (g.awayRest != null && g.awayRest < 7) {
      ab.shortN += 1
      if (!homeWin) ab.shortW += 1
    }
  }

  return [...byTeam.entries()]
    .map(([team, b]) => ({
      team,
      games: b.homeN + b.awayN,
      homeGames: b.homeN,
      awayGames: b.awayN,
      homeWinPct: b.homeN ? b.homeW / b.homeN : 0,
      awayWinPct: b.awayN ? b.awayW / b.awayN : 0,
      shortRestGames: b.shortN,
      shortRestWinPct: b.shortN ? b.shortW / b.shortN : null,
      primetimeGames: b.ptN,
      primetimeWinPct: b.ptN ? b.ptW / b.ptN : null,
    }))
    .sort((a, b) => b.games - a.games)
}

/**
 * Expected season wins = sum of model pre-game win probs (v3 independent).
 * Direct expectation — no Monte Carlo.
 */
export function projectSeasonWinTotal(
  team: string,
  season: number,
): {
  team: string
  expectedWins: number
  actualWins: number
  games: number
  remainingExpected: number
  remainingGames: number
} {
  const preds = PREDICTIONS_V3_INDEPENDENT.filter(
    (p) =>
      p.season === season &&
      (p.homeTeam === team || p.awayTeam === team),
  )

  let expected = 0
  let actual = 0
  let n = 0
  let remExp = 0
  let remN = 0

  for (const p of preds) {
    const isHome = p.homeTeam === team
    const pWin = isHome
      ? spreadToWinProb(p.modelSpread)
      : 1 - spreadToWinProb(p.modelSpread)

    const settled = p.homeScore != null && p.awayScore != null
    if (settled) {
      expected += pWin
      n += 1
      const homeWin = (p.homeScore ?? 0) > (p.awayScore ?? 0)
      if (isHome ? homeWin : !homeWin) actual += 1
    } else {
      remExp += pWin
      remN += 1
    }
  }

  return {
    team,
    expectedWins: expected,
    actualWins: actual,
    games: n,
    remainingExpected: remExp,
    remainingGames: remN,
  }
}

export function getWinTotalsTable(season: number): Array<{
  rank: number
  team: string
  expectedWins: number
  actualWins: number
  games: number
  delta: number
  remainingExpected: number
  remainingGames: number
}> {
  const teams = new Set<string>()
  for (const p of PREDICTIONS_V3_INDEPENDENT) {
    if (p.season !== season) continue
    teams.add(p.homeTeam)
    teams.add(p.awayTeam)
  }
  const rows = [...teams]
    .map((t) => projectSeasonWinTotal(t, season))
    .filter((r) => r.games > 0)
    .map((r) => ({
      ...r,
      delta: r.actualWins - r.expectedWins,
    }))
    .sort((a, b) => b.expectedWins - a.expectedWins)
    .map((r, i) => ({ rank: i + 1, ...r }))
  return rows
}
