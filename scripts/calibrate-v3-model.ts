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
  QB_ELO_MEAN,
  QB_ELO_REPLACEMENT,
  qbGameEpaToEloPerformance,
  rollingCareerAverage,
  seedRookieQbRating,
  updateQbRating,
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
  type V3GamePrediction,
} from '../src/lib/predictionsV3.ts'
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
): {
  qbStart: QbStartLookup
  snapshots: QbRating[]
} {
  const starterByKey = new Map<string, StarterRow>()
  for (const s of starters) {
    starterByKey.set(`${s.season}_${s.week}_${s.team}`, s)
  }

  const state = new Map<string, QbState>()
  /** Elo available BEFORE season/week for team (no look-ahead). */
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

      // Snapshot starters BEFORE this week's games
      for (const team of teams) {
        const s = starterByKey.get(`${season}_${week}_${team}`)
        if (!s) continue
        let st = state.get(s.playerId)
        if (!st) {
          const pick = draftPick.get(s.playerId) ?? 100
          const seeded = seedRookieQbRating(pick, QB_ELO_MEAN)
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

      // Update AFTER week from that week's EPA (for next week)
      for (const team of teams) {
        const s = starterByKey.get(`${season}_${week}_${team}`)
        if (!s) continue
        const st = state.get(s.playerId)!
        const perf = qbGameEpaToEloPerformance(s.passingEpa)
        const career = rollingCareerAverage(st.history, st.elo)
        const next = updateQbRating(st.elo, perf, career, st.games)
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

function summarize(label: string, preds: GamePrediction[]) {
  const train = scoreSeasons(preds, TRAIN)
  const val = scoreSeasons(preds, VALIDATION)
  const all = computeBacktest(preds, 'all')
  console.log(
    `${label}: train ATS ${pct(train.overallWinRate)} (n=${train.totalPlayableGames}) · val ATS ${pct(val.overallWinRate)} (n=${val.totalPlayableGames}) · SU val ${pct(val.straightUp?.accuracy ?? 0)}`,
  )
  return {
    trainWinRate: train.overallWinRate,
    trainGames: train.totalPlayableGames,
    trainBrier: train.brierScore,
    trainRoi: train.roiIfFollowed,
    trainStraightUpAccuracy: train.straightUp?.accuracy ?? 0,
    trainStraightUpGames: train.straightUp?.totalGames ?? 0,
    validationWinRate: val.overallWinRate,
    validationGames: val.totalPlayableGames,
    validationBrier: val.brierScore,
    validationRoi: val.roiIfFollowed,
    validationStraightUpAccuracy: val.straightUp?.accuracy ?? 0,
    validationStraightUpGames: val.straightUp?.totalGames ?? 0,
    allWinRate: all.overallWinRate,
    allGames: all.totalPlayableGames,
    allBrier: all.brierScore,
    allRoi: all.roiIfFollowed,
    allStraightUpAccuracy: all.straightUp?.accuracy ?? 0,
    beatsV2Holdout: false as boolean,
  }
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
  const { qbStart, snapshots } = buildQbLookups(games, starters, draftPick)

  const teamWepa: TeamWepaLookup = (gameId, team) => {
    const g = games.find((x) => x.gameId === gameId)
    if (!g) return null
    const v = teamEpa.get(`${g.season}_${g.week}_${team}`)
    return v ?? null
  }

  // Season-by-season team ratings
  let priorFinal: Record<string, TeamRating> = {}
  const seasonBundles: Record<
    string,
    { seed: Record<string, number>; byWeek: Record<number, Record<string, number>> }
  > = {}
  const independent: V3GamePrediction[] = []

  for (const season of SEASONS) {
    const seasonGames = games.filter((g) => g.season === season)
    const prior = buildPreseasonPriors(priorFinal, [])
    if (season === SEASONS[0]) {
      console.log(`SRS prior: ${prior.method} — ${prior.note}`)
    }
    const seed = prior.ratings
    // Ensure all teams present
    for (const g of seasonGames) {
      if (seed[g.homeTeam] == null) seed[g.homeTeam] = 0
      if (seed[g.awayTeam] == null) seed[g.awayTeam] = 0
    }

    const { final, byWeek } = processSeasonRatingsV3(seasonGames, seed, {
      hfa: HOME_FIELD_ADVANTAGE,
      qbStart,
      teamWepa,
      useQbInUpdate: true,
    })
    seasonBundles[String(season)] = { seed, byWeek }
    priorFinal = final

    for (const g of seasonGames) {
      // ratingBeforeWeek: week W reads week W-1 snapshot (or season seed) — no look-ahead
      const hb = ratingBeforeWeek(byWeek, g.week, g.homeTeam, seed)
      const ab = ratingBeforeWeek(byWeek, g.week, g.awayTeam, seed)
      const hq = qbStart(g.season, g.week, g.homeTeam)
      const aq = qbStart(g.season, g.week, g.awayTeam)
      independent.push(
        buildIndependentV3Prediction(g, hb, ab, hq, aq, HOME_FIELD_ADVANTAGE),
      )
    }
    console.log(`Season ${season}: ${seasonGames.length} games rated`)
  }

  // Fit market blend on TRAIN only
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

  // Cover model on train blended rows
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

  const blended = independent.map((p) =>
    buildMarketBlendedV3Prediction(p, modelWeight, coverCoeffs),
  )

  const v2Summary = summarize('v2 (power+stars)', v2Preds)
  const v3IndSummary = summarize('v3-independent', independent)
  const v3BlendSummary = summarize('v3-market-blended', blended)

  v3IndSummary.beatsV2Holdout =
    v3IndSummary.validationWinRate > v2Summary.validationWinRate + 0.01
  v3BlendSummary.beatsV2Holdout =
    v3BlendSummary.validationWinRate > v2Summary.validationWinRate + 0.01

  const indClear = v3IndSummary.beatsV2Holdout
  const blendClear = v3BlendSummary.beatsV2Holdout
  const indAboveBe =
    v3IndSummary.validationWinRate >= BREAKEVEN_WIN_RATE
  const blendAboveBe =
    v3BlendSummary.validationWinRate >= BREAKEVEN_WIN_RATE

  let verdict: string
  if (!indClear && !blendClear) {
    verdict =
      'Holdout: neither v3 variant clearly beats v2 (>1pp) — reported plainly, not tuned away. Independent remains ~coin-flip ATS.'
  } else if (indClear && indAboveBe) {
    verdict =
      'Holdout: v3-independent clearly beats v2 and clears breakeven on this split — still provisional, not a guarantee.'
  } else if (indClear) {
    verdict =
      'Holdout: v3-independent is slightly above v2 but still below −110 breakeven — not an edge claim.'
  } else if (blendClear && blendAboveBe) {
    verdict =
      'Holdout: only the market-blended v3 clears breakeven vs v2 — do not conflate with independent edge over the closing line.'
  } else {
    verdict =
      'Holdout: market-blended edges v2 on this sample without a clean independent win — report both numbers separately.'
  }

  console.log(verdict)

  await writeFile(
    path.join(OUT_DIR, 'predictions-v3-independent.json'),
    JSON.stringify(independent),
  )
  await writeFile(
    path.join(OUT_DIR, 'predictions-v3-market.json'),
    JSON.stringify(blended),
  )
  await writeFile(
    path.join(OUT_DIR, 'ratings-v3.json'),
    JSON.stringify(seasonBundles),
  )
  await writeFile(
    path.join(OUT_DIR, 'qb-ratings-v3-sample.json'),
    JSON.stringify(snapshots.filter((s) => s.week === 1 || s.week === 10).slice(0, 400)),
  )

  const report = {
    generatedAt: new Date().toISOString(),
    methodology:
      'v3 QB-Elo + weekly-EPA team signal + optional market blend. Independent and blended reported separately. IP: independent reimplementation from public methodology descriptions — not a port of nfelo source.',
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
    modelWeight,
    coverCoeffs,
    replacementElo: QB_ELO_REPLACEMENT,
    breakeven: BREAKEVEN_WIN_RATE,
    v2: v2Summary,
    v3Independent: v3IndSummary,
    v3MarketBlended: v3BlendSummary,
    verdict,
  }

  await writeFile(
    path.join(OUT_DIR, 'calibrated-v3.json'),
    JSON.stringify(report, null, 2),
  )

  console.log('Wrote predictions-v3-*.json, ratings-v3.json, calibrated-v3.json')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
