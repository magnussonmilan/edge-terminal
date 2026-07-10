import type { Trade } from '@/types/trade'

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 60 * 60 * 1000)
}

function minutesAgo(m: number): Date {
  return new Date(Date.now() - m * 60 * 1000)
}

function daysAgoDate(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function makeLast10(
  values: number[],
  line: number,
): Trade['historicalData']['last10Games'] {
  return values.map((value, i) => ({
    date: daysAgo(values.length - i),
    value,
    actualOutcome: value >= line ? 1 : 0,
  }))
}

export const MOCK_TRADES: Trade[] = [
  {
    id: 'tr-nba-001',
    sport: 'nba',
    eventId: 'evt-lal-bos-0710',
    betType: 'prop',
    matchup: { home: 'Boston Celtics', away: 'Los Angeles Lakers' },
    proposition: 'LeBron Over 28.5 PTS',
    fairValueProbability: 0.58,
    bookImpliedProbability: 0.48,
    edgePercentage: 0.1,
    confidence: 0.72,
    rationale:
      'We found an edge on LeBron clearing 28.5 points tonight. He has been scoring at a steady clip against Boston this season, and the current book price looks soft compared with how often he has hit this mark lately.',
    historicalData: {
      last10Games: makeLast10([31, 27, 34, 29, 22, 33, 30, 26, 35, 28], 28.5),
      average: 29.5,
      trend: 0.12,
      consistency: 0.7,
    },
    books: {
      DraftKings: {
        currentOdds: -110,
        spread: 28.5,
        lastUpdated: minutesAgo(4),
        available: true,
      },
      FanDuel: {
        currentOdds: -105,
        spread: 28.5,
        lastUpdated: minutesAgo(6),
        available: true,
      },
      BetMGM: {
        currentOdds: -115,
        spread: 28.5,
        lastUpdated: minutesAgo(9),
        available: true,
      },
    },
    createdAt: minutesAgo(12),
    expiresAt: hoursFromNow(3),
    status: 'active',
    userAction: 'ignored',
  },
  {
    id: 'tr-nfl-002',
    sport: 'nfl',
    eventId: 'evt-kc-buf-0710',
    betType: 'spread',
    matchup: { home: 'Buffalo Bills', away: 'Kansas City Chiefs' },
    proposition: 'Chiefs -3.5',
    fairValueProbability: 0.55,
    bookImpliedProbability: 0.49,
    edgePercentage: 0.06,
    confidence: 0.64,
    rationale:
      'We found an edge on Kansas City covering 3.5 on the road. Buffalo has been giving up chunk plays lately, and the number still sits a half-point softer than where we think this game should land.',
    historicalData: {
      last10Games: makeLast10([7, -3, 10, 4, -6, 14, 3, 1, 8, -2], 3.5),
      average: 3.6,
      trend: 0.05,
      consistency: 0.55,
    },
    books: {
      DraftKings: {
        currentOdds: -110,
        spread: -3.5,
        lastUpdated: minutesAgo(2),
        available: true,
      },
      FanDuel: {
        currentOdds: -108,
        spread: -3.5,
        lastUpdated: minutesAgo(5),
        available: true,
      },
      Caesars: {
        currentOdds: -115,
        spread: -3,
        lastUpdated: minutesAgo(8),
        available: true,
      },
    },
    createdAt: minutesAgo(20),
    expiresAt: hoursFromNow(5),
    status: 'settled',
    userAction: 'placed',
    placement: {
      bookName: 'FanDuel',
      odds: -108,
      stake: 55,
      placedAt: daysAgoDate(3),
      result: 'won',
    },
  },
  {
    id: 'tr-mlb-003',
    sport: 'mlb',
    eventId: 'evt-nyy-bos-0710',
    betType: 'total',
    matchup: { home: 'Boston Red Sox', away: 'New York Yankees' },
    proposition: 'Over 8.5 Runs',
    fairValueProbability: 0.54,
    bookImpliedProbability: 0.47,
    edgePercentage: 0.07,
    confidence: 0.61,
    rationale:
      'We found an edge on the over in this Yankees–Red Sox matchup. Both lineups have been putting the ball in play with authority, and the posted total looks a touch low for how these parks have played recently.',
    historicalData: {
      last10Games: makeLast10([9, 7, 11, 6, 10, 12, 8, 5, 13, 9], 8.5),
      average: 9.0,
      trend: 0.08,
      consistency: 0.6,
    },
    books: {
      DraftKings: {
        currentOdds: -105,
        spread: 8.5,
        lastUpdated: minutesAgo(3),
        available: true,
      },
      FanDuel: {
        currentOdds: -110,
        spread: 8.5,
        lastUpdated: minutesAgo(7),
        available: true,
      },
    },
    createdAt: minutesAgo(18),
    expiresAt: hoursFromNow(4),
    status: 'active',
    userAction: 'watchlisted',
  },
  {
    id: 'tr-nhl-004',
    sport: 'nhl',
    eventId: 'evt-tor-mtl-0710',
    betType: 'moneyline',
    matchup: { home: 'Montreal Canadiens', away: 'Toronto Maple Leafs' },
    proposition: 'Maple Leafs Moneyline',
    fairValueProbability: 0.62,
    bookImpliedProbability: 0.55,
    edgePercentage: 0.07,
    confidence: 0.68,
    rationale:
      'We found an edge on Toronto to win outright in Montreal. The Leafs have been sharper at even strength lately, and the price still does not fully reflect how often they have closed out similar road spots.',
    historicalData: {
      last10Games: makeLast10([1, 0, 1, 1, 0, 1, 1, 1, 0, 1], 0.5),
      average: 0.7,
      trend: 0.1,
      consistency: 0.65,
    },
    books: {
      DraftKings: {
        currentOdds: -122,
        spread: 0,
        lastUpdated: minutesAgo(1),
        available: true,
      },
      BetMGM: {
        currentOdds: -118,
        spread: 0,
        lastUpdated: minutesAgo(4),
        available: true,
      },
      FanDuel: {
        currentOdds: -125,
        spread: 0,
        lastUpdated: minutesAgo(11),
        available: true,
      },
    },
    createdAt: minutesAgo(8),
    expiresAt: hoursFromNow(2),
    status: 'active',
    userAction: 'ignored',
  },
  {
    id: 'tr-nba-005',
    sport: 'nba',
    eventId: 'evt-gsw-den-0710',
    betType: 'prop',
    matchup: { home: 'Denver Nuggets', away: 'Golden State Warriors' },
    proposition: 'Stephen Curry Over 4.5 Threes',
    fairValueProbability: 0.57,
    bookImpliedProbability: 0.51,
    edgePercentage: 0.06,
    confidence: 0.59,
    rationale:
      'We found an edge on Curry clearing 4.5 made threes. Denver has left shooters open on the perimeter in recent games, and Curry has been hunting those looks at a high rate on the road.',
    historicalData: {
      last10Games: makeLast10([5, 3, 6, 4, 7, 5, 2, 6, 5, 4], 4.5),
      average: 4.7,
      trend: 0.04,
      consistency: 0.58,
    },
    books: {
      FanDuel: {
        currentOdds: -115,
        spread: 4.5,
        lastUpdated: minutesAgo(5),
        available: true,
      },
      DraftKings: {
        currentOdds: -110,
        spread: 4.5,
        lastUpdated: minutesAgo(6),
        available: true,
      },
      BetMGM: {
        currentOdds: -120,
        spread: 4.5,
        lastUpdated: minutesAgo(14),
        available: false,
      },
    },
    createdAt: minutesAgo(25),
    expiresAt: hoursFromNow(6),
    status: 'settled',
    userAction: 'placed',
    placement: {
      bookName: 'DraftKings',
      odds: -110,
      stake: 40,
      placedAt: daysAgoDate(5),
      result: 'lost',
    },
  },
  {
    id: 'tr-nfl-006',
    sport: 'nfl',
    eventId: 'evt-phi-dal-0710',
    betType: 'prop',
    matchup: { home: 'Dallas Cowboys', away: 'Philadelphia Eagles' },
    proposition: 'Jalen Hurts Over 45.5 Rush Yards',
    fairValueProbability: 0.6,
    bookImpliedProbability: 0.52,
    edgePercentage: 0.08,
    confidence: 0.7,
    rationale:
      'We found an edge on Hurts clearing 45.5 rush yards. Philadelphia has leaned on designed keepers in this matchup, and Dallas has struggled to keep quarterbacks contained near the line.',
    historicalData: {
      last10Games: makeLast10([52, 38, 61, 44, 49, 33, 55, 47, 41, 58], 45.5),
      average: 47.8,
      trend: 0.09,
      consistency: 0.66,
    },
    books: {
      DraftKings: {
        currentOdds: -112,
        spread: 45.5,
        lastUpdated: minutesAgo(3),
        available: true,
      },
      FanDuel: {
        currentOdds: -108,
        spread: 45.5,
        lastUpdated: minutesAgo(4),
        available: true,
      },
      Caesars: {
        currentOdds: -115,
        spread: 45.5,
        lastUpdated: minutesAgo(10),
        available: true,
      },
    },
    createdAt: minutesAgo(15),
    expiresAt: hoursFromNow(7),
    status: 'active',
    userAction: 'ignored',
  },
  {
    id: 'tr-mlb-007',
    sport: 'mlb',
    eventId: 'evt-lad-sf-0710',
    betType: 'prop',
    matchup: { home: 'San Francisco Giants', away: 'Los Angeles Dodgers' },
    proposition: 'Mookie Betts Over 1.5 Hits',
    fairValueProbability: 0.49,
    bookImpliedProbability: 0.46,
    edgePercentage: 0.03,
    confidence: 0.52,
    rationale:
      'We found a smaller edge on Betts recording more than 1.5 hits. He has been making consistent contact against right-handed starters, though the price is only mildly off from where we see it.',
    historicalData: {
      last10Games: makeLast10([2, 1, 3, 0, 2, 2, 1, 2, 1, 3], 1.5),
      average: 1.7,
      trend: 0.02,
      consistency: 0.5,
    },
    books: {
      DraftKings: {
        currentOdds: +110,
        spread: 1.5,
        lastUpdated: minutesAgo(7),
        available: true,
      },
      FanDuel: {
        currentOdds: +105,
        spread: 1.5,
        lastUpdated: minutesAgo(9),
        available: true,
      },
    },
    createdAt: minutesAgo(30),
    expiresAt: hoursFromNow(3),
    status: 'settled',
    userAction: 'placed',
    placement: {
      bookName: 'DraftKings',
      odds: 110,
      stake: 50,
      placedAt: daysAgoDate(4),
      result: 'lost',
    },
  },
  {
    id: 'tr-nhl-008',
    sport: 'nhl',
    eventId: 'evt-edmn-cgy-0710',
    betType: 'total',
    matchup: { home: 'Calgary Flames', away: 'Edmonton Oilers' },
    proposition: 'Over 6.5 Goals',
    fairValueProbability: 0.56,
    bookImpliedProbability: 0.5,
    edgePercentage: 0.06,
    confidence: 0.63,
    rationale:
      'We found an edge on the over in this Alberta matchup. Both clubs have been trading chances at a high rate, and recent meetings have cleared this number more often than the books are pricing.',
    historicalData: {
      last10Games: makeLast10([7, 5, 8, 6, 9, 4, 7, 8, 6, 7], 6.5),
      average: 6.7,
      trend: 0.06,
      consistency: 0.62,
    },
    books: {
      BetMGM: {
        currentOdds: -110,
        spread: 6.5,
        lastUpdated: minutesAgo(2),
        available: true,
      },
      DraftKings: {
        currentOdds: -105,
        spread: 6.5,
        lastUpdated: minutesAgo(5),
        available: true,
      },
      FanDuel: {
        currentOdds: -115,
        spread: 6.5,
        lastUpdated: minutesAgo(8),
        available: true,
      },
    },
    createdAt: minutesAgo(11),
    expiresAt: hoursFromNow(4),
    status: 'settled',
    userAction: 'placed',
    placement: {
      bookName: 'DraftKings',
      odds: -105,
      stake: 75,
      placedAt: daysAgoDate(2),
      result: 'won',
    },
  },
  {
    id: 'tr-nba-009',
    sport: 'nba',
    eventId: 'evt-mia-nyk-0710',
    betType: 'spread',
    matchup: { home: 'New York Knicks', away: 'Miami Heat' },
    proposition: 'Knicks -4.5',
    fairValueProbability: 0.53,
    bookImpliedProbability: 0.5,
    edgePercentage: 0.03,
    confidence: 0.55,
    rationale:
      'We found a modest edge on New York covering at home. Miami has been thin on the wing, and the Knicks have been finishing games with a stronger closing unit than this number suggests.',
    historicalData: {
      last10Games: makeLast10([8, -2, 12, 5, -5, 9, 3, 6, -1, 7], 4.5),
      average: 4.2,
      trend: 0.03,
      consistency: 0.54,
    },
    books: {
      DraftKings: {
        currentOdds: -110,
        spread: -4.5,
        lastUpdated: minutesAgo(6),
        available: true,
      },
      FanDuel: {
        currentOdds: -110,
        spread: -4.5,
        lastUpdated: minutesAgo(6),
        available: true,
      },
      Caesars: {
        currentOdds: -108,
        spread: -4.5,
        lastUpdated: minutesAgo(12),
        available: true,
      },
    },
    createdAt: minutesAgo(22),
    expiresAt: hoursFromNow(5),
    status: 'settled',
    userAction: 'placed',
    placement: {
      bookName: 'Caesars',
      odds: -108,
      stake: 60,
      placedAt: daysAgoDate(1),
      result: 'won',
    },
  },
  {
    id: 'tr-nhl-010',
    sport: 'nhl',
    eventId: 'evt-bos-nyr-past',
    betType: 'moneyline',
    matchup: { home: 'New York Rangers', away: 'Boston Bruins' },
    proposition: 'Bruins Moneyline',
    fairValueProbability: 0.58,
    bookImpliedProbability: 0.52,
    edgePercentage: 0.06,
    confidence: 0.66,
    rationale:
      'We found an edge on Boston to win on the road. The Bruins closed stronger in recent meetings, and the price looked soft relative to how these two have traded wins.',
    historicalData: {
      last10Games: makeLast10([1, 0, 1, 1, 1, 0, 1, 0, 1, 1], 0.5),
      average: 0.7,
      trend: 0.05,
      consistency: 0.6,
    },
    books: {
      DraftKings: {
        currentOdds: -115,
        spread: 0,
        lastUpdated: daysAgoDate(2),
        available: false,
      },
      FanDuel: {
        currentOdds: -110,
        spread: 0,
        lastUpdated: daysAgoDate(2),
        available: false,
      },
    },
    createdAt: daysAgoDate(3),
    expiresAt: daysAgoDate(2),
    status: 'settled',
    userAction: 'placed',
    placement: {
      bookName: 'FanDuel',
      odds: -110,
      stake: 70,
      placedAt: daysAgoDate(3),
      result: 'won',
    },
  },
]
