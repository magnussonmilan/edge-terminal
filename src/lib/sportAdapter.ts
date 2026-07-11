/**
 * Sport adapter — shared comparison surface for NFL and MLB.
 * NFL wraps existing nflData behavior unchanged; MLB uses Neil Paine Elo.
 */

import type { MatchedEventPair } from './eventMatcher'
import { mlbSportAdapter } from './sportAdapters/mlbAdapter'
import { nflSportAdapter } from './sportAdapters/nflAdapter'

export type SportId = 'nfl' | 'mlb'

export interface SportGameOption {
  gameId: string
  matchup: string
  homeTeam: string
  awayTeam: string
  season: number
  /** NFL week; MLB uses calendar month (1–12) as the group key. */
  week: number
  date?: string
  /** Model P(home wins) — primary cross-venue axis. */
  modelHomeWinProb: number
  /** Point-spread style edge when available (NFL); null for MLB Elo-only. */
  modelSpread: number | null
  postedSpread: number | null
}

export interface SportAdapter {
  sport: SportId
  label: string
  hasLivePredictions: boolean
  liveDataStatus: string
  copyrightNotice: string | null
  listSeasons(): number[]
  listGroups(season: number): number[]
  groupLabel(group: number): string
  getGamesForComparison(season: number, group: number): SportGameOption[]
  getGame(gameId: string): SportGameOption | null
  listPredictionMarketPairs(): MatchedEventPair[]
  /** Default blend weight for UI (NFL calibrated; MLB = 1 pure model). */
  defaultBlendWeight(): number
  supportsMarketBlend: boolean
}

export function getSportAdapter(sport: SportId): SportAdapter {
  return sport === 'mlb' ? mlbSportAdapter : nflSportAdapter
}

export function parseSportId(raw: string | null | undefined): SportId {
  return raw === 'mlb' ? 'mlb' : 'nfl'
}
