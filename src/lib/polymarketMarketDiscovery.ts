/**
 * Discover current/upcoming MLB game moneyline markets via Polymarket Gamma.
 *
 * Docs / live endpoints checked 2026-07-11:
 * - GET https://gamma-api.polymarket.com/sports → mlb series id = 3
 * - GET /events?series_id=3&active=true&closed=false
 * Moneyline markets carry sportsMarketType === 'moneyline'.
 * Public, read-only — no auth / no orders.
 */

import { POLYMARKET_GAMMA_BASE } from './polymarketClient'
import type { DiscoveredMarket } from './discoveredMarket'
import {
  resolveMlbVenueTeam,
  sortedTeamPair,
} from './mlbVenueTeams'

export const POLYMARKET_MLB_SERIES_ID = '3'

interface GammaTeam {
  name?: string
  abbreviation?: string
  ordering?: string
}

interface GammaMarket {
  conditionId?: string
  question?: string
  description?: string
  resolutionSource?: string
  outcomes?: string | string[]
  sportsMarketType?: string
  gameStartTime?: string
  active?: boolean
  closed?: boolean
}

interface GammaEvent {
  slug?: string
  title?: string
  description?: string
  resolutionSource?: string
  eventDate?: string
  startTime?: string
  active?: boolean
  closed?: boolean
  markets?: GammaMarket[]
  teams?: GammaTeam[]
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

async function gammaGet<T>(path: string): Promise<T> {
  const url = `${POLYMARKET_GAMMA_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Polymarket Gamma GET ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

function dateFromEvent(e: GammaEvent, m: GammaMarket): string | null {
  if (e.eventDate && /^\d{4}-\d{2}-\d{2}$/.test(e.eventDate)) {
    return e.eventDate
  }
  const fromStart = (e.startTime || m.gameStartTime || '').match(
    /^(\d{4}-\d{2}-\d{2})/,
  )
  return fromStart?.[1] ?? null
}

function homeTeamFromEvent(e: GammaEvent): string | null {
  const teams = e.teams ?? []
  for (const t of teams) {
    if ((t.ordering || '').toLowerCase() !== 'home') continue
    return (
      resolveMlbVenueTeam(t.abbreviation || '') ??
      resolveMlbVenueTeam(t.name || '')
    )
  }
  // Slug mlb-away-home-date → second code is home on Polymarket MLB series
  const slug = e.slug || ''
  const m = slug.match(/^mlb-([a-z0-9]+)-([a-z0-9]+)-\d{4}-\d{2}-\d{2}$/i)
  if (m) return resolveMlbVenueTeam(m[2]!)
  return null
}

function firstPitchIsoFromEvent(e: GammaEvent, m: GammaMarket): string | null {
  const raw = e.startTime || m.gameStartTime
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

function teamsFromEvent(e: GammaEvent): [string, string] | null {
  const teams = e.teams ?? []
  if (teams.length >= 2) {
    const a =
      resolveMlbVenueTeam(teams[0]!.abbreviation || '') ??
      resolveMlbVenueTeam(teams[0]!.name || '')
    const b =
      resolveMlbVenueTeam(teams[1]!.abbreviation || '') ??
      resolveMlbVenueTeam(teams[1]!.name || '')
    if (a && b) return sortedTeamPair(a, b)
  }

  // Fallback: slug mlb-tor-sd-2026-07-12
  const slug = e.slug || ''
  const m = slug.match(/^mlb-([a-z0-9]+)-([a-z0-9]+)-\d{4}-\d{2}-\d{2}$/i)
  if (m) {
    const a = resolveMlbVenueTeam(m[1]!)
    const b = resolveMlbVenueTeam(m[2]!)
    if (a && b) return sortedTeamPair(a, b)
  }
  return null
}

/**
 * List Polymarket MLB moneyline markets for active series events.
 */
export async function discoverPolymarketMlbMarkets(): Promise<
  DiscoveredMarket[]
> {
  const out: DiscoveredMarket[] = []
  const limit = 100
  let offset = 0
  let pages = 0

  while (pages < 30) {
    const qs = new URLSearchParams({
      series_id: POLYMARKET_MLB_SERIES_ID,
      active: 'true',
      closed: 'false',
      limit: String(limit),
      offset: String(offset),
    })
    const events = await gammaGet<GammaEvent[]>(`/events?${qs.toString()}`)
    if (!Array.isArray(events) || events.length === 0) break

    for (const ev of events) {
      if (ev.closed) continue
      const pair = teamsFromEvent(ev)
      if (!pair) continue

      for (const m of ev.markets ?? []) {
        if (m.closed || m.active === false) continue
        if (m.sportsMarketType !== 'moneyline') continue
        if (!m.conditionId) continue

        const gameDate = dateFromEvent(ev, m)
        if (!gameDate) continue

        const outcomes = parseJsonArray<string>(m.outcomes)
        const rules = (m.description || ev.description || '').trim()
        if (!rules) continue

        const homeTeam = homeTeamFromEvent(ev) ?? undefined
        const firstPitchIso = firstPitchIsoFromEvent(ev, m) ?? undefined

        out.push({
          venue: 'polymarket',
          marketId: m.conditionId,
          title: m.question || ev.title || m.conditionId,
          teams: pair,
          gameDate,
          resolutionRules: rules,
          resolutionSource:
            (m.resolutionSource || ev.resolutionSource || '').trim() ||
            'Polymarket market description (UMA / resolvedBy)',
          homeTeam,
          firstPitchIso,
          outcomeLabels:
            outcomes.length >= 2
              ? [outcomes[0]!, outcomes[1]!]
              : undefined,
          eventSlug: ev.slug,
          rawTitle: ev.title,
        })
      }
    }

    if (events.length < limit) break
    offset += limit
    pages += 1
  }

  return out
}
