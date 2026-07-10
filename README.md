# Edge Terminal

Phase 1 sports betting edge feed — mock trades, Recharts performance charts, Supabase email/password auth.

## Stack

- **Router:** React Router (`/src/pages`) — Vite SPA
- **Auth/DB:** Supabase (email/password only)
- **State:** Zustand
- **UI:** Tailwind CSS v4 + shadcn-style Radix primitives
- **Charts:** Recharts

## Setup

```bash
npm install
cp .env.example .env   # add real Supabase URL + anon key
npm run dev
```

Without Supabase env vars, demo auth accepts any email + password (6+ chars) and stores a local session flag.

## Phase 1 scope

- Trade cards (collapsed / expanded)
- Historical bar chart + book line benchmark
- Mock trade data layer (`src/lib/trades.ts` → `src/mocks/trades.ts`)
- Responsive feed sorted by edge %
- Dismissible shock banner (dev trigger)
- Free tier fully; premium chart filters gated with upgrade label

## Phase 2 scope

- Book selector → stake confirm → mock receipt (`PlaceBetModal`)
- Portfolio dashboard derived via `computePortfolio(trades, bankroll)`
- Suggested stake (Kelly, display-only, premium) — labeled “Suggested Stake”
- Premium gate on full ROI / yield / streaks; Upgrade flips the tier toggle
- Feed lifecycle badges + status filter (open / watchlisted / placed)
- Dev bankroll editor in feed filters

## Power ratings

- `npm run ingest:nfl` — retrospective ratings/predictions → `src/data/nfl/`
- `/predictions` — star-rated game cards vs historical closing lines

## Stack Finder (correlation demo)

- `npm run ingest:stacks` — nflverse weekly player logs → `correlation-stacks.json`
- `src/lib/correlation.ts` — Pearson r + joint hit-rate (min 20 shared games)
- `src/lib/stacks.ts` — `fetchStacks()` data layer (mirrors trades.ts)
- `/stacks` — ranked by joint hit-rate; free top 3 + premium blur gate
- Cross-model badge when the stack's latest shared game has ≥2★ prediction
- Lines shown are **illustrative averages**, not live pick'em odds

## Backtest + how it works

- `/backtest` — ATS win rate by star level, Brier, ROI-if-followed (−110)
- `/how-it-works` — plain-language mechanism walkthrough
- `npm test` — key-number star-rating regression tests
