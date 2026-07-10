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
