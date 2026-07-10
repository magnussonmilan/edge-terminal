/**
 * Calibrate power-rating coefficients on 2022–2023, hold out 2024.
 * Records a calibration log and regenerates predictions.json.
 *
 * Usage: npx tsx scripts/calibrate-model.ts
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_SPLIT,
  estimateHfaFromHomeMargins,
  fitCoefficient,
  scoreSeasons,
  type CalibrationLogEntry,
} from '../src/lib/calibration.ts'
import { computeBacktest } from '../src/lib/backtest.ts'
import {
  processSeasonRatings,
  seedFromPriorSeason,
  type GameResult,
  type HfaConfig,
  type TeamRating,
  HOME_FIELD_ADVANTAGE,
} from '../src/lib/powerRatings.ts'
import {
  buildDefenderValuesFromSeasonRows,
  buildOlValuesFromSnapRows,
  buildPlayerValuesFromSeasonRows,
  computeInjuryDifferential,
  getPlayerValueCoeffs,
  resetPlayerValueCoeffs,
  setPlayerValueCoeffs,
  type HistoricalInjuryReport,
  type PlayerValue,
  type PlayerValueCoeffs,
} from '../src/lib/playerValues.ts'
import {
  buildGamePrediction,
  ratingBeforeWeek,
  type GamePrediction,
} from '../src/lib/predictions.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')
const BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
const SEASONS = [2022, 2023, 2024]

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`)
  return res.text()
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const headers = splitCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? ''
    })
    return row
  })
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

function buildInjuryLookup(
  playerValues: PlayerValue[],
  injuries: HistoricalInjuryReport[],
  useReplacement: boolean,
) {
  const cache = new Map<string, number>()
  return (season: number, week: number, team: string) => {
    const key = `${season}-${week}-${team}-${useReplacement ? 1 : 0}`
    if (cache.has(key)) return cache.get(key)!
    const seasonValues = playerValues.filter((p) => p.season === season)
    const v = computeInjuryDifferential(
      team,
      week,
      season,
      seasonValues,
      injuries,
      { useReplacementAddBack: useReplacement },
    )
    cache.set(key, v)
    return v
  }
}

function rebuildAllPredictions(
  games: GameResult[],
  injuryDiff: (s: number, w: number, t: string) => number,
  hfa: HfaConfig,
): {
  predictions: GamePrediction[]
  ratingsBySeason: Record<
    number,
    {
      byWeek: Record<number, Record<string, number>>
      seed: Record<string, number>
    }
  >
} {
  let priorFinal: Record<string, TeamRating> = {}
  const predictions: GamePrediction[] = []
  const ratingsBySeason: Record<
    number,
    {
      byWeek: Record<number, Record<string, number>>
      seed: Record<string, number>
    }
  > = {}

  for (const season of SEASONS) {
    const seasonGames = games.filter((g) => g.season === season)
    const seed =
      Object.keys(priorFinal).length > 0
        ? seedFromPriorSeason(priorFinal, 0.5)
        : {}
    const { final, byWeek } = processSeasonRatings(
      seasonGames,
      seed,
      injuryDiff,
      hfa,
    )
    ratingsBySeason[season] = { byWeek, seed }
    priorFinal = final
    for (const game of seasonGames) {
      const homeR = ratingBeforeWeek(byWeek, game.week, game.homeTeam, seed)
      const awayR = ratingBeforeWeek(byWeek, game.week, game.awayTeam, seed)
      predictions.push(buildGamePrediction(game, homeR, awayR, hfa))
    }
  }
  return { predictions, ratingsBySeason }
}

type ParsedSeasonRows = {
  stats: Record<number, Record<string, string>[]>
  def: Record<number, Record<string, string>[]>
  snaps: Record<number, Record<string, string>[]>
}

async function loadParsedSeasonRows(): Promise<ParsedSeasonRows> {
  const stats: Record<number, Record<string, string>[]> = {}
  const def: Record<number, Record<string, string>[]> = {}
  const snaps: Record<number, Record<string, string>[]> = {}
  for (const season of SEASONS) {
    console.log(`  cache season ${season} stats…`)
    stats[season] = parseCsv(
      await fetchText(`${BASE}/player_stats/player_stats_season_${season}.csv`),
    )
    def[season] = parseCsv(
      await fetchText(
        `${BASE}/player_stats/player_stats_def_season_${season}.csv`,
      ),
    )
    snaps[season] = parseCsv(
      await fetchText(`${BASE}/snap_counts/snap_counts_${season}.csv`),
    )
  }
  return { stats, def, snaps }
}

function buildPlayerValuesFromCache(
  cache: ParsedSeasonRows,
  pfrToGsis: Record<string, string>,
): PlayerValue[] {
  const playerValues: PlayerValue[] = []
  for (const season of SEASONS) {
    playerValues.push(
      ...buildPlayerValuesFromSeasonRows(cache.stats[season], season),
    )
    playerValues.push(
      ...buildDefenderValuesFromSeasonRows(cache.def[season], season),
    )
    playerValues.push(
      ...buildOlValuesFromSnapRows(cache.snaps[season], season, pfrToGsis),
    )
  }
  return playerValues
}

async function main() {
  console.log('=== Model calibration (train 2022–2023, holdout 2024) ===\n')
  const log: CalibrationLogEntry[] = []

  const games = JSON.parse(
    await readFile(path.join(OUT_DIR, 'games.json'), 'utf8'),
  ) as GameResult[]

  console.log('Loading injuries…')
  const injuries: HistoricalInjuryReport[] = []
  for (const season of SEASONS) {
    const csv = await fetchText(`${BASE}/injuries/injuries_${season}.csv`)
    for (const r of parseCsv(csv)) {
      if (r.game_type && r.game_type !== 'REG') continue
      injuries.push({
        season,
        week: Number(r.week),
        team: r.team,
        playerId: r.gsis_id,
        playerName: r.full_name || `${r.first_name} ${r.last_name}`,
        position: r.position || '',
        reportStatus: (r.report_status || '').toLowerCase(),
      })
    }
  }

  console.log('Loading players map + caching season CSVs…')
  const pfrToGsis: Record<string, string> = {}
  const playersCsv = await fetchText(`${BASE}/players/players.csv`)
  for (const r of parseCsv(playersCsv)) {
    if (r.pfr_id && r.gsis_id) pfrToGsis[r.pfr_id] = r.gsis_id
  }
  const csvCache = await loadParsedSeasonRows()

  resetPlayerValueCoeffs()
  let playerValues = buildPlayerValuesFromCache(csvCache, pfrToGsis)

  // --- Baseline: HFA=2.0, no replacement add-back ---
  console.log('\n[0] Baseline (HFA=2.0, injury subtract-only)…')
  let useReplacement = false
  let hfa: HfaConfig = HOME_FIELD_ADVANTAGE
  let injuryDiff = buildInjuryLookup(playerValues, injuries, useReplacement)
  let rebuilt = rebuildAllPredictions(games, injuryDiff, hfa)
  let preds = rebuilt.predictions
  let train = scoreSeasons(preds, DEFAULT_SPLIT.trainSeasons)
  let val = scoreSeasons(preds, DEFAULT_SPLIT.validationSeasons)
  console.log(`  train ${pct(train.overallWinRate)} · val ${pct(val.overallWinRate)}`)

  const baselineTrain = train.overallWinRate
  const baselineVal = val.overallWinRate

  // --- 1) Fit HFA: residual mean on train + global grid on train WR ---
  console.log('\n[1] Fit HFA (train residuals + train grid)…')
  // Residual HFA: actual home margin − (homeRating − awayRating) with HFA=0
  const zeroHfaPreds = rebuildAllPredictions(games, injuryDiff, 0).predictions
  const hfaBySeason: Record<number, number> = {}
  for (const season of DEFAULT_SPLIT.trainSeasons) {
    const residuals: number[] = []
    for (const p of zeroHfaPreds) {
      if (p.season !== season) continue
      const game = games.find((g) => g.gameId === p.gameId)
      if (!game) continue
      const actualMargin = game.homeScore - game.awayScore
      // modelSpread with HFA=0 ≈ homeRating - awayRating (+ rest/PT)
      const predictedWithoutHfa = p.modelSpread
      residuals.push(actualMargin - predictedWithoutHfa)
    }
    hfaBySeason[season] = estimateHfaFromHomeMargins(residuals)
    console.log(
      `  ${season} residual HFA ≈ ${hfaBySeason[season]} (n=${residuals.length})`,
    )
  }
  const meanTrainHfa =
    DEFAULT_SPLIT.trainSeasons.reduce((s, y) => s + hfaBySeason[y], 0) /
    DEFAULT_SPLIT.trainSeasons.length
  for (const season of DEFAULT_SPLIT.validationSeasons) {
    hfaBySeason[season] = Math.round(meanTrainHfa * 4) / 4
  }

  const hfaGrid = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]
  const fittedGlobal = fitCoefficient(
    hfaGrid,
    (value) => {
      const diff = buildInjuryLookup(playerValues, injuries, useReplacement)
      return rebuildAllPredictions(games, diff, value).predictions
    },
    DEFAULT_SPLIT,
    'train',
    baselineVal,
    HOME_FIELD_ADVANTAGE,
  )
  console.log(
    `  grid-best global HFA=${fittedGlobal.value} train=${pct(fittedGlobal.trainWinRate)} val=${pct(fittedGlobal.validationWinRate)}`,
  )

  injuryDiff = buildInjuryLookup(playerValues, injuries, useReplacement)
  const seasonMapPreds = rebuildAllPredictions(games, injuryDiff, hfaBySeason).predictions
  const seasonMapTrain = scoreSeasons(seasonMapPreds, DEFAULT_SPLIT.trainSeasons)
  const seasonMapVal = scoreSeasons(
    seasonMapPreds,
    DEFAULT_SPLIT.validationSeasons,
  )
  console.log(
    `  season-map train=${pct(seasonMapTrain.overallWinRate)} val=${pct(seasonMapVal.overallWinRate)}`,
  )

  // Select on train WR only (holdout stays clean)
  if (fittedGlobal.trainWinRate >= seasonMapTrain.overallWinRate) {
    hfa = fittedGlobal.value
    console.log('  → using global grid HFA')
  } else {
    hfa = { ...hfaBySeason }
    console.log('  → using season-level residual HFA map')
  }

  rebuilt = rebuildAllPredictions(games, injuryDiff, hfa)
  preds = rebuilt.predictions
  train = scoreSeasons(preds, DEFAULT_SPLIT.trainSeasons)
  val = scoreSeasons(preds, DEFAULT_SPLIT.validationSeasons)
  console.log(`  after HFA: train ${pct(train.overallWinRate)} · val ${pct(val.overallWinRate)}`)
  log.push({
    step: '1-hfa',
    coefficient: 'homeFieldAdvantage',
    oldValue: HOME_FIELD_ADVANTAGE,
    newValue:
      typeof hfa === 'number' ? hfa : `seasonMap:${JSON.stringify(hfa)}`,
    trainWinRateBefore: baselineTrain,
    trainWinRateAfter: train.overallWinRate,
    validationWinRateBefore: baselineVal,
    validationWinRateAfter: val.overallWinRate,
    note:
      train.overallWinRate > baselineTrain &&
      val.overallWinRate < baselineVal
        ? 'Train improved, validation did not — possible overfitting.'
        : 'HFA selected on train WR; 2024 never used for selection.',
  })

  // --- 2) Replacement add-back ---
  console.log('\n[2] Enable replacement-player add-back…')
  const beforeRepTrain = train.overallWinRate
  const beforeRepVal = val.overallWinRate
  useReplacement = true
  injuryDiff = buildInjuryLookup(playerValues, injuries, useReplacement)
  const withRepRebuilt = rebuildAllPredictions(games, injuryDiff, hfa)
  const withRepPreds = withRepRebuilt.predictions
  const withRepTrain = scoreSeasons(withRepPreds, DEFAULT_SPLIT.trainSeasons)
  const withRepVal = scoreSeasons(withRepPreds, DEFAULT_SPLIT.validationSeasons)
  console.log(
    `  with replacement: train ${pct(withRepTrain.overallWinRate)} · val ${pct(withRepVal.overallWinRate)}`,
  )
  // Keep replacement on (correct injury accounting) even if train WR dips —
  // but flag when train falls while holdout rises (unstable / small-sample).
  preds = withRepPreds
  rebuilt = withRepRebuilt
  train = withRepTrain
  val = withRepVal
  log.push({
    step: '2-replacement',
    coefficient: 'injuryReplacementAddBack',
    oldValue: 'off',
    newValue: 'on',
    trainWinRateBefore: beforeRepTrain,
    trainWinRateAfter: train.overallWinRate,
    validationWinRateBefore: beforeRepVal,
    validationWinRateAfter: val.overallWinRate,
    note:
      train.overallWinRate < beforeRepTrain - 0.01 &&
      val.overallWinRate > beforeRepVal
        ? 'Train fell while holdout rose — treat holdout bump cautiously (small sample / unstable).'
        : train.overallWinRate > beforeRepTrain &&
            val.overallWinRate <= beforeRepVal
          ? 'Train improved, validation did not — overfitting signal.'
          : 'Replacement add-back enabled (starter − backup, else position median).',
  })

  // --- 3) Fit player-value coefficients one at a time (select on train) ---
  console.log('\n[3] Fit player-value coefficients (one at a time, select on train)…')
  const coeffGrids: Array<{ key: keyof PlayerValueCoeffs; candidates: number[] }> = [
    { key: 'qbYpaMult', candidates: [0.15, 0.25, 0.35, 0.45, 0.55] },
    { key: 'qbIntMult', candidates: [10, 15, 20, 25, 30] },
    { key: 'qbEpaMult', candidates: [0.5, 1.0, 1.5, 2.0, 2.5] },
    { key: 'wrPprMult', candidates: [0.06, 0.09, 0.12, 0.15, 0.18] },
    { key: 'wrShareMult', candidates: [1, 1.5, 2, 2.5, 3] },
    { key: 'rbYpgDiv', candidates: [30, 35, 40, 45, 50] },
    { key: 'rbTdMult', candidates: [0.2, 0.3, 0.4, 0.5, 0.6] },
  ]

  for (const { key, candidates } of coeffGrids) {
    const before = getPlayerValueCoeffs()
    const beforeTrain = train.overallWinRate
    const beforeVal = val.overallWinRate
    const oldVal = before[key]

    const fitted = fitCoefficient(
      candidates,
      (value) => {
        setPlayerValueCoeffs({ ...getPlayerValueCoeffs(), [key]: value })
        const pv = buildPlayerValuesFromCache(csvCache, pfrToGsis)
        const diff = buildInjuryLookup(pv, injuries, useReplacement)
        return rebuildAllPredictions(games, diff, hfa).predictions
      },
      DEFAULT_SPLIT,
      'train',
      beforeVal,
      oldVal,
    )

    // Only adopt if train WR strictly improves; otherwise keep prior coeff
    const adopt =
      fitted.trainWinRate > beforeTrain + 1e-12 ? fitted.value : oldVal
    setPlayerValueCoeffs({ ...getPlayerValueCoeffs(), [key]: adopt })
    playerValues = buildPlayerValuesFromCache(csvCache, pfrToGsis)
    injuryDiff = buildInjuryLookup(playerValues, injuries, useReplacement)
    rebuilt = rebuildAllPredictions(games, injuryDiff, hfa)
    preds = rebuilt.predictions
    train = scoreSeasons(preds, DEFAULT_SPLIT.trainSeasons)
    val = scoreSeasons(preds, DEFAULT_SPLIT.validationSeasons)

    console.log(
      `  ${key}: ${oldVal} → ${adopt} | train ${pct(beforeTrain)}→${pct(train.overallWinRate)} | val ${pct(beforeVal)}→${pct(val.overallWinRate)}${
        train.overallWinRate > beforeTrain && val.overallWinRate < beforeVal
          ? '  ⚠ overfit'
          : adopt === oldVal
            ? '  (no train gain — kept)'
            : ''
      }`,
    )
    log.push({
      step: `3-${key}`,
      coefficient: key,
      oldValue: oldVal,
      newValue: adopt,
      trainWinRateBefore: beforeTrain,
      trainWinRateAfter: train.overallWinRate,
      validationWinRateBefore: beforeVal,
      validationWinRateAfter: val.overallWinRate,
      note:
        adopt === oldVal
          ? 'No train win-rate gain — coefficient unchanged.'
          : train.overallWinRate > beforeTrain &&
              val.overallWinRate < beforeVal
            ? 'Train improved, validation did not — overfitting.'
            : undefined,
    })
  }

  // Final summary
  const finalAll = computeBacktest(preds, 'all')
  console.log('\n=== Final ===')
  console.log(
    `train ${pct(train.overallWinRate)} · val ${pct(val.overallWinRate)} · all ${pct(finalAll.overallWinRate)}`,
  )
  if (val.overallWinRate < 0.524) {
    console.log(
      'Holdout still below 52.4% break-even — report honestly; do not expand scope chasing the number.',
    )
  }

  const coeffs = getPlayerValueCoeffs()
  const calibrated = {
    split: DEFAULT_SPLIT,
    hfa,
    playerCoeffs: coeffs,
    useReplacementAddBack: useReplacement,
    baseline: {
      trainWinRate: baselineTrain,
      validationWinRate: baselineVal,
    },
    final: {
      trainWinRate: train.overallWinRate,
      validationWinRate: val.overallWinRate,
      allWinRate: finalAll.overallWinRate,
      brierScore: finalAll.brierScore,
      roiIfFollowed: finalAll.roiIfFollowed,
      totalPlayableGames: finalAll.totalPlayableGames,
    },
    generatedAt: new Date().toISOString(),
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(
    path.join(OUT_DIR, 'calibrated-coeffs.json'),
    JSON.stringify(calibrated, null, 2),
  )
  await writeFile(
    path.join(OUT_DIR, 'calibration-log.json'),
    JSON.stringify(log, null, 2),
  )

  // Write updated predictions + player values
  const predictionsOut = preds.map((p) => ({
    ...p,
    homeRating: round(p.homeRating),
    awayRating: round(p.awayRating),
    modelSpread: round(p.modelSpread),
    postedSpread: p.postedSpread == null ? null : round(p.postedSpread),
    restAdjustment: round(p.restAdjustment),
    primetimeAdjustment: round(p.primetimeAdjustment),
    starRating: {
      ...p.starRating,
      differentialPct: round(p.starRating.differentialPct),
    },
  }))
  await writeFile(
    path.join(OUT_DIR, 'predictions.json'),
    JSON.stringify(predictionsOut),
  )
  await writeFile(
    path.join(OUT_DIR, 'player-values.json'),
    JSON.stringify(
      playerValues.map((p) => ({ ...p, baseValue: round(p.baseValue) })),
    ),
  )

  const ratingsCompact: Record<
    string,
    { seed: Record<string, number>; byWeek: Record<string, Record<string, number>> }
  > = {}
  for (const season of SEASONS) {
    const r = rebuilt.ratingsBySeason[season]
    ratingsCompact[String(season)] = {
      seed: Object.fromEntries(
        Object.entries(r.seed).map(([k, v]) => [k, round(v)]),
      ),
      byWeek: Object.fromEntries(
        Object.entries(r.byWeek).map(([w, m]) => [
          w,
          Object.fromEntries(Object.entries(m).map(([k, v]) => [k, round(v)])),
        ]),
      ),
    }
  }
  await writeFile(path.join(OUT_DIR, 'ratings.json'), JSON.stringify(ratingsCompact))

  console.log(
    `\nWrote calibrated-coeffs.json, calibration-log.json, predictions.json, ratings.json`,
  )
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
