/**
 * Calibrate + backtest v3 with staged architecture changes:
 *   1. Non-net per-team grades (vs legacy net margin)
 *   2. Real play-level WEPA + calibrated PD/WEPA blend (vs weekly EPA 70/30)
 *   3. CPOE in QB Elo (vs EPA-only)
 *   4. Fitted margin-probability distribution (vs Walters table)
 *
 * Each change is measured with its own before/after holdout delta.
 * Split: train 2009–2022 / validate 2023–2024.
 *
 * IP: independent reimplementation from published nfelo methodology articles —
 * not a port of any nfelo/greerreNFL source.
 *
 * Usage: npm run calibrate:v3
 */
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeBacktest, BREAKEVEN_WIN_RATE } from '../src/lib/backtest.ts'
import { scoreSeasons } from '../src/lib/calibration.ts'
import {
  fitCoverModel,
  fitModelWeight,
  setCoverProbabilityMode,
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
  DEFAULT_PD_WEIGHT,
  processSeasonRatingsV3,
  setPdWeight,
  type QbStartInfo,
  type QbStartLookup,
  type TeamWepaLookup,
} from '../src/lib/teamEloV2.ts'
import {
  weightPlay,
  type RawPlayByPlayRow,
  type TeamWepaComponents,
} from '../src/lib/weightedEpa.ts'
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
  fitMarginDistribution,
  setMarginDistParams,
  resetMarginDistParams,
  DEFAULT_MARGIN_DIST_PARAMS,
  type MarginDistParams,
} from '../src/lib/marginDistribution.ts'
import { setStarRatingMode } from '../src/lib/keyNumbers.ts'
import {
  ratingBeforeWeek,
  type GamePrediction,
} from '../src/lib/predictions.ts'
import type { GameResult, TeamRating } from '../src/lib/powerRatings.ts'
import { HOME_FIELD_ADVANTAGE } from '../src/lib/powerRatings.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '../src/data/nfl')
const BASE = 'https://github.com/nflverse/nflverse-data/releases/download'
const PBP_CACHE = path.join(OUT_DIR, 'team-wepa-pbp-cache.json')

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
  cpoe: number | null
}

type PipelineOpts = {
  useNetMargin: boolean
  pdWeight: number
  /** When true, pass CPOE into qbGameEpaToEloPerformance. */
  useCpoe: boolean
  teamWepa: TeamWepaLookup
}

async function loadWeeklyQbAndTeamEpa(seasons: number[]): Promise<{
  starters: StarterRow[]
  /** `${season}_${week}_${team}` → offense EPA sum (weekly stand-in). */
  teamEpa: Map<string, number>
  draftPick: Map<string, number>
}> {
  const starters: StarterRow[] = []
  const teamEpa = new Map<string, number>()
  const draftPick = new Map<string, number>()

  try {
    const draftText = await fetchText(`${BASE}/draft_picks/draft_picks.csv`)
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
      const cpoe =
        num(row.passing_cpoe) ??
        num(row.completion_percentage_above_expectation)
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
          cpoe,
        })
      }
    }

    starters.push(...qbByKey.values())
    console.log(`  ${season}: ${qbByKey.size} team-week QB starters`)
  }

  return { starters, teamEpa, draftPick }
}

/**
 * Build weekly-EPA stand-in components: offense = own weekly EPA sum,
 * defenseAllowed = opponent's weekly EPA sum for the same game.
 */
function weeklyEpaAsComponents(
  games: GameResult[],
  teamEpa: Map<string, number>,
): Map<string, TeamWepaComponents> {
  const out = new Map<string, TeamWepaComponents>()
  for (const g of games) {
    const hOff = teamEpa.get(`${g.season}_${g.week}_${g.homeTeam}`)
    const aOff = teamEpa.get(`${g.season}_${g.week}_${g.awayTeam}`)
    if (hOff != null) {
      out.set(`${g.gameId}_${g.homeTeam}`, {
        offenseWepa: hOff,
        defenseWepaAllowed: aOff ?? 0,
      })
    }
    if (aOff != null) {
      out.set(`${g.gameId}_${g.awayTeam}`, {
        offenseWepa: aOff,
        defenseWepaAllowed: hOff ?? 0,
      })
    }
  }
  return out
}

/**
 * Download nflverse PBP, run weightPlay(), cache per-game team components.
 * Streams line-by-line (never materializes the full CSV as objects) and
 * writes the cache after each season so a crash can resume.
 */
async function loadPbpTeamWepa(
  seasons: number[],
): Promise<Map<string, TeamWepaComponents>> {
  let merged: Record<string, TeamWepaComponents> = {}
  const doneSeasons = new Set<number>()

  try {
    await access(PBP_CACHE)
    const raw = JSON.parse(await readFile(PBP_CACHE, 'utf8')) as {
      seasons?: number[]
      rows: Record<string, TeamWepaComponents>
    }
    if (raw.rows && typeof raw.rows === 'object') {
      merged = raw.rows
      for (const s of raw.seasons ?? []) doneSeasons.add(s)
      console.log(
        `Loaded PBP WEPA cache: ${Object.keys(merged).length} team-game rows (${doneSeasons.size} seasons)`,
      )
    } else {
      // Legacy flat map format
      merged = raw as unknown as Record<string, TeamWepaComponents>
      console.log(
        `Loaded legacy PBP WEPA cache: ${Object.keys(merged).length} team-game rows`,
      )
      // Treat as complete if large enough
      if (Object.keys(merged).length > 10000) {
        return new Map(Object.entries(merged))
      }
    }
  } catch {
    console.log('No PBP WEPA cache — downloading play-by-play…')
  }

  const NEEDED = new Set([
    'game_id',
    'posteam',
    'defteam',
    'epa',
    'score_differential',
    'half_seconds_remaining',
    'qtr',
    'interception',
    'fumble_lost',
    'fumble',
    'incomplete_pass',
    'touchdown',
    'pass',
    'rush',
    'play_type',
    'passer_player_id',
    'passer_player_name',
    'special_teams_play',
    'season_type',
  ])

  for (const season of seasons) {
    if (doneSeasons.has(season)) {
      console.log(`  PBP ${season}: cached — skip`)
      continue
    }
    console.log(`Fetching PBP ${season}…`)
    const res = await fetch(`${BASE}/pbp/play_by_play_${season}.csv`)
    if (!res.ok) throw new Error(`Failed PBP ${season}: ${res.status}`)
    if (!res.body) throw new Error(`No body for PBP ${season}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let headers: string[] | null = null
    let colIndex: Record<string, number> = {}
    let playCount = 0
    const seasonAgg: Record<string, Record<string, TeamWepaComponents>> = {}

    const processLine = (line: string) => {
      if (!line) return
      if (!headers) {
        headers = splitCsvLine(line)
        colIndex = {}
        headers.forEach((h, i) => {
          if (NEEDED.has(h)) colIndex[h] = i
        })
        return
      }
      const cols = splitCsvLine(line)
      const seasonType = (cols[colIndex.season_type] || 'REG').toUpperCase()
      if (seasonType !== 'REG') return
      const gameId = cols[colIndex.game_id] || ''
      const posteam = (cols[colIndex.posteam] || '').trim()
      const epa = cols[colIndex.epa]
      if (!gameId || !posteam || epa === '' || epa == null) return

      const raw: RawPlayByPlayRow = {
        game_id: gameId,
        posteam,
        defteam: cols[colIndex.defteam],
        epa,
        score_differential: cols[colIndex.score_differential],
        half_seconds_remaining: cols[colIndex.half_seconds_remaining],
        qtr: cols[colIndex.qtr],
        interception: cols[colIndex.interception],
        fumble_lost: cols[colIndex.fumble_lost],
        fumble: cols[colIndex.fumble],
        incomplete_pass: cols[colIndex.incomplete_pass],
        touchdown: cols[colIndex.touchdown],
        pass: cols[colIndex.pass],
        rush: cols[colIndex.rush],
        play_type: cols[colIndex.play_type],
        passer_player_id: cols[colIndex.passer_player_id],
        passer_player_name: cols[colIndex.passer_player_name],
        special_teams_play: cols[colIndex.special_teams_play],
      }
      const wp = weightPlay(raw)
      if (!wp) return
      playCount += 1
      if (!seasonAgg[wp.gameId]) seasonAgg[wp.gameId] = {}
      const off = seasonAgg[wp.gameId][wp.team] ?? {
        offenseWepa: 0,
        defenseWepaAllowed: 0,
      }
      off.offenseWepa += wp.weightedEpa
      seasonAgg[wp.gameId][wp.team] = off
      const defteam = (raw.defteam || '').trim()
      if (defteam) {
        const def = seasonAgg[wp.gameId][defteam] ?? {
          offenseWepa: 0,
          defenseWepaAllowed: 0,
        }
        def.defenseWepaAllowed += wp.weightedEpa
        seasonAgg[wp.gameId][defteam] = def
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        processLine(line)
      }
    }
    if (buffer.trim()) processLine(buffer.replace(/\r$/, ''))

    let n = 0
    for (const [gameId, teams] of Object.entries(seasonAgg)) {
      for (const [team, comps] of Object.entries(teams)) {
        merged[`${gameId}_${team}`] = comps
        n += 1
      }
    }
    doneSeasons.add(season)
    await writeFile(
      PBP_CACHE,
      JSON.stringify({ seasons: [...doneSeasons].sort((a, b) => a - b), rows: merged }),
    )
    console.log(
      `  ${season}: ${playCount} weighted plays → ${n} team-games (cache updated)`,
    )
  }

  console.log(`PBP WEPA ready: ${Object.keys(merged).length} team-game rows`)
  return new Map(Object.entries(merged))
}

function lookupFromMap(
  map: Map<string, TeamWepaComponents>,
): TeamWepaLookup {
  return (gameId, team) => map.get(`${gameId}_${team}`) ?? null
}

function buildQbLookups(
  games: GameResult[],
  starters: StarterRow[],
  draftPick: Map<string, number>,
  params: QbEloParams = getQbEloParams(),
  useCpoe = false,
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
        const perf = qbGameEpaToEloPerformance(
          s.passingEpa,
          0,
          params,
          useCpoe ? s.cpoe : null,
        )
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
  params: QbEloParams,
  opts: PipelineOpts,
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
  setPdWeight(opts.pdWeight)
  const { qbStart, snapshots } = buildQbLookups(
    games,
    starters,
    draftPick,
    params,
    opts.useCpoe,
  )

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
      teamWepa: opts.teamWepa,
      neutralizeQbInUpdate: true,
      pdWeight: opts.pdWeight,
      useNetMargin: opts.useNetMargin,
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
  // Include 0 so CPOE can be rejected on train
  { key: 'cpoeToEloScale', candidates: [0, 1, 2, 3, 5, 8] },
]

function calibrateQbEloParams(
  games: GameResult[],
  starters: StarterRow[],
  draftPick: Map<string, number>,
  pipelineBase: Omit<PipelineOpts, 'useCpoe'>,
  useCpoe: boolean,
): { params: QbEloParams; log: QbCalibLogEntry[]; before: Summary; after: Summary } {
  let params: QbEloParams = {
    ...DEFAULT_QB_ELO_PARAMS,
    // Start from previously-known good values when present
    gameWeight: 0.3,
    careerWeightCap: 0.45,
    rookieDecayPickScale: 30,
    cpoeToEloScale: useCpoe ? 0 : 0,
  }
  const log: QbCalibLogEntry[] = []
  const grids = useCpoe
    ? QB_ELO_GRIDS
    : QB_ELO_GRIDS.filter((g) => g.key !== 'cpoeToEloScale')

  console.log(
    `\n=== QB-Elo parameter calibration (useCpoe=${useCpoe}, select on train only) ===`,
  )
  let { independent: baselineInd } = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    params,
    { ...pipelineBase, useCpoe },
  )
  const before = summarize('v3-ind BEFORE qb calib', baselineInd)
  let bestTrain = before.trainWinRate
  let bestVal = before.validationWinRate

  let round = 0
  let adoptedInRound = true
  while (adoptedInRound && round < 3) {
    round += 1
    adoptedInRound = false
    console.log(`\nQB-Elo calib round ${round}…`)

    for (const grid of grids) {
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
          trial,
          { ...pipelineBase, useCpoe },
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
        log.push({
          step: `qbElo-round-${round}`,
          coefficient: grid.key,
          oldValue,
          newValue: bestValForParam,
          trainWinRateBefore: bestTrain,
          trainWinRateAfter: bestTrainForParam,
          validationWinRateBefore: bestVal,
          validationWinRateAfter: bestValHoldout,
          note: 'Adopted on train win rate.',
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
    params,
    { ...pipelineBase, useCpoe },
  )
  const after = summarize('v3-ind AFTER qb calib', afterInd)
  return { params, log, before, after }
}

function calibratePdWeight(
  games: GameResult[],
  starters: StarterRow[],
  draftPick: Map<string, number>,
  params: QbEloParams,
  teamWepa: TeamWepaLookup,
  useCpoe: boolean,
): { pdWeight: number; before: Summary; after: Summary } {
  console.log('\n=== PD / WEPA blend weight calibration (train only) ===')
  const candidates = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
  const beforePipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    params,
    {
      useNetMargin: false,
      pdWeight: 0.3,
      useCpoe,
      teamWepa,
    },
  )
  const before = summarize('blend BEFORE pd calib (0.3)', beforePipe.independent)

  let bestW = 0.3
  let bestTrain = before.trainWinRate
  let bestVal = before.validationWinRate

  for (const w of candidates) {
    if (w === 0.3) continue
    const { independent } = buildIndependentPipeline(
      games,
      starters,
      draftPick,
      params,
      { useNetMargin: false, pdWeight: w, useCpoe, teamWepa },
    )
    const train = scoreSeasons(independent, TRAIN)
    const val = scoreSeasons(independent, VALIDATION)
    console.log(
      `  pdWeight=${w}: train ${pct(train.overallWinRate)} val ${pct(val.overallWinRate)}`,
    )
    if (train.overallWinRate > bestTrain + 1e-12) {
      bestTrain = train.overallWinRate
      bestW = w
      bestVal = val.overallWinRate
    }
  }

  console.log(
    `Best pdWeight=${bestW} (train ${pct(bestTrain)}, val ${pct(bestVal)})`,
  )
  const afterPipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    params,
    { useNetMargin: false, pdWeight: bestW, useCpoe, teamWepa },
  )
  const after = summarize(`blend AFTER pd=${bestW}`, afterPipe.independent)
  return { pdWeight: bestW, before, after }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  // Default star/cover modes for staged baselines
  setStarRatingMode('walters')
  setCoverProbabilityMode('logistic')
  resetMarginDistParams()

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
  const weeklyComponents = weeklyEpaAsComponents(games, teamEpa)
  const weeklyLookup = lookupFromMap(weeklyComponents)

  const pbpMap = await loadPbpTeamWepa(SEASONS)
  const pbpLookup = lookupFromMap(pbpMap)
  const pbpCoverage = games.filter(
    (g) =>
      pbpMap.has(`${g.gameId}_${g.homeTeam}`) &&
      pbpMap.has(`${g.gameId}_${g.awayTeam}`),
  ).length
  console.log(
    `PBP WEPA coverage: ${pbpCoverage}/${games.length} games (${pct(pbpCoverage / games.length)})`,
  )

  // Prefer PBP; fall back to weekly components when a game is missing
  const hybridLookup: TeamWepaLookup = (gameId, team) =>
    pbpLookup(gameId, team) ?? weeklyLookup(gameId, team)

  // ─── Change 1: non-net vs net (weekly EPA, fixed 70/30, no CPOE, Walters) ───
  console.log('\n========== CHANGE 1: Non-net grades ==========')
  setStarRatingMode('walters')
  const baseParams: QbEloParams = {
    ...DEFAULT_QB_ELO_PARAMS,
    gameWeight: 0.3,
    careerWeightCap: 0.45,
    rookieDecayPickScale: 30,
    cpoeToEloScale: 0,
  }
  const netPipe = buildIndependentPipeline(games, starters, draftPick, baseParams, {
    useNetMargin: true,
    pdWeight: 0.3,
    useCpoe: false,
    teamWepa: weeklyLookup,
  })
  const nonNetPipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    baseParams,
    {
      useNetMargin: false,
      pdWeight: 0.3,
      useCpoe: false,
      teamWepa: weeklyLookup,
    },
  )
  const change1Before = summarize('C1 BEFORE (net margin)', netPipe.independent)
  const change1After = summarize(
    'C1 AFTER (non-net grades)',
    nonNetPipe.independent,
  )
  const change1Helped =
    change1After.validationWinRate > change1Before.validationWinRate + 0.005

  // ─── Change 2: real PBP WEPA + calibrated PD blend (QB params held fixed) ───
  console.log('\n========== CHANGE 2: Real WEPA + PD blend ==========')
  const change2BeforePipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    baseParams,
    {
      useNetMargin: false,
      pdWeight: 0.3,
      useCpoe: false,
      teamWepa: weeklyLookup,
    },
  )
  const change2Before = summarize(
    'C2 BEFORE (weekly EPA, pd=0.3)',
    change2BeforePipe.independent,
  )

  // Calibrate PD weight on PBP path with fixed QB params (isolate WEPA/blend)
  const pdCalib = calibratePdWeight(
    games,
    starters,
    draftPick,
    baseParams,
    hybridLookup,
    false,
  )
  const change2After = pdCalib.after
  const change2Helped =
    change2After.validationWinRate > change2Before.validationWinRate + 0.005
  const pdBeatAssumed70_30 =
    pdCalib.pdWeight !== 0.3 &&
    change2After.trainWinRate > change2Before.trainWinRate + 1e-12

  // Fit QB params once on the post-C2 path (used by C3+; not part of C2 delta)
  const qbPre = calibrateQbEloParams(
    games,
    starters,
    draftPick,
    {
      useNetMargin: false,
      pdWeight: pdCalib.pdWeight,
      teamWepa: hybridLookup,
    },
    false,
  )

  // ─── Change 3: CPOE only (hold all other QB params fixed) ───
  console.log('\n========== CHANGE 3: CPOE ==========')
  setStarRatingMode('walters')
  const cpoeOffParams = { ...qbPre.params, cpoeToEloScale: 0 }
  const change3BeforePipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    cpoeOffParams,
    {
      useNetMargin: false,
      pdWeight: pdCalib.pdWeight,
      useCpoe: false,
      teamWepa: hybridLookup,
    },
  )
  const change3Before = summarize(
    'C3 BEFORE (no CPOE)',
    change3BeforePipe.independent,
  )

  // Grid-search only cpoeToEloScale on train
  let bestCpoe = 0
  let bestCpoeTrain = change3Before.trainWinRate
  let bestCpoeVal = change3Before.validationWinRate
  for (const scale of [0, 1, 2, 3, 5, 8]) {
    if (scale === 0) continue
    const trial = { ...cpoeOffParams, cpoeToEloScale: scale }
    const { independent } = buildIndependentPipeline(
      games,
      starters,
      draftPick,
      trial,
      {
        useNetMargin: false,
        pdWeight: pdCalib.pdWeight,
        useCpoe: true,
        teamWepa: hybridLookup,
      },
    )
    const train = scoreSeasons(independent, TRAIN)
    const val = scoreSeasons(independent, VALIDATION)
    console.log(
      `  cpoeToEloScale=${scale}: train ${pct(train.overallWinRate)} val ${pct(val.overallWinRate)}`,
    )
    if (train.overallWinRate > bestCpoeTrain + 1e-12) {
      bestCpoeTrain = train.overallWinRate
      bestCpoe = scale
      bestCpoeVal = val.overallWinRate
    }
  }
  const finalParams: QbEloParams = {
    ...cpoeOffParams,
    cpoeToEloScale: bestCpoe,
  }
  console.log(
    `CPOE: selected scale=${bestCpoe} (train ${pct(change3Before.trainWinRate)} → ${pct(bestCpoeTrain)}; val ${pct(change3Before.validationWinRate)} → ${pct(bestCpoeVal)})`,
  )
  const change3AfterPipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    finalParams,
    {
      useNetMargin: false,
      pdWeight: pdCalib.pdWeight,
      useCpoe: bestCpoe > 0,
      teamWepa: hybridLookup,
    },
  )
  const change3After = summarize(
    'C3 AFTER (CPOE grid)',
    change3AfterPipe.independent,
  )
  const cpoeEarned = bestCpoe > 0
  const change3Helped =
    change3After.validationWinRate > change3Before.validationWinRate + 0.005

  // ─── Change 4: fitted margin distribution ───
  console.log('\n========== CHANGE 4: Fitted margin distribution ==========')
  setStarRatingMode('walters')
  setCoverProbabilityMode('logistic')
  const change4BeforePipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    finalParams,
    {
      useNetMargin: false,
      pdWeight: pdCalib.pdWeight,
      useCpoe: bestCpoe > 0,
      teamWepa: hybridLookup,
    },
  )
  const change4Before = summarize(
    'C4 BEFORE (Walters table)',
    change4BeforePipe.independent,
  )

  const marginRows = games
    .filter(
      (g) =>
        TRAIN.includes(g.season) &&
        g.spreadLine != null &&
        g.homeScore != null &&
        g.awayScore != null,
    )
    .map((g) => ({
      postedSpread: g.spreadLine!,
      homeMargin: g.homeScore! - g.awayScore!,
    }))
  const marginFit = fitMarginDistribution(marginRows)
  console.log(
    `Fitted margin params: ${JSON.stringify(marginFit.params)} (train MSE ${marginFit.trainMse.toFixed(6)})`,
  )
  setMarginDistParams(marginFit.params)
  setStarRatingMode('fitted')
  setCoverProbabilityMode('fitted-margins')

  const change4AfterPipe = buildIndependentPipeline(
    games,
    starters,
    draftPick,
    finalParams,
    {
      useNetMargin: false,
      pdWeight: pdCalib.pdWeight,
      useCpoe: bestCpoe > 0,
      teamWepa: hybridLookup,
    },
    true,
  )
  const change4After = summarize(
    'C4 AFTER (fitted margins)',
    change4AfterPipe.independent,
  )
  const change4Helped =
    change4After.validationWinRate > change4Before.validationWinRate + 0.005

  // ─── Final artifacts: market blend on post-C4 independent ───
  const independent = change4AfterPipe.independent
  const seasonBundles = change4AfterPipe.seasonBundles
  const snapshots = change4AfterPipe.snapshots
  setQbEloParams(finalParams)
  setPdWeight(pdCalib.pdWeight)

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

  const blendedStatic = independent.map((p) =>
    buildMarketBlendedV3Prediction(p, modelWeight, coverCoeffs, {
      blendMode: 'static-constant',
    }),
  )
  const blendedLegacy = independent.map((p) =>
    buildMarketBlendedV3PredictionLegacy(p, modelWeight, coverCoeffs),
  )

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
    `Best regression params: halfLife=${bestReg.halfLifeGames}, normalizer=${bestReg.normalizer}`,
  )

  const blendedDynamic = buildDynamicMarketBlendedPredictions(
    independent,
    coverCoeffs,
    bestReg,
  )

  const v2Summary = summarize('v2 (power+stars)', v2Preds)
  const v3IndSummary = summarize('v3-independent (final)', independent)
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

  const parts: string[] = []
  parts.push(
    `C1 non-net: holdout ATS ${pct(change1Before.validationWinRate)} → ${pct(change1After.validationWinRate)}${change1Helped ? '' : ' (no meaningful gain)'}.`,
  )
  parts.push(
    `C2 real WEPA + pdWeight=${pdCalib.pdWeight}: holdout ATS ${pct(change2Before.validationWinRate)} → ${pct(change2After.validationWinRate)}${change2Helped ? '' : ' (no meaningful gain)'}.`,
  )
  parts.push(
    `C3 CPOE (scale=${finalParams.cpoeToEloScale}): holdout ATS ${pct(change3Before.validationWinRate)} → ${pct(change3After.validationWinRate)}${cpoeEarned ? (change3Helped ? '' : ' (earned on train, not holdout)') : ' (coefficient not earned — stayed 0 or no train gain)'}.`,
  )
  parts.push(
    `C4 fitted margins: holdout ATS ${pct(change4Before.validationWinRate)} → ${pct(change4After.validationWinRate)}${change4Helped ? '' : ' (no meaningful gain)'}.`,
  )
  if (!v3IndSummary.beatsV2Holdout && !blendDynamic.beatsV2Holdout) {
    parts.push('Neither final v3 variant clearly beats v2 on holdout.')
  }
  const verdict = parts.join(' ')
  console.log('\n' + verdict)

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
        fitted: finalParams,
        log: [
          ...qbPre.log,
          {
            step: 'cpoe-only',
            coefficient: 'cpoeToEloScale',
            oldValue: 0,
            newValue: bestCpoe,
            trainWinRateBefore: change3Before.trainWinRate,
            trainWinRateAfter: change3After.trainWinRate,
            validationWinRateBefore: change3Before.validationWinRate,
            validationWinRateAfter: change3After.validationWinRate,
            note: cpoeEarned
              ? 'Adopted on train win rate.'
              : 'No train gain — kept 0.',
          },
        ],
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
        fitted: bestReg,
        staticModelWeight: modelWeight,
        log: regLog,
      },
      null,
      2,
    ),
  )
  await writeFile(
    path.join(OUT_DIR, 'margin-distribution-calibration-log.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source:
          'Inspired by nfelo "Margin Probabilities from NFL Spreads" (2020-11-01) — independent fit.',
        defaults: DEFAULT_MARGIN_DIST_PARAMS,
        fitted: marginFit.params,
        trainMse: marginFit.trainMse,
        trainRows: marginRows.length,
      },
      null,
      2,
    ),
  )

  const report = {
    generatedAt: new Date().toISOString(),
    methodology:
      'v3: non-net grades + play-level WEPA (weightPlay) + calibrated PD/WEPA blend + CPOE QB signal + fitted margin distribution. Four architecture changes reported with separate before/after holdout deltas. IP: independent reimplementation from published methodology — not a port of nfelo source.',
    requestedSplit: {
      train: '2009–2022',
      validation: '2023–2024',
    },
    actualSplit: {
      trainSeasons: TRAIN,
      validationSeasons: VALIDATION,
      note: 'Seasons 2009–2024.',
    },
    srsPrior: {
      method: 'prior-season-decay',
      note: 'No free historical win-total odds — SRS stretch goal blocked on data.',
    },
    wepaNote: `Play-level weightPlay() on nflverse PBP (cached). Coverage ${pbpCoverage}/${games.length} games; weekly player-EPA sums as fallback. Non-net grade = offense WEPA − defense WEPA allowed.`,
    pdWeight: pdCalib.pdWeight,
    pdWeightDefault: DEFAULT_PD_WEIGHT,
    qbEloParams: finalParams,
    marginDistParams: marginFit.params,
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
      nonNetGrading: {
        before: change1Before,
        after: change1After,
        helpedHoldout: change1Helped,
        note: 'Independent per-team WEPA grades vs forced awayNet=-homeNet. Weekly EPA stand-in for clean isolation of the grading change.',
      },
      realWepaAndBlend: {
        before: change2Before,
        after: change2After,
        pdWeightBefore: 0.3,
        pdWeightAfter: pdCalib.pdWeight,
        helpedHoldout: change2Helped,
        beatAssumed70_30: pdBeatAssumed70_30,
        note: 'Play-level PBP WEPA on the live rating path + train-fit PD/WEPA blend weight (not assumed 70/30).',
      },
      cpoe: {
        before: change3Before,
        after: change3After,
        cpoeToEloScale: finalParams.cpoeToEloScale,
        earnedCoefficient: cpoeEarned,
        helpedHoldout: change3Helped,
        note: 'passing_cpoe from nflverse weekly stats as QB Elo add-on. Scale=0 means train rejected CPOE.',
      },
      fittedMarginDistribution: {
        before: change4Before,
        after: change4After,
        helpedHoldout: change4Helped,
        params: marginFit.params,
        trainMse: marginFit.trainMse,
        note: 'Replaces Walters KEY_NUMBER_PCT table with fitted Laplace+key-bumps+asymmetry model for star differentials; cover uses fitted margins too.',
      },
      // Keep prior change cards for continuity on the Backtest page
      qbEloCalibration: {
        before: qbPre.before,
        after: change3After,
        paramsBefore: DEFAULT_QB_ELO_PARAMS,
        paramsAfter: finalParams,
        helpedHoldout:
          change3After.validationWinRate > qbPre.before.validationWinRate + 0.005,
      },
      marketBlendPlayability: {
        before: blendPlayabilityBefore,
        after: blendStatic,
        beforeMode: 'legacy-blended-stars',
        afterMode: 'independent-selection',
        sampleGrew:
          blendStatic.validationGames >
          blendPlayabilityBefore.validationGames * 1.5,
        note: 'Selection uses independent star disagreement; betting signal is blended spread + coverProbability.',
      },
      marketRegressionDynamic: {
        before: blendStatic,
        after: blendDynamic,
        beforeMode: 'static-constant',
        afterMode: 'dynamic-error-weighted',
        params: bestReg,
        helpedHoldoutAts:
          blendDynamic.validationWinRate > blendStatic.validationWinRate + 0.005,
        helpedHoldoutBrier:
          blendDynamic.validationBrier < blendStatic.validationBrier - 0.002,
        note: 'Trailing per-team EWMA squared error → blend weight.',
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
