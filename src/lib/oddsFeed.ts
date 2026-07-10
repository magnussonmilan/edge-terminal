/**
 * The Odds API client (the-odds-api.com).
 *
 * Pricing note (check https://the-odds-api.com/ before assuming costs — plans change):
 * - Free tier: ~500 credits/month; featured markets (h2h/spreads/totals) are available
 *   on current plans including free, but credit burn is markets × regions per call.
 * - This module requests regions=us & markets=spreads only → 1 credit per poll.
 * - Store ODDS_API_KEY in env / GitHub Actions secrets — never commit the key.
 */

import type { BookOdds, Trade } from '@/types/trade'

export interface OddsSnapshot {
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

export interface BestLine {
  bookmaker: string
  side: 'home' | 'away'
  point: number
  price: number
}

function getOddsApiKey(): string | undefined {
  // Node ingest scripts (avoid referencing process in the Vite browser bundle)
  const nodeProcess = (globalThis as { process?: { env?: Record<string, string> } })
    .process
  if (nodeProcess?.env?.ODDS_API_KEY) {
    return nodeProcess.env.ODDS_API_KEY
  }
  // Vite client (optional local live mode)
  try {
    const viteKey = import.meta.env?.VITE_ODDS_API_KEY as string | undefined
    if (viteKey) return viteKey
  } catch {
    /* not in Vite */
  }
  return undefined
}

export function isOddsApiConfigured(): boolean {
  return Boolean(getOddsApiKey())
}

/**
 * Fetch NFL spreads from The Odds API.
 * Fails loudly if the key is missing or the HTTP response is not OK.
 */
export async function fetchNflOdds(): Promise<OddsSnapshot[]> {
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
  url.searchParams.set('regions', 'us')
  url.searchParams.set('markets', 'spreads')
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
    bookmakers: OddsSnapshot['bookmakers']
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

/** Most favorable home spread point (higher = better for home bettor). */
export function bestHomeSpread(snapshot: OddsSnapshot): BestLine | null {
  let best: BestLine | null = null
  for (const book of snapshot.bookmakers) {
    const market = book.markets.find((m) => m.key === 'spreads')
    if (!market) continue
    const home = market.outcomes.find((o) => o.name === snapshot.homeTeam)
    if (home?.point == null) continue
    if (!best || home.point > best.point) {
      best = {
        bookmaker: book.title,
        side: 'home',
        point: home.point,
        price: home.price,
      }
    }
  }
  return best
}

/** Most favorable away spread point (higher away point = better for away). */
export function bestAwaySpread(snapshot: OddsSnapshot): BestLine | null {
  let best: BestLine | null = null
  for (const book of snapshot.bookmakers) {
    const market = book.markets.find((m) => m.key === 'spreads')
    if (!market) continue
    const away = market.outcomes.find((o) => o.name === snapshot.awayTeam)
    if (away?.point == null) continue
    if (!best || away.point > best.point) {
      best = {
        bookmaker: book.title,
        side: 'away',
        point: away.point,
        price: away.price,
      }
    }
  }
  return best
}

function americanToImplied(price: number): number {
  if (price < 0) return -price / (-price + 100)
  return 100 / (price + 100)
}

/**
 * Normalize Odds API snapshots into the Trade shape used by the feed.
 * Edge/fair-value are placeholders until live model lines are joined —
 * books + best-line badge are the live signal in this pass.
 */
export function oddsSnapshotsToTrades(snapshots: OddsSnapshot[]): Trade[] {
  const now = new Date()
  return snapshots.map((snap) => {
    const books: Trade['books'] = {}
    for (const book of snap.bookmakers) {
      const market = book.markets.find((m) => m.key === 'spreads')
      const home = market?.outcomes.find((o) => o.name === snap.homeTeam)
      if (!home || home.point == null) continue
      books[book.title] = {
        currentOdds: home.price,
        spread: home.point,
        lastUpdated: new Date(book.lastUpdate || now),
        available: true,
      } satisfies BookOdds
    }

    const bookEntries = Object.entries(books)
    const primary = bookEntries[0]?.[1]
    const bestHome = bestHomeSpread(snap)
    const bestAway = bestAwaySpread(snap)

    const bookImplied = primary
      ? americanToImplied(primary.currentOdds)
      : 0.5

    return {
      id: `odds-${snap.id}`,
      sport: 'nfl',
      eventId: snap.id,
      betType: 'spread',
      matchup: { home: snap.homeTeam, away: snap.awayTeam },
      proposition: `${snap.awayTeam} @ ${snap.homeTeam} (spread)`,
      fairValueProbability: bookImplied,
      bookImpliedProbability: bookImplied,
      edgePercentage: 0,
      confidence: 0.5,
      rationale:
        'Live NFL spreads from The Odds API. Fair-value/edge placeholders until model lines are joined — compare books via the best-line badge.',
      historicalData: {
        last10Games: [],
        average: primary?.spread ?? 0,
        trend: 0,
        consistency: 0,
      },
      books,
      createdAt: now,
      expiresAt: new Date(snap.commenceTime),
      status: 'active',
      userAction: 'ignored',
      bestLineHome: bestHome
        ? {
            bookmaker: bestHome.bookmaker,
            point: bestHome.point,
            price: bestHome.price,
          }
        : undefined,
      bestLineAway: bestAway
        ? {
            bookmaker: bestAway.bookmaker,
            point: bestAway.point,
            price: bestAway.price,
          }
        : undefined,
    }
  })
}
