/**
 * NOAA api.weather.gov forecast helper (free, no API key).
 * Requires a descriptive User-Agent per NOAA policy.
 */

import { getStadium, isOutdoorStadium } from './stadiums'

export interface GameWeather {
  tempF: number | null
  windMph: number | null
  windDirection: string | null
  precipitationChance: number | null
  shortForecast: string
  fetchedAt: string
}

type PointsCacheEntry = {
  forecastHourly: string
  fetchedAt: string
}

const pointsCache = new Map<string, PointsCacheEntry>()

const NOAA_USER_AGENT =
  'EdgeTerminal/0.1 (https://github.com/magnussonmilan/edge-terminal; weather display)'

function pointsCacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`
}

/** Clear in-memory grid cache (tests). */
export function clearWeatherPointsCache(): void {
  pointsCache.clear()
}

export function getCachedForecastHourlyUrl(
  lat: number,
  lon: number,
): string | undefined {
  return pointsCache.get(pointsCacheKey(lat, lon))?.forecastHourly
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': NOAA_USER_AGENT,
      Accept: 'application/geo+json',
    },
  })
  if (!res.ok) {
    throw new Error(`weather.gov request failed (${res.status}): ${url}`)
  }
  return res.json()
}

/**
 * Resolve forecastHourly grid URL for a lat/lon (cached — grid endpoints are stable).
 */
export async function resolveForecastHourlyUrl(
  lat: number,
  lon: number,
): Promise<string> {
  const key = pointsCacheKey(lat, lon)
  const cached = pointsCache.get(key)
  if (cached) return cached.forecastHourly

  const data = (await fetchJson(
    `https://api.weather.gov/points/${lat},${lon}`,
  )) as {
    properties?: { forecastHourly?: string }
  }
  const forecastHourly = data.properties?.forecastHourly
  if (!forecastHourly) {
    throw new Error(`No forecastHourly for points ${lat},${lon}`)
  }
  pointsCache.set(key, {
    forecastHourly,
    fetchedAt: new Date().toISOString(),
  })
  return forecastHourly
}

type HourlyPeriod = {
  startTime: string
  temperature?: number
  temperatureUnit?: string
  windSpeed?: string
  windDirection?: string
  probabilityOfPrecipitation?: { value: number | null }
  shortForecast?: string
}

function parseWindMph(windSpeed: string | undefined): number | null {
  if (!windSpeed) return null
  const nums = [...windSpeed.matchAll(/(\d+)/g)].map((m) => Number(m[1]))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function toFahrenheit(temp: number, unit: string | undefined): number {
  if ((unit || 'F').toUpperCase() === 'C') return (temp * 9) / 5 + 32
  return temp
}

/**
 * Fetch hourly forecast and pick the period closest to gameTime.
 */
export async function getGameWeather(
  lat: number,
  lon: number,
  gameTime: Date,
): Promise<GameWeather> {
  const hourlyUrl = await resolveForecastHourlyUrl(lat, lon)
  const data = (await fetchJson(hourlyUrl)) as {
    properties?: { periods?: HourlyPeriod[] }
  }
  const periods = data.properties?.periods ?? []
  if (periods.length === 0) {
    throw new Error(`No hourly periods from ${hourlyUrl}`)
  }

  const target = gameTime.getTime()
  let best = periods[0]
  let bestDist = Math.abs(Date.parse(best.startTime) - target)
  for (const p of periods) {
    const dist = Math.abs(Date.parse(p.startTime) - target)
    if (dist < bestDist) {
      best = p
      bestDist = dist
    }
  }

  const temp =
    best.temperature == null
      ? null
      : toFahrenheit(best.temperature, best.temperatureUnit)

  return {
    tempF: temp,
    windMph: parseWindMph(best.windSpeed),
    windDirection: best.windDirection ?? null,
    precipitationChance: best.probabilityOfPrecipitation?.value ?? null,
    shortForecast: best.shortForecast || '—',
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Weather for a home team's stadium at gameTime.
 * Returns null for domed/retractable venues (no weather adjustment path).
 * Throws if outdoor and NOAA returns nothing useful.
 */
export async function getStadiumWeather(
  homeTeam: string,
  gameTime: Date,
): Promise<GameWeather | null> {
  if (!isOutdoorStadium(homeTeam)) return null
  const stadium = getStadium(homeTeam)
  if (!stadium) {
    throw new Error(`No stadium metadata for team ${homeTeam}`)
  }
  return getGameWeather(stadium.lat, stadium.lon, gameTime)
}
