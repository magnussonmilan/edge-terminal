/**
 * Regression tests for automated rules-diff.
 * SEA @ DAL (Aug 15 2026) is a known true-positive postponement mismatch.
 */

import { describe, expect, it } from 'vitest'
import { diffResolutionRules } from './rulesDiffChecker'
import { matchCandidatePairs } from './pairMatcher'
import type { DiscoveredMarket } from './discoveredMarket'
import { classifyCandidatePair } from './mlbPairDiscovery'

/** Verbatim (abbreviated to the risk clauses) from live APIs 2026-07-11. */
const SEA_DAL_KALSHI_RULES = `
If Seattle wins the Dallas vs Seattle professional football game originally scheduled for Aug 15, 2026, then the market resolves to Yes.

The following market refers to the team who wins the Dallas vs Seattle professional football game originally scheduled for Aug 15, 2026. If the game ends in a tie, the market will resolve to $0.50 for each team. If the game is postponed but begins within 48 hours from its originally scheduled start time, the market will remain open and resolve based on the official final result. If the game is not started within 48 hours, the market will resolve to a fair market price.

This market will close and expire after a winner is declared.
`.trim()

const SEA_DAL_POLYMARKET_RULES = `
In the upcoming NFL game, scheduled for August 15 at 8:00PM ET:
If Seahawks wins, the market will resolve to "Seahawks".
If Cowboys wins, the market will resolve to "Cowboys".
If the game is postponed, this market will remain open until the game has been completed.
If the game is canceled entirely or ends in a tie, with no make-up game, this market will resolve 50-50.
`.trim()

/** Identical standard stay-open rules on both sides — should not flag. */
const IDENTICAL_STANDARD = `
In the upcoming MLB game scheduled for July 12:
This market will resolve to the winning team.
If the game is postponed, this market will remain open until the game has been completed.
If the game is canceled entirely, with no make-up game, or ends in a tie, this market will resolve 50-50.
`.trim()

describe('diffResolutionRules', () => {
  it('flags the confirmed Seahawks/Cowboys postponement-window mismatch', () => {
    const flags = diffResolutionRules(
      SEA_DAL_KALSHI_RULES,
      SEA_DAL_POLYMARKET_RULES,
    )
    expect(flags.length).toBeGreaterThan(0)
    const postponement = flags.filter((f) => f.category === 'postponement')
    expect(postponement.length).toBeGreaterThan(0)
    expect(postponement.some((f) => f.severity === 'blocking')).toBe(true)
  })

  it('produces zero flags for genuinely identical standard rules', () => {
    const flags = diffResolutionRules(IDENTICAL_STANDARD, IDENTICAL_STANDARD)
    expect(flags).toEqual([])
  })

  it('flags missing rules as blocking other', () => {
    const flags = diffResolutionRules('', IDENTICAL_STANDARD)
    expect(flags.some((f) => f.category === 'other' && f.severity === 'blocking')).toBe(
      true,
    )
  })
})

describe('matchCandidatePairs + classify', () => {
  it('matches on franchise ids + date and auto-approves only with zero flags', () => {
    const kalshi: DiscoveredMarket = {
      venue: 'kalshi',
      marketId: 'KXMLBGAME-TEST-TOR',
      title: 'Toronto vs San Diego Winner?',
      teams: ['SDP', 'TOR'],
      gameDate: '2026-07-12',
      resolutionRules: IDENTICAL_STANDARD,
      resolutionSource: 'test',
      yesTeam: 'TOR',
    }
    const polymarket: DiscoveredMarket = {
      venue: 'polymarket',
      marketId: '0xtest',
      title: 'Toronto Blue Jays vs. San Diego Padres',
      teams: ['SDP', 'TOR'],
      gameDate: '2026-07-12',
      resolutionRules: IDENTICAL_STANDARD,
      resolutionSource: 'test',
      outcomeLabels: ['Toronto Blue Jays', 'San Diego Padres'],
      eventSlug: 'mlb-tor-sd-2026-07-12',
    }
    const pairs = matchCandidatePairs([kalshi], [polymarket])
    expect(pairs).toHaveLength(1)
    const item = classifyCandidatePair(pairs[0]!)
    expect(item.status).toBe('auto_approved')
    expect(item.proposed.verifiedEquivalent).toBe(true)

    const risky = classifyCandidatePair({
      ...pairs[0]!,
      kalshi: { ...kalshi, resolutionRules: SEA_DAL_KALSHI_RULES },
      polymarket: {
        ...polymarket,
        resolutionRules: SEA_DAL_POLYMARKET_RULES,
      },
    })
    expect(risky.status).toBe('needs_review')
    expect(risky.proposed.verifiedEquivalent).toBe(false)
    expect(risky.flags.some((f) => f.category === 'postponement')).toBe(true)
  })

  it('does not match different dates', () => {
    const kalshi: DiscoveredMarket = {
      venue: 'kalshi',
      marketId: 'K-1',
      title: 't',
      teams: ['BOS', 'NYY'],
      gameDate: '2026-07-12',
      resolutionRules: 'x',
      resolutionSource: 't',
      yesTeam: 'NYY',
    }
    const polymarket: DiscoveredMarket = {
      venue: 'polymarket',
      marketId: 'P-1',
      title: 't',
      teams: ['BOS', 'NYY'],
      gameDate: '2026-07-13',
      resolutionRules: 'x',
      resolutionSource: 't',
      outcomeLabels: ['New York Yankees', 'Boston Red Sox'],
    }
    expect(matchCandidatePairs([kalshi], [polymarket])).toHaveLength(0)
  })
})
