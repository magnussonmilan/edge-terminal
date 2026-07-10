import type { CorrelationResult, PropType } from '@/lib/correlation'

/** Display stack — CorrelationResult plus chart lookback metadata from ingest. */
export interface Stack {
  pairKey: string
  playerA: {
    name: string
    propType: PropType
    playerId: string
    team: string
  }
  playerB: {
    name: string
    propType: PropType
    playerId: string
    team: string
  }
  correlation: number
  sampleSize: number
  tier: 'high' | 'medium' | 'low'
  jointHitRate: {
    hitsTogether: number
    totalGames: number
    rate: number
  }
  /** Illustrative line = series average — not a live pick'em number. */
  lineA: number
  lineB: number
  seriesA: number[]
  seriesB: number[]
  gameIds: string[]
  lookbackGames: number
  chartGames: number
}

export type { CorrelationResult, PropType }
