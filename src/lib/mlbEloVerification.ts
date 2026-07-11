/**
 * Independent verification of FiveThirtyEight MLB Elo / rating probabilities.
 *
 * Compute accuracy and Brier directly from raw pre-game probabilities vs
 * actual score1/score2 — do not cite published summaries without this check.
 *
 * Attribution (data): Data by FiveThirtyEight/ABC News, CC BY 4.0.
 * https://github.com/fivethirtyeight/data/tree/master/mlb-elo
 * Verification numbers below are Edge Terminal's own computations over that
 * data (Adapted Material if redistributed) — not 538's published figures.
 */

import type { MlbEloGame } from './mlbTypes'

export interface MlbEloVerificationResult {
  eloAccuracy: number
  eloBrier: number
  ratingAccuracy: number
  ratingBrier: number
  /** Games used for Elo metrics (decided, with elo_prob1). */
  eloN: number
  /** Games used for rating metrics (decided, with rating_prob1). */
  ratingN: number
  n: number
  eraLabel: string
  minSeason: number | null
  maxSeason: number | null
  /** Home-team-always baseline accuracy on the same Elo sample. */
  homeBaselineAccuracy: number
}

export interface EraFilter {
  minSeason?: number
  maxSeason?: number
  label?: string
}

/** Default era cuts — hide more than a single 1871–present aggregate would. */
export const DEFAULT_MLB_ERAS: EraFilter[] = [
  { minSeason: 1871, maxSeason: 1949, label: 'pre-1950' },
  { minSeason: 1950, maxSeason: 1999, label: '1950–1999' },
  { minSeason: 2000, maxSeason: 2013, label: '2000–2013' },
  { minSeason: 2014, maxSeason: 9999, label: 'modern (2014+)' },
  { minSeason: 2014, maxSeason: 2023, label: '2014–2023 (pitcher-era window)' },
  { minSeason: 2021, maxSeason: 2023, label: '2021–2023 (recent / opener era)' },
]

function inEra(season: number, filter?: EraFilter): boolean {
  if (!filter) return true
  if (filter.minSeason != null && season < filter.minSeason) return false
  if (filter.maxSeason != null && season > filter.maxSeason) return false
  return true
}

function eraLabel(filter?: EraFilter): string {
  if (filter?.label) return filter.label
  if (!filter) return 'all seasons'
  const lo = filter.minSeason ?? '…'
  const hi = filter.maxSeason ?? '…'
  return `${lo}–${hi}`
}

/**
 * Straight-up: did P(home) ≥ 0.5 match the winner?
 * Ties excluded from accuracy denominator (same spirit as NFL SU helper).
 * Brier uses actual 1/0 for home win/loss; ties use 0.5 outcome.
 */
export function scoreProbabilitySeries(
  probs: number[],
  actualHomeWin: Array<0 | 1 | 0.5>,
): { accuracy: number; brier: number; nAccuracy: number; nBrier: number } {
  if (probs.length !== actualHomeWin.length) {
    throw new Error('probs and outcomes length mismatch')
  }
  let correct = 0
  let nAcc = 0
  let brierSum = 0
  let nBrier = 0
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i]!
    const y = actualHomeWin[i]!
    brierSum += (p - y) ** 2
    nBrier += 1
    if (y === 0.5) continue
    const predHome = p >= 0.5
    const actualHome = y === 1
    if (predHome === actualHome) correct += 1
    nAcc += 1
  }
  return {
    accuracy: nAcc > 0 ? correct / nAcc : 0,
    brier: nBrier > 0 ? brierSum / nBrier : 0,
    nAccuracy: nAcc,
    nBrier,
  }
}

/**
 * Compute our own accuracy/Brier for both 538 systems on a game list.
 */
export function verifyEloModelAccuracy(
  games: MlbEloGame[],
  eraFilter?: EraFilter,
): MlbEloVerificationResult {
  const eloProbs: number[] = []
  const eloOutcomes: Array<0 | 1 | 0.5> = []
  const ratingProbs: number[] = []
  const ratingOutcomes: Array<0 | 1 | 0.5> = []
  let homeCorrect = 0
  let homeN = 0
  let minSeason: number | null = null
  let maxSeason: number | null = null

  for (const g of games) {
    if (!inEra(g.season, eraFilter)) continue
    if (g.score1 == null || g.score2 == null) continue

    minSeason = minSeason == null ? g.season : Math.min(minSeason, g.season)
    maxSeason = maxSeason == null ? g.season : Math.max(maxSeason, g.season)

    const outcome: 0 | 1 | 0.5 =
      g.score1 === g.score2 ? 0.5 : g.score1 > g.score2 ? 1 : 0

    if (Number.isFinite(g.eloProb1)) {
      eloProbs.push(g.eloProb1)
      eloOutcomes.push(outcome)
      if (outcome !== 0.5) {
        homeN += 1
        if (outcome === 1) homeCorrect += 1
      }
    }

    if (g.ratingProb1 != null && Number.isFinite(g.ratingProb1)) {
      ratingProbs.push(g.ratingProb1)
      ratingOutcomes.push(outcome)
    }
  }

  const elo = scoreProbabilitySeries(eloProbs, eloOutcomes)
  const rating = scoreProbabilitySeries(ratingProbs, ratingOutcomes)

  return {
    eloAccuracy: elo.accuracy,
    eloBrier: elo.brier,
    ratingAccuracy: rating.accuracy,
    ratingBrier: rating.brier,
    eloN: elo.nAccuracy,
    ratingN: rating.nAccuracy,
    n: elo.nAccuracy,
    eraLabel: eraLabel(eraFilter),
    minSeason,
    maxSeason,
    homeBaselineAccuracy: homeN > 0 ? homeCorrect / homeN : 0,
  }
}

export function verifyAllEras(
  games: MlbEloGame[],
  eras: EraFilter[] = DEFAULT_MLB_ERAS,
): MlbEloVerificationResult[] {
  return [
    verifyEloModelAccuracy(games),
    ...eras.map((e) => verifyEloModelAccuracy(games, e)),
  ]
}

/**
 * Crude opener / bullpen-day proxy: both listed starters have |pitcher_adj| < threshold.
 * Not ground truth — only a checkable era signal from columns we actually have.
 */
export function verifyRatingByPitcherAdjProxy(
  games: MlbEloGame[],
  opts: {
    minSeason: number
    maxSeason: number
    lowAdjThreshold?: number
  },
): {
  lowAdj: MlbEloVerificationResult
  normalAdj: MlbEloVerificationResult
  lowAdjThreshold: number
} {
  const thr = opts.lowAdjThreshold ?? 3
  const low: MlbEloGame[] = []
  const normal: MlbEloGame[] = []
  for (const g of games) {
    if (g.season < opts.minSeason || g.season > opts.maxSeason) continue
    if (g.score1 == null || g.score2 == null) continue
    if (g.pitcher1Adj == null || g.pitcher2Adj == null) continue
    if (Math.abs(g.pitcher1Adj) < thr && Math.abs(g.pitcher2Adj) < thr) {
      low.push(g)
    } else {
      normal.push(g)
    }
  }
  return {
    lowAdjThreshold: thr,
    lowAdj: verifyEloModelAccuracy(low, {
      minSeason: opts.minSeason,
      maxSeason: opts.maxSeason,
      label: `low-|adj| both starters (<${thr})`,
    }),
    normalAdj: verifyEloModelAccuracy(normal, {
      minSeason: opts.minSeason,
      maxSeason: opts.maxSeason,
      label: `normal pitcher adj`,
    }),
  }
}

/** Year-by-year rating vs Elo for opener-era inspection. */
export function verifyBySeason(
  games: MlbEloGame[],
  minSeason: number,
  maxSeason: number,
): MlbEloVerificationResult[] {
  const out: MlbEloVerificationResult[] = []
  for (let y = minSeason; y <= maxSeason; y++) {
    out.push(
      verifyEloModelAccuracy(games, {
        minSeason: y,
        maxSeason: y,
        label: String(y),
      }),
    )
  }
  return out
}
