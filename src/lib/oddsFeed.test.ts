import { describe, expect, it } from 'vitest'
import {
  bestAwaySpread,
  bestHomeSpread,
  oddsSnapshotsToTrades,
  type OddsSnapshot,
} from './oddsFeed'

const sample: OddsSnapshot = {
  id: 'evt1',
  sportKey: 'americanfootball_nfl',
  commenceTime: '2025-12-28T18:00:00Z',
  homeTeam: 'Kansas City Chiefs',
  awayTeam: 'Las Vegas Raiders',
  bookmakers: [
    {
      key: 'draftkings',
      title: 'DraftKings',
      lastUpdate: '2025-12-27T12:00:00Z',
      markets: [
        {
          key: 'spreads',
          outcomes: [
            { name: 'Kansas City Chiefs', price: -110, point: -6.5 },
            { name: 'Las Vegas Raiders', price: -110, point: 6.5 },
          ],
        },
      ],
    },
    {
      key: 'fanduel',
      title: 'FanDuel',
      lastUpdate: '2025-12-27T12:05:00Z',
      markets: [
        {
          key: 'spreads',
          outcomes: [
            { name: 'Kansas City Chiefs', price: -105, point: -6.0 },
            { name: 'Las Vegas Raiders', price: -115, point: 6.0 },
          ],
        },
      ],
    },
  ],
}

describe('oddsFeed best line', () => {
  it('picks the most favorable home point', () => {
    const best = bestHomeSpread(sample)
    expect(best?.bookmaker).toBe('FanDuel')
    expect(best?.point).toBe(-6)
  })

  it('picks the most favorable away point', () => {
    const best = bestAwaySpread(sample)
    expect(best?.bookmaker).toBe('DraftKings')
    expect(best?.point).toBe(6.5)
  })

  it('maps snapshots into Trade shape with best-line fields', () => {
    const trades = oddsSnapshotsToTrades([sample])
    expect(trades).toHaveLength(1)
    expect(trades[0].sport).toBe('nfl')
    expect(trades[0].bestLineHome?.bookmaker).toBe('FanDuel')
    expect(Object.keys(trades[0].books).length).toBe(2)
  })
})
