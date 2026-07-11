/**
 * Read-only Polymarket client (Gamma discovery + CLOB prices).
 *
 * Docs checked 2026-07-10:
 * - Gamma: https://gamma-api.polymarket.com (public, no auth)
 * - CLOB: https://clob.polymarket.com (public book/price reads; trading needs auth)
 * - Fees (docs.polymarket.com/trading/fees): sports taker
 *   fee = C × 0.05 × p × (1 − p), rounded to 5 decimal places; makers free
 * - Geopolitics fee-free; NFL moneylines use sports schedule (feeType sports_fees_v2)
 *
 * No order-placement endpoints are called here.
 */

import {
  parseDollarProb,
  type MarketPrice,
} from './marketPrice'

export const POLYMARKET_GAMMA_BASE =
  typeof window !== 'undefined'
    ? '/api/polymarket-gamma'
    : 'https://gamma-api.polymarket.com'

export const POLYMARKET_CLOB_BASE =
  typeof window !== 'undefined'
    ? '/api/polymarket-clob'
    : 'https://clob.polymarket.com'

/** Sports category taker fee rate from Polymarket fee docs. */
export const POLYMARKET_SPORTS_TAKER_FEE_RATE = 0.05

/**
 * Polymarket taker fee in USDC for C shares at price p.
 * fee = C × feeRate × p × (1 − p), rounded to 5 decimal places.
 */
export function polymarketTakerFeeDollars(
  contracts: number,
  price: number,
  feeRate: number = POLYMARKET_SPORTS_TAKER_FEE_RATE,
): number {
  const C = Math.max(0, contracts)
  const p = Math.max(0, Math.min(1, price))
  const raw = C * feeRate * p * (1 - p)
  // Round to 5 decimal places (docs: smallest fee 0.00001 USDC)
  return Math.round(raw * 1e5) / 1e5
}

function parseJsonArray<T>(raw: string | T[] | undefined | null): T[] {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

interface GammaMarket {
  conditionId?: string
  question?: string
  description?: string
  resolutionSource?: string
  outcomes?: string | string[]
  outcomePrices?: string | string[]
  clobTokenIds?: string | string[]
  feesEnabled?: boolean
  feeType?: string
  feeSchedule?: { rate?: number; exponent?: number; takerOnly?: boolean }
  updatedAt?: string
  active?: boolean
  closed?: boolean
}

async function gammaGet<T>(path: string): Promise<T> {
  const url = `${POLYMARKET_GAMMA_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Polymarket Gamma GET ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

async function clobGet<T>(path: string): Promise<T> {
  const url = `${POLYMARKET_CLOB_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url)
  if (res.status === 429) {
    throw new Error('Polymarket CLOB rate limited (429) — back off and retry')
  }
  if (!res.ok) throw new Error(`Polymarket CLOB GET ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

interface ClobBookLevel {
  price: string
  size: string
}

interface ClobBook {
  bids?: ClobBookLevel[]
  asks?: ClobBookLevel[]
}

/** Best ask (lowest sell) — price a taker pays to buy. */
export function bestAskFromBook(book: ClobBook): {
  price: number
  size: number
} | null {
  const asks = book.asks ?? []
  if (!asks.length) return null
  let best: { price: number; size: number } | null = null
  for (const level of asks) {
    const price = parseDollarProb(level.price)
    const size = Number(level.size)
    if (price == null || !Number.isFinite(size)) continue
    if (!best || price < best.price) best = { price, size }
  }
  return best
}

async function fetchTokenAsk(tokenId: string): Promise<{
  price: number
  size: number | null
}> {
  const book = await clobGet<ClobBook>(
    `/book?token_id=${encodeURIComponent(tokenId)}`,
  )
  const ask = bestAskFromBook(book)
  if (ask) return { price: ask.price, size: ask.size }

  // Fallback: CLOB /price side=buy (documented as buy-side quote)
  const quote = await clobGet<{ price?: string }>(
    `/price?token_id=${encodeURIComponent(tokenId)}&side=buy`,
  )
  const price = parseDollarProb(quote.price)
  if (price == null) {
    throw new Error(`No ask available for Polymarket token ${tokenId}`)
  }
  return { price, size: null }
}

/**
 * Fetch a Polymarket market by condition ID.
 *
 * @param alignedOutcomeLabel — outcome name that corresponds to Kalshi YES
 *   (e.g. "Seahawks"). Required for two-outcome moneylines so yes/no map
 *   correctly for cross-venue arb.
 * @param eventSlug — optional Gamma event slug (preferred lookup path).
 */
export async function fetchPolymarketMarket(
  conditionId: string,
  alignedOutcomeLabel: string,
  eventSlug?: string,
): Promise<MarketPrice> {
  let market: GammaMarket | undefined

  if (eventSlug) {
    const events = await gammaGet<
      Array<{ markets?: GammaMarket[]; slug?: string }>
    >(`/events?slug=${encodeURIComponent(eventSlug)}`)
    const ev = Array.isArray(events) ? events[0] : undefined
    market = (ev?.markets ?? []).find(
      (m) => m.conditionId?.toLowerCase() === conditionId.toLowerCase(),
    ) ?? ev?.markets?.[0]
  }

  if (!market) {
    const rows = await gammaGet<GammaMarket[]>(
      `/markets?condition_ids=${encodeURIComponent(conditionId)}`,
    )
    market = Array.isArray(rows) ? rows[0] : undefined
  }

  if (!market?.conditionId) {
    throw new Error(`Polymarket market not found for conditionId ${conditionId}`)
  }

  const outcomes = parseJsonArray<string>(market.outcomes)
  const tokenIds = parseJsonArray<string>(market.clobTokenIds)
  if (outcomes.length < 2 || tokenIds.length < 2) {
    throw new Error(
      `Polymarket ${conditionId} missing outcomes/token ids (need 2-outcome moneyline)`,
    )
  }

  const alignedIdx = outcomes.findIndex(
    (o) => o.toLowerCase() === alignedOutcomeLabel.toLowerCase(),
  )
  if (alignedIdx < 0) {
    throw new Error(
      `Aligned outcome "${alignedOutcomeLabel}" not in [${outcomes.join(', ')}]`,
    )
  }
  const oppositeIdx = alignedIdx === 0 ? 1 : 0

  const [yesAsk, noAsk] = await Promise.all([
    fetchTokenAsk(tokenIds[alignedIdx]!),
    fetchTokenAsk(tokenIds[oppositeIdx]!),
  ])

  const feeRate =
    market.feeSchedule?.rate ??
    (market.feesEnabled === false ? 0 : POLYMARKET_SPORTS_TAKER_FEE_RATE)

  const resolutionRules = (market.description || '').trim()
  const resolutionSource = (market.resolutionSource || '').trim()

  return {
    venue: 'polymarket',
    marketId: market.conditionId,
    title: market.question || conditionId,
    yesPrice: yesAsk.price,
    noPrice: noAsk.price,
    liquidity: yesAsk.size,
    noLiquidity: noAsk.size,
    resolutionRules,
    resolutionSource:
      resolutionSource || 'Polymarket market description (UMA / resolvedBy)',
    lastUpdated: market.updatedAt ? new Date(market.updatedAt) : new Date(),
    feeRateHint: feeRate,
  }
}
