import { propTypeLabel } from '@/lib/correlation'
import type { Stack } from '@/types/stack'
import { StackChart } from '@/components/stack/StackChart'

interface StackCardExpandedProps {
  stack: Stack
}

export function StackCardExpanded({ stack }: StackCardExpandedProps) {
  const rationale = buildRationale(stack)

  return (
    <div className="space-y-4 border-t border-slate-100 pt-4 text-left">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Last {stack.chartGames} shared games
        </p>
        <StackChart stack={stack} />
        <p className="mt-2 text-[11px] text-slate-400">
          Dashed lines are illustrative averages from this lookback — not live pick&apos;em
          lines.
        </p>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">{rationale}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Hit together"
          value={`${stack.jointHitRate.hitsTogether}/${stack.jointHitRate.totalGames}`}
        />
        <Stat label="Sample size" value={String(stack.sampleSize)} />
        <Stat
          label={`${shortName(stack.playerA.name)} avg`}
          value={stack.lineA.toFixed(1)}
        />
        <Stat
          label={`${shortName(stack.playerB.name)} avg`}
          value={stack.lineB.toFixed(1)}
        />
      </div>

      <p className="text-xs text-slate-400">
        Lookback: {stack.lookbackGames} shared regular-season games (min 20). Equal-weight
        across seasons — recency weighting is a planned v2 refinement.
      </p>
    </div>
  )
}

function buildRationale(stack: Stack): string {
  const a = shortName(stack.playerA.name)
  const b = shortName(stack.playerB.name)
  const propA = propTypeLabel(stack.playerA.propType).toLowerCase()
  const propB = propTypeLabel(stack.playerB.propType).toLowerCase()
  const ratePct = Math.round(stack.jointHitRate.rate * 100)
  const n = stack.jointHitRate.totalGames

  const positive = stack.correlation >= 0
  const link = positive
    ? `When ${a}'s ${propA} run higher, ${b}'s ${propB} tend to follow`
    : `When ${a}'s ${propA} run higher, ${b}'s ${propB} often move the other way`

  return `${link} — these two have cleared their averages together in ${ratePct}% of their last ${n} shared games (${stack.jointHitRate.hitsTogether}/${n}).`
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0][0]}. ${parts[parts.length - 1]}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="tabular-nums text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
