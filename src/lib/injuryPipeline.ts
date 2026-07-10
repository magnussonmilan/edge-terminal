/**
 * Current-week injury ingest helpers (nflverse injuries CSV).
 * Keeps the latest date_modified row per (season, week, team, playerId).
 */

import { parseCsv } from './csv'
import {
  computeInjuryDifferential,
  type HistoricalInjuryReport,
  type PlayerValue,
} from './playerValues'

export const NFLVERSE_INJURIES_BASE =
  'https://github.com/nflverse/nflverse-data/releases/download/injuries'

export interface CurrentWeekInjury {
  season: number
  week: number
  team: string
  playerId: string
  playerName: string
  position: string
  reportStatus: string
  practiceStatus: string
  reportPrimaryInjury: string
  dateModified: string
  gameType: string
}

export interface CurrentWeekInjuriesFile {
  season: number
  week: number | null
  generatedAt: string
  source: string
  dryRun: boolean
  injuries: CurrentWeekInjury[]
}

function parseModifiedMs(value: string): number {
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : 0
}

/** Map nflverse injury CSV rows → typed records (REG only by default). */
export function rowsToInjuryRecords(
  rows: Record<string, string>[],
  options: { regularSeasonOnly?: boolean } = {},
): CurrentWeekInjury[] {
  const regularOnly = options.regularSeasonOnly !== false
  const out: CurrentWeekInjury[] = []
  for (const r of rows) {
    if (regularOnly && r.game_type && r.game_type !== 'REG') continue
    const season = Number(r.season)
    const week = Number(r.week)
    const playerId = r.gsis_id || r.player_id || ''
    if (!Number.isFinite(season) || !Number.isFinite(week) || !playerId) continue
    out.push({
      season,
      week,
      team: r.team || '',
      playerId,
      playerName: r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim(),
      position: r.position || '',
      reportStatus: (r.report_status || '').toLowerCase(),
      practiceStatus: (r.practice_status || '').toLowerCase(),
      reportPrimaryInjury: r.report_primary_injury || '',
      dateModified: r.date_modified || '',
      gameType: r.game_type || 'REG',
    })
  }
  return out
}

/**
 * One row per (season, week, team, playerId) — keep the latest date_modified
 * (Friday/final report supersedes Wed/Thu practice-report days).
 */
export function dedupeInjuriesByLatestReport(
  injuries: CurrentWeekInjury[],
): CurrentWeekInjury[] {
  const best = new Map<string, CurrentWeekInjury>()
  for (const inj of injuries) {
    const key = `${inj.season}|${inj.week}|${inj.team}|${inj.playerId}`
    const prev = best.get(key)
    if (!prev || parseModifiedMs(inj.dateModified) >= parseModifiedMs(prev.dateModified)) {
      best.set(key, inj)
    }
  }
  return [...best.values()].sort((a, b) => {
    if (a.week !== b.week) return a.week - b.week
    if (a.team !== b.team) return a.team.localeCompare(b.team)
    return a.playerName.localeCompare(b.playerName)
  })
}

export function filterInjuriesByWeek(
  injuries: CurrentWeekInjury[],
  season: number,
  week: number,
): CurrentWeekInjury[] {
  return injuries.filter((i) => i.season === season && i.week === week)
}

/** Infer the latest week present in a season's injury file. */
export function latestWeekInInjuries(injuries: CurrentWeekInjury[]): number | null {
  let max: number | null = null
  for (const i of injuries) {
    if (max == null || i.week > max) max = i.week
  }
  return max
}

export function parseInjuriesCsv(text: string): CurrentWeekInjury[] {
  return dedupeInjuriesByLatestReport(rowsToInjuryRecords(parseCsv(text)))
}

export function currentWeekToHistoricalReports(
  injuries: CurrentWeekInjury[],
): HistoricalInjuryReport[] {
  return injuries.map((i) => ({
    season: i.season,
    week: i.week,
    team: i.team,
    playerId: i.playerId,
    playerName: i.playerName,
    position: i.position,
    reportStatus: i.reportStatus,
  }))
}

/**
 * Same differential as historical path — accepts current-week injury shape.
 */
export function computeCurrentWeekInjuryDifferential(
  team: string,
  week: number,
  season: number,
  playerValues: PlayerValue[],
  injuries: CurrentWeekInjury[],
  options?: { useReplacementAddBack?: boolean },
): number {
  return computeInjuryDifferential(
    team,
    week,
    season,
    playerValues,
    currentWeekToHistoricalReports(injuries),
    options,
  )
}

export function injuriesUrlForSeason(season: number): string {
  return `${NFLVERSE_INJURIES_BASE}/injuries_${season}.csv`
}
