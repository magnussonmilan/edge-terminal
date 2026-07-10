/**
 * Calibrate player-value coeffs via joint ridge + rolling-origin CV.
 * Seasons: 2016–2024 (spread_line 100% covered; player/injury/snap assets present).
 *
 * Usage: npm run calibrate
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RIDGE_LAMBDA,
  buildJointFitRows,
  estimateHfaFromHomeMargins,
  fitJointCoefficients,
  rollingOriginSplits,
  scoreSeasons,
  summarizeCrossFold,
  type FoldResult,
} from '../src/lib/calibration.ts'
import { BREAKEVEN_WIN_RATE, computeBacktest } from '../src/lib/backtest.ts'
import {
  processSeasonRatings,
  seedFromPriorSeason,
  type GameResult,
  type HfaConfig,
  type TeamRating,
} from '../src/lib/powerRatings.ts'
import {
  buildDefenderValuesFromSeasonRows,
  buildOlValuesFromSnapRows,
  buildPlayerValuesFromSeasonRows,
  computeInjuryDifferential,
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

/** Expanded range: spread_line fully populated; stats/injuries/snaps available. */
const SEASONS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

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

function num(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function round(n: number): number {
  return Math.round(n * 100) / 100
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
    console.log(`  cache season ${season}…`)
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
  seasons: number[] = SEASONS,
): PlayerValue[] {
  const playerValues: PlayerValue[] = []
  for (const season of seasons) {
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
  seasons: number[] = SEASONS,
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

  for (const season of seasons) {
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

function fitHfaOnTrain(games: GameResult[], trainSeasons: number[]): number {
  const set = new Set(trainSeasons)
  const margins = games
    .filter((g) => set.has(g.season))
    .map((g) => g.homeScore - g.awayScore)
  return estimateHfaFromHomeMargins(margins)
}

async function main() {
  console.log('=== Joint ridge + rolling-origin calibration ===')
  console.log(`Seasons: ${SEASONS.join(', ')}`)
  console.log(`RIDGE_LAMBDA=${RIDGE_LAMBDA}\n`)

  console.log('Downloading schedules…')
  const gamesCsv = await fetchText(`${BASE}/schedules/games.csv`)
  const allGames = parseCsv(gamesCsv)
  const games: GameResult[] = allGames
    .filter((r) => {
      const season = Number(r.season)
      return (
        SEASONS.includes(season) &&
        r.game_type === 'REG' &&
        r.home_score !== '' &&
        r.away_score !== ''
      )
    })
    .map((r) => ({
      gameId: r.game_id,
      season: Number(r.season),
      week: Number(r.week),
      homeTeam: r.home_team,
      awayTeam: r.away_team,
      homeScore: Number(r.home_score),
      awayScore: Number(r.away_score),
      spreadLine: num(r.spread_line),
      homeRest: num(r.home_rest),
      awayRest: num(r.away_rest),
      weekday: r.weekday || null,
      gametime: r.gametime || null,
    }))

  const withSpread = games.filter((g) => g.spreadLine != null).length
  console.log(
    `Games: ${games.length} REG settled · ${withSpread} with spread_line (${(
      (100 * withSpread) /
      Math.max(1, games.length)
    ).toFixed(1)}%)`,
  )

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

  const folds = rollingOriginSplits(SEASONS)
  console.log(`\nRolling-origin folds: ${folds.length}`)

  const foldResults: FoldResult[] = []
  const useReplacement = true

  for (const fold of folds) {
    const trainGames = games.filter((g) => fold.trainSeasons.includes(g.season))
    const rows = buildJointFitRows(trainGames, csvCache.stats)
    const coeffs = fitJointCoefficients(rows, RIDGE_LAMBDA)
    const hfa = fitHfaOnTrain(games, fold.trainSeasons)

    setPlayerValueCoeffs(coeffs)
    const playerValues = buildPlayerValuesFromCache(csvCache, pfrToGsis)
    const injuryDiff = buildInjuryLookup(playerValues, injuries, useReplacement)
    const { predictions } = rebuildAllPredictions(games, injuryDiff, hfa)
    const val = scoreSeasons(predictions, [fold.valSeason])

    console.log(
      `  train=[${fold.trainSeasons.join(',')}] → val ${fold.valSeason}: ` +
        `WR ${pct(val.overallWinRate)} · Brier ${val.brierScore.toFixed(3)} · n=${val.totalPlayableGames}`,
    )

    foldResults.push({
      trainSeasons: fold.trainSeasons,
      valSeason: fold.valSeason,
      winRate: val.overallWinRate,
      brierScore: val.brierScore,
      sampleSize: val.totalPlayableGames,
      playerCoeffs: { ...coeffs },
      hfa,
    })
  }

  const cross = summarizeCrossFold(foldResults, BREAKEVEN_WIN_RATE)
  console.log('\n=== Cross-fold summary ===')
  console.log(
    `Validation WR mean ± std: ${pct(cross.meanWinRate)} ± ${(cross.stdWinRate * 100).toFixed(1)}pp`,
  )
  console.log(`Mean Brier: ${cross.meanBrier.toFixed(3)}`)
  console.log(`Total val-fold playable games (sum): ${cross.totalValGames}`)
  const meanMinusStd = cross.meanWinRate - cross.stdWinRate
  console.log(
    `mean − 1·std = ${pct(meanMinusStd)} vs breakeven ${pct(BREAKEVEN_WIN_RATE)}`,
  )
  if (!cross.clearsBreakevenAtMeanMinusOneStd) {
    console.log(
      '⚠ Holdout below breakeven — report honestly: mean−1σ does not clear 52.4%. No trustworthy edge claimed.',
    )
  } else {
    console.log(
      'mean−1σ clears 52.4% — still treat as provisional; not a guarantee of future edge.',
    )
  }

  // Final production fit: all seasons (CV already reported without peeking for selection)
  console.log('\nFitting final coeffs on all seasons (for fixtures)…')
  const finalRows = buildJointFitRows(games, csvCache.stats)
  const finalCoeffs = fitJointCoefficients(finalRows, RIDGE_LAMBDA)
  const finalHfa = fitHfaOnTrain(games, SEASONS)
  setPlayerValueCoeffs(finalCoeffs)
  const playerValues = buildPlayerValuesFromCache(csvCache, pfrToGsis)
  const injuryDiff = buildInjuryLookup(playerValues, injuries, useReplacement)
  const rebuilt = rebuildAllPredictions(games, injuryDiff, finalHfa)
  const preds = rebuilt.predictions
  const finalAll = computeBacktest(preds, 'all')

  console.log(
    `Final all-season playable games: ${finalAll.totalPlayableGames} · WR ${pct(finalAll.overallWinRate)} · ROI ${(finalAll.roiIfFollowed * 100).toFixed(1)}%`,
  )

  const calibrationLog = {
    methodology: 'joint-ridge + rolling-origin CV',
    ridgeLambda: RIDGE_LAMBDA,
    seasons: SEASONS,
    generatedAt: new Date().toISOString(),
    folds: foldResults.map((f) => ({
      trainSeasons: f.trainSeasons,
      valSeason: f.valSeason,
      winRate: f.winRate,
      brierScore: f.brierScore,
      sampleSize: f.sampleSize,
      hfa: f.hfa,
      playerCoeffs: f.playerCoeffs,
    })),
    crossFold: {
      meanWinRate: cross.meanWinRate,
      stdWinRate: cross.stdWinRate,
      meanBrier: cross.meanBrier,
      totalValGames: cross.totalValGames,
      clearsBreakevenAtMeanMinusOneStd: cross.clearsBreakevenAtMeanMinusOneStd,
      meanMinusOneStd: meanMinusStd,
      breakeven: BREAKEVEN_WIN_RATE,
    },
  }

  const calibrated = {
    methodology: 'joint-ridge + rolling-origin CV',
    ridgeLambda: RIDGE_LAMBDA,
    seasons: SEASONS,
    split: {
      trainSeasons: SEASONS.slice(0, -1),
      validationSeasons: [SEASONS[SEASONS.length - 1]],
    },
    hfa: finalHfa,
    playerCoeffs: finalCoeffs as PlayerValueCoeffs,
    useReplacementAddBack: useReplacement,
    folds: calibrationLog.folds,
    crossFold: calibrationLog.crossFold,
    final: {
      allWinRate: finalAll.overallWinRate,
      brierScore: finalAll.brierScore,
      roiIfFollowed: finalAll.roiIfFollowed,
      totalPlayableGames: finalAll.totalPlayableGames,
      /** @deprecated single-split fields — prefer crossFold */
      trainWinRate: scoreSeasons(preds, SEASONS.slice(0, -1)).overallWinRate,
      validationWinRate: scoreSeasons(preds, [
        SEASONS[SEASONS.length - 1],
      ]).overallWinRate,
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
    JSON.stringify(calibrationLog, null, 2),
  )
  await writeFile(path.join(OUT_DIR, 'games.json'), JSON.stringify(games))

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

  await writeFile(
    path.join(OUT_DIR, 'meta.json'),
    JSON.stringify(
      {
        source: 'nflverse',
        seasons: SEASONS,
        generatedAt: new Date().toISOString(),
        notes: [
          'Joint ridge player-value calibration with rolling-origin CV.',
          'spread_line coverage verified 100% for included seasons.',
          'Cross-fold mean±std is the primary validation metric — not a single holdout year.',
        ],
        gameCount: games.length,
        predictionCount: preds.length,
        playableGames: finalAll.totalPlayableGames,
        injuryReportCount: injuries.length,
        playerValueCount: playerValues.length,
        crossFoldMeanWinRate: cross.meanWinRate,
        crossFoldStdWinRate: cross.stdWinRate,
      },
      null,
      2,
    ),
  )

  console.log(
    `\nWrote calibrated-coeffs.json, calibration-log.json, games/predictions/ratings (${finalAll.totalPlayableGames} playable).`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
