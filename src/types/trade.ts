export type Sport = 'nfl' | 'nba' | 'mlb' | 'nhl'
export type BetType = 'moneyline' | 'spread' | 'prop' | 'total'
export type TradeStatus = 'active' | 'expired' | 'settled'
export type UserAction = 'ignored' | 'placed' | 'watchlisted'
export type UserTier = 'free' | 'premium'

export interface HistoricalGame {
  date: string
  value: number
  actualOutcome: number
}

export interface BookOdds {
  currentOdds: number
  spread: number
  lastUpdated: Date
  available: boolean
}

/** Optional placement record — used for portfolio derivation + receipt UI. */
export interface TradePlacement {
  bookName: string
  odds: number
  stake: number
  placedAt: Date
  /** Present when status is settled; open/active placements omit this. */
  result?: 'won' | 'lost'
}

export interface Trade {
  id: string
  sport: Sport
  eventId: string
  betType: BetType
  matchup: { home: string; away: string }
  proposition: string

  fairValueProbability: number
  bookImpliedProbability: number
  edgePercentage: number
  confidence: number
  rationale: string

  historicalData: {
    last10Games: HistoricalGame[]
    average: number
    trend: number
    consistency: number
  }

  books: {
    [bookName: string]: BookOdds
  }

  createdAt: Date
  expiresAt: Date
  status: TradeStatus
  userAction: UserAction
  /** Set when the user places (or mock history includes) a bet. */
  placement?: TradePlacement
  /** Best home spread among returned books (live odds feed). */
  bestLineHome?: { bookmaker: string; point: number; price: number }
  /** Best away spread among returned books (live odds feed). */
  bestLineAway?: { bookmaker: string; point: number; price: number }
}

export interface UserPortfolio {
  userId: string
  activeBankroll: number
  totalRisked: number
  totalWins: number
  totalLosses: number
  /** (totalWins - totalRisked) / totalRisked — 0 when nothing risked. */
  roi: number
  yieldByBetType: {
    [betType in BetType]?: {
      betsPlaced: number
      roi: number
      winRate: number
    }
  }
  winStreak: number
  lossStreak: number
  lastUpdated: Date
}

export interface ShockEvent {
  id: string
  event: string
  prop: string
  fromProbability: number
  toProbability: number
  delta: number
  tradeId?: string
}

export interface MockUser {
  id: string
  email: string
  tier: UserTier
}

export interface TradeFilters {
  sport: Sport | 'all'
  betType: BetType | 'all'
  userAction: UserAction | 'all'
  /** Premium-only chart context filters (gated in UI). */
  chartContext: 'all' | 'home' | 'away' | 'matchup'
}
