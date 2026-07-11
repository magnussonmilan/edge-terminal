/**
 * Multi-book NFL game-line odds via The Odds API (the-odds-api.com).
 *
 * Provider / ToS (checked against https://the-odds-api.com/terms-and-conditions.html):
 * - Licensed commercial odds aggregation for apps/dashboards is an intended use.
 * - Do not resell/repackage the raw feed as a standalone data product.
 * - Distinct from pick'em scraping: this is a normal paid API with public book
 *   odds, not a prohibited scrape of PrizePicks-style products.
 *
 * Pricing (verify on the-odds-api.com — plans change): free ~500 credits/mo;
 * cost ≈ markets × regions (or × ceil(bookmakers/10)). This module requests
 * h2h+spreads+totals for a fixed bookmaker list (~10 keys → 1 region-equivalent)
 * → ~3 credits per poll.
 *
 * Book tier classification (documented — not silent guesses):
 *
 * Sharp (line-setting / reduced-juice references available in this API):
 * - pinnacle — industry sharp reference; Odds API lists under region `eu`
 *   (docs note public-site delay). Circa Sports is the usual US sharp
 *   reference but is NOT in The Odds API bookmaker catalog as of 2026-07 —
 *   we cannot fetch or classify what the API does not offer.
 * - lowvig — LowVig.ag; reduced juice, typically tracks sharp numbers.
 * - betonlineag — offshore that market-structure writing often groups with
 *   sharper books vs retail US sportsbooks.
 *
 * Soft (recreational / retail / regional — slower movers relative to sharps):
 * DraftKings, FanDuel, BetMGM, BetRivers, Caesars, Fanatics, Hard Rock,
 * theScore/ESPN Bet, Fliff, Bovada, MyBookie, BetUS, Bally Bet, etc.
 *
 * Unknown bookmaker keys default to soft: over-calling soft is safer for UI
 * framing than falsely tagging a book as sharp.
 */

import { americanToDecimal } from './odds'

export type BookTier = 'sharp' | 'soft'
export type GameMarket = 'moneyline' | 'spread' | 'total'

/**
 * Normalized per-outcome odds row for line shopping / value detection.
 * Name matches the feature spec; distinct from `BookOdds` in types/trade.ts
 * (feed Trade.books shape).
 */
export interface BookOdds {
  book: string
  bookTier: BookTier
  market: GameMarket
  side: string
  price: number
  line?: number
  lastUpdated: Date
  /** Extra join keys for UI grouping (not in the minimal spec shape). */
  bookKey: string
  eventId: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
}

export interface AggregatedEvent {
  id: string
  sportKey: string
  commenceTime: string
  homeTeam: string
  awayTeam: string
  bookmakers: Array<{
    key: string
    title: string
    lastUpdate: string
    markets: Array<{
      key: string
      outcomes: Array<{ name: string; price: number; point?: number }>
    }>
  }>
}

/** Odds API keys treated as sharp for this product. */
export const SHARP_BOOK_KEYS = new Set([
  'pinnacle',
  'lowvig',
  'betonlineag',
])

/**
 * Bookmakers requested for game lines. Kept ≤10 so markets×1-region-eq ≈ 3 credits.
 * Includes Pinnacle (eu) + US retail/offshore mix.
 */
export const DEFAULT_GAME_LINE_BOOKMAKERS = [
  'pinnacle',
  'lowvig',
  'betonlineag',
  'draftkings',
  'fanduel',
  'betmgm',
  'betrivers',
  'bovada',
  'williamhill_us',
  'espnbet',
] as const

const MARKET_KEY_TO_GAME: Record<string, GameMarket> = {
  h2h: 'moneyline',
  spreads: 'spread',
  totals: 'total',
}

function getOddsApiKey(): string | undefined {
  const nodeProcess = (globalThis as { process?: { env?: Record<string, string> } })
    .process
  if (nodeProcess?.env?.ODDS_API_KEY) {
    return nodeProcess.env.ODDS_API_KEY
  }
  try {
    const viteKey = import.meta.env?.VITE_ODDS_API_KEY as string | undefined
    if (viteKey) return viteKey
  } catch {
    /* not in Vite */
  }
  return undefined
}

export function isOddsAggregatorConfigured(): boolean {
  return Boolean(getOddsApiKey())
}

export function classifyBookTier(bookKey: string): BookTier {
  return SHARP_BOOK_KEYS.has(bookKey.toLowerCase()) ? 'sharp' : 'soft'
}

/** Raw American → implied probability (includes vig share). */
export function americanImpliedProbability(price: number): number {
  if (price < 0) return -price / (-price + 100)
  return 100 / (price + 100)
}

/**
 * Multiplicative (proportional) de-vig for a two-way market.
 * Returns fair probabilities that sum to 1.
 */
export function multiplicativeDevig(
  priceA: number,
  priceB: number,
): { fairA: number; fairB: number } {
  const rawA = americanImpliedProbability(priceA)
  const rawB = americanImpliedProbability(priceB)
  const sum = rawA + rawB
  if (sum <= 0) return { fairA: 0.5, fairB: 0.5 }
  return { fairA: rawA / sum, fairB: rawB / sum }
}

/**
 * Fetch NFL moneyline / spread / total odds from The Odds API.
 * Fails loudly if the key is missing or the HTTP response is not OK.
 */
export async function fetchNflGameLineOdds(
  bookmakers: readonly string[] = DEFAULT_GAME_LINE_BOOKMAKERS,
): Promise<AggregatedEvent[]> {
  const apiKey = getOddsApiKey()
  if (!apiKey) {
    throw new Error(
      'ODDS_API_KEY is unset — refuse to fetch live odds (no silent mock fallback when a key was expected)',
    )
  }

  const url = new URL(
    'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds',
  )
  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('bookmakers', bookmakers.join(','))
  url.searchParams.set('markets', 'h2h,spreads,totals')
  url.searchParams.set('oddsFormat', 'american')

  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `The Odds API error ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    )
  }

  const data = (await res.json()) as Array<{
    id: string
    sport_key: string
    commence_time: string
    home_team: string
    away_team: string
    bookmakers: AggregatedEvent['bookmakers']
  }>

  if (!Array.isArray(data)) {
    throw new Error('The Odds API returned a non-array payload')
  }

  return data.map((g) => ({
    id: g.id,
    sportKey: g.sport_key,
    commenceTime: g.commence_time,
    homeTeam: g.home_team,
    awayTeam: g.away_team,
    bookmakers: g.bookmakers ?? [],
  }))
}

/** Flatten API events into per-outcome BookOdds rows. */
export function eventsToBookOdds(events: AggregatedEvent[]): BookOdds[] {
  const rows: BookOdds[] = []
  for (const event of events) {
    for (const book of event.bookmakers) {
      const tier = classifyBookTier(book.key)
      const lastUpdated = new Date(book.lastUpdate || Date.now())
      for (const market of book.markets) {
        const gameMarket = MARKET_KEY_TO_GAME[market.key]
        if (!gameMarket) continue
        for (const outcome of market.outcomes) {
          if (!Number.isFinite(outcome.price)) continue
          const side =
            gameMarket === 'total'
              ? outcome.name.toLowerCase() === 'over'
                ? 'over'
                : outcome.name.toLowerCase() === 'under'
                  ? 'under'
                  : outcome.name
              : outcome.name

          rows.push({
            book: book.title || book.key,
            bookKey: book.key,
            bookTier: tier,
            market: gameMarket,
            side,
            price: outcome.price,
            line: outcome.point,
            lastUpdated,
            eventId: event.id,
            homeTeam: event.homeTeam,
            awayTeam: event.awayTeam,
            commenceTime: event.commenceTime,
          })
        }
      }
    }
  }
  return rows
}

/** Same bet side: better American price = higher decimal payout. */
export function isBetterAmericanPrice(a: number, b: number): boolean {
  return americanToDecimal(a) > americanToDecimal(b)
}

/** Demo fixture for off-season / no-key UI — labeled as sample in the page. */
export const DEMO_GAME_LINE_EVENTS: AggregatedEvent[] = [
  {
    id: 'demo-kc-lv',
    sportKey: 'americanfootball_nfl',
    commenceTime: '2026-09-13T17:00:00Z',
    homeTeam: 'Kansas City Chiefs',
    awayTeam: 'Las Vegas Raiders',
    bookmakers: [
      {
        key: 'pinnacle',
        title: 'Pinnacle',
        lastUpdate: '2026-09-12T12:00:00Z',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -280 },
              { name: 'Las Vegas Raiders', price: 240 },
            ],
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -110, point: -7 },
              { name: 'Las Vegas Raiders', price: -110, point: 7 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: -110, point: 44.5 },
              { name: 'Under', price: -110, point: 44.5 },
            ],
          },
        ],
      },
      {
        key: 'draftkings',
        title: 'DraftKings',
        lastUpdate: '2026-09-12T12:02:00Z',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -265 },
              { name: 'Las Vegas Raiders', price: 220 },
            ],
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -115, point: -7 },
              { name: 'Las Vegas Raiders', price: -105, point: 7 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: -105, point: 44.5 },
              { name: 'Under', price: -115, point: 44.5 },
            ],
          },
        ],
      },
      {
        key: 'fanduel',
        title: 'FanDuel',
        lastUpdate: '2026-09-12T11:50:00Z',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -270 },
              { name: 'Las Vegas Raiders', price: 225 },
            ],
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -108, point: -7 },
              { name: 'Las Vegas Raiders', price: -112, point: 7 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: -110, point: 44.5 },
              { name: 'Under', price: -110, point: 44.5 },
            ],
          },
        ],
      },
      {
        key: 'betmgm',
        title: 'BetMGM',
        lastUpdate: '2026-09-12T11:40:00Z',
        markets: [
          {
            key: 'h2h',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -250 },
              { name: 'Las Vegas Raiders', price: 200 },
            ],
          },
          {
            key: 'spreads',
            outcomes: [
              { name: 'Kansas City Chiefs', price: -120, point: -6.5 },
              { name: 'Las Vegas Raiders', price: 100, point: 6.5 },
            ],
          },
          {
            key: 'totals',
            outcomes: [
              { name: 'Over', price: -102, point: 45 },
              { name: 'Under', price: -118, point: 45 },
            ],
          },
        ],
      },
    ],
  },
]
