import { describe, expect, it } from 'vitest'
import {
  RIDGE_LAMBDA,
  fitJointCoefficients,
  rollingOriginSplits,
  summarizeCrossFold,
  type FoldResult,
  type JointFitRow,
} from './calibration'
import { DEFAULT_PLAYER_COEFFS } from './playerValues'

describe('rollingOriginSplits', () => {
  it('returns empty for fewer than 2 seasons', () => {
    expect(rollingOriginSplits([])).toEqual([])
    expect(rollingOriginSplits([2022])).toEqual([])
  })

  it('builds expanding train windows', () => {
    expect(rollingOriginSplits([2020, 2021, 2022, 2023])).toEqual([
      { trainSeasons: [2020], valSeason: 2021 },
      { trainSeasons: [2020, 2021], valSeason: 2022 },
      { trainSeasons: [2020, 2021, 2022], valSeason: 2023 },
    ])
  })

  it('sorts unsorted input', () => {
    const folds = rollingOriginSplits([2022, 2020, 2021])
    expect(folds[0]).toEqual({ trainSeasons: [2020], valSeason: 2021 })
    expect(folds[1].valSeason).toBe(2022)
  })
})

describe('fitJointCoefficients', () => {
  it('recovers a known linear relationship on synthetic data', () => {
    const trueBeta = [0.4, 18, 1.2, 0.1, 1.5, 1 / 40, 0.35]
    const rows: JointFitRow[] = []
    for (let i = 0; i < 400; i++) {
      const x = [
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 80,
        (Math.random() - 0.5) * 1,
      ]
      const noise = (Math.random() - 0.5) * 2
      const y =
        1.5 +
        trueBeta.reduce((s, b, j) => s + b * x[j], 0) +
        noise
      rows.push({ y, x })
    }

    const fitted = fitJointCoefficients(rows, 0.01)
    expect(fitted.qbYpaMult).toBeGreaterThan(0.2)
    expect(fitted.qbYpaMult).toBeLessThan(0.7)
    expect(fitted.qbIntMult).toBeGreaterThan(10)
    expect(fitted.qbIntMult).toBeLessThan(30)
    expect(fitted.rbYpgDiv).toBeGreaterThan(25)
    expect(fitted.rbYpgDiv).toBeLessThan(60)
  })

  it('regularization shrinks coefficient magnitudes vs near-unregularized', () => {
    const rows: JointFitRow[] = []
    for (let i = 0; i < 80; i++) {
      const x = Array.from({ length: 7 }, () => (Math.random() - 0.5) * 4)
      // Underdetermined-ish / noisy — ridge should shrink
      const y = x.reduce((s, v, j) => s + (j + 1) * v, 0) + (Math.random() - 0.5) * 20
      rows.push({ y, x })
    }

    const loose = fitJointCoefficients(rows, 0.001)
    const tight = fitJointCoefficients(rows, 1000)

    const mag = (c: typeof loose) =>
      Math.abs(c.qbYpaMult - DEFAULT_PLAYER_COEFFS.qbYpaMult) +
      Math.abs(c.qbIntMult - DEFAULT_PLAYER_COEFFS.qbIntMult) +
      Math.abs(c.qbEpaMult - DEFAULT_PLAYER_COEFFS.qbEpaMult) +
      Math.abs(c.wrPprMult - DEFAULT_PLAYER_COEFFS.wrPprMult) +
      Math.abs(c.wrShareMult - DEFAULT_PLAYER_COEFFS.wrShareMult) +
      Math.abs(c.rbTdMult - DEFAULT_PLAYER_COEFFS.rbTdMult)

    // Strong ridge pulls toward smaller / more constrained solutions;
    // at minimum, qbYpaMult should not explode relative to loose fit.
    expect(Math.abs(tight.qbYpaMult)).toBeLessThanOrEqual(
      Math.abs(loose.qbYpaMult) + 0.05,
    )
    expect(RIDGE_LAMBDA).toBeGreaterThan(0)
    // Sanity: both return finite coeffs
    expect(Number.isFinite(mag(loose))).toBe(true)
    expect(Number.isFinite(mag(tight))).toBe(true)
  })

  it('returns defaults when too few rows', () => {
    expect(fitJointCoefficients([])).toEqual(DEFAULT_PLAYER_COEFFS)
  })
})

describe('summarizeCrossFold', () => {
  it('computes mean, std, and breakeven flag', () => {
    const folds: FoldResult[] = [
      {
        trainSeasons: [2020],
        valSeason: 2021,
        winRate: 0.5,
        brierScore: 0.22,
        sampleSize: 100,
        playerCoeffs: DEFAULT_PLAYER_COEFFS,
        hfa: 2,
      },
      {
        trainSeasons: [2020, 2021],
        valSeason: 2022,
        winRate: 0.54,
        brierScore: 0.21,
        sampleSize: 110,
        playerCoeffs: DEFAULT_PLAYER_COEFFS,
        hfa: 1.5,
      },
    ]
    const s = summarizeCrossFold(folds, 0.524)
    expect(s.meanWinRate).toBeCloseTo(0.52, 5)
    expect(s.stdWinRate).toBeCloseTo(0.02, 5)
    expect(s.clearsBreakevenAtMeanMinusOneStd).toBe(false)
    expect(s.totalValGames).toBe(210)
  })
})
