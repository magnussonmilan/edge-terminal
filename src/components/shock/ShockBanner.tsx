import { useEffect, useRef } from 'react'
import { X, Zap } from 'lucide-react'
import { useTradeStore } from '@/store/useTradeStore'
import { formatPct } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function ShockBanner() {
  const shock = useTradeStore((s) => s.shock)
  const dismissShock = useTradeStore((s) => s.dismissShock)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!shock) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => dismissShock(), 8000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [shock, dismissShock])

  if (!shock) return null

  const deltaPct = `+${(shock.delta * 100).toFixed(1)}%`

  return (
    <div className="animate-slide-down sticky top-0 z-40 border-b border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-start gap-3">
        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="flex-1 text-sm text-amber-950">
          ⚡ <span className="font-semibold">{shock.event}</span>
          {' — '}
          {shock.prop} probability{' '}
          <span className="tabular-nums">{formatPct(shock.fromProbability)}</span>
          {' → '}
          <span className="tabular-nums">{formatPct(shock.toProbability)}</span>
          {' '}
          <span className="tabular-nums font-semibold text-edge-positive">
            ({deltaPct})
          </span>
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-amber-800"
          onClick={dismissShock}
          aria-label="Dismiss shock banner"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
