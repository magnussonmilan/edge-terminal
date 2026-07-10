export interface StackLeg {
  player: string
  prop: string
  bookImplied: number
  fairValue: number
}

export interface PropStack {
  id: string
  gameId: string
  season: number
  week: number
  matchup: string
  legs: StackLeg[]
  correlation: number
  combinedEdge: number
  /** Cross-model tie-in: game also has a high-confidence power-rating signal. */
  highConfidenceGame: boolean
  gameStars: number
}
