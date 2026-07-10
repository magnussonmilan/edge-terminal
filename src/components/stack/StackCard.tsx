import { ChevronDown } from 'lucide-react'
import type { Stack } from '@/types/stack'
import { propTypeLabel } from '@/lib/correlation'
import { Badge } from '@/components/ui/badge'
import { StackCardExpanded } from '@/components/stack/StackCardExpanded'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface StackCardProps {
  stack: Stack
}

const TIER_STYLES: Record<Stack['tier'], string> = {
  high: 'bg-emerald-50 text-edge-positive',
  medium: 'bg-amber-50 text-amber-800',
  low: 'bg-slate-100 text-slate-600',
}

export function StackCard({ stack }: StackCardProps) {
  const [expanded, setExpanded] = useState(false)
  const ratePct = Math.round(stack.jointHitRate.rate * 100)
  const positiveCorr = stack.correlation >= 0

  return (
    <article
      className={cn(
        'rounded-lg border bg-white text-left shadow-sm transition-all duration-300 ease-out',
        stack.tier === 'high'
          ? 'border-emerald-200'
          : stack.tier === 'medium'
            ? 'border-amber-200'
            : 'border-slate-200',
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
            <Badge className="bg-slate-900 text-white">{stack.playerA.team}</Badge>
            <Badge className={cn('normal-case capitalize', TIER_STYLES[stack.tier])}>
              {stack.tier} corr
            </Badge>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-300 ease-out',
              expanded && 'rotate-180',
            )}
          />
        </div>

        <h3 className="text-base font-semibold leading-snug text-slate-900">
          {shortName(stack.playerA.name)} {propTypeLabel(stack.playerA.propType)}
          <span className="mx-1.5 text-slate-400">↔</span>
          {shortName(stack.playerB.name)} {propTypeLabel(stack.playerB.propType)}
        </h3>

        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs text-slate-500">Hit together</p>
            <p
              className={cn(
                'tabular-nums text-lg font-semibold',
                ratePct >= 40 ? 'text-edge-positive' : 'text-edge-neutral',
              )}
            >
              {ratePct}%
            </p>
            <p className="tabular-nums text-[11px] text-slate-400">
              {stack.jointHitRate.hitsTogether}/{stack.jointHitRate.totalGames} games
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Correlation r</p>
            <p
              className={cn(
                'tabular-nums text-sm font-semibold',
                positiveCorr ? 'text-slate-800' : 'text-slate-600',
              )}
            >
              {stack.correlation >= 0 ? '+' : ''}
              {stack.correlation.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Sample</p>
            <p className="tabular-nums text-sm font-semibold text-slate-800">
              {stack.sampleSize}
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
          <div className="px-4 pb-4">
            <StackCardExpanded stack={stack} />
          </div>
        </div>
      </div>
    </article>
  )
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0][0]}. ${parts[parts.length - 1]}`
}
