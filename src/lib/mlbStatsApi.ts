/**
 * MLB Stats API client (statsapi.mlb.com) — schedule / results for Elo backfill.
 *
 * Verified 2026-07-11:
 * - Endpoint: GET https://statsapi.mlb.com/api/v1/schedule
 *   params: sportId=1, startDate, endDate, hydrate=team,linescore
 * - Response includes copyright acknowledgment.
 * - Terms notice (gdx.mlb.com/components/copyright.txt): Materials are
 *   proprietary to MLBAM; only individual, non-commercial, non-bulk use is
 *   permitted without prior written authorization. Cache aggressively; do not
 *   treat this as a license for commercial redistribution.
 *
 * Read-only. No auth. Unofficial / undocumented — may change without notice.
 */

export const MLB_STATS_API_BASE = 'https://statsapi.mlb.com/api/v1'

export const MLB_STATS_API_COPYRIGHT_NOTE =
  'Copyright MLB Advanced Media, L.P. Use subject to http://gdx.mlb.com/components/copyright.txt (individual, non-commercial, non-bulk without written authorization).'

/** Map Stats API abbreviations → franchise ids used elsewhere in Edge Terminal. */
export const MLB_API_ABBR_TO_FRANCHISE: Record<string, string> = {
  AZ: 'ARI',
  ARI: 'ARI',
  ATL: 'ATL',
  BAL: 'BAL',
  BOS: 'BOS',
  CHC: 'CHC',
  CWS: 'CHW',
  CHW: 'CHW',
  CIN: 'CIN',
  CLE: 'CLE',
  COL: 'COL',
  DET: 'DET',
  HOU: 'HOU',
  KC: 'KCR',
  KCR: 'KCR',
  LAA: 'ANA',
  ANA: 'ANA',
  LAD: 'LAD',
  MIA: 'MIA',
  MIL: 'MIL',
  MIN: 'MIN',
  NYM: 'NYM',
  NYY: 'NYY',
  ATH: 'OAK',
  OAK: 'OAK',
  PHI: 'PHI',
  PIT: 'PIT',
  SD: 'SDP',
  SDP: 'SDP',
  SEA: 'SEA',
  SF: 'SFG',
  SFG: 'SFG',
  STL: 'STL',
  TB: 'TBR',
  TBR: 'TBR',
  TBD: 'TBR',
  TEX: 'TEX',
  TOR: 'TOR',
  WSH: 'WSN',
  WSN: 'WSN',
  WAS: 'WSN',
}

export function apiAbbrToFranchise(abbr: string): string | null {
  const key = abbr.trim().toUpperCase()
  return MLB_API_ABBR_TO_FRANCHISE[key] ?? null
}

export interface MlbGameResult {
  gamePk: number
  gameDate: string // YYYY-MM-DD (officialDate)
  gameDateTimeIso: string
  season: number
  gameType: string // R, F, D, L, W, S, …
  homeTeam: string // franchise id
  awayTeam: string
  homeScore: number
  awayScore: number
  /** 1 or 2 — doubleheader sequence (1 when not a DH). */
  gameSequenceInDay: number
  doubleHeader: 'N' | 'Y' | 'S'
  status: string
  abstractGameState: string
}

interface ScheduleGameRaw {
  gamePk: number
  gameDate?: string
  officialDate?: string
  season?: string
  gameType?: string
  doubleHeader?: string
  gameNumber?: number
  status?: { detailedState?: string; abstractGameState?: string }
  teams?: {
    home?: { score?: number | null; team?: { abbreviation?: string } }
    away?: { score?: number | null; team?: { abbreviation?: string } }
  }
}

async function statsGet<T>(path: string): Promise<T> {
  const url = `${MLB_STATS_API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`MLB Stats API GET ${path} failed: ${res.status}`)
  }
  return (await res.json()) as T
}

function parseGame(g: ScheduleGameRaw): MlbGameResult | null {
  const homeAbbr = g.teams?.home?.team?.abbreviation
  const awayAbbr = g.teams?.away?.team?.abbreviation
  if (!homeAbbr || !awayAbbr) return null
  const homeTeam = apiAbbrToFranchise(homeAbbr)
  const awayTeam = apiAbbrToFranchise(awayAbbr)
  if (!homeTeam || !awayTeam) return null

  const homeScore = g.teams?.home?.score
  const awayScore = g.teams?.away?.score
  const gameDate = g.officialDate || (g.gameDate || '').slice(0, 10)
  if (!gameDate || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) return null

  const dh = (g.doubleHeader || 'N') as 'N' | 'Y' | 'S'
  const seq = g.gameNumber && g.gameNumber >= 1 ? g.gameNumber : 1

  return {
    gamePk: g.gamePk,
    gameDate,
    gameDateTimeIso: g.gameDate || `${gameDate}T17:00:00Z`,
    season: Number(g.season) || Number(gameDate.slice(0, 4)),
    gameType: g.gameType || 'R',
    homeTeam,
    awayTeam,
    homeScore: homeScore == null ? Number.NaN : Number(homeScore),
    awayScore: awayScore == null ? Number.NaN : Number(awayScore),
    gameSequenceInDay: seq,
    doubleHeader: dh,
    status: g.status?.detailedState || '',
    abstractGameState: g.status?.abstractGameState || '',
  }
}

/**
 * Fetch schedule/results for a date range (inclusive).
 * Chunks by ~14 days to keep responses manageable (non-bulk spirit).
 */
export async function fetchMlbScheduleRange(
  startDate: string,
  endDate: string,
  opts: { gameTypes?: string[]; settledOnly?: boolean } = {},
): Promise<MlbGameResult[]> {
  const out: MlbGameResult[] = []
  const start = new Date(`${startDate}T12:00:00Z`)
  const end = new Date(`${endDate}T12:00:00Z`)
  if (end < start) return out

  let cursor = new Date(start)
  while (cursor <= end) {
    const chunkEnd = new Date(cursor)
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + 13)
    if (chunkEnd > end) chunkEnd.setTime(end.getTime())

    const a = cursor.toISOString().slice(0, 10)
    const b = chunkEnd.toISOString().slice(0, 10)
    const qs = new URLSearchParams({
      sportId: '1',
      startDate: a,
      endDate: b,
      hydrate: 'team,linescore',
    })
    const data = await statsGet<{
      copyright?: string
      dates?: Array<{ games?: ScheduleGameRaw[] }>
    }>(`/schedule?${qs.toString()}`)

    for (const day of data.dates ?? []) {
      for (const g of day.games ?? []) {
        const parsed = parseGame(g)
        if (!parsed) continue
        if (opts.gameTypes && !opts.gameTypes.includes(parsed.gameType)) {
          continue
        }
        if (opts.settledOnly) {
          if (parsed.abstractGameState !== 'Final') continue
          if (
            !Number.isFinite(parsed.homeScore) ||
            !Number.isFinite(parsed.awayScore)
          ) {
            continue
          }
        }
        out.push(parsed)
      }
    }

    // polite pause between chunks
    await new Promise((r) => setTimeout(r, 150))
    cursor = new Date(chunkEnd)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return sortGamesChronologically(out)
}

/** True chronological order: date → start time → gameNumber (DH). */
export function sortGamesChronologically(
  games: MlbGameResult[],
): MlbGameResult[] {
  return [...games].sort((a, b) => {
    const byDate = a.gameDate.localeCompare(b.gameDate)
    if (byDate !== 0) return byDate
    const byTime = a.gameDateTimeIso.localeCompare(b.gameDateTimeIso)
    if (byTime !== 0) return byTime
    return a.gameSequenceInDay - b.gameSequenceInDay
  })
}

export function groupGamesByTeamChrono(
  games: MlbGameResult[],
): Record<string, MlbGameResult[]> {
  const sorted = sortGamesChronologically(games)
  const out: Record<string, MlbGameResult[]> = {}
  for (const g of sorted) {
    ;(out[g.homeTeam] ??= []).push(g)
    ;(out[g.awayTeam] ??= []).push(g)
  }
  return out
}
