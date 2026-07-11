/**
 * Model-vs-book value flags.
 *
 * Reuses the existing star-rating / playability gate from Predictions —
 * no new arbitrary threshold. Only playable spread signals are considered;
 * moneyline/totals value needs a calibrated model we do not invent here.
 *
 * Honest framing: this project's backtests have not shown the model beats a
 * sharp closing line. Sharp-book disagreements should be read with more
 * skepticism than soft-book lag in the UI.
 */

import { coverProbabilityFromMargins } from './marginDistribution'
import {
  multiplicativeDevig,
  type BookOdds,
  type BookTier,
} from './oddsAggregator'
import type { StarRating } from './keyNumbers'

export interface ValueBet {
  matchup: string
  side: string
  book: string
  bookTier: BookTier
  modelProbability: number
  bookImpliedProbability: number
  edgePercent: number
  starRating: number
  /** Join / display extras */
  bookKey: string
  market: 'spread'
  line: number
  eventId: string
  differentialPct: number
}

export interface ValueBetModelInput {
  homeTeam: string
  awayTeam: string
  /** Full names preferred for Odds API join; abbreviations also accepted. */
  homeTeamFull?: string
  awayTeamFull?: string
  modelSpread: number
  postedSpread: number | null
  starRating: StarRating
  eventId?: string
}

/** Odds API full names → nflverse abbreviations (and reverse helpers). */
export const NFL_FULL_TO_ABBR: Record<string, string> = {
  'Arizona Cardinals': 'ARI',
  'Atlanta Falcons': 'ATL',
  'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF',
  'Carolina Panthers': 'CAR',
  'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN',
  'Cleveland Browns': 'CLE',
  'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN',
  'Detroit Lions': 'DET',
  'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU',
  'Indianapolis Colts': 'IND',
  'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC',
  'Las Vegas Raiders': 'LV',
  'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LA',
  'Miami Dolphins': 'MIA',
  'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE',
  'New Orleans Saints': 'NO',
  'New York Giants': 'NYG',
  'New York Jets': 'NYJ',
  'Philadelphia Eagles': 'PHI',
  'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF',
  'Seattle Seahawks': 'SEA',
  'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN',
  'Washington Commanders': 'WAS',
}

const ABBR_TO_FULL = Object.fromEntries(
  Object.entries(NFL_FULL_TO_ABBR).map(([full, abbr]) => [abbr, full]),
)

function normalizeTeam(name: string): string {
  const trimmed = name.trim()
  if (NFL_FULL_TO_ABBR[trimmed]) return NFL_FULL_TO_ABBR[trimmed]
  if (ABBR_TO_FULL[trimmed.toUpperCase()]) return trimmed.toUpperCase()
  return trimmed.toUpperCase()
}

function teamsMatch(a: string, b: string): boolean {
  return normalizeTeam(a) === normalizeTeam(b)
}

/**
 * Vig-adjusted implied probability for one side of a two-way market.
 */
export function vigAdjustedImpliedProbability(
  sidePrice: number,
  oppositePrice: number,
): number {
  return multiplicativeDevig(sidePrice, oppositePrice).fairA
}

/**
 * Which ATS side the model prefers vs the posted (or book) line.
 * modelSpread > line → home covers more than that number implies.
 */
export function modelPreferredSpreadSide(
  modelSpread: number,
  line: number,
): 'home' | 'away' {
  return modelSpread > line ? 'home' : 'away'
}

function matchPredictionToEventOdds(
  pred: ValueBetModelInput,
  allBooks: BookOdds[],
): BookOdds[] {
  if (pred.eventId) {
    return allBooks.filter((r) => r.eventId === pred.eventId)
  }
  const homeCandidates = [pred.homeTeam, pred.homeTeamFull].filter(
    Boolean,
  ) as string[]
  const awayCandidates = [pred.awayTeam, pred.awayTeamFull].filter(
    Boolean,
  ) as string[]

  return allBooks.filter((r) => {
    const homeOk = homeCandidates.some((h) => teamsMatch(h, r.homeTeam))
    const awayOk = awayCandidates.some((a) => teamsMatch(a, r.awayTeam))
    return homeOk && awayOk
  })
}

/**
 * Surface value bets only where starRating.playable is true (existing gate).
 * Compares calibrated cover probability at each book's spread vs that book's
 * vig-adjusted implied probability. Positive model edge only.
 */
export function findValueBets(
  predictions: ValueBetModelInput[],
  allBooks: BookOdds[],
): ValueBet[] {
  const out: ValueBet[] = []

  for (const pred of predictions) {
    if (!pred.starRating.playable) continue
    if (pred.postedSpread == null || !Number.isFinite(pred.postedSpread)) {
      continue
    }

    const eventOdds = matchPredictionToEventOdds(pred, allBooks)
    const spreads = eventOdds.filter((r) => r.market === 'spread')
    if (spreads.length === 0) continue

    const byBook = new Map<string, BookOdds[]>()
    for (const row of spreads) {
      const list = byBook.get(row.bookKey) ?? []
      list.push(row)
      byBook.set(row.bookKey, list)
    }

    for (const [bookKey, rows] of byBook) {
      // Prefer outcome named as home/away team (Odds API style)
      const home =
        rows.find((r) => teamsMatch(r.side, r.homeTeam)) ??
        rows.find((r) => homeCandidatesMatch(r.side, pred))
      const away =
        rows.find((r) => teamsMatch(r.side, r.awayTeam)) ??
        rows.find((r) => awayCandidatesMatch(r.side, pred))

      if (!home || !away || home.line == null || away.line == null) continue
      // Same absolute line magnitude expected
      if (Math.abs(home.line + away.line) > 1e-6) continue

      const bookLine = home.line
      const preferred = modelPreferredSpreadSide(pred.modelSpread, bookLine)
      const modelHomeCover = coverProbabilityFromMargins(
        pred.modelSpread,
        bookLine,
      )
      const modelProb =
        preferred === 'home' ? modelHomeCover : 1 - modelHomeCover
      const sideRow = preferred === 'home' ? home : away
      const oppRow = preferred === 'home' ? away : home
      const bookImplied = vigAdjustedImpliedProbability(
        sideRow.price,
        oppRow.price,
      )
      const edge = modelProb - bookImplied
      if (edge <= 0) continue

      out.push({
        matchup: `${pred.awayTeam} @ ${pred.homeTeam}`,
        side:
          preferred === 'home'
            ? `${pred.homeTeam} ${formatSpread(bookLine)}`
            : `${pred.awayTeam} ${formatSpread(-bookLine)}`,
        book: home.book,
        bookKey,
        bookTier: home.bookTier,
        modelProbability: modelProb,
        bookImpliedProbability: bookImplied,
        edgePercent: edge * 100,
        starRating: pred.starRating.stars,
        market: 'spread',
        line: preferred === 'home' ? bookLine : -bookLine,
        eventId: home.eventId,
        differentialPct: pred.starRating.differentialPct,
      })
    }
  }

  // Soft first within tier groups handled by UI; sort: soft before sharp, then edge desc
  return out.sort((a, b) => {
    if (a.bookTier !== b.bookTier) {
      return a.bookTier === 'soft' ? -1 : 1
    }
    return b.edgePercent - a.edgePercent
  })
}

function homeCandidatesMatch(side: string, pred: ValueBetModelInput): boolean {
  return (
    teamsMatch(side, pred.homeTeam) ||
    (pred.homeTeamFull != null && teamsMatch(side, pred.homeTeamFull))
  )
}

function awayCandidatesMatch(side: string, pred: ValueBetModelInput): boolean {
  return (
    teamsMatch(side, pred.awayTeam) ||
    (pred.awayTeamFull != null && teamsMatch(side, pred.awayTeamFull))
  )
}

function formatSpread(line: number): string {
  if (line > 0) return `+${line}`
  return String(line)
}

/** Count sharp vs soft flags — useful signal report when live data flows. */
export function summarizeValueBetTiers(bets: ValueBet[]): {
  sharp: number
  soft: number
} {
  let sharp = 0
  let soft = 0
  for (const b of bets) {
    if (b.bookTier === 'sharp') sharp += 1
    else soft += 1
  }
  return { sharp, soft }
}
