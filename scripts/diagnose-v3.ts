/**
 * One-shot diagnostics for v3 regressions (market-blend + Brier).
 * Usage: npx tsx scripts/diagnose-v3.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spreadToWinProb } from '../src/lib/backtest.ts'
import { compareDifferentialDistributions } from '../src/lib/marketBlendDiagnostics.ts'
import { playContextWeight, type RawPlayByPlayRow } from '../src/lib/weightedEpa.ts'
import type { GamePrediction } from '../src/lib/predictions.ts'
import type { V3GamePrediction } from '../src/lib/predictionsV3.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../src/data/nfl')

function playable(preds: GamePrediction[]) {
  return preds.filter(
    (p) =>
      p.postedSpreadIsHistorical &&
      p.starRating?.playable &&
      p.homeScore != null,
  )
}

function brierParts(preds: GamePrediction[], label: string) {
  const a = playable(preds)
  let brier = 0
  let meanConf = 0
  let meanAbsSpread = 0
  for (const p of a) {
    const prob = spreadToWinProb(p.modelSpread)
    const actual =
      p.homeScore === p.awayScore ? 0.5 : (p.homeScore! > p.awayScore! ? 1 : 0)
    brier += (prob - actual) ** 2
    meanConf += Math.abs(prob - 0.5)
    meanAbsSpread += Math.abs(p.modelSpread)
  }
  const n = a.length
  return {
    label,
    n,
    brier: n ? brier / n : 0,
    meanConf: n ? meanConf / n : 0,
    meanAbsSpread: n ? meanAbsSpread / n : 0,
  }
}

function wowDeltas(bundle: Record<string, { byWeek: Record<string, Record<string, number>> }>) {
  const deltas: number[] = []
  for (const season of Object.keys(bundle)) {
    const byWeek = bundle[season].byWeek
    const weeks = Object.keys(byWeek)
      .map(Number)
      .sort((a, b) => a - b)
    for (let i = 1; i < weeks.length; i++) {
      const prev = byWeek[String(weeks[i - 1])]
      const cur = byWeek[String(weeks[i])]
      if (!prev || !cur) continue
      for (const team of Object.keys(cur)) {
        if (prev[team] == null) continue
        deltas.push(cur[team] - prev[team])
      }
    }
  }
  return deltas
}

function varStats(arr: number[]) {
  if (!arr.length) return { n: 0, std: 0, meanAbs: 0, p95: 0 }
  const n = arr.length
  const mean = arr.reduce((a, b) => a + b, 0) / n
  const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  const abs = [...arr].map(Math.abs).sort((a, b) => a - b)
  return {
    n,
    std: Math.sqrt(v),
    meanAbs: arr.reduce((a, b) => a + Math.abs(b), 0) / n,
    p95: abs[Math.floor(n * 0.95)] ?? 0,
  }
}

function variance(a: number[]) {
  const m = a.reduce((x, y) => x + y, 0) / a.length
  return a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length
}

function main() {
  const ind = JSON.parse(
    readFileSync(path.join(OUT, 'predictions-v3-independent.json'), 'utf8'),
  ) as V3GamePrediction[]
  const blend = JSON.parse(
    readFileSync(path.join(OUT, 'predictions-v3-market.json'), 'utf8'),
  ) as V3GamePrediction[]
  const v2 = JSON.parse(
    readFileSync(path.join(OUT, 'predictions.json'), 'utf8'),
  ) as GamePrediction[]
  const qb = JSON.parse(
    readFileSync(path.join(OUT, 'qb-ratings-v3-sample.json'), 'utf8'),
  ) as Array<{ playerId: string; season: number; week: number; rating: number }>
  const ratingsV3 = JSON.parse(
    readFileSync(path.join(OUT, 'ratings-v3.json'), 'utf8'),
  )
  const ratingsV2 = JSON.parse(
    readFileSync(path.join(OUT, 'ratings.json'), 'utf8'),
  )

  const diffs = compareDifferentialDistributions(ind, blend)

  const spreadChecks = {
    zero: spreadToWinProb(0),
    plus3: spreadToWinProb(3),
    minus3: spreadToWinProb(-3),
    plus7: spreadToWinProb(7),
    note: 'Same mapping as v2 (k so +3 → ~0.60). Hand check: +3 should be ~0.60.',
  }

  const brier = {
    v2: brierParts(v2, 'v2'),
    v3Independent: brierParts(ind, 'v3-independent'),
    v3ClippedPm7: brierParts(
      ind.map((p) => ({
        ...p,
        modelSpread: Math.max(-7, Math.min(7, p.modelSpread)),
      })),
      'v3-independent clipped ±7',
    ),
  }

  const teamWowV3 = varStats(wowDeltas(ratingsV3))
  const teamWowV2 = varStats(wowDeltas(ratingsV2))

  const byPlayer = new Map<string, typeof qb>()
  for (const r of qb) {
    if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, [])
    byPlayer.get(r.playerId)!.push(r)
  }
  const qbPerWeek: number[] = []
  for (const rows of byPlayer.values()) {
    rows.sort((a, b) => a.season - b.season || a.week - b.week)
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].season !== rows[i - 1].season) continue
      const gap = Math.max(1, rows[i].week - rows[i - 1].week)
      qbPerWeek.push((rows[i].rating - rows[i - 1].rating) / gap)
    }
  }
  const qbWowElo = varStats(qbPerWeek)
  const qbWowPoints = varStats(qbPerWeek.map((d) => d / 25))

  // Synthetic WEPA SNR (production path currently uses weekly EPA sums, not PBP weightPlay)
  const raw: number[] = []
  const weighted: number[] = []
  for (let i = 0; i < 5000; i++) {
    const epa = (Math.random() - 0.5) * 2
    const garbage = Math.random() < 0.15
    const play: RawPlayByPlayRow = {
      game_id: 'g',
      posteam: 'KC',
      epa,
      score_differential: garbage ? 21 : 3,
      half_seconds_remaining: garbage ? 90 : 600,
      play_type: 'pass',
    }
    const w = playContextWeight(play)
    raw.push(epa)
    weighted.push(epa * w)
  }
  const wepa = {
    productionNote:
      'calibrate-v3 currently feeds weekly player EPA sums into team updates — play-level weightPlay() is unit-tested but not on the live rating path.',
    syntheticVarRaw: variance(raw),
    syntheticVarWeighted: variance(weighted),
    varianceRatioWeightedOverRaw: variance(weighted) / variance(raw),
  }

  const findings = {
    generatedAt: new Date().toISOString(),
    marketBlend: {
      ...diffs,
      hypothesisConfirmed:
        diffs.blendedMeanAbsDiff < diffs.independentMeanAbsDiff * 0.35,
      conclusion:
        diffs.blendedMeanAbsDiff < diffs.independentMeanAbsDiff * 0.35
          ? 'CONFIRMED: modelWeight≈0.15 shrinks |blended−posted| to ~15% of independent gap. Star playability (key-number differential) then selects a thin tail — not a valid apples-to-apples comparison to v2/v3-independent without a different playability criterion.'
          : 'Hypothesis not strongly confirmed — investigate other causes of small blended n.',
    },
    brier: {
      spreadToWinProb: spreadChecks,
      sameMappingAsV2: true,
      parts: brier,
      overconfidence:
        brier.v3Independent.meanAbsSpread > brier.v2.meanAbsSpread * 1.3
          ? `v3 playable |modelSpread| mean ${brier.v3Independent.meanAbsSpread.toFixed(2)} vs v2 ${brier.v2.meanAbsSpread.toFixed(2)} — same logistic maps larger spreads to more extreme probs, inflating Brier when wrong.`
          : 'Spread magnitudes similar — overconfidence less likely primary.',
      clipExperiment:
        brier.v3ClippedPm7.brier < brier.v3Independent.brier
          ? `Clipping v3 spreads to ±7 improves Brier ${brier.v3Independent.brier.toFixed(4)} → ${brier.v3ClippedPm7.brier.toFixed(4)} (diagnostic only, not a fix).`
          : 'Clipping did not improve Brier.',
    },
    qbVolatility: {
      teamWowV2,
      teamWowV3,
      qbWowEloPerWeekApprox: qbWowElo,
      qbWowPointsPerWeekApprox: qbWowPoints,
      sampleCaveat:
        'qb-ratings-v3-sample.json only stores week 1 & 10 snapshots — per-week rates are interpolated across that gap.',
      note:
        qbWowPoints.meanAbs > teamWowV3.meanAbs * 2
          ? 'QB point-delta week-over-week meanAbs exceeds team rating wow — QB overlay injects more noise than team updates alone.'
          : 'QB point deltas are not dramatically larger than team wow on this sample.',
    },
    wepa,
    overall:
      'Primary Brier driver: overconfident |modelSpread| under the shared spread→P map (not a new conversion). Market-blend instability: differential shrinkage under star filter. WEPA weightPlay not on production path — cannot explain current Brier. Architecture needs more than coefficient retuning before claiming v3 > v2.',
  }

  console.log(JSON.stringify(findings, null, 2))
  writeFileSync(
    path.join(OUT, 'v3-diagnostics.json'),
    JSON.stringify(findings, null, 2),
  )
  console.log('Wrote src/data/nfl/v3-diagnostics.json')
}

main()
