import { describe, expect, it, vi } from 'vitest'
import {
  DOME_WEATHER_NOTE,
  getMlbStadium,
  MLB_STADIUMS,
  RETRACTABLE_ROOF_NOTE,
} from './mlbStadiumInfo'
import {
  computePostponementRiskContext,
  markStaleIfNeeded,
  POSTPONEMENT_CONTEXT_MAX_AGE_MS,
} from './postponementRiskContext'

describe('mlbStadiumInfo', () => {
  it('covers all 30 MLB teams with valid roof types', () => {
    expect(MLB_STADIUMS).toHaveLength(30)
    const teams = new Set(MLB_STADIUMS.map((s) => s.team))
    expect(teams.size).toBe(30)
    for (const s of MLB_STADIUMS) {
      expect(['dome', 'retractable', 'open_air']).toContain(s.roofType)
      if (s.roofType === 'dome') {
        expect(s.latitude).toBeNull()
        expect(s.longitude).toBeNull()
      } else {
        expect(s.latitude).not.toBeNull()
        expect(s.longitude).not.toBeNull()
      }
    }
  })

  it('looks up known parks (Coors open air, Tropicana dome, Chase retractable)', () => {
    expect(getMlbStadium('COL')?.stadium).toBe('Coors Field')
    expect(getMlbStadium('COL')?.roofType).toBe('open_air')
    expect(getMlbStadium('TBR')?.roofType).toBe('dome')
    expect(getMlbStadium('ARI')?.roofType).toBe('retractable')
    expect(getMlbStadium('SD')?.team).toBe('SDP')
  })
})

describe('computePostponementRiskContext', () => {
  const firstPitch = new Date('2026-07-12T20:10:00Z')
  const now = new Date('2026-07-12T16:00:00Z')

  it('returns null weather for domes without attempting a fetch', async () => {
    const fetchWeather = vi.fn()
    const ctx = await computePostponementRiskContext('dome-game', firstPitch, {
      homeTeam: 'TBR',
      now,
      fetchWeather,
    })
    expect(ctx.roofType).toBe('dome')
    expect(ctx.weather).toBeNull()
    expect(ctx.roofNote).toBe(DOME_WEATHER_NOTE)
    expect(fetchWeather).not.toHaveBeenCalled()
    expect(ctx.stale).toBe(false)
    expect(ctx.hoursUntilFirstPitch).toBeCloseTo(4.166, 2)
  })

  it('retractable roofs get explicit unknowable note — never guessed open/closed', async () => {
    const ctx = await computePostponementRiskContext('ret-game', firstPitch, {
      homeTeam: 'SEA',
      now,
      fetchWeather: async () => ({
        precipitationChance: 40,
        shortForecast: 'Showers Likely',
        fetchedAt: now.toISOString(),
      }),
    })
    expect(ctx.roofType).toBe('retractable')
    expect(ctx.roofNote).toBe(RETRACTABLE_ROOF_NOTE)
    expect(ctx.roofNote).toContain('not knowable in advance')
    // Must not assert a guessed open or closed state
    expect(ctx.roofNote).not.toMatch(/\broof is (open|closed)\b/i)
    // Weather may still be present as situational info
    expect(ctx.weather?.precipitationProbability).toBe(40)
  })

  it('open-air parks attach weather from fetch', async () => {
    const ctx = await computePostponementRiskContext('col-game', firstPitch, {
      homeTeam: 'COL',
      now,
      fetchWeather: async () => ({
        precipitationChance: 8,
        shortForecast: 'Sunny',
        fetchedAt: now.toISOString(),
      }),
    })
    expect(ctx.roofType).toBe('open_air')
    expect(ctx.stadium).toBe('Coors Field')
    expect(ctx.roofNote).toBeNull()
    expect(ctx.weather?.precipitationProbability).toBe(8)
    expect(ctx.weather?.summary).toBe('Sunny')
  })

  it('marks context stale when older than freshness threshold', () => {
    const asOf = new Date('2026-07-12T10:00:00Z')
    const later = new Date(
      asOf.getTime() + POSTPONEMENT_CONTEXT_MAX_AGE_MS + 60_000,
    )
    const fresh = {
      gameId: 'g',
      homeTeam: 'COL',
      stadium: 'Coors Field',
      roofType: 'open_air' as const,
      roofNote: null,
      weather: {
        precipitationProbability: 8,
        summary: 'Sunny',
        fetchedAt: asOf.toISOString(),
      },
      hoursUntilFirstPitch: 4,
      asOf: asOf.toISOString(),
      stale: false,
    }
    expect(markStaleIfNeeded(fresh, asOf).stale).toBe(false)
    expect(markStaleIfNeeded(fresh, later).stale).toBe(true)
  })
})
