/**
 * MLB Elo types for FiveThirtyEight / ABC News game-by-game forecasts.
 *
 * Attribution (CC BY 4.0 — required wherever this data or derivatives appear):
 * Data by FiveThirtyEight/ABC News.
 * Source tree: https://github.com/fivethirtyeight/data/tree/master/mlb-elo
 * License: https://github.com/fivethirtyeight/data/blob/master/LICENSE
 *
 * Using this material does not imply FiveThirtyEight or ABC News sponsors,
 * endorses, or is affiliated with Edge Terminal (CC BY 4.0 §2(a)(6)).
 */

export interface MlbEloGame {
  gameId: string
  date: string
  season: number
  neutral: boolean
  playoff: string | null
  /** Home team abbreviation as in the 538 file (franchise-continuous). */
  homeTeam: string
  /** Away team abbreviation as in the 538 file. */
  awayTeam: string
  /** Stable franchise IDs after relocation/rename mapping. */
  homeFranchiseId: string
  awayFranchiseId: string
  elo1Pre: number
  elo2Pre: number
  eloProb1: number
  eloProb2: number
  elo1Post: number | null
  elo2Post: number | null
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
  license: string
  licenseUrl: string
  sourceReadme: string
  canonicalUrls: string[]
  fetchStatus: {
    officialLive: boolean
    officialNote: string
    resolvedSource: string
    archiveTimestamp: string | null
  }
  /** Plain-language freshness finding. */
  freshness: {
    status: 'live' | 'frozen'
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
