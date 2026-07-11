/**
 * Situational postponement-risk context for MLB review UI.
 *
 * INFORMATIONAL ONLY — hard safety line:
 * - Never touches verifiedEquivalent
 * - Never contributes to auto-approval / rules-diff
 * - Never used to sort, filter, or deprioritize flagged pairs
 *
 * A clear forecast does not clear a structural rules mismatch.
 */

import { getGameWeather } from './weather'
import {
  DOME_WEATHER_NOTE,
  getMlbStadium,
  mlbRoofLabel,
  RETRACTABLE_ROOF_NOTE,
  type MlbRoofType,
  type MlbStadiumInfo,
} from './mlbStadiumInfo'

/** Context older than this must be re-fetched before display — not served stale. */
export const POSTPONEMENT_CONTEXT_MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

export interface PostponementRiskContext {
  gameId: string
  homeTeam: string
  stadium: string
  roofType: MlbRoofType
  /** Explicit note for dome / retractable; null for open-air. */
  roofNote: string | null
  weather: {
    precipitationProbability: number | null
    summary: string | null
    fetchedAt: string | null
  } | null
  hoursUntilFirstPitch: number
  /** When this context object was produced. */
  asOf: string
  /**
   * True when asOf is older than POSTPONEMENT_CONTEXT_MAX_AGE_MS relative to `now`
   * (or relative to evaluate time). Fresh computes set this false; callers must
   * re-check before display via markStaleIfNeeded.
   */
  stale: boolean
}

export interface ComputePostponementRiskOptions {
  /** Home club franchise id — stadium / weather keyed off home park. */
  homeTeam: string
  /** Override clock (tests). */
  now?: Date
  /** Inject weather fetch (tests) — skips NOAA when provided. */
  fetchWeather?: (
    lat: number,
    lon: number,
    firstPitch: Date,
  ) => Promise<{
    precipitationChance: number | null
    shortForecast: string
    fetchedAt: string
  }>
}

/**
 * Compute situational context for one game.
 * Signature keeps gameId + firstPitch as primary inputs; homeTeam is required
 * in opts for stadium lookup (park is always the home club's).
 */
export async function computePostponementRiskContext(
  gameId: string,
  firstPitchTime: Date,
  opts: ComputePostponementRiskOptions,
): Promise<PostponementRiskContext> {
  const now = opts.now ?? new Date()
  const stadium = getMlbStadium(opts.homeTeam)
  if (!stadium) {
    throw new Error(`No MLB stadium metadata for home team ${opts.homeTeam}`)
  }

  const hoursUntilFirstPitch =
    (firstPitchTime.getTime() - now.getTime()) / (1000 * 60 * 60)

  const asOf = now.toISOString()
  const base = {
    gameId,
    homeTeam: stadium.team,
    stadium: stadium.stadium,
    roofType: stadium.roofType,
    hoursUntilFirstPitch,
    asOf,
    stale: false as boolean,
  }

  if (stadium.roofType === 'dome') {
    return {
      ...base,
      roofNote: DOME_WEATHER_NOTE,
      weather: null,
    }
  }

  const roofNote =
    stadium.roofType === 'retractable' ? RETRACTABLE_ROOF_NOTE : null

  // Retractable + open_air: fetch weather when coords exist.
  // Retractable still gets weather as situational info — with explicit
  // unknowable roof-state note (never guess open/closed).
  if (stadium.latitude == null || stadium.longitude == null) {
    return {
      ...base,
      roofNote,
      weather: {
        precipitationProbability: null,
        summary: 'coordinates unavailable — weather not fetched',
        fetchedAt: null,
      },
    }
  }

  try {
    const wx = opts.fetchWeather
      ? await opts.fetchWeather(
          stadium.latitude,
          stadium.longitude,
          firstPitchTime,
        )
      : await getGameWeather(
          stadium.latitude,
          stadium.longitude,
          firstPitchTime,
        )

    return {
      ...base,
      roofNote,
      weather: {
        precipitationProbability: wx.precipitationChance,
        summary: wx.shortForecast,
        fetchedAt: wx.fetchedAt,
      },
    }
  } catch {
    return {
      ...base,
      roofNote,
      weather: {
        precipitationProbability: null,
        summary: 'weather fetch failed',
        fetchedAt: null,
      },
    }
  }
}

/**
 * Mark a previously computed context stale if older than the freshness threshold.
 * Does not mutate approval state — display-only helper.
 */
export function markStaleIfNeeded(
  ctx: PostponementRiskContext,
  now: Date = new Date(),
): PostponementRiskContext {
  const age = now.getTime() - Date.parse(ctx.asOf)
  const stale = !Number.isFinite(age) || age > POSTPONEMENT_CONTEXT_MAX_AGE_MS
  if (stale === ctx.stale) return ctx
  return { ...ctx, stale }
}

export function isContextFresh(
  ctx: PostponementRiskContext,
  now: Date = new Date(),
): boolean {
  return !markStaleIfNeeded(ctx, now).stale
}

/** Display helper — never implies the rules flag is cleared. */
export function formatRoofTypeLine(stadium: MlbStadiumInfo): string {
  const label = mlbRoofLabel(stadium.roofType)
  if (stadium.roofType === 'retractable') {
    return `${stadium.stadium} (${label}; ${RETRACTABLE_ROOF_NOTE})`
  }
  if (stadium.roofType === 'dome') {
    return `${stadium.stadium} (${label}; ${DOME_WEATHER_NOTE})`
  }
  return `${stadium.stadium} (${label})`
}

export function formatHoursUntilPitch(hours: number): string {
  if (!Number.isFinite(hours)) return '—'
  if (hours < 0) {
    const ago = Math.abs(hours)
    if (ago < 1) return `${Math.round(ago * 60)} min ago`
    return `${ago.toFixed(1)} hours ago`
  }
  if (hours < 1) return `in ${Math.round(hours * 60)} min`
  return `in ${hours.toFixed(1)} hours`
}

export function formatContextAge(asOf: string, now: Date = new Date()): string {
  const ageMs = now.getTime() - Date.parse(asOf)
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'as of unknown'
  const mins = Math.round(ageMs / 60000)
  if (mins < 1) return 'as of just now'
  if (mins === 1) return 'as of 1 min ago'
  if (mins < 60) return `as of ${mins} min ago`
  const hrs = (ageMs / 3600000).toFixed(1)
  return `as of ${hrs} hours ago`
}
