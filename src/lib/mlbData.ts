/**
 * MLB Elo game fixtures for comparison UI.
 *
 * Historical: Copyright (c) 2024 Neil Paine (MIT) — games-recent.json
 * Live 2026: Neil Paine seed + MLB Stats API backfill/roll — data/mlb/live/
 */

import recentBundle from '@/data/mlb/games-recent.json'
import metaData from '@/data/mlb/meta.json'
import liveMetaData from '@/data/mlb/live/meta.json'
import livePredictions from '@/data/mlb/live/predictions-upcoming.json'
import type { MlbEloGame, MlbIngestMeta } from './mlbTypes'
import type { MlbLivePrediction } from './mlbEloLive'

export const MLB_META = metaData as MlbIngestMeta

export const MLB_LIVE_META = liveMetaData as {
  attributionNeilPaine: string
  mlbStatsApi: string
  methodology: Record<string, unknown>
  seedAsOf: string
  backfill: { start: string; end: string; settledGameCount: number }
  live: {
    season: number
    ratingsAsOf: string
    settled2026Count: number
    upcomingCount: number
    generatedAt: string
  }
  honesty: string
}

type RecentBundle = {
  attribution: string
  copyrightNotice: string
  note: string
  games: MlbEloGame[]
}

type LivePredBundle = {
  generatedAt: string
  asOfDate: string
  games: MlbLivePrediction[]
}

const BUNDLE = recentBundle as RecentBundle
const LIVE_PRED = livePredictions as LivePredBundle

export const MLB_RECENT_GAMES: MlbEloGame[] = BUNDLE.games
export const MLB_LIVE_PREDICTIONS: MlbLivePrediction[] = LIVE_PRED.games
export const MLB_ATTRIBUTION = BUNDLE.attribution
export const MLB_COPYRIGHT = BUNDLE.copyrightNotice

export function listMlbSeasons(): number[] {
  const seasons = new Set<number>([
    ...MLB_RECENT_GAMES.map((g) => g.season),
    ...MLB_LIVE_PREDICTIONS.map((g) => g.season),
  ])
  return [...seasons].sort((a, b) => b - a)
}

/** Calendar month 1–12 for games in a season. */
export function listMlbMonths(season: number): number[] {
  if (season >= 2026) {
    const months = new Set(
      MLB_LIVE_PREDICTIONS.filter((g) => g.season === season).map((g) =>
        Number(g.date.slice(5, 7)),
      ),
    )
    return [...months].sort((a, b) => a - b)
  }
  const months = new Set(
    MLB_RECENT_GAMES.filter((g) => g.season === season).map((g) =>
      Number(g.date.slice(5, 7)),
    ),
  )
  return [...months].sort((a, b) => a - b)
}

export function getMlbLiveGamesForMonth(
  season: number,
  month: number,
): MlbLivePrediction[] {
  return MLB_LIVE_PREDICTIONS.filter(
    (g) => g.season === season && Number(g.date.slice(5, 7)) === month,
  ).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.firstPitchIso.localeCompare(b.firstPitchIso) ||
      a.gameSequenceInDay - b.gameSequenceInDay,
  )
}

export function getMlbLiveGameById(gameId: string): MlbLivePrediction | null {
  return MLB_LIVE_PREDICTIONS.find((g) => g.gameId === gameId) ?? null
}

export function getMlbGamesForMonth(
  season: number,
  month: number,
): MlbEloGame[] {
  return MLB_RECENT_GAMES.filter(
    (g) => g.season === season && Number(g.date.slice(5, 7)) === month,
  ).sort((a, b) => a.date.localeCompare(b.date) || a.gameId.localeCompare(b.gameId))
}

export function getMlbGameById(gameId: string): MlbEloGame | null {
  return MLB_RECENT_GAMES.find((g) => g.gameId === gameId) ?? null
}

export function mlbLiveDataStatus(): string {
  const live = MLB_LIVE_META.live
  return (
    `Live via MLB Stats API backfill + Neil Paine seed (MIT), ` +
    `ratings updated through ${live.ratingsAsOf} ` +
    `(${live.settled2026Count} settled 2026 games; ${live.upcomingCount} upcoming predictions). ` +
    `Neil Paine settled checkpoint ${MLB_LIVE_META.seedAsOf}; ` +
    `backfill ${MLB_LIVE_META.backfill.start}→${MLB_LIVE_META.backfill.end}. ` +
    `Attribution: ${MLB_COPYRIGHT}. ` +
    `MLB Stats API: individual non-commercial non-bulk use per MLBAM copyright notice.`
  )
}

export function hasGenuineLiveMlbPredictions(): boolean {
  return MLB_LIVE_PREDICTIONS.length > 0
}
