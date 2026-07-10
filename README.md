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
- `npm run calibrate` — joint ridge + rolling-origin CV over 2016–2024

## Live data pipeline (injuries → weather → odds)

Static JSON under `src/data/nfl/` is refreshed by scripts (no Postgres/Redis/Airflow).

| Script | Purpose |
|--------|---------|
| `npm run ingest:current-week` | nflverse injuries for current season (or `--dry-run-season=2025 --dry-run-week=17`) |
| `npm run ingest:odds` | The Odds API spreads → `current-odds.json` + `current-week-schedule.json` (needs `ODDS_API_KEY`) |
| `npm run ingest:weather` | NOAA `api.weather.gov` for outdoor homes (needs schedule JSON, or dry-run flags) |

**Season helper:** `getCurrentNflSeason()` — Sept starts a new season year; Jan/Feb stay on the prior year.

**Odds:** Without `ODDS_API_KEY`, `/` keeps mock trades. With the key (or ingested `current-odds.json`), the feed shows live NFL spreads and a best-line badge. Do not commit API keys — use `.env` / GitHub Actions secrets.

**Weather:** Domed/retractable stadiums skip NOAA and show no weather UI. `weatherAdjustment` is display-only (not in `modelSpread`) until a separate calibration pass.

### GitHub Actions — `.github/workflows/weekly-ingest.yml`

- **Cron:** Tue–Fri 14:00 UTC
- **Guard:** job exits early outside Sept–Feb (no twice-yearly cron edits)
- **Steps:** `ingest:current-week` → `ingest:odds` (if `ODDS_API_KEY` secret set) → `ingest:weather` → auto-commit JSON
- **Manual test:** Actions → *Weekly live ingest* → *Run workflow* (`workflow_dispatch`). Off-season, injuries should log `No injury data yet for {season}` and exit 0.

Store `ODDS_API_KEY` as a repository secret (Settings → Secrets and variables → Actions).
