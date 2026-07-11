/**
 * Pure price comparison — same side of the same bet, which book pays more.
 * No prediction, no edge claim. The only "risk" here is a book not
 * actually honoring the displayed price (line movement, limits) — note
 * this plainly in the UI, don't imply it's risk-free.
 */

import {
  americanImpliedProbability,
  isBetterAmericanPrice,
  type BookOdds,
  type GameMarket,
} from './oddsAggregator'

export interface BestPriceResult {
  book: string
  bookKey: string
  bookTier: BookOdds['bookTier']
  price: number
  impliedProbability: number
  line?: number
  /** All matching quotes sorted best → worst (for UI comparison). */
  allQuotes: BookOdds[]
}

function marketMatches(row: BookOdds, market: string): boolean {
  return row.market === market
}

function sideMatches(row: BookOdds, side: string): boolean {
  return row.side.toLowerCase() === side.toLowerCase()
}

function lineMatches(row: BookOdds, line: number | undefined): boolean {
  if (line == null) return true
  if (row.line == null) return false
  return Math.abs(row.line - line) < 1e-9
}

/**
 * Best American price across books for one market/side (and optional line).
 * Higher decimal payout wins; ties keep the first-seen book.
 */
export function bestPriceForSide(
  allBooks: BookOdds[],
  market: string,
  side: string,
  line?: number,
): BestPriceResult | null {
  const matches = allBooks.filter(
    (r) =>
      marketMatches(r, market) &&
      sideMatches(r, side) &&
      lineMatches(r, line),
  )
  if (matches.length === 0) return null

  const sorted = [...matches].sort((a, b) =>
    isBetterAmericanPrice(a.price, b.price)
      ? -1
      : isBetterAmericanPrice(b.price, a.price)
        ? 1
        : 0,
  )
  const best = sorted[0]!
  return {
    book: best.book,
    bookKey: best.bookKey,
    bookTier: best.bookTier,
    price: best.price,
    impliedProbability: americanImpliedProbability(best.price),
    line: best.line,
    allQuotes: sorted,
  }
}

export interface LineShopGroup {
  eventId: string
  matchup: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  market: GameMarket
  side: string
  line?: number
  best: BestPriceResult
}

/**
 * Build comparison rows for every distinct (event, market, side, line) tuple.
 */
export function buildLineShoppingGroups(allBooks: BookOdds[]): LineShopGroup[] {
  const keys = new Map<string, BookOdds>()
  for (const row of allBooks) {
    const k = [
      row.eventId,
      row.market,
      row.side.toLowerCase(),
      row.line ?? '',
    ].join('|')
    // Keep one representative; bestPriceForSide filters the full list
    if (!keys.has(k)) keys.set(k, row)
  }

  const groups: LineShopGroup[] = []
  for (const rep of keys.values()) {
    const scoped = allBooks.filter((r) => r.eventId === rep.eventId)
    const best = bestPriceForSide(
      scoped,
      rep.market,
      rep.side,
      rep.line,
    )
    if (!best) continue
    groups.push({
      eventId: rep.eventId,
      matchup: `${rep.awayTeam} @ ${rep.homeTeam}`,
      homeTeam: rep.homeTeam,
      awayTeam: rep.awayTeam,
      commenceTime: rep.commenceTime,
      market: rep.market,
      side: rep.side,
      line: rep.line,
      best,
    })
  }

  return groups.sort((a, b) => {
    const byGame = a.matchup.localeCompare(b.matchup)
    if (byGame !== 0) return byGame
    const byMarket = a.market.localeCompare(b.market)
    if (byMarket !== 0) return byMarket
    return a.side.localeCompare(b.side)
  })
}
