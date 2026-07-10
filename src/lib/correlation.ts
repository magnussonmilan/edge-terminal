/**
 * Pearson correlation + joint hit-rate for correlated prop stacks.
 *
 * v2 (not implemented): recency weighting — weight the last 12 months of shared
 * games higher than older seasons in the correlation calc. Demo uses equal
 * weight across the lookback window.
 */

export type PropType =
  | 'pass_yds'
  | 'rec_yds'
  | 'rush_yds'
  | 'pass_att'
  | 'targets'

export interface PropSeries {
  playerId: string
  playerName: string
  team: string
  propType: PropType
  /** Aligned by game — same length/order as the paired series. */
  values: number[]
  gameIds: string[]
}

export interface CorrelationResult {
  pairKey: string
  playerA: { name: string; propType: PropType; playerId: string; team: string }
  playerB: { name: string; propType: PropType; playerId: string; team: string }
  correlation: number
  sampleSize: number
  tier: 'high' | 'medium' | 'low'
  jointHitRate: {
    hitsTogether: number
    totalGames: number
    rate: number
  }
  /** Illustrative lines = rolling averages of each series (not live odds). */
  lineA: number
  lineB: number
  /** Shared-game series for charting (aligned). */
  seriesA: number[]
  seriesB: number[]
  gameIds: string[]
}

export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 2) return 0

  // Pairwise delete non-finite
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      xs.push(a[i])
      ys.push(b[i])
    }
  }
  if (xs.length < 2) return 0

  const meanX = xs.reduce((s, v) => s + v, 0) / xs.length
  const meanY = ys.reduce((s, v) => s + v, 0) / ys.length

  let num = 0
  let denX = 0
  let denY = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  if (den === 0) return 0
  return num / den
}

export function computeJointHitRate(
  a: number[],
  aLine: number,
  b: number[],
  bLine: number,
): CorrelationResult['jointHitRate'] {
  const n = Math.min(a.length, b.length)
  let hitsTogether = 0
  let totalGames = 0
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) continue
    totalGames += 1
    if (a[i] >= aLine && b[i] >= bLine) hitsTogether += 1
  }
  return {
    hitsTogether,
    totalGames,
    rate: totalGames > 0 ? hitsTogether / totalGames : 0,
  }
}

export function correlationTier(r: number): CorrelationResult['tier'] {
  const abs = Math.abs(r)
  if (abs > 0.6) return 'high'
  if (abs >= 0.3) return 'medium'
  return 'low'
}

export function mean(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return 0
  return finite.reduce((s, v) => s + v, 0) / finite.length
}

function alignSeries(
  a: PropSeries,
  b: PropSeries,
): { valuesA: number[]; valuesB: number[]; gameIds: string[] } | null {
  const mapB = new Map(b.gameIds.map((id, i) => [id, b.values[i]]))
  const valuesA: number[] = []
  const valuesB: number[] = []
  const gameIds: string[] = []
  for (let i = 0; i < a.gameIds.length; i++) {
    const gid = a.gameIds[i]
    if (!mapB.has(gid)) continue
    const vb = mapB.get(gid)!
    const va = a.values[i]
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue
    valuesA.push(va)
    valuesB.push(vb)
    gameIds.push(gid)
  }
  return { valuesA, valuesB, gameIds }
}

function pairKey(a: PropSeries, b: PropSeries): string {
  const left = `${a.playerId}:${a.propType}`
  const right = `${b.playerId}:${b.propType}`
  return left < right ? `${left}__${right}` : `${right}__${left}`
}

/**
 * Build stack candidates from teammate prop series.
 * Only pairs with sampleSize >= minSampleSize are returned.
 */
export function buildStackCandidates(
  series: PropSeries[],
  minSampleSize = 20,
): CorrelationResult[] {
  const byTeam = new Map<string, PropSeries[]>()
  for (const s of series) {
    const list = byTeam.get(s.team) ?? []
    list.push(s)
    byTeam.set(s.team, list)
  }

  const results: CorrelationResult[] = []
  const seen = new Set<string>()

  for (const teamSeries of byTeam.values()) {
    for (let i = 0; i < teamSeries.length; i++) {
      for (let j = i + 1; j < teamSeries.length; j++) {
        const a = teamSeries[i]
        const b = teamSeries[j]
        if (a.playerId === b.playerId) continue
        if (!isInterestingPair(a.propType, b.propType)) continue

        const key = pairKey(a, b)
        if (seen.has(key)) continue
        seen.add(key)

        const aligned = alignSeries(a, b)
        if (!aligned || aligned.gameIds.length < minSampleSize) continue

        const { valuesA, valuesB, gameIds } = aligned
        const lineA = mean(valuesA)
        const lineB = mean(valuesB)
        const correlation = pearsonCorrelation(valuesA, valuesB)
        const jointHitRate = computeJointHitRate(valuesA, lineA, valuesB, lineB)

        results.push({
          pairKey: key,
          playerA: {
            name: a.playerName,
            propType: a.propType,
            playerId: a.playerId,
            team: a.team,
          },
          playerB: {
            name: b.playerName,
            propType: b.propType,
            playerId: b.playerId,
            team: b.team,
          },
          correlation,
          sampleSize: gameIds.length,
          tier: correlationTier(correlation),
          jointHitRate,
          lineA,
          lineB,
          seriesA: valuesA,
          seriesB: valuesB,
          gameIds,
        })
      }
    }
  }

  return results.sort((x, y) => y.jointHitRate.rate - x.jointHitRate.rate)
}

/** Demo-relevant pairings: QB/WR yards, RB/QB rush, WR target competition. */
function isInterestingPair(a: PropType, b: PropType): boolean {
  const set = new Set([a, b])
  if (set.has('pass_yds') && set.has('rec_yds')) return true
  if (set.has('pass_att') && set.has('targets')) return true
  // QB rush ↔ RB rush only (both props must be rush_yds)
  if (a === 'rush_yds' && b === 'rush_yds') return true
  if (a === 'targets' && b === 'targets') return true // WR1/WR2 competition
  if (a === 'rec_yds' && b === 'rec_yds') return true
  return false
}

export function propTypeLabel(prop: PropType): string {
  switch (prop) {
    case 'pass_yds':
      return 'Pass Yds'
    case 'rec_yds':
      return 'Rec Yds'
    case 'rush_yds':
      return 'Rush Yds'
    case 'pass_att':
      return 'Pass Att'
    case 'targets':
      return 'Targets'
  }
}
