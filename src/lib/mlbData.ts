/**
 * MLB Elo game fixtures for comparison UI.
 *
 * Copyright (c) 2024 Neil Paine
 * Source: https://github.com/Neil-Paine-1/MLB-WAR-data-historical (MIT)
 */

import recentBundle from '@/data/mlb/games-recent.json'
import metaData from '@/data/mlb/meta.json'
import type { MlbEloGame, MlbIngestMeta } from './mlbTypes'

export const MLB_META = metaData as MlbIngestMeta

type RecentBundle = {
  attribution: string
  copyrightNotice: string
  note: string
  games: MlbEloGame[]
}

const BUNDLE = recentBundle as RecentBundle

export const MLB_RECENT_GAMES: MlbEloGame[] = BUNDLE.games
export const MLB_ATTRIBUTION = BUNDLE.attribution
export const MLB_COPYRIGHT = BUNDLE.copyrightNotice

export function listMlbSeasons(): number[] {
  const seasons = new Set(MLB_RECENT_GAMES.map((g) => g.season))
  return [...seasons].sort((a, b) => b - a)
}

/** Calendar month 1–12 for games in a season. */
export function listMlbMonths(season: number): number[] {
  const months = new Set(
    MLB_RECENT_GAMES.filter((g) => g.season === season).map((g) =>
      Number(g.date.slice(5, 7)),
    ),
  )
  return [...months].sort((a, b) => a - b)
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
  const freq =
    MLB_META.fetchStatus.lastRepoCommitDate != null
      ? `last file commit ${MLB_META.fetchStatus.lastRepoCommitDate}`
      : 'commit date unknown'
  return (
    `Seasonal via Neil-Paine-1/MLB-WAR-data-historical (MIT), ${freq}. ` +
    `${MLB_META.freshness.summary} Attribution: ${MLB_COPYRIGHT}.`
  )
}
