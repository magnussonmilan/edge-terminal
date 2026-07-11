/**
 * Independent verification of MLB Elo pre-game probabilities vs outcomes.
 *
 * Copyright (c) 2024 Neil Paine
 * Source: https://github.com/Neil-Paine-1/MLB-WAR-data-historical
 * License: MIT — retain the copyright notice on redistributions.
 *
 * Figures on this page are Edge Terminal's own computations over that data —
 * not published summaries from the source author.
 */
import verification from '@/data/mlb/verification.json'
import meta from '@/data/mlb/meta.json'
import { Link } from 'react-router-dom'

function pct(x: number): string {
  return `${(x * 100).toFixed(2)}%`
}

export function MlbEloPage() {
  const eras = verification.eras
  const notes = verification.decisionNotes ?? []
  const opener = 'openerProxy' in verification ? verification.openerProxy : null
  const hasRating =
    eras.some((e) => (e.ratingN ?? 0) > 0) ||
    eras.some((e) => (e.ratingAccuracy ?? 0) > 0)

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        MLB Elo verification
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Independent recompute of accuracy and Brier from Neil Paine&apos;s
        mlb-elo-latest.csv pre-game Elo probabilities vs final scores. This page
        is the verification deliverable — not a betting product.
      </p>

      <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700">
        {meta.copyrightNotice}. Source:{' '}
        <a
          className="underline"
          href={meta.sourceReadme}
          target="_blank"
          rel="noreferrer"
        >
          github.com/Neil-Paine-1/MLB-WAR-data-historical
        </a>{' '}
        (
        <a
          className="underline"
          href={meta.licenseUrl}
          target="_blank"
          rel="noreferrer"
        >
          MIT
        </a>
        ). Accuracy figures below are Edge Terminal computations over that data.
      </p>

      <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-950">
        <p className="font-medium">MLB model vs Kalshi / Polymarket</p>
        <p className="mt-1 text-xs text-emerald-900/90">
          Compare Elo win probabilities to curated prediction-market prices on
          the unified Compare page (seasonal feed — not a live 2026 pipeline).
        </p>
        <Link
          to="/compare?sport=mlb"
          className="mt-2 inline-block text-sm font-medium underline"
        >
          Open MLB vs markets →
        </Link>
      </div>

      <section className="mt-8 space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Freshness</h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Status:{' '}
          <span className="font-medium text-slate-900">
            {meta.freshness.status}
          </span>
          . {meta.freshness.summary}
        </p>
        <p className="text-xs text-slate-500">
          Settled through {meta.freshness.maxSettledDate} · max season{' '}
          {meta.freshness.maxSeason} · {meta.freshness.settledGameCount} settled
          games · last commit {meta.fetchStatus.lastRepoCommitDate ?? '—'} ·
          resolved from {meta.fetchStatus.resolvedSource}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">
          Independent accuracy by era
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {hasRating
            ? 'Two systems, reported separately: simpler Elo vs pitcher-adjusted “rating”. Home-team baseline included for context.'
            : 'This feed is Elo-only (no pitcher-adjusted rating_prob columns). Rating columns show n=0. Home-team baseline included for context.'}
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Era</th>
                <th className="py-2 pr-3 font-medium">Elo SU</th>
                <th className="py-2 pr-3 font-medium">Elo Brier</th>
                <th className="py-2 pr-3 font-medium">Rating SU</th>
                <th className="py-2 pr-3 font-medium">Rating Brier</th>
                <th className="py-2 pr-3 font-medium">n</th>
                <th className="py-2 font-medium">Home</th>
              </tr>
            </thead>
            <tbody>
              {eras.map((e) => (
                <tr key={e.eraLabel} className="border-b border-slate-100">
                  <td className="py-2 pr-3 text-slate-800">{e.eraLabel}</td>
                  <td className="py-2 pr-3 tabular-nums">{pct(e.eloAccuracy)}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {e.eloBrier.toFixed(4)}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {e.ratingN > 0 ? pct(e.ratingAccuracy) : '—'}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {e.ratingN > 0 ? e.ratingBrier.toFixed(4) : '—'}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-slate-500">
                    {e.ratingN || e.eloN}
                  </td>
                  <td className="py-2 tabular-nums text-slate-500">
                    {pct(e.homeBaselineAccuracy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {opener != null ? (
        <section className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Opener / low pitcher-adj proxy
          </h2>
          <p className="text-sm text-slate-600">
            Games where both listed starters have |pitcher_adj| &lt;{' '}
            {opener.lowAdjThreshold} (crude bullpen-day / weak-starter proxy —
            not opener ground truth):
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            <li>
              Low-adj: rating {pct(opener.lowAdj.ratingAccuracy)} (n=
              {opener.lowAdj.ratingN}) vs Elo {pct(opener.lowAdj.eloAccuracy)}
            </li>
            <li>
              Normal-adj: rating {pct(opener.normalAdj.ratingAccuracy)} (n=
              {opener.normalAdj.ratingN}) vs Elo{' '}
              {pct(opener.normalAdj.eloAccuracy)}
            </li>
          </ul>
        </section>
      ) : (
        <section className="mt-8 space-y-2">
          <h2 className="text-lg font-semibold text-slate-900">
            Opener / pitcher-adj proxy
          </h2>
          <p className="text-sm text-slate-600">
            Not applicable — Neil Paine mlb-elo-latest.csv has no pitcher_adj /
            rating_prob columns. The prior 538-era opener proxy is retired with
            that source.
          </p>
        </section>
      )}

      <section className="mt-8 space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">
          Decision notes (after verification)
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
          {notes.map((n) => (
            <li key={n.slice(0, 48)}>{n}</li>
          ))}
        </ul>
        <p className="text-sm text-slate-600">
          Closing-line ATS is deferred: The Odds API documents historical{' '}
          <code className="text-xs">baseball_mlb</code> from 2020-06-30 (paid
          historical product) — a real source, not assumed. Not wired in this
          pass.
        </p>
      </section>

      <p className="mt-10 text-sm text-slate-500">
        <Link to="/compare?sport=mlb" className="underline">
          MLB vs markets
        </Link>{' '}
        ·{' '}
        <Link to="/how-it-works" className="underline">
          How it works
        </Link>{' '}
        ·{' '}
        <Link to="/backtest" className="underline">
          NFL backtest
        </Link>
      </p>
    </div>
  )
}
