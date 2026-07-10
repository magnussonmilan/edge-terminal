import { describe, expect, it } from 'vitest'
import {
  computeCurrentWeekInjuryDifferential,
  dedupeInjuriesByLatestReport,
  filterInjuriesByWeek,
  injuriesUrlForSeason,
  parseInjuriesCsv,
  rowsToInjuryRecords,
} from './injuryPipeline'
import type { PlayerValue } from './playerValues'

const FIXTURE_CSV = `season,week,game_type,team,gsis_id,full_name,first_name,last_name,position,report_status,practice_status,report_primary_injury,date_modified
2025,17,REG,KC,00-0033873,Patrick Mahomes,Patrick,Mahomes,QB,Questionable,Limited,Ankle,2025-12-24T18:00:00Z
2025,17,REG,KC,00-0033873,Patrick Mahomes,Patrick,Mahomes,QB,Out,Did Not Practice,Ankle,2025-12-26T18:00:00Z
2025,17,REG,KC,00-0031234,Backup Player,Backup,Player,WR,Out,Did Not Practice,Knee,2025-12-26T12:00:00Z
2025,16,REG,KC,00-0033873,Patrick Mahomes,Patrick,Mahomes,QB,Out,Did Not Practice,Ankle,2025-12-19T18:00:00Z
2025,17,POST,KC,00-0039999,Playoff Only,Playoff,Only,RB,Out,Did Not Practice,Hamstring,2025-12-26T18:00:00Z
`

describe('injuryPipeline dedupe', () => {
  it('keeps the latest date_modified per player/week/team', () => {
    const parsed = parseInjuriesCsv(FIXTURE_CSV)
    const week17 = filterInjuriesByWeek(parsed, 2025, 17)
    const mahomes = week17.find((i) => i.playerId === '00-0033873')
    expect(mahomes).toBeTruthy()
    expect(mahomes!.reportStatus).toBe('out')
    expect(mahomes!.dateModified).toBe('2025-12-26T18:00:00Z')
    expect(week17.some((i) => i.playerId === '00-0039999')).toBe(false)
  })

  it('dedupeInjuriesByLatestReport is stable on already-deduped input', () => {
    const once = parseInjuriesCsv(FIXTURE_CSV)
    const twice = dedupeInjuriesByLatestReport(once)
    expect(twice).toHaveLength(once.length)
  })
})

describe('computeCurrentWeekInjuryDifferential', () => {
  it('matches historical differential for out players with values', () => {
    const injuries = filterInjuriesByWeek(parseInjuriesCsv(FIXTURE_CSV), 2025, 17)
    const values: PlayerValue[] = [
      {
        playerId: '00-0033873',
        playerName: 'Patrick Mahomes',
        team: 'KC',
        position: 'QB',
        baseValue: 8,
        season: 2025,
      },
      {
        playerId: '00-0030001',
        playerName: 'Backup QB',
        team: 'KC',
        position: 'QB',
        baseValue: 2,
        season: 2025,
      },
    ]
    const diff = computeCurrentWeekInjuryDifferential(
      'KC',
      17,
      2025,
      values,
      injuries,
      { useReplacementAddBack: true },
    )
    // 8 - 2 backup add-back
    expect(diff).toBe(6)
  })
})

describe('2025 week 17 dry-run against nflverse', () => {
  it('fetches and produces non-empty deduped REG injuries', async () => {
    const url = injuriesUrlForSeason(2025)
    const res = await fetch(url)
    expect(res.ok).toBe(true)
    const text = await res.text()
    const all = parseInjuriesCsv(text)
    const week17 = filterInjuriesByWeek(all, 2025, 17)
    expect(week17.length).toBeGreaterThan(20)

    // Every player appears at most once
    const keys = new Set(week17.map((i) => `${i.team}|${i.playerId}`))
    expect(keys.size).toBe(week17.length)

    // Spot-check: rows came from REG and have statuses
    expect(week17.every((i) => i.week === 17 && i.season === 2025)).toBe(true)
    expect(week17.some((i) => i.reportStatus.length > 0)).toBe(true)

    // rowsToInjuryRecords path used by parse
    expect(rowsToInjuryRecords([{ season: 'x' }]).length).toBe(0)
  }, 60_000)
})
