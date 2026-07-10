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

## Power ratings + Stack Finder demo

Independent NFL modules (do not alter Phase 1/2 trade paths):

- `src/lib/keyNumbers.ts` — key-number table + star ratings
- `src/lib/powerRatings.ts` — weekly score-based rating updates + HFA
- `src/lib/playerValues.ts` — formula player values + flat injury differential
- `src/lib/predictions.ts` — predicted spread (ratings + rest + primetime)
- `scripts/ingest-nflverse.ts` — retrospective 2022–2024 nflverse ingest → `src/data/nfl/`
- `/predictions` — `GamePredictionCard` list sorted by stars (free: top 3)
- `/stacks` — correlation stack cards; **Game ★** badge when the game is high-confidence

```bash
npm run ingest:nfl   # refresh fixtures from nflverse
npm run dev
```

Honest demo copy: mechanism transparency vs historical closing lines — not a market-beating claim.
