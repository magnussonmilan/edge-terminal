import { describe, expect, it } from 'vitest'
import {
  clearWeatherPointsCache,
  getCachedForecastHourlyUrl,
  resolveForecastHourlyUrl,
} from './weather'
import { isOutdoorStadium, getStadium } from './stadiums'

describe('stadium outdoor flags', () => {
  it('marks domes as indoor and Lambeau as outdoor', () => {
    expect(isOutdoorStadium('MIN')).toBe(false)
    expect(isOutdoorStadium('NO')).toBe(false)
    expect(isOutdoorStadium('DAL')).toBe(false)
    expect(isOutdoorStadium('GB')).toBe(true)
    expect(getStadium('KC')?.lat).toBeGreaterThan(30)
  })
})

describe('weather grid cache', () => {
  it('caches forecastHourly URL per lat/lon', async () => {
    clearWeatherPointsCache()
    const lat = 44.5013
    const lon = -88.0622
    expect(getCachedForecastHourlyUrl(lat, lon)).toBeUndefined()

    const url1 = await resolveForecastHourlyUrl(lat, lon)
    expect(url1).toMatch(/^https:\/\/api\.weather\.gov\//)
    expect(getCachedForecastHourlyUrl(lat, lon)).toBe(url1)

    const url2 = await resolveForecastHourlyUrl(lat, lon)
    expect(url2).toBe(url1)
  }, 30_000)
})
