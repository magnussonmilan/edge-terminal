import type { CorrelationResult, PropType } from '@/lib/correlation'

/** Display stack — CorrelationResult plus chart lookback + cross-model context. */
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
  /** Cross-model: most recent shared game has prediction stars ≥ 2.0 */
  highConfidenceGame: boolean
  gameStars: number
}

export type StackWithGameContext = Stack

export type { CorrelationResult, PropType }
