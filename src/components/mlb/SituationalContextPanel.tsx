/**
 * Situational postponement context panel — INFORMATIONAL ONLY.
 * Never implies the rules flag is cleared or reduced.
 * Never touches verifiedEquivalent / auto-approval.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReviewQueueItem } from '@/lib/mlbPairDiscovery'
import {
  computePostponementRiskContext,
  formatContextAge,
  formatHoursUntilPitch,
  isContextFresh,
  markStaleIfNeeded,
  type PostponementRiskContext,
} from '@/lib/postponementRiskContext'
import { mlbRoofLabel } from '@/lib/mlbStadiumInfo'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function resolveHomeAndPitch(item: ReviewQueueItem): {
  homeTeam: string | null
  firstPitch: Date | null
  gameId: string
} {
  const home =
    item.pair.polymarket.homeTeam ?? item.pair.kalshi.homeTeam ?? null
  const iso =
    item.pair.polymarket.firstPitchIso ??
    item.pair.kalshi.firstPitchIso ??
    null
  const firstPitch = iso ? new Date(iso) : null
  const gameId =
    item.pair.kalshi.marketId.replace(/-[A-Z]{2,3}$/, '') ||
    item.proposed.kalshiMarketId
  return {
    homeTeam: home,
    firstPitch:
      firstPitch && Number.isFinite(firstPitch.getTime()) ? firstPitch : null,
    gameId,
  }
}

export function SituationalContextPanel({ item }: { item: ReviewQueueItem }) {
  const [ctx, setCtx] = useState<PostponementRiskContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    const { homeTeam, firstPitch, gameId } = resolveHomeAndPitch(item)
    if (!homeTeam || !firstPitch) {
      setError('Missing home team or first-pitch time — context unavailable.')
      setCtx(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await computePostponementRiskContext(gameId, firstPitch, {
        homeTeam,
      })
      setCtx(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCtx(null)
    } finally {
      setLoading(false)
    }
  }, [item])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!ctx) return
    const id = window.setInterval(() => {
      setCtx((prev) => (prev ? markStaleIfNeeded(prev) : prev))
    }, 60_000)
    return () => window.clearInterval(id)
  }, [ctx?.asOf])

  const display = ctx ? markStaleIfNeeded(ctx) : null
  const fresh = display ? isContextFresh(display) : false

  return (
    <div
      className="mt-4 rounded-md border border-sky-200 bg-sky-50/50 p-3"
      data-informational-only="true"
      data-affects-approval="false"
    >
      <p className="text-xs font-semibold text-sky-950">
        Situational context{' '}
        <span className="font-normal text-sky-800/90">
          (informational only — does not affect approval)
        </span>
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-sky-900/80">
        The rules flag above is unchanged. Clear weather or a dome does not
        clear a structural postponement-window mismatch.
      </p>

      {loading && (
        <p className="mt-2 text-xs text-sky-800">Loading stadium / weather…</p>
      )}
      {error && !loading && (
        <p className="mt-2 text-xs text-amber-900">{error}</p>
      )}

      {display && !loading && (
        <dl className="mt-2 space-y-1.5 text-xs text-sky-950">
          <div>
            <dt className="inline font-medium">Stadium: </dt>
            <dd className="inline">
              {display.stadium} ({mlbRoofLabel(display.roofType)})
            </dd>
          </div>
          {display.roofNote && (
            <div>
              <dt className="inline font-medium">Roof: </dt>
              <dd className="inline">{display.roofNote}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium">Weather: </dt>
            <dd className="inline">
              {display.weather == null
                ? 'n/a (dome — not fetched)'
                : `${display.weather.precipitationProbability ?? '—'}% precipitation chance${
                    display.weather.summary
                      ? `, ${display.weather.summary}`
                      : ''
                  }`}
              {display.weather != null && (
                <span
                  className={cn(
                    'ml-1',
                    fresh ? 'text-sky-800/80' : 'font-medium text-amber-800',
                  )}
                >
                  · {formatContextAge(display.asOf)}
                  {!fresh ? ' — stale, refresh before relying on this' : ''}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">First pitch: </dt>
            <dd className="inline">
              {formatHoursUntilPitch(display.hoursUntilFirstPitch)}
            </dd>
          </div>
        </dl>
      )}

      {(display?.stale || error) && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-2"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh context
        </Button>
      )}
    </div>
  )
}
