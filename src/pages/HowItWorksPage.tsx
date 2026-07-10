/**
 * Plain-language mechanism walkthrough — no formulas, no jargon dump.
 */
import { Link } from 'react-router-dom'

export function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        How it works
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        A short tour of what Edge Terminal is measuring — and what it is not claiming.
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Power ratings</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Each team carries a number that starts near average and updates after every
          game. Most of the old rating sticks around (think &quot;90% memory&quot;), and a
          smaller slice of this week&apos;s performance blends in (think &quot;10% new
          information&quot;). Home field is a fixed two-point bump. Injuries adjust the
          read using a simple player-value table — not a human scout&apos;s notebook.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Star ratings</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          When the model&apos;s number disagrees with the historical closing line, we
          count how much &quot;key number&quot; territory sits between them — the margins
          games actually land on most often (3, 7, and so on). Below about 5.5% of that
          territory, we treat the gap as too thin to call playable. More stars means a
          wider, more meaningful gap — not a guarantee.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Correlation stacks</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Flat-payout pick&apos;em products usually price each player prop on its own.
          In real games, a quarterback&apos;s passing yards and a receiver&apos;s catching
          yards often rise and fall together. Stack Finder measures how often two
          teammates clear their averages in the same game, and how tightly their
          numbers move together. That joint hit-rate is the headline; the correlation
          number is supporting detail.
        </p>
        <p className="text-sm leading-relaxed text-slate-600">
          When a stack&apos;s most recent shared game also shows a high-confidence
          power-rating signal (two stars or more), we add a small badge — two models
          pointing at the same spot, still not a promise.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">See the track record</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          The{' '}
          <Link to="/backtest" className="font-medium text-slate-900 underline">
            Backtest
          </Link>{' '}
          page shows how playable star signals would have done against historical
          closing lines from 2022–2024 — win rate, a simple accuracy score, and what
          flat betting at standard juice would have returned. Use it to pressure-test
          the mechanism, not as a forecast of next week.
        </p>
      </section>

      <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm leading-relaxed text-slate-700">
          <span className="font-semibold">This is a demo.</span> Edge Terminal is built
          for mechanism transparency — showing how ratings, stars, and stacks work on
          real historical data. It is not a guaranteed-winner system, and past backtest
          results do not guarantee future results.
        </p>
      </section>
    </div>
  )
}
