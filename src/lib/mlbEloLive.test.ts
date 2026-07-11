import { describe, expect, it } from 'vitest'
import {
  MLB_ELO_MEAN,
  MLB_OFFSEASON_RETAIN,
  applyEloResult,
  backfillThrough2025Season,
  eloWinProb,
  groupGamesByTeamChrono,
  ratingBeforeGame,
  seedMlb2026FromPriorSeason,
  type MlbSeedState,
} from './mlbEloLive'
import type { MlbGameResult } from './mlbStatsApi'

function game(
  partial: Partial<MlbGameResult> &
    Pick<
      MlbGameResult,
      | 'gamePk'
      | 'gameDate'
      | 'homeTeam'
      | 'awayTeam'
      | 'homeScore'
      | 'awayScore'
      | 'gameSequenceInDay'
    >,
): MlbGameResult {
  return {
    gameDateTimeIso: `${partial.gameDate}T${partial.gameSequenceInDay === 2 ? '23' : '17'}:00:00Z`,
    season: Number(partial.gameDate.slice(0, 4)),
    gameType: 'R',
    doubleHeader: partial.gameSequenceInDay > 1 ? 'Y' : 'N',
    status: 'Final',
    abstractGameState: 'Final',
    ...partial,
  }
}

describe('seedMlb2026FromPriorSeason', () => {
  it('regresses 1/3 of the way toward league mean (retain 2/3)', () => {
    const end: MlbSeedState[] = [
      { team: 'NYY', eloRating: 1600, asOfDate: '2025-09-28' },
      { team: 'COL', eloRating: 1400, asOfDate: '2025-09-28' },
    ]
    const seeded = seedMlb2026FromPriorSeason(end)
    const nyy = seeded.find((s) => s.team === 'NYY')!
    const col = seeded.find((s) => s.team === 'COL')!
    expect(nyy.eloRating).toBeCloseTo(
      MLB_ELO_MEAN + (1600 - MLB_ELO_MEAN) * MLB_OFFSEASON_RETAIN,
      10,
    )
    expect(col.eloRating).toBeCloseTo(
      MLB_ELO_MEAN + (1400 - MLB_ELO_MEAN) * MLB_OFFSEASON_RETAIN,
      10,
    )
  })
})

describe('backfillThrough2025Season', () => {
  it('applies only games after seed asOf and updates both clubs', () => {
    const seed: MlbSeedState[] = [
      { team: 'NYY', eloRating: 1500, asOfDate: '2025-05-09' },
      { team: 'BOS', eloRating: 1500, asOfDate: '2025-05-09' },
    ]
    const results = [
      game({
        gamePk: 1,
        gameDate: '2025-05-08', // before seed — ignored
        homeTeam: 'NYY',
        awayTeam: 'BOS',
        homeScore: 10,
        awayScore: 0,
        gameSequenceInDay: 1,
      }),
      game({
        gamePk: 2,
        gameDate: '2025-05-10',
        homeTeam: 'NYY',
        awayTeam: 'BOS',
        homeScore: 5,
        awayScore: 1,
        gameSequenceInDay: 1,
      }),
    ]
    const out = backfillThrough2025Season(seed, results)
    const nyy = out.find((s) => s.team === 'NYY')!
    const bos = out.find((s) => s.team === 'BOS')!
    expect(nyy.eloRating).toBeGreaterThan(1500)
    expect(bos.eloRating).toBeLessThan(1500)
    expect(nyy.asOfDate).toBe('2025-05-10')
  })
})

describe('ratingBeforeGame — doubleheader no-look-ahead', () => {
  it('uses game-1 result when computing game-2 before-rating', () => {
    const seed = { NYY: 1500, BOS: 1500 }
    const g1 = game({
      gamePk: 101,
      gameDate: '2026-07-04',
      homeTeam: 'NYY',
      awayTeam: 'BOS',
      homeScore: 8,
      awayScore: 1,
      gameSequenceInDay: 1,
    })
    const g2 = game({
      gamePk: 102,
      gameDate: '2026-07-04',
      homeTeam: 'NYY',
      awayTeam: 'BOS',
      homeScore: 2,
      awayScore: 3,
      gameSequenceInDay: 2,
    })
    const byTeam = groupGamesByTeamChrono([g1, g2])

    const beforeG1 = ratingBeforeGame(byTeam, 'NYY', '2026-07-04', 1, seed)
    const beforeG2 = ratingBeforeGame(byTeam, 'NYY', '2026-07-04', 2, seed)
    expect(beforeG1).toBe(1500)

    const afterG1 = applyEloResult(1500, 1500, 8, 1)
    expect(beforeG2).toBeCloseTo(afterG1.homeElo, 10)
    expect(beforeG2).not.toBe(beforeG1)

    // Away side also moves after game 1
    const bosBeforeG2 = ratingBeforeGame(byTeam, 'BOS', '2026-07-04', 2, seed)
    expect(bosBeforeG2).toBeCloseTo(afterG1.awayElo, 10)
  })

  it('does not leak game-2 result into game-1 before-rating', () => {
    const seed = { NYY: 1520, BOS: 1480 }
    const g1 = game({
      gamePk: 201,
      gameDate: '2026-07-05',
      homeTeam: 'BOS',
      awayTeam: 'NYY',
      homeScore: 1,
      awayScore: 0,
      gameSequenceInDay: 1,
    })
    const g2 = game({
      gamePk: 202,
      gameDate: '2026-07-05',
      homeTeam: 'BOS',
      awayTeam: 'NYY',
      homeScore: 0,
      awayScore: 12,
      gameSequenceInDay: 2,
    })
    const byTeam = groupGamesByTeamChrono([g1, g2])
    const before1 = ratingBeforeGame(byTeam, 'BOS', '2026-07-05', 1, seed)
    expect(before1).toBe(1480)
  })
})

describe('eloWinProb', () => {
  it('is 0.5 for equal ratings before home adv, >0.5 with home adv', () => {
    // With H=24, equal Elo → home favored
    expect(eloWinProb(1500, 1500)).toBeGreaterThan(0.5)
    expect(eloWinProb(1500, 1500, 0)).toBeCloseTo(0.5, 10)
  })
})
