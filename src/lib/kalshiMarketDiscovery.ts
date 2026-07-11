/**
 * Discover current/upcoming MLB game-winner markets via Kalshi Trade API.
 *
 * Docs (checked 2026-07-11): GET /markets?series_ticker=&status=&limit=&cursor=
 * Series: KXMLBGAME ("Professional Baseball Game") — same pattern as KXNFLGAME.
 * Public, read-only — no auth / no orders.
 */

import { KALSHI_API_BASE } from './kalshiClient'
import type { DiscoveredMarket } from './discoveredMarket'
import {
  resolveMlbVenueTeam,
  sortedTeamPair,
} from './mlbVenueTeams'

/** Kalshi series for MLB full-game winners (not F5/spread/futures). */
export const KALSHI_MLB_GAME_SERIES = 'KXMLBGAME'

interface KalshiMarketRaw {
  ticker: string
  event_ticker?: string
  title?: string
  yes_sub_title?: string
  no_sub_title?: string
  status?: string
  occurrence_datetime?: string
  expected_expiration_time?: string
  rules_primary?: string
  rules_secondary?: string
  early_close_condition?: string
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

function gameDateFromIso(iso: string | undefined): string | null {
  if (!iso) return null
  // occurrence is UTC instant — use calendar date in America/New_York-ish via
  // the ISO date portion when present; prefer YYYY-MM-DD prefix.
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return m?.[1] ?? null
}

/**
 * Parse teams from Kalshi MLB ticker / title.
 * Ticker shape: KXMLBGAME-26JUL121610TORSD-TOR (event codes + YES team suffix).
 */
export function parseKalshiMlbGameMarket(
  m: KalshiMarketRaw,
): DiscoveredMarket | null {
  const ticker = m.ticker
  const yesLabel = (m.yes_sub_title || '').trim()
  const title = m.title || ticker

  const yesCodeMatch = ticker.match(/-([A-Z]{2,3})$/)
  const yesCode = yesCodeMatch?.[1] ?? null

  const eventPart = (m.event_ticker || ticker.replace(/-[A-Z]{2,3}$/, '')).toUpperCase()
  // Strip date/time prefix like 26JUL121610
  const afterTime = eventPart.replace(/^KXMLBGAME-?\d{0,2}[A-Z]{3}\d{0,6}/, '')
  const codeBlob =
    afterTime.match(/([A-Z]{4,6})$/)?.[1] ??
    eventPart.match(/([A-Z]{4,6})$/)?.[1] ??
    ''

  let teamA: string | null = null
  let teamB: string | null = null
  const split = splitConcatTeamCodes(codeBlob)
  if (split) {
    teamA = resolveMlbVenueTeam(split[0])
    teamB = resolveMlbVenueTeam(split[1])
  }

  // Title: "Toronto vs San Diego Winner?"
  if ((!teamA || !teamB) && title) {
    const vs = title.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+Winner)?\??$/i)
    if (vs) {
      teamA = resolveMlbVenueTeam(vs[1]!)
      teamB = resolveMlbVenueTeam(vs[2]!)
    }
  }

  const yesTeam =
    resolveMlbVenueTeam(yesLabel) ??
    (yesCode ? resolveMlbVenueTeam(yesCode) : null)

  if (!teamA || !teamB || !yesTeam) return null
  const teams = sortedTeamPair(teamA, teamB)
  if (!teams) return null
  if (yesTeam !== teams[0] && yesTeam !== teams[1]) return null

  const gameDate =
    gameDateFromIso(m.occurrence_datetime) ??
    gameDateFromIso(m.expected_expiration_time)
  if (!gameDate) return null

  const rulesParts = [
    m.rules_primary,
    m.rules_secondary,
    m.early_close_condition,
  ].filter((s): s is string => !!s && s.trim().length > 0)

  const firstPitchIso = m.occurrence_datetime
    ? new Date(m.occurrence_datetime).toISOString()
    : undefined

  // Kalshi titles are typically "Away vs Home Winner?"
  let homeTeam: string | undefined
  const vs = title.match(/^(.+?)\s+vs\.?\s+(.+?)(?:\s+Winner)?\??$/i)
  if (vs) {
    homeTeam = resolveMlbVenueTeam(vs[2]!) ?? undefined
  }

  return {
    venue: 'kalshi',
    marketId: ticker,
    title,
    teams,
    gameDate,
    resolutionRules: rulesParts.join('\n\n'),
    resolutionSource:
      'Kalshi rules_primary / rules_secondary (exchange determination)',
    yesTeam,
    homeTeam,
    firstPitchIso,
    rawTitle: title,
  }
}

/** Known Kalshi MLB ticker codes (longest first for greedy split). */
const KALSHI_TEAM_CODES = [
  'TOR',
  'SDP',
  'LAD',
  'NYY',
  'NYM',
  'BOS',
  'CHC',
  'CHW',
  'CWS',
  'SFG',
  'STL',
  'TBR',
  'KCR',
  'OAK',
  'ATH',
  'WSN',
  'WSH',
  'WAS',
  'MIA',
  'FLA',
  'COL',
  'MIL',
  'MIN',
  'CLE',
  'DET',
  'HOU',
  'TEX',
  'SEA',
  'PHI',
  'PIT',
  'CIN',
  'ATL',
  'BAL',
  'LAA',
  'ANA',
  'ARI',
  'AZ',
  'SD',
  'SF',
  'TB',
  'KC',
].sort((a, b) => b.length - a.length)

function splitConcatTeamCodes(blob: string): [string, string] | null {
  const s = blob.toUpperCase()
  if (s.length < 4) return null
  for (const a of KALSHI_TEAM_CODES) {
    if (!s.startsWith(a)) continue
    const rest = s.slice(a.length)
    for (const b of KALSHI_TEAM_CODES) {
      if (rest === b) return [a, b]
    }
  }
  return null
}

/**
 * List open Kalshi MLB game-winner markets (one binary market per team/side).
 */
export async function discoverKalshiMlbMarkets(): Promise<DiscoveredMarket[]> {
  const out: DiscoveredMarket[] = []
  let cursor: string | undefined
  let pages = 0

  do {
    const qs = new URLSearchParams({
      series_ticker: KALSHI_MLB_GAME_SERIES,
      status: 'open',
      limit: '200',
    })
    if (cursor) qs.set('cursor', cursor)

    const data = await kalshiGet<{
      markets?: KalshiMarketRaw[]
      cursor?: string
    }>(`/markets?${qs.toString()}`)

    const markets = data.markets ?? []
    for (const m of markets) {
      const parsed = parseKalshiMlbGameMarket(m)
      if (parsed) out.push(parsed)
    }

    const next = data.cursor?.trim() || undefined
    // Stop if API returns empty cursor or repeats (defensive)
    if (!next || next === cursor || markets.length === 0) break
    cursor = next
    pages += 1
  } while (pages < 20)

  return out
}
