/**
 * Formula-driven player values (point-spread equivalents) + retrospective
 * injury differential for power-rating TGPL.
 *
 * v2 (not implemented): compounding/exponential impact when multiple injuries
 * hit the same position group in the same week — v1 is a flat sum only.
 */

export type SkillPosition = 'QB' | 'WR' | 'TE' | 'RB' | 'OL' | 'DL' | 'LB' | 'DB'

export interface PlayerValue {
  playerId: string
  playerName: string
  team: string
  position: SkillPosition
  baseValue: number
  season: number
}

export interface QBSeasonStats {
  playerId: string
  playerName: string
  team: string
  games: number
  attempts: number
  passingYards: number
  interceptions: number
  passingEpa: number
}

export interface ReceivingSeasonStats {
  playerId: string
  playerName: string
  team: string
  position: 'WR' | 'TE'
  games: number
  receptions: number
  receivingYards: number
  receivingTds: number
  targetShare: number
}

export interface RushingSeasonStats {
  playerId: string
  playerName: string
  team: string
  games: number
  carries: number
  rushingYards: number
  rushingTds: number
}

export interface OLineStats {
  playerId: string
  playerName: string
  team: string
  /** Proxy: games started / available — demo uses games played. */
  games: number
}

export interface DefensiveStats {
  playerId: string
  playerName: string
  team: string
  position: 'DL' | 'LB' | 'DB'
  games: number
  /** Counting stats when available; otherwise 0. */
  tackles?: number
  sacks?: number
  interceptions?: number
}

export interface HistoricalInjuryReport {
  season: number
  week: number
  team: string
  playerId: string
  playerName: string
  position: string
  /** out | doubtful | questionable | … */
  reportStatus: string
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** QB: base 7.5, adjusted by efficiency proxies, clamped [6.0, 9.5]. */
export function valueQB(stats: QBSeasonStats): PlayerValue {
  const att = Math.max(1, stats.attempts)
  const ypa = stats.passingYards / att
  const intRate = stats.interceptions / att
  const epaPerPlay = stats.attempts > 0 ? stats.passingEpa / att : 0

  // Normalize roughly around league-average-ish anchors
  const ypaAdj = (ypa - 7.0) * 0.35
  const intAdj = -(intRate - 0.025) * 20
  const epaAdj = epaPerPlay * 1.5

  const baseValue = clamp(7.5 + ypaAdj + intAdj + epaAdj, 6.0, 9.5)
  return {
    playerId: stats.playerId,
    playerName: stats.playerName,
    team: stats.team,
    position: 'QB',
    baseValue,
    season: 0,
  }
}

/** WR/TE: PPR-style production / game + target share, clamped [0, 3]. */
export function valueReceiver(stats: ReceivingSeasonStats): PlayerValue {
  const g = Math.max(1, stats.games)
  const pprPerGame =
    (stats.receptions + stats.receivingYards / 10 + stats.receivingTds * 6) / g
  const shareAdj = (stats.targetShare || 0) * 2
  const baseValue = clamp(pprPerGame * 0.12 + shareAdj, 0, 3.0)
  return {
    playerId: stats.playerId,
    playerName: stats.playerName,
    team: stats.team,
    position: stats.position,
    baseValue,
    season: 0,
  }
}

/** RB: yards + TD production, clamped [0, 2.5]. */
export function valueRB(stats: RushingSeasonStats): PlayerValue {
  const g = Math.max(1, stats.games)
  const ypg = stats.rushingYards / g
  const tdpg = stats.rushingTds / g
  const baseValue = clamp(ypg / 40 + tdpg * 0.4, 0, 2.5)
  return {
    playerId: stats.playerId,
    playerName: stats.playerName,
    team: stats.team,
    position: 'RB',
    baseValue,
    season: 0,
  }
}

/** OL: flat baseline scaled by availability, clamped [0.5, 1.5]. */
export function valueOL(stats: OLineStats): PlayerValue {
  const availability = clamp(stats.games / 17, 0, 1)
  const baseValue = clamp(0.5 + availability, 0.5, 1.5)
  return {
    playerId: stats.playerId,
    playerName: stats.playerName,
    team: stats.team,
    position: 'OL',
    baseValue,
    season: 0,
  }
}

/** Front seven / secondary: baseline + counting stats, clamped by position. */
export function valueDefender(stats: DefensiveStats): PlayerValue {
  const g = Math.max(1, stats.games)
  const tackles = (stats.tackles ?? 0) / g
  const sacks = (stats.sacks ?? 0) / g
  const ints = (stats.interceptions ?? 0) / g

  let base = 0.8
  let hi = 2.0
  if (stats.position === 'DL') {
    base = 0.9 + sacks * 0.35 + tackles * 0.02
    hi = 2.5
  } else if (stats.position === 'LB') {
    base = 0.8 + tackles * 0.04 + sacks * 0.2
    hi = 2.2
  } else {
    base = 0.7 + ints * 0.5 + tackles * 0.03
    hi = 2.0
  }

  return {
    playerId: stats.playerId,
    playerName: stats.playerName,
    team: stats.team,
    position: stats.position,
    baseValue: clamp(base, 0.3, hi),
    season: 0,
  }
}

const OUT_STATUSES = new Set(['out', 'doubtful'])

/**
 * Value lost to out/doubtful players that week (flat sum — no compounding).
 * Replacement add-back omitted when replacement not in the value map.
 */
export function computeInjuryDifferential(
  team: string,
  week: number,
  season: number,
  playerValues: PlayerValue[],
  injuryReports: HistoricalInjuryReport[],
): number {
  const teamValues = playerValues.filter(
    (p) => p.team === team && (p.season === season || p.season === 0),
  )
  const byId = new Map(teamValues.map((p) => [p.playerId, p]))

  const reports = injuryReports.filter(
    (r) =>
      r.team === team &&
      r.week === week &&
      r.season === season &&
      OUT_STATUSES.has(r.reportStatus.toLowerCase()),
  )

  let lost = 0
  for (const report of reports) {
    const pv = byId.get(report.playerId)
    if (pv) lost += pv.baseValue
  }
  return lost
}

export function buildPlayerValuesFromSeasonRows(
  rows: Array<Record<string, string>>,
  season: number,
): PlayerValue[] {
  const out: PlayerValue[] = []

  for (const row of rows) {
    const pos = (row.position || '').toUpperCase()
    const playerId = row.player_id
    const playerName = row.player_display_name || row.player_name || playerId
    const team = row.recent_team
    const games = Number(row.games) || 0
    if (!playerId || !team || games <= 0) continue

    let pv: PlayerValue | null = null

    if (pos === 'QB' && Number(row.attempts) >= 50) {
      pv = valueQB({
        playerId,
        playerName,
        team,
        games,
        attempts: Number(row.attempts) || 0,
        passingYards: Number(row.passing_yards) || 0,
        interceptions: Number(row.interceptions) || 0,
        passingEpa: Number(row.passing_epa) || 0,
      })
    } else if ((pos === 'WR' || pos === 'TE') && Number(row.targets) >= 20) {
      pv = valueReceiver({
        playerId,
        playerName,
        team,
        position: pos,
        games,
        receptions: Number(row.receptions) || 0,
        receivingYards: Number(row.receiving_yards) || 0,
        receivingTds: Number(row.receiving_tds) || 0,
        targetShare: Number(row.target_share) || 0,
      })
    } else if (pos === 'RB' && Number(row.carries) >= 40) {
      pv = valueRB({
        playerId,
        playerName,
        team,
        games,
        carries: Number(row.carries) || 0,
        rushingYards: Number(row.rushing_yards) || 0,
        rushingTds: Number(row.rushing_tds) || 0,
      })
    }

    if (pv) {
      pv.season = season
      out.push(pv)
    }
  }

  return out
}
