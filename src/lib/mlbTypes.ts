/**
 * MLB Elo types — Neil Paine historical feed (MIT).
 *
 * Copyright (c) 2024 Neil Paine
 * Source: https://github.com/Neil-Paine-1/MLB-WAR-data-historical
 * License: MIT (LICENSE.txt in that repo) — retain this copyright notice
 * wherever the software/data is redistributed.
 *
 * Prior 538/ABC CC BY feed was frozen (settled ~2023-06-20) and is no longer
 * the ingest source. Verification math still applies to Elo probs in this file.
 */

export interface MlbEloGame {
  gameId: string
  date: string
  season: number
  neutral: boolean
  playoff: string | null
  /** Home team abbreviation (is_home=1 row; team1 is home perspective). */
  homeTeam: string
  awayTeam: string
  homeFranchiseId: string
  awayFranchiseId: string
  elo1Pre: number
  elo2Pre: number
  eloProb1: number
  eloProb2: number
  elo1Post: number | null
  elo2Post: number | null
  /** Pitcher-adjusted "rating" system — not present in Neil Paine CSV. */
  rating1Pre: number | null
  rating2Pre: number | null
  pitcher1: string | null
  pitcher2: string | null
  pitcher1Rgs: number | null
  pitcher2Rgs: number | null
  pitcher1Adj: number | null
  pitcher2Adj: number | null
  ratingProb1: number | null
  ratingProb2: number | null
  rating1Post: number | null
  rating2Post: number | null
  score1: number | null
  score2: number | null
}

export interface MlbIngestMeta {
  attribution: string
  copyrightNotice: string
  license: string
  licenseUrl: string
  sourceReadme: string
  canonicalUrls: string[]
  fetchStatus: {
    officialLive: boolean
    officialNote: string
    resolvedSource: string
    archiveTimestamp: string | null
    lastRepoCommitDate: string | null
  }
  freshness: {
    status: 'live' | 'frozen' | 'seasonal'
    summary: string
    minDate: string
    maxDate: string
    maxSeason: number
    maxSettledDate: string | null
    settledGameCount: number
    unsettledGameCount: number
  }
  generatedAt: string
  gameCount: number
}
