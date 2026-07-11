/**
 * Read-only Kalshi Trade API client (public market data — no auth).
 *
 * Docs checked 2026-07-10:
 * - Base: https://external-api.kalshi.com/trade-api/v2
 * - Public GET /markets/{ticker} — no API key
 * - Rate limits: token-bucket on authenticated routes; public reads still
 *   subject to fair-use / 429 — back off on 429
 * - Fees (kalshi.com/docs/kalshi-fee-schedule.pdf, general taker):
 *   fees = round_up_cent(0.07 × C × P × (1 − P))
 *
 * No order-placement endpoints are called here.
 */

import {
  parseDollarProb,
  type MarketPrice,
} from './marketPrice'

export const KALSHI_API_BASE =
  typeof window !== 'undefined'
    ? '/api/kalshi'
    : 'https://external-api.kalshi.com/trade-api/v2'

/** General taker fee coefficient from Kalshi fee schedule (not S&P/Nasdaq special). */
export const KALSHI_TAKER_FEE_COEFF = 0.07

/**
 * Kalshi taker fee in dollars for C contracts at price P ∈ [0,1].
 * Formula from published schedule: round up(0.07 × C × P × (1−P)) to next cent.
 */
export function kalshiTakerFeeDollars(contracts: number, price: number): number {
  const C = Math.max(0, contracts)
  const P = Math.max(0, Math.min(1, price))
  const raw = KALSHI_TAKER_FEE_COEFF * C * P * (1 - P)
  // Round up to next cent (ceiling to 0.01)
  return Math.ceil(raw * 100 - 1e-12) / 100
}

interface KalshiMarketRaw {
  ticker: string
  title?: string
  yes_sub_title?: string
  no_sub_title?: string
  yes_ask_dollars?: string
  no_ask_dollars?: string
  yes_ask_size_fp?: string
  // no_ask_size may not always be present; derive from reciprocal book when missing
  no_bid_size_fp?: string
  rules_primary?: string
  rules_secondary?: string
  early_close_condition?: string
  updated_time?: string
  status?: string
}

async function kalshiGet<T>(path: string): Promise<T> {
  const url = `${KALSHI_API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url)
  if (res.status === 429) {
    throw new Error('Kalshi rate limited (429) — back off and retry')
  }
  if (!res.ok) {
    throw new Error(`Kalshi GET ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

/**
 * Fetch a single Kalshi market by ticker. Read-only.
 * yesPrice / noPrice = best ask to buy YES / NO (what a taker pays).
 */
export async function fetchKalshiMarket(ticker: string): Promise<MarketPrice> {
  const data = await kalshiGet<{ market: KalshiMarketRaw }>(
    `/markets/${encodeURIComponent(ticker)}`,
  )
  const m = data.market
  const yesAsk = parseDollarProb(m.yes_ask_dollars)
  const noAsk = parseDollarProb(m.no_ask_dollars)
  if (yesAsk == null || noAsk == null) {
    throw new Error(`Kalshi market ${ticker} missing ask prices`)
  }

  const rulesParts = [m.rules_primary, m.rules_secondary, m.early_close_condition]
    .filter((s): s is string => !!s && s.trim().length > 0)
  const resolutionRules = rulesParts.join('\n\n')

  const yesLiq = m.yes_ask_size_fp != null ? Number(m.yes_ask_size_fp) : null

  return {
    venue: 'kalshi',
    marketId: m.ticker,
    title: m.title || m.yes_sub_title || m.ticker,
    yesPrice: yesAsk,
    noPrice: noAsk,
    liquidity: Number.isFinite(yesLiq) ? yesLiq : null,
    noLiquidity: null,
    resolutionRules,
    resolutionSource: 'Kalshi rules_primary / rules_secondary (exchange determination)',
    lastUpdated: m.updated_time ? new Date(m.updated_time) : new Date(),
    feeRateHint: KALSHI_TAKER_FEE_COEFF,
  }
}
