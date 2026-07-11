/**
 * Automated resolution-rules diff — pattern match known risk categories.
 *
 * Conservative by design: if unsure, flag for human review rather than
 * auto-clear. A false "needs review" costs minutes; a false auto-approve
 * can cost real money.
 *
 * Known true-positive (NFL SEA @ DAL, Aug 15 2026):
 * Kalshi → fair market price if not started within 48 hours
 * Polymarket → stays open until completed; cancel/tie → 50-50
 */

export type RulesFlagCategory =
  | 'postponement'
  | 'doubleheader'
  | 'tie_handling'
  | 'neutral_site'
  | 'other'

export interface RulesFlag {
  category: RulesFlagCategory
  severity: 'blocking' | 'note'
  description: string
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function hasFairPriceAfterDelay(text: string): boolean {
  const t = norm(text)
  const fair =
    t.includes('fair market price') ||
    t.includes('fair price in accordance') ||
    (t.includes('fair price') && t.includes('resolve'))
  const window =
    /\b\d+\s*hours?\b/.test(t) ||
    /\b(two|2|three|3)\s+days?\b/.test(t) ||
    t.includes('within two days') ||
    t.includes('over two days') ||
    t.includes('rescheduled to over')
  return fair && window
}

function hasStayOpenUntilComplete(text: string): boolean {
  const t = norm(text)
  return (
    (t.includes('remain open') && t.includes('completed')) ||
    (t.includes('remain open until the game has been completed') ||
      t.includes('stays open until the game is completed') ||
      (t.includes('remain open') &&
        t.includes('until the game') &&
        t.includes('completed')))
  )
}

function hasCancelFiftyFifty(text: string): boolean {
  const t = norm(text)
  const cancel =
    t.includes('canceled') ||
    t.includes('cancelled') ||
    t.includes('cancel entirely')
  const fifty =
    t.includes('50-50') ||
    t.includes('50/50') ||
    t.includes('$0.50') ||
    t.includes('0.50')
  return cancel && fifty
}

function mentionsDoubleheader(text: string): boolean {
  const t = norm(text)
  return (
    t.includes('doubleheader') ||
    t.includes('double-header') ||
    t.includes('game 1 of') ||
    t.includes('first game of a double')
  )
}

function mentionsNeutralSite(text: string): boolean {
  const t = norm(text)
  return (
    t.includes('neutral site') ||
    t.includes('neutral-site') ||
    t.includes('at a neutral')
  )
}

function hasTieHalf(text: string): boolean {
  const t = norm(text)
  return (
    (t.includes('tie') &&
      (t.includes('50-50') ||
        t.includes('50/50') ||
        t.includes('$0.50') ||
        t.includes('0.50'))) ||
    (t.includes('ends in a tie') && t.includes('resolve'))
  )
}

function hasTieVoidOrNoAction(text: string): boolean {
  const t = norm(text)
  return (
    t.includes('tie') &&
    (t.includes('void') ||
      t.includes('does not resolve') ||
      t.includes('no official winner'))
  )
}

/**
 * Diff two platforms' verbatim resolution rules for known risk patterns.
 * Zero flags ⇒ eligible for automatic verifiedEquivalent: true.
 * Any flag (including notes) ⇒ human-review queue.
 */
export function diffResolutionRules(
  kalshiRules: string,
  polymarketRules: string,
): RulesFlag[] {
  const flags: RulesFlag[] = []
  const k = kalshiRules || ''
  const p = polymarketRules || ''

  if (!k.trim() || !p.trim()) {
    flags.push({
      category: 'other',
      severity: 'blocking',
      description:
        'Missing rules text on one or both venues — cannot auto-approve.',
    })
    return flags
  }

  const kFairDelay = hasFairPriceAfterDelay(k)
  const pFairDelay = hasFairPriceAfterDelay(p)
  const kStayOpen = hasStayOpenUntilComplete(k)
  const pStayOpen = hasStayOpenUntilComplete(p)

  // Classic mismatch: one fair-prices after a delay window; the other stays open
  if ((kFairDelay && pStayOpen && !pFairDelay) || (pFairDelay && kStayOpen && !kFairDelay)) {
    flags.push({
      category: 'postponement',
      severity: 'blocking',
      description:
        'Postponement windows diverge: one venue resolves to a fair market/fair price after a delay window; the other stays open until the game is completed. Same pattern as the confirmed Seahawks/Cowboys (Aug 15 2026) case.',
    })
  } else if (kFairDelay !== pFairDelay) {
    flags.push({
      category: 'postponement',
      severity: 'blocking',
      description:
        'Only one venue uses a fair-price resolution after a postponement/reschedule window — treat as basis risk until a human confirms equivalence.',
    })
  } else if (kStayOpen !== pStayOpen && (kFairDelay || pFairDelay || kStayOpen || pStayOpen)) {
    flags.push({
      category: 'postponement',
      severity: 'note',
      description:
        'Postponement language is present on one side but not clearly mirrored on the other — review verbatim rules.',
    })
  }

  // Cancel → 50-50 only on one side while the other fair-prices
  if (hasCancelFiftyFifty(p) && kFairDelay && !hasCancelFiftyFifty(k)) {
    if (!flags.some((f) => f.category === 'postponement')) {
      flags.push({
        category: 'postponement',
        severity: 'blocking',
        description:
          'Polymarket cancel → 50-50 vs Kalshi fair-price delay window — residual cancel/postponement basis risk.',
      })
    }
  }

  // Tie handling: only flag concrete conflicts (void vs half), not "one
  // mentions 50-50 on tie and the other is silent" — silence is common on
  // Kalshi MLB templates and would flag every pair.
  if (hasTieVoidOrNoAction(k) && hasTieHalf(p)) {
    flags.push({
      category: 'tie_handling',
      severity: 'blocking',
      description:
        'Tie handling conflicts: one venue voids / refuses to resolve on a tie while the other pays ~50/50.',
    })
  } else if (hasTieVoidOrNoAction(p) && hasTieHalf(k)) {
    flags.push({
      category: 'tie_handling',
      severity: 'blocking',
      description:
        'Tie handling conflicts: one venue voids / refuses to resolve on a tie while the other pays ~50/50.',
    })
  } else if (hasTieVoidOrNoAction(k) !== hasTieVoidOrNoAction(p) && (hasTieVoidOrNoAction(k) || hasTieVoidOrNoAction(p))) {
    flags.push({
      category: 'tie_handling',
      severity: 'note',
      description:
        'One venue has void/no-winner-on-tie language the other lacks — confirm settlement on ties.',
    })
  }

  const kDh = mentionsDoubleheader(k)
  const pDh = mentionsDoubleheader(p)
  if (kDh !== pDh) {
    flags.push({
      category: 'doubleheader',
      severity: 'note',
      description:
        'Doubleheader / which-game language appears on only one venue — confirm the markets refer to the same scheduled contest.',
    })
  }

  const kN = mentionsNeutralSite(k)
  const pN = mentionsNeutralSite(p)
  if (kN !== pN) {
    flags.push({
      category: 'neutral_site',
      severity: 'note',
      description:
        'Neutral-site language appears on only one venue — confirm venue identity matches.',
    })
  }

  return flags
}
