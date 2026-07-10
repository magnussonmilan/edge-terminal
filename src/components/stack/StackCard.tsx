import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { PropStack } from '@/types/stack'
import { Badge } from '@/components/ui/badge'
import { formatPct, cn } from '@/lib/utils'
import { formatStars } from '@/lib/keyNumbers'

interface StackCardProps {
  stack: PropStack
}

export function StackCard({ stack }: StackCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <article
      className={cn(
        'rounded-lg border bg-white text-left shadow-sm transition-all duration-300 ease-out',
        stack.highConfidenceGame ? 'border-emerald-300' : 'border-slate-200',
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
            <Badge className="bg-violet-100 text-violet-800">Stack</Badge>
            <Badge className="bg-slate-100 text-slate-600 normal-case">
              W{stack.week} · {stack.season}
            </Badge>
            {stack.highConfidenceGame && (
              <Badge className="bg-emerald-50 text-edge-positive normal-case">
                Game {formatStars(stack.gameStars)}
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

        <p className="text-sm text-slate-500">{stack.matchup}</p>
        <h3 className="mt-1 text-base font-semibold text-slate-900">
          {stack.legs.map((l) => l.player).join(' + ')}
        </h3>

        <div className="mt-3 flex flex-wrap gap-4">
          <div>
            <p className="text-xs text-slate-500">Combined edge</p>
            <p className="tabular-nums text-lg font-semibold text-edge-positive">
              +{(stack.combinedEdge * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Correlation</p>
            <p className="tabular-nums text-sm font-semibold text-slate-800">
              {stack.correlation.toFixed(2)}
            </p>
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
          <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-4">
            {stack.legs.map((leg) => (
              <div
                key={`${leg.player}-${leg.prop}`}
                className="rounded-md border border-slate-200 px-3 py-2"
              >
                <p className="text-sm font-medium text-slate-900">{leg.player}</p>
                <p className="text-xs text-slate-500">{leg.prop}</p>
                <p className="mt-1 tabular-nums text-xs text-slate-600">
                  Fair {formatPct(leg.fairValue)} vs book {formatPct(leg.bookImplied)}
                </p>
              </div>
            ))}
            <p className="text-xs text-slate-500">
              Correlation stack demo — independent from power ratings, with an optional
              game-confidence badge when both models agree the spot is interesting.
            </p>
          </div>
        </div>
      </div>
    </article>
  )
}
