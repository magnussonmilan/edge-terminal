import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { GamePrediction } from '@/lib/predictions'
import { formatStars } from '@/lib/keyNumbers'
import { Badge } from '@/components/ui/badge'
import { RatingTrajectoryChart } from '@/components/prediction/RatingTrajectoryChart'
import { isOutdoorStadium } from '@/lib/stadiums'
import { cn } from '@/lib/utils'

interface GamePredictionCardProps {
  prediction: GamePrediction
}

export function GamePredictionCard({ prediction }: GamePredictionCardProps) {
  const [expanded, setExpanded] = useState(false)
  const { starRating } = prediction
  const playable = starRating.playable
  const outdoor = isOutdoorStadium(prediction.homeTeam)
  const weather = prediction.weather
  const weatherAdj = prediction.weatherAdjustment ?? 0

  return (
    <article
      className={cn(
        'rounded-lg border bg-white text-left shadow-sm transition-all duration-300 ease-out',
        playable ? 'border-emerald-200' : 'border-slate-200',
        expanded && 'ring-1 ring-slate-300',
      )}
    >
      <button
        type="button"
        className="w-full p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge className="bg-blue-100 text-blue-800">NFL</Badge>
            <Badge className="bg-slate-100 text-slate-600 normal-case">
              W{prediction.week} · {prediction.season}
            </Badge>
            {playable ? (
              <Badge
                className={cn(
                  'normal-case tabular-nums',
                  starRating.stars >= 2
                    ? 'bg-emerald-50 text-edge-positive'
                    : 'bg-amber-50 text-amber-800',
                )}
              >
                {formatStars(starRating.stars)}
              </Badge>
            ) : (
              <Badge className="bg-slate-50 text-slate-500 normal-case">
                Below threshold
              </Badge>
            )}
            {outdoor && weather && (
              <Badge className="bg-sky-50 text-sky-800 normal-case">
                {weather.tempF != null ? `${Math.round(weather.tempF)}°F` : 'Weather'}
                {weather.windMph != null
                  ? ` · ${Math.round(weather.windMph)} mph`
                  : ''}
              </Badge>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ease-out',
              expanded && 'rotate-180',
            )}
          />
        </div>

        <p className="text-sm text-slate-500">
          {prediction.awayTeam} @ {prediction.homeTeam}
        </p>
        <h3 className="mt-1 text-base font-semibold text-slate-900">
          Model {formatHomeSpread(prediction.modelSpread)}
        </h3>

        <div className="mt-3 flex flex-wrap items-end gap-4">
          <Metric label="Home rating" value={prediction.homeRating.toFixed(1)} />
          <Metric label="Away rating" value={prediction.awayRating.toFixed(1)} />
          <div>
            <p className="text-xs text-slate-500">
              {prediction.postedSpreadIsHistorical ? 'Closing line' : 'Posted line'}
            </p>
            <p className="tabular-nums text-sm font-semibold text-slate-800">
              {prediction.postedSpread == null
                ? '—'
                : formatHomeSpread(prediction.postedSpread)}
            </p>
            {!prediction.postedSpreadIsHistorical && (
              <p className="text-[10px] text-amber-700">Unavailable in source</p>
            )}
          </div>
        </div>
      </button>

      <div
        className={cn(
          'grid transition-all duration-300 ease-out',
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4">
            <p className="text-sm leading-relaxed text-slate-600">{prediction.blurb}</p>

            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Simplified factors only: rest days (
              <span className="tabular-nums">
                {prediction.restAdjustment >= 0 ? '+' : ''}
                {prediction.restAdjustment.toFixed(2)}
              </span>
              ) and primetime (
              <span className="tabular-nums">
                {prediction.primetimeAdjustment >= 0 ? '+' : ''}
                {prediction.primetimeAdjustment.toFixed(2)}
              </span>
              ). Weather adjustment is display-only (
              <span className="tabular-nums">
                {weatherAdj >= 0 ? '+' : ''}
                {weatherAdj.toFixed(2)}
              </span>
              ) — not in modelSpread until calibrated.
            </div>

            {outdoor && weather && (
              <div className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                <p className="font-medium text-sky-900">Game-time weather (NOAA)</p>
                <p className="mt-1">
                  {weather.shortForecast}
                  {weather.tempF != null ? ` · ${Math.round(weather.tempF)}°F` : ''}
                  {weather.windMph != null
                    ? ` · wind ${Math.round(weather.windMph)} mph${
                        weather.windDirection ? ` ${weather.windDirection}` : ''
                      }`
                    : ''}
                  {weather.precipitationChance != null
                    ? ` · precip ${weather.precipitationChance}%`
                    : ''}
                </p>
              </div>
            )}

            {!outdoor && (
              <p className="text-xs text-slate-400">
                Domed / closed-roof stadium — no weather adjustment.
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Season rating trajectory
              </p>
              <RatingTrajectoryChart
                season={prediction.season}
                homeTeam={prediction.homeTeam}
                awayTeam={prediction.awayTeam}
              />
            </div>

            {prediction.homeScore != null && prediction.awayScore != null && (
              <p className="text-xs text-slate-400">
                Final:{' '}
                <span className="tabular-nums text-slate-600">
                  {prediction.awayTeam} {prediction.awayScore} –{' '}
                  {prediction.homeTeam} {prediction.homeScore}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function formatHomeSpread(spread: number): string {
  if (spread > 0) return `Home -${spread.toFixed(1)}`
  if (spread < 0) return `Home +${Math.abs(spread).toFixed(1)}`
  return "Pick'em"
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular-nums text-sm font-semibold text-slate-800">{value}</p>
    </div>
  )
}
