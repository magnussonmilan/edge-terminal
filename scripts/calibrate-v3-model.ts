/**
 * Calibrate + backtest v3 (QB-Elo + weighted EPA) vs v2 fixtures.
 *
 * Split (as requested): train through 2022, validate 2023–2024.
 * Data note: seasons 2009–2024 (injury reports from 2009; spread_line clean
 * from ~2005). Train 2009–2022 / validate 2023–2024.
 *
 * WEPA: weekly player EPA summed by team as a stand-in when full PBP isn't
 * downloaded; weightPlay() remains the PBP path (unit-tested). QB updates use
 * starter passing_epa from nflverse weekly player stats.
 *
 * Usage: npm run calibrate:v3
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeBacktest, BREAKEVEN_WIN_RATE } from '../src/lib/backtest.ts'
import { scoreSeasons } from '../src/lib/calibration.ts'
import {
  fitCoverModel,
  fitModelWeight,
  type CoverModelCoeffs,
} from '../src/lib/marketBlend.ts'
import {
  DEFAULT_QB_ELO_PARAMS,
  QB_ELO_MEAN,
  QB_ELO_REPLACEMENT,
  getQbEloParams,
  qbGameEpaToEloPerformance,
  rollingCareerAverage,
  seedRookieQbRating,
  setQbEloParams,
  updateQbRating,
  type QbEloParams,
  type QbRating,
} from '../src/lib/qbElo.ts'
import {
  processSeasonRatingsV3,
  type QbStartInfo,
  type QbStartLookup,
  type TeamWepaLookup,
} from '../src/lib/teamEloV2.ts'
import { buildPreseasonPriors } from '../src/lib/srsPrior.ts'
import {
  buildIndependentV3Prediction,
  buildMarketBlendedV3Prediction,
  buildMarketBlendedV3PredictionLegacy,
  buildDynamicMarketBlendedPredictions,
  type V3GamePrediction,
} from '../src/lib/predictionsV3.ts'
import {
  DEFAULT_REGRESSION_PARAMS,
  type RegressionParams,
} from '../src/lib/marketRegression.ts'
import {
  ratingBeforeWeek,
  type GamePrediction,
} from '../src/lib/predictions.ts'
import type { GameResult, TeamRating } from '../src/lib/powerRatings.ts'
import { HOME_FIELD_ADVANTAGE } from '../src/lib/powerRatings.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')
const BASE = 'https://github.com/nflverse/nflverse-data/releases/download'

/** 2009–2024: matches published nfelo-style window; injuries available from 2009. */
const SEASONS = [
  2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021,
  2022, 2023, 2024,
]
const TRAIN = [
  2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021,
  2022,
]
const VALIDATION = [2023, 2024]

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
    } else {
      cur += ch
    }
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

function num(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`
}

type QbState = {
  elo: number
  history: number[]
  games: number
  name: string
}

type StarterRow = {
  playerId: string
  playerName: string
  team: string
  season: number
  week: number
  passingEpa: number
  attempts: number
}

async function loadWeeklyQbAndTeamEpa(seasons: number[]): Promise<{
  starters: StarterRow[]
  teamEpa: Map<string, number> // `${season}_${week}_${team}` → offense EPA sum
  draftPick: Map<string, number> // player_id → overall pick
}> {
  const starters: StarterRow[] = []
  const teamEpa = new Map<string, number>()
  const draftPick = new Map<string, number>()

  // Draft picks (best-effort for rookie seeds)
  try {
    const draftText = await fetchText(
      `${BASE}/draft_picks/draft_picks.csv`,
    )
    for (const row of parseCsv(draftText)) {
      const id = row.gsis_id || row.pfr_player_id || ''
      const pick = num(row.pick) ?? num(row.overall)
      const pos = (row.position || '').toUpperCase()
      if (id && pick != null && pos === 'QB') draftPick.set(id, pick)
    }
    console.log(`Draft picks loaded: ${draftPick.size} QBs`)
  } catch (e) {
    console.warn('Draft picks unavailable — rookies use mid-round seed', e)
  }

  for (const season of seasons) {
    console.log(`Fetching player week stats ${season}…`)
    const text = await fetchText(
      `${BASE}/stats_player/stats_player_week_${season}.csv`,
    )
    const rows = parseCsv(text)
    const qbByKey = new Map<string, StarterRow>()

    for (const row of rows) {
      if ((row.season_type || 'REG').toUpperCase() !== 'REG') continue
      const week = num(row.week)
      const team = (row.recent_team || row.team || '').trim()
      if (week == null || !team || week < 1 || week > 18) continue

      const passEpa = num(row.passing_epa) ?? 0
      const rushEpa = num(row.rushing_epa) ?? 0
      const recEpa = num(row.receiving_epa) ?? 0
      const off = passEpa + rushEpa + recEpa
      const tk = `${season}_${week}_${team}`
      teamEpa.set(tk, (teamEpa.get(tk) ?? 0) + off)

      const pos = (row.position || '').toUpperCase()
      const attempts = num(row.attempts) ?? num(row.passing_attempts) ?? 0
      if (pos !== 'QB' || attempts < 1) continue

      const playerId = row.player_id || row.gsis_id || ''
      if (!playerId) continue
      const playerName = row.player_display_name || row.player_name || playerId
      const key = `${season}_${week}_${team}`
      const prev = qbByKey.get(key)
      if (!prev || attempts > prev.attempts) {
        qbByKey.set(key, {
          playerId,
          playerName,
          team,
          season,
          week,
          passingEpa: passEpa,
          attempts,
        })
      }
    }

    starters.push(...qbByKey.values())
    console.log(`  ${season}: ${qbByKey.size} team-week QB starters`)
  }

  return { starters, teamEpa, draftPick }
}

function buildQbLookups(
  games: GameResult[],
  starters: StarterRow[],
  draftPick: Map<string, number>,
  params: QbEloParams = getQbEloParams(),
): {
  qbStart: QbStartLookup
  snapshots: QbRating[]
} {
  const starterByKey = new Map<string, StarterRow>()
  for (const s of starters) {
    starterByKey.set(`${s.season}_${s.week}_${s.team}`, s)
  }

  const state = new Map<string, QbState>()
  const before = new Map<string, QbStartInfo>()
  const snapshots: QbRating[] = []

  const bySeasonWeek = new Map<string, GameResult[]>()
  for (const g of games) {
    const k = `${g.season}_${g.week}`
    if (!bySeasonWeek.has(k)) bySeasonWeek.set(k, [])
    bySeasonWeek.get(k)!.push(g)
  }

  const seasons = [...new Set(games.map((g) => g.season))].sort((a, b) => a - b)

  for (const season of seasons) {
    const weeks = [
      ...new Set(games.filter((g) => g.season === season).map((g) => g.week)),
    ].sort((a, b) => a - b)

    for (const week of weeks) {
      const weekGames = bySeasonWeek.get(`${season}_${week}`) ?? []
      const teams = new Set<string>()
      for (const g of weekGames) {
        teams.add(g.homeTeam)
        teams.add(g.awayTeam)
      }

      for (const team of teams) {
        const s = starterByKey.get(`${season}_${week}_${team}`)
        if (!s) continue
        let st = state.get(s.playerId)
        if (!st) {
          const pick = draftPick.get(s.playerId) ?? 100
          const seeded = seedRookieQbRating(pick, QB_ELO_MEAN, params)
          st = {
            elo: seeded,
            history: [],
            games: 0,
            name: s.playerName,
          }
          state.set(s.playerId, st)
        }
        const info: QbStartInfo = {
          playerId: s.playerId,
          playerName: st.name,
          elo: st.elo,
        }
        before.set(`${season}_${week}_${team}`, info)
        snapshots.push({
          playerId: s.playerId,
          playerName: st.name,
          team,
          season,
          week,
          rating: st.elo,
        })
      }

      for (const team of teams) {
        const s = starterByKey.get(`${season}_${week}_${team}`)
        if (!s) continue
        const st = state.get(s.playerId)!
        const perf = qbGameEpaToEloPerformance(s.passingEpa, 0, params)
        const career = rollingCareerAverage(st.history, st.elo)
        const next = updateQbRating(st.elo, perf, career, st.games, params)
        st.history.push(st.elo)
        if (st.history.length > 48) st.history.shift()
        st.elo = next
        st.games += 1
        st.name = s.playerName
      }
    }
  }

  const qbStart: QbStartLookup = (season, week, team) =>
    before.get(`${season}_${week}_${team}`) ?? null

  return { qbStart, snapshots }
}

function buildIndependentPipeline(
  games: GameResult[],
  starters: StarterRow[],
  draftPick: Map<string, number>,
  teamEpa: Map<string, number>,
  params: QbEloParams,
  logSeasons = false,
): {
  independent: V3GamePrediction[]
  seasonBundles: Record<
    string,
    { seed: Record<string, number>; byWeek: Record<number, Record<string, number>> }
  >
  snapshots: QbRating[]
} {
  setQbEloParams(params)
  const { qbStart, snapshots } = buildQbLookups(
    games,
    starters,
    draftPick,
    params,
  )

  const gameById = new Map(games.map((g) => [g.gameId, g]))
  const teamWepa: TeamWepaLookup = (gameId, team) => {
    const g = gameById.get(gameId)
    if (!g) return null
    return teamEpa.get(`${g.season}_${g.week}_${team}`) ?? null
  }

  let priorFinal: Record<string, TeamRating> = {}
  const seasonBundles: Record<
    string,
    { seed: Record<string, number>; byWeek: Record<number, Record<string, number>> }
  > = {}
  const independent: V3GamePrediction[] = []

  for (const season of SEASONS) {
    const seasonGames = games.filter((g) => g.season === season)
    const prior = buildPreseasonPriors(priorFinal, [])
    const seed = prior.ratings
    for (const g of seasonGames) {
      if (seed[g.homeTeam] == null) seed[g.homeTeam] = 0
      if (seed[g.awayTeam] == null) seed[g.awayTeam] = 0
    }

    const { final, byWeek } = processSeasonRatingsV3(seasonGames, seed, {
      hfa: HOME_FIELD_ADVANTAGE,
      qbStart,
      teamWepa,
      neutralizeQbInUpdate: true,
    })
    seasonBundles[String(season)] = { seed, byWeek }
    priorFinal = final

    for (const g of seasonGames) {
      const hb = ratingBeforeWeek(byWeek, g.week, g.homeTeam, seed)
      const ab = ratingBeforeWeek(byWeek, g.week, g.awayTeam, seed)
      const hq = qbStart(g.season, g.week, g.homeTeam)
      const aq = qbStart(g.season, g.week, g.awayTeam)
      independent.push(
        buildIndependentV3Prediction(g, hb, ab, hq, aq, HOME_FIELD_ADVANTAGE),
      )
    }
    if (logSeasons) console.log(`Season ${season}: ${seasonGames.length} games rated`)
  }

  return { independent, seasonBundles, snapshots }
}

type Summary = ReturnType<typeof summarize>

function summarize(label: string, preds: GamePrediction[]) {
  const train = scoreSeasons(preds, TRAIN)
  const val = scoreSeasons(preds, VALIDATION)
  const all = computeBacktest(preds, 'all')
  console.log(
    `${label}: train ATS ${pct(train.overallWinRate)} (n=${train.totalPlayableGames}) · val ATS ${pct(val.overallWinRate)} (n=${val.totalPlayableGames}) · SU val ${pct(val.straightUp?.accuracy ?? 0)} · MAE val ${(val.mae?.mae ?? 0).toFixed(2)}`,
  )
  return {
    trainWinRate: train.overallWinRate,
    trainGames: train.totalPlayableGames,
    trainBrier: train.brierScore,
    trainRoi: train.roiIfFollowed,
    trainStraightUpAccuracy: train.straightUp?.accuracy ?? 0,
    trainStraightUpGames: train.straightUp?.totalGames ?? 0,
    trainMae: train.mae?.mae ?? 0,
    validationWinRate: val.overallWinRate,
    validationGames: val.totalPlayableGames,
    validationBrier: val.brierScore,
    validationRoi: val.roiIfFollowed,
    validationStraightUpAccuracy: val.straightUp?.accuracy ?? 0,
    validationStraightUpGames: val.straightUp?.totalGames ?? 0,
    validationMae: val.mae?.mae ?? 0,
    allWinRate: all.overallWinRate,
    allGames: all.totalPlayableGames,
    allBrier: all.brierScore,
    allRoi: all.roiIfFollowed,
    allStraightUpAccuracy: all.straightUp?.accuracy ?? 0,
    allMae: all.mae?.mae ?? 0,
    allMaeN: all.mae?.n ?? 0,
    beatsV2Holdout: false as boolean,
  }
}

type QbCalibLogEntry = {
  step: string
  coefficient: string
  oldValue: number
  newValue: number
  trainWinRateBefore: number
  trainWinRateAfter: number
  validationWinRateBefore: number
  validationWinRateAfter: number
  note?: string
}

const QB_ELO_GRIDS: Array<{ key: keyof QbEloParams; candidates: number[] }> = [
  { key: 'gameWeight', candidates: [0.2, 0.25, 0.3, 0.35, 0.4, 0.45] },
  { key: 'careerWeightCap', candidates: [0.35, 0.45, 0.55, 0.65] },
  { key: 'rookiePremiumMax', candidates: [60, 90, 120, 150] },
  { key: 'rookieDecayPickScale', candidates: [20, 30, 40, 60] },
  { key: 'wepaToEloScale', candidates: [4, 6, 8, 10, 12] },
]

function calibrateQbEloParams(
  games: GameResult[],
  starters: StarterRow[],
  draftPick: Map<string, number>,
  teamEpa: Map<string, number>,
): { params: QbEloParams; log: QbCalibLogEntry[]; before: Summary; after: Summary } {
  let params: QbEloParams = { ...DEFAULT_QB_ELO_PARAMS }
  const log: QbCalibLogEntry[] = []

  console.log('\n=== QB-Elo parameter calibration (select on train only) ===')
  let { independent: baselineInd } = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    teamEpa,
    params,
  )
  const before = summarize('v3-ind BEFORE qb calib', baselineInd)
  let bestTrain = before.trainWinRate
  let bestVal = before.validationWinRate

  let round = 0
  let adoptedInRound = true
  while (adoptedInRound && round < 4) {
    round += 1
    adoptedInRound = false
    console.log(`\nQB-Elo calib round ${round}…`)

    for (const grid of QB_ELO_GRIDS) {
      let bestValForParam = params[grid.key]
      let bestTrainForParam = bestTrain
      let bestValHoldout = bestVal
      let improved = false

      for (const candidate of grid.candidates) {
        if (candidate === params[grid.key]) continue
        const trial: QbEloParams = { ...params, [grid.key]: candidate }
        const { independent } = buildIndependentPipeline(
          games,
          starters,
          draftPick,
          teamEpa,
          trial,
        )
        const train = scoreSeasons(independent, TRAIN)
        const val = scoreSeasons(independent, VALIDATION)
        if (train.overallWinRate > bestTrainForParam + 1e-12) {
          bestTrainForParam = train.overallWinRate
          bestValForParam = candidate
          bestValHoldout = val.overallWinRate
          improved = true
        }
      }

      const oldValue = params[grid.key]
      if (improved && bestValForParam !== oldValue) {
        const note =
          bestValHoldout + 0.02 < bestVal
            ? 'Adopted on train; validation dropped >2pp — still selected on train only (honest log).'
            : 'Adopted on train win rate.'
        log.push({
          step: `qbElo-round-${round}`,
          coefficient: grid.key,
          oldValue,
          newValue: bestValForParam,
          trainWinRateBefore: bestTrain,
          trainWinRateAfter: bestTrainForParam,
          validationWinRateBefore: bestVal,
          validationWinRateAfter: bestValHoldout,
          note,
        })
        console.log(
          `  ${grid.key}: ${oldValue} → ${bestValForParam} (train ${pct(bestTrain)} → ${pct(bestTrainForParam)}; val ${pct(bestVal)} → ${pct(bestValHoldout)})`,
        )
        params = { ...params, [grid.key]: bestValForParam }
        bestTrain = bestTrainForParam
        bestVal = bestValHoldout
        adoptedInRound = true
      } else {
        log.push({
          step: `qbElo-round-${round}`,
          coefficient: grid.key,
          oldValue,
          newValue: oldValue,
          trainWinRateBefore: bestTrain,
          trainWinRateAfter: bestTrain,
          validationWinRateBefore: bestVal,
          validationWinRateAfter: bestVal,
          note: 'No train-win-rate gain across candidates — kept original.',
        })
        console.log(`  ${grid.key}: no train gain — keep ${oldValue}`)
      }
    }
  }

  const { independent: afterInd } = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    teamEpa,
    params,
  )
  const after = summarize('v3-ind AFTER qb calib', afterInd)
  return { params, log, before, after }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const games = JSON.parse(
    await readFile(path.join(OUT_DIR, 'games.json'), 'utf8'),
  ) as GameResult[]

  let v2Preds: GamePrediction[] = []
  try {
    v2Preds = JSON.parse(
      await readFile(path.join(OUT_DIR, 'predictions.json'), 'utf8'),
    ) as GamePrediction[]
  } catch {
    console.warn('predictions.json missing — v2 comparison will be empty')
  }

  const { starters, teamEpa, draftPick } = await loadWeeklyQbAndTeamEpa(SEASONS)

  // --- 1) QB-Elo calibration (independent only) ---
  const qbCalib = calibrateQbEloParams(games, starters, draftPick, teamEpa)
  setQbEloParams(qbCalib.params)

  console.log('\nSRS prior: prior-season-decay (fallback — no win-total odds)')
  const {
    independent,
    seasonBundles,
    snapshots,
  } = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    teamEpa,
    qbCalib.params,
    true,
  )

  // --- 2) Market blend: fit weight + cover on train ---
  const trainRows = independent
    .filter(
      (p) =>
        TRAIN.includes(p.season) &&
        p.postedSpread != null &&
        p.homeScore != null &&
        p.awayScore != null,
    )
    .map((p) => ({
      modelSpread: p.modelSpread,
      postedSpread: p.postedSpread!,
      homeMargin: p.homeScore! - p.awayScore!,
    }))

  const { weight: modelWeight, trainWinRate: blendTrainWr } =
    fitModelWeight(trainRows)
  console.log(
    `Fitted modelWeight=${modelWeight} (train blended ATS proxy ${pct(blendTrainWr)})`,
  )

  const coverRows = trainRows.map((r) => {
    const blended =
      modelWeight * r.modelSpread + (1 - modelWeight) * r.postedSpread
    const betHome = blended > r.postedSpread
    const homeCovered = r.homeMargin > r.postedSpread
    const push = r.homeMargin === r.postedSpread
    return {
      blendedSpread: blended,
      postedSpread: r.postedSpread,
      covered: push ? 0 : betHome === homeCovered ? 1 : 0,
    }
  })
  const coverCoeffs: CoverModelCoeffs = fitCoverModel(coverRows)

  // Static constant-weight blend (independent selection) — "before" for regression change
  const blendedStatic = independent.map((p) =>
    buildMarketBlendedV3Prediction(p, modelWeight, coverCoeffs, {
      blendMode: 'static-constant',
    }),
  )
  const blendedLegacy = independent.map((p) =>
    buildMarketBlendedV3PredictionLegacy(p, modelWeight, coverCoeffs),
  )

  // --- 3) Dynamic error-weighted regression: calibrate halfLife + normalizer on train ---
  console.log('\n=== Dynamic market regression calibration (train only) ===')
  const halfLifeCandidates = [4, 6, 8, 10, 12, 16]
  const normalizerCandidates = [3, 4, 6, 8, 10, 12]
  let bestReg: RegressionParams = {
    ...DEFAULT_REGRESSION_PARAMS,
    coldStartWeight: modelWeight,
  }
  let bestTrainAts = -1
  let bestTrainBrier = Infinity
  const regLog: Array<{
    halfLifeGames: number
    normalizer: number
    trainAts: number
    trainBrier: number
    validationAts: number
    validationBrier: number
    adopted: boolean
  }> = []

  for (const halfLifeGames of halfLifeCandidates) {
    for (const normalizer of normalizerCandidates) {
      const trial: RegressionParams = {
        halfLifeGames,
        normalizer,
        coldStartWeight: modelWeight,
      }
      const dyn = buildDynamicMarketBlendedPredictions(
        independent,
        coverCoeffs,
        trial,
      )
      const train = scoreSeasons(dyn, TRAIN)
      const val = scoreSeasons(dyn, VALIDATION)
      const adopted =
        train.overallWinRate > bestTrainAts + 1e-12 ||
        (Math.abs(train.overallWinRate - bestTrainAts) <= 1e-12 &&
          train.brierScore < bestTrainBrier - 1e-12)
      regLog.push({
        halfLifeGames,
        normalizer,
        trainAts: train.overallWinRate,
        trainBrier: train.brierScore,
        validationAts: val.overallWinRate,
        validationBrier: val.brierScore,
        adopted: false,
      })
      if (adopted) {
        bestTrainAts = train.overallWinRate
        bestTrainBrier = train.brierScore
        bestReg = trial
      }
    }
  }
  for (const row of regLog) {
    row.adopted =
      row.halfLifeGames === bestReg.halfLifeGames &&
      row.normalizer === bestReg.normalizer
  }
  console.log(
    `Best regression params: halfLife=${bestReg.halfLifeGames}, normalizer=${bestReg.normalizer}, coldStart=${bestReg.coldStartWeight} (train ATS ${pct(bestTrainAts)}, Brier ${bestTrainBrier.toFixed(3)})`,
  )

  const blendedDynamic = buildDynamicMarketBlendedPredictions(
    independent,
    coverCoeffs,
    bestReg,
  )

  const v2Summary = summarize('v2 (power+stars)', v2Preds)
  const v3IndSummary = summarize('v3-independent (calibrated QB)', independent)
  const blendPlayabilityBefore = summarize(
    'v3-blend LEGACY playability',
    blendedLegacy,
  )
  const blendStatic = summarize(
    'v3-blend STATIC constant weight',
    blendedStatic,
  )
  const blendDynamic = summarize(
    'v3-blend DYNAMIC error-weighted',
    blendedDynamic,
  )

  v3IndSummary.beatsV2Holdout =
    v3IndSummary.validationWinRate > v2Summary.validationWinRate + 0.01
  blendDynamic.beatsV2Holdout =
    blendDynamic.validationWinRate > v2Summary.validationWinRate + 0.01

  const qbHelpedHoldout =
    v3IndSummary.validationWinRate > qbCalib.before.validationWinRate + 0.005
  const playabilityGrew =
    blendStatic.validationGames > blendPlayabilityBefore.validationGames * 1.5
  const dynamicHelpedBrier =
    blendDynamic.validationBrier < blendStatic.validationBrier - 0.002
  const dynamicHelpedAts =
    blendDynamic.validationWinRate > blendStatic.validationWinRate + 0.005

  const parts: string[] = []
  if (qbHelpedHoldout) {
    parts.push(
      `QB-Elo calib moved holdout ATS ${pct(qbCalib.before.validationWinRate)} → ${pct(v3IndSummary.validationWinRate)}.`,
    )
  } else {
    parts.push(
      `QB-Elo calib did not meaningfully improve holdout ATS (${pct(qbCalib.before.validationWinRate)} → ${pct(v3IndSummary.validationWinRate)}).`,
    )
  }
  if (playabilityGrew) {
    parts.push(
      `Playability redesign holdout n ${blendPlayabilityBefore.validationGames} → ${blendStatic.validationGames}.`,
    )
  }
  if (dynamicHelpedAts || dynamicHelpedBrier) {
    parts.push(
      `Dynamic regression vs static: holdout ATS ${pct(blendStatic.validationWinRate)} → ${pct(blendDynamic.validationWinRate)}, Brier ${blendStatic.validationBrier.toFixed(3)} → ${blendDynamic.validationBrier.toFixed(3)}.`,
    )
  } else {
    parts.push(
      `Dynamic error-weighted regression did not improve holdout vs static constant weight (ATS ${pct(blendStatic.validationWinRate)} → ${pct(blendDynamic.validationWinRate)}, Brier ${blendStatic.validationBrier.toFixed(3)} → ${blendDynamic.validationBrier.toFixed(3)}) — trailing per-team errors may not be stable enough to exploit.`,
    )
  }
  if (!v3IndSummary.beatsV2Holdout && !blendDynamic.beatsV2Holdout) {
    parts.push('Neither v3 variant clearly beats v2 on holdout.')
  }
  const verdict = parts.join(' ')

  console.log(verdict)

  await writeFile(
    path.join(OUT_DIR, 'predictions-v3-independent.json'),
    JSON.stringify(independent),
  )
  await writeFile(
    path.join(OUT_DIR, 'predictions-v3-market.json'),
    JSON.stringify(blendedDynamic),
  )
  await writeFile(
    path.join(OUT_DIR, 'predictions-v3-market-static.json'),
    JSON.stringify(blendedStatic),
  )
  await writeFile(
    path.join(OUT_DIR, 'predictions-v3-market-legacy.json'),
    JSON.stringify(blendedLegacy),
  )
  await writeFile(
    path.join(OUT_DIR, 'ratings-v3.json'),
    JSON.stringify(seasonBundles),
  )
  await writeFile(
    path.join(OUT_DIR, 'qb-ratings-v3-sample.json'),
    JSON.stringify(
      snapshots.filter((s) => s.week === 1 || s.week === 10).slice(0, 400),
    ),
  )
  await writeFile(
    path.join(OUT_DIR, 'qb-elo-calibration-log.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        defaults: DEFAULT_QB_ELO_PARAMS,
        fitted: qbCalib.params,
        log: qbCalib.log,
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(OUT_DIR, 'market-regression-calibration-log.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source:
          'Inspired by nfelo "Using Market Regression to Improve Prediction Accuracy in the NFL" (2020-11-08) — independent implementation from published description.',
        fitted: bestReg,
        staticModelWeight: modelWeight,
        log: regLog,
      },
      null,
      2,
    ),
  )

  const report = {
    generatedAt: new Date().toISOString(),
    methodology:
      'v3 QB-Elo + weekly-EPA + market blend. Dynamic error-weighted regression (EWMA per-team trailing error → blend weight) vs static constant weight, reported separately. Selection still independent-star. IP: independent reimplementation from public methodology descriptions — not a port of nfelo source.',
    requestedSplit: {
      train: '2009–2022',
      validation: '2023–2024',
    },
    actualSplit: {
      trainSeasons: TRAIN,
      validationSeasons: VALIDATION,
      note: 'Seasons 2009–2024 (injury reports available from 2009; spread_line clean earlier).',
    },
    srsPrior: {
      method: 'prior-season-decay',
      note: 'No free historical win-total odds — SRS stretch goal blocked on data.',
    },
    wepaNote:
      'Team WEPA approximated from weekly player EPA sums; play-level weightPlay() used when PBP rows are supplied (unit tests).',
    qbEloParams: qbCalib.params,
    modelWeight,
    marketRegression: bestReg,
    coverCoeffs,
    replacementElo: QB_ELO_REPLACEMENT,
    breakeven: BREAKEVEN_WIN_RATE,
    v2: v2Summary,
    v3Independent: v3IndSummary,
    v3MarketBlended: blendDynamic,
    v3MarketBlendedStatic: blendStatic,
    changes: {
      qbEloCalibration: {
        before: qbCalib.before,
        after: v3IndSummary,
        paramsBefore: DEFAULT_QB_ELO_PARAMS,
        paramsAfter: qbCalib.params,
        helpedHoldout: qbHelpedHoldout,
      },
      marketBlendPlayability: {
        before: blendPlayabilityBefore,
        after: blendStatic,
        beforeMode: 'legacy-blended-stars',
        afterMode: 'independent-selection',
        sampleGrew: playabilityGrew,
        note: 'Selection uses independent star disagreement; betting signal is blended spread + coverProbability.',
      },
      marketRegressionDynamic: {
        before: blendStatic,
        after: blendDynamic,
        beforeMode: 'static-constant',
        afterMode: 'dynamic-error-weighted',
        params: bestReg,
        helpedHoldoutAts: dynamicHelpedAts,
        helpedHoldoutBrier: dynamicHelpedBrier,
        note: 'Trailing per-team EWMA squared error → relative_accuracy (sqrt each team then average) → clamped-linear weight. Half-life + normalizer fit on train ATS only.',
      },
    },
    verdict,
  }

  await writeFile(
    path.join(OUT_DIR, 'calibrated-v3.json'),
    JSON.stringify(report, null, 2),
  )

  console.log(
    'Wrote predictions-v3-*.json, ratings-v3.json, calibration logs, calibrated-v3.json',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
