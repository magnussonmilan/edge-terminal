import { describe, expect, it } from 'vitest'
import {
  americanImpliedProbability,
  eventsToBookOdds,
  isBetterAmericanPrice,
  multiplicativeDevig,
  classifyBookTier,
  DEMO_GAME_LINE_EVENTS,
} from './oddsAggregator'
import { bestPriceForSide, buildLineShoppingGroups } from './lineShopping'
import {
  findValueBets,
  modelPreferredSpreadSide,
  vigAdjustedImpliedProbability,
} from './valueBets'

describe('americanImpliedProbability', () => {
  it('converts favorite American odds', () => {
    expect(americanImpliedProbability(-110)).toBeCloseTo(110 / 210, 6)
  })

  it('converts underdog American odds', () => {
    expect(americanImpliedProbability(150)).toBeCloseTo(100 / 250, 6)
  })
})

describe('multiplicativeDevig', () => {
  it('removes two-way vig so fair probs sum to 1', () => {
    const { fairA, fairB } = multiplicativeDevig(-110, -110)
    expect(fairA + fairB).toBeCloseTo(1, 10)
    expect(fairA).toBeCloseTo(0.5, 6)
    expect(fairB).toBeCloseTo(0.5, 6)
  })

  it('assigns more fair mass to the juiced favorite', () => {
    const { fairA, fairB } = multiplicativeDevig(-150, 130)
    expect(fairA).toBeGreaterThan(fairB)
    expect(fairA + fairB).toBeCloseTo(1, 10)
  })
})

describe('isBetterAmericanPrice / bestPriceForSide', () => {
  const books = eventsToBookOdds(DEMO_GAME_LINE_EVENTS)

  it('treats -105 as better than -115 for the bettor', () => {
    expect(isBetterAmericanPrice(-105, -115)).toBe(true)
    expect(isBetterAmericanPrice(-115, -105)).toBe(false)
  })

  it('picks the soft book paying more on Raiders +7', () => {
    const best = bestPriceForSide(
      books,
      'spread',
      'Las Vegas Raiders',
      7,
    )
    expect(best).not.toBeNull()
    expect(best!.book).toBe('DraftKings')
    expect(best!.price).toBe(-105)
    expect(best!.impliedProbability).toBeCloseTo(
      americanImpliedProbability(-105),
      6,
    )
  })

  it('picks best moneyline dog without a line filter', () => {
    const best = bestPriceForSide(books, 'moneyline', 'Las Vegas Raiders')
    expect(best?.book).toBe('Pinnacle')
    expect(best?.price).toBe(240)
  })

  it('builds groups with a best quote per side/line', () => {
    const groups = buildLineShoppingGroups(books)
    expect(groups.length).toBeGreaterThan(0)
    const raidersPlus7 = groups.find(
      (g) => g.side === 'Las Vegas Raiders' && g.line === 7,
    )
    expect(raidersPlus7?.best.book).toBe('DraftKings')
  })
})

describe('classifyBookTier', () => {
  it('marks Pinnacle / LowVig / BetOnline as sharp', () => {
    expect(classifyBookTier('pinnacle')).toBe('sharp')
    expect(classifyBookTier('lowvig')).toBe('sharp')
    expect(classifyBookTier('betonlineag')).toBe('sharp')
  })

  it('marks retail books as soft', () => {
    expect(classifyBookTier('draftkings')).toBe('soft')
    expect(classifyBookTier('fanduel')).toBe('soft')
  })
})

describe('valueBets gate + math', () => {
  it('prefers home when modelSpread is above the book line', () => {
    expect(modelPreferredSpreadSide(-3, -7)).toBe('home')
    expect(modelPreferredSpreadSide(-10, -7)).toBe('away')
  })

  it('vigAdjustedImpliedProbability matches multiplicative fairA', () => {
    const p = vigAdjustedImpliedProbability(-105, -115)
    expect(p).toBeCloseTo(multiplicativeDevig(-105, -115).fairA, 10)
  })

  it('does not surface bets when star rating is not playable', () => {
    const books = eventsToBookOdds(DEMO_GAME_LINE_EVENTS)
    const bets = findValueBets(
      [
        {
          homeTeam: 'KC',
          awayTeam: 'LV',
          homeTeamFull: 'Kansas City Chiefs',
          awayTeamFull: 'Las Vegas Raiders',
          modelSpread: -10,
          postedSpread: -7,
          starRating: { differentialPct: 2, stars: 0, playable: false },
        },
      ],
      books,
    )
    expect(bets).toHaveLength(0)
  })

  it('surfaces playable model-vs-book edges and tags book tiers', () => {
    const books = eventsToBookOdds(DEMO_GAME_LINE_EVENTS)
    // Model much stronger home than -7 → home side; playable stars
    const bets = findValueBets(
      [
        {
          homeTeam: 'KC',
          awayTeam: 'LV',
          homeTeamFull: 'Kansas City Chiefs',
          awayTeamFull: 'Las Vegas Raiders',
          modelSpread: -14,
          postedSpread: -7,
          starRating: { differentialPct: 12, stars: 2, playable: true },
        },
      ],
      books,
    )
    expect(bets.length).toBeGreaterThan(0)
    for (const b of bets) {
      expect(b.starRating).toBe(2)
      expect(b.edgePercent).toBeGreaterThan(0)
      expect(b.modelProbability).toBeGreaterThan(b.bookImpliedProbability)
      expect(['sharp', 'soft']).toContain(b.bookTier)
    }
    const tiers = new Set(bets.map((b) => b.bookTier))
    expect(tiers.has('sharp') || tiers.has('soft')).toBe(true)
  })
})
