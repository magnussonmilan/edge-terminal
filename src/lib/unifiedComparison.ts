/**
 * Unified per-game view: model (raw + blended) vs traditional books +
 * Kalshi/Polymarket moneyline-equivalent prices.
 *
 * Primary comparison axis is win probability (moneyline-equivalent).
 * Spreads/totals are secondary and traditional-books-only.
 */

import { spreadToWinProb } from './backtest'
import {
  blendWithAdjustableWeight,
  blendWithMarket,
} from './marketBlend'
import {
  getCalibratedModelWeight,
  getPredictionById,
  getV3IndependentById,
} from './nflData'
import {
  americanImpliedProbability,
  multiplicativeDevig,
  type BookOdds,
  type BookTier,
} from './oddsAggregator'
import { formatAmericanOdds as formatOdds } from './odds'
import type { MatchedEventPair } from './eventMatcher'
import type { MarketPrice } from './marketPrice'
import { NFL_FULL_TO_ABBR } from './valueBets'
import type { GamePrediction } from './predictions'

export type VenueType = 'traditional_book' | 'prediction_market'

export interface VenueQuote {
  venue: string
  venueType: VenueType
  bookTier?: BookTier
  market: 'moneyline' | 'spread' | 'total'
  /** Universal comparison field — P(home wins) for moneyline rows. */
  impliedProbability: number
  americanOdds?: number
  spreadLine?: number
  totalLine?: number
  side?: string
  rawPrice: string
  resolutionVerified: boolean
  verificationNote?: string
  bookKey?: string
}

export interface UnifiedGameComparison {
  gameId: string
  matchup: string
  homeTeam: string
  awayTeam: string
  season: number
  week: number
  postedSpread: number | null
  calibratedWeight: number
  modelRaw: {
    moneylineProbability: number
    spread: number
  }
  modelBlended: {
    moneylineProbability: number
    spread: number
    weightUsed: number
    isCalibratedDefault: boolean
  }
  moneylineVenues: VenueQuote[]
  spreadVenues: VenueQuote[]
  totalVenues: VenueQuote[]
  /**
   * True when calibrated weight is low enough that blended ≈ market across
   * most of the slider — surface this in the UI so the control is not oversold.
   */
  blendTracksMarketClosely: boolean
}

export interface PredictionMarketSnapshot {
  pair: MatchedEventPair
  kalshi: MarketPrice | null
  polymarket: MarketPrice | null
}

export interface UnifiedComparisonExtras {
  bookOdds?: BookOdds[]
  predictionMarkets?: PredictionMarketSnapshot[]
}

const WEIGHT_EPS = 1e-9

function clampWeight(w: number): number {
  if (!Number.isFinite(w)) return 0
  return Math.max(0, Math.min(1, w))
}

/**
 * Recompute blended spread + moneyline for a slider move without rebuilding venues.
 */
export function recomputeBlendedModel(
  modelSpread: number,
  marketSpread: number,
  weight: number,
  calibratedWeight: number = getCalibratedModelWeight(),
): UnifiedGameComparison['modelBlended'] {
  const w = clampWeight(weight)
  const cal = clampWeight(calibratedWeight)
  const spread = blendWithAdjustableWeight(modelSpread, marketSpread, w)
  return {
    spread,
    moneylineProbability: spreadToWinProb(spread),
    weightUsed: w,
    isCalibratedDefault: Math.abs(w - cal) < WEIGHT_EPS,
  }
}

function teamsMatchAbbr(a: string, b: string): boolean {
  const na = a.trim().toUpperCase()
  const nb = b.trim().toUpperCase()
  if (na === nb) return true
  const fa = NFL_FULL_TO_ABBR[a.trim()]
  const fb = NFL_FULL_TO_ABBR[b.trim()]
  if (fa && fa === nb) return true
  if (fb && fb === na) return true
  if (fa && fb && fa === fb) return true
  return false
}

function bookOddsForGame(
  all: BookOdds[],
  homeTeam: string,
  awayTeam: string,
): BookOdds[] {
  return all.filter(
    (r) =>
      teamsMatchAbbr(r.homeTeam, homeTeam) &&
      teamsMatchAbbr(r.awayTeam, awayTeam),
  )
}

function pairsForGame(
  snaps: PredictionMarketSnapshot[],
  homeTeam: string,
  awayTeam: string,
): PredictionMarketSnapshot[] {
  return snaps.filter((s) => {
    const h = s.pair.homeTeam
    const a = s.pair.awayTeam
    if (!h || !a) return false
    return teamsMatchAbbr(h, homeTeam) && teamsMatchAbbr(a, awayTeam)
  })
}

function moneylineQuotesFromBooks(rows: BookOdds[]): VenueQuote[] {
  const byBook = new Map<string, BookOdds[]>()
  for (const r of rows.filter((x) => x.market === 'moneyline')) {
    const list = byBook.get(r.bookKey) ?? []
    list.push(r)
    byBook.set(r.bookKey, list)
  }
  const out: VenueQuote[] = []
  for (const [, list] of byBook) {
    const home = list.find((r) => teamsMatchAbbr(r.side, r.homeTeam))
    const away = list.find((r) => teamsMatchAbbr(r.side, r.awayTeam))
    if (!home || !away) continue
    const { fairA } = multiplicativeDevig(home.price, away.price)
    out.push({
      venue: home.book,
      venueType: 'traditional_book',
      bookTier: home.bookTier,
      bookKey: home.bookKey,
      market: 'moneyline',
      impliedProbability: fairA,
      americanOdds: home.price,
      rawPrice: formatOdds(home.price),
      resolutionVerified: true,
      side: home.homeTeam,
    })
  }
  return out.sort((a, b) => {
    if (a.bookTier !== b.bookTier) return a.bookTier === 'sharp' ? -1 : 1
    return a.venue.localeCompare(b.venue)
  })
}

function lineQuotesFromBooks(
  rows: BookOdds[],
  market: 'spread' | 'total',
): VenueQuote[] {
  const filtered = rows.filter((r) => r.market === market)
  const out: VenueQuote[] = []
  for (const r of filtered) {
    // Home side for spreads; over for totals as the listed quote
    if (market === 'spread' && !teamsMatchAbbr(r.side, r.homeTeam)) continue
    if (market === 'total' && r.side.toLowerCase() !== 'over') continue
    out.push({
      venue: r.book,
      venueType: 'traditional_book',
      bookTier: r.bookTier,
      bookKey: r.bookKey,
      market,
      impliedProbability: americanImpliedProbability(r.price),
      americanOdds: r.price,
      spreadLine: market === 'spread' ? r.line : undefined,
      totalLine: market === 'total' ? r.line : undefined,
      rawPrice:
        market === 'spread'
          ? `${r.line != null && r.line > 0 ? '+' : ''}${r.line ?? ''} (${formatOdds(r.price)})`
          : `O${r.line ?? ''} (${formatOdds(r.price)})`,
      resolutionVerified: true,
      side: r.side,
    })
  }
  return out.sort((a, b) => {
    if (a.bookTier !== b.bookTier) return a.bookTier === 'sharp' ? -1 : 1
    return a.venue.localeCompare(b.venue)
  })
}

/**
 * Convert a prediction-market snapshot into home-win implied quotes.
 * Unverified pairs are included with resolutionVerified: false — never omitted
 * and never treated as confirmed equivalent.
 */
export function predictionMarketToVenueQuotes(
  snap: PredictionMarketSnapshot,
): VenueQuote[] {
  const { pair, kalshi, polymarket } = snap
  const yesIsHome = pair.yesSide !== 'away'
  const out: VenueQuote[] = []

  if (kalshi) {
    const pYes = kalshi.yesPrice
    const pHome = yesIsHome ? pYes : 1 - pYes
    out.push({
      venue: 'Kalshi',
      venueType: 'prediction_market',
      market: 'moneyline',
      impliedProbability: pHome,
      rawPrice: `${(pYes * 100).toFixed(1)}¢ YES (${pair.polymarketAlignedOutcome})`,
      resolutionVerified: pair.verifiedEquivalent,
      verificationNote: pair.verificationNote,
    })
  }

  if (polymarket) {
    const pYes = polymarket.yesPrice
    const pHome = yesIsHome ? pYes : 1 - pYes
    out.push({
      venue: 'Polymarket',
      venueType: 'prediction_market',
      market: 'moneyline',
      impliedProbability: pHome,
      rawPrice: `${(pYes * 100).toFixed(1)}¢ ${pair.polymarketAlignedOutcome}`,
      resolutionVerified: pair.verifiedEquivalent,
      verificationNote: pair.verificationNote,
    })
  }

  // Still surface the pair when prices failed to load — verification flag visible
  if (!kalshi && !polymarket) {
    out.push({
      venue: `Kalshi/Polymarket (${pair.description})`,
      venueType: 'prediction_market',
      market: 'moneyline',
      impliedProbability: Number.NaN,
      rawPrice: 'price unavailable',
      resolutionVerified: pair.verifiedEquivalent,
      verificationNote: pair.verificationNote,
    })
  }

  return out
}

function resolvePrediction(gameId: string): GamePrediction | null {
  return getV3IndependentById(gameId) ?? getPredictionById(gameId)
}

function resolveModelSpread(pred: GamePrediction): number {
  const maybe = pred as GamePrediction & { independentSpread?: number }
  if (typeof maybe.independentSpread === 'number') {
    return maybe.independentSpread
  }
  return pred.modelSpread
}

/**
 * Gather one game's model + venue quotes into a normalized comparison.
 * weightOverride omitted → calibrated weight from calibrated-v3.json.
 */
export function buildUnifiedComparison(
  gameId: string,
  weightOverride?: number,
  extras: UnifiedComparisonExtras = {},
): UnifiedGameComparison | null {
  const pred = resolvePrediction(gameId)
  if (!pred) return null

  const calibratedWeight = clampWeight(getCalibratedModelWeight())
  const weightUsed =
    weightOverride == null
      ? calibratedWeight
      : clampWeight(weightOverride)

  const modelSpread = resolveModelSpread(pred)
  const marketSpread = pred.postedSpread
  if (marketSpread == null) {
    // Still return a shell with raw model only — blend needs a market line
    const rawProb = spreadToWinProb(modelSpread)
    return {
      gameId: pred.gameId,
      matchup: `${pred.awayTeam} @ ${pred.homeTeam}`,
      homeTeam: pred.homeTeam,
      awayTeam: pred.awayTeam,
      season: pred.season,
      week: pred.week,
      postedSpread: null,
      calibratedWeight,
      modelRaw: { moneylineProbability: rawProb, spread: modelSpread },
      modelBlended: {
        moneylineProbability: rawProb,
        spread: modelSpread,
        weightUsed: 1,
        isCalibratedDefault: false,
      },
      moneylineVenues: [],
      spreadVenues: [],
      totalVenues: [],
      blendTracksMarketClosely: calibratedWeight <= 0.25,
    }
  }

  const blended = recomputeBlendedModel(
    modelSpread,
    marketSpread,
    weightUsed,
    calibratedWeight,
  )

  const scopedBooks = bookOddsForGame(
    extras.bookOdds ?? [],
    pred.homeTeam,
    pred.awayTeam,
  )
  const moneylineVenues = [
    ...moneylineQuotesFromBooks(scopedBooks),
    ...pairsForGame(extras.predictionMarkets ?? [], pred.homeTeam, pred.awayTeam)
      .flatMap(predictionMarketToVenueQuotes),
  ]

  return {
    gameId: pred.gameId,
    matchup: `${pred.awayTeam} @ ${pred.homeTeam}`,
    homeTeam: pred.homeTeam,
    awayTeam: pred.awayTeam,
    season: pred.season,
    week: pred.week,
    postedSpread: marketSpread,
    calibratedWeight,
    modelRaw: {
      moneylineProbability: spreadToWinProb(modelSpread),
      spread: modelSpread,
    },
    modelBlended: blended,
    moneylineVenues,
    spreadVenues: lineQuotesFromBooks(scopedBooks, 'spread'),
    totalVenues: lineQuotesFromBooks(scopedBooks, 'total'),
    blendTracksMarketClosely: calibratedWeight <= 0.25,
  }
}

/** Apply a new slider weight to an existing comparison (venues unchanged). */
export function withBlendWeight(
  comparison: UnifiedGameComparison,
  weight: number,
): UnifiedGameComparison {
  if (comparison.postedSpread == null) return comparison
  return {
    ...comparison,
    modelBlended: recomputeBlendedModel(
      comparison.modelRaw.spread,
      comparison.postedSpread,
      weight,
      comparison.calibratedWeight,
    ),
  }
}

// Re-export helpers tests may want
export { blendWithMarket, blendWithAdjustableWeight }
