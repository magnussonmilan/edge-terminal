import { useMemo, useState } from 'react'
import type { Trade } from '@/types/trade'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useTradeStore } from '@/store/useTradeStore'
import { calculateSuggestedStake } from '@/lib/kelly'
import {
  compareBooksByOdds,
  formatAmericanOdds,
  potentialReturn,
} from '@/lib/odds'
import { formatUsdPrecise } from '@/lib/portfolio'
import { cn } from '@/lib/utils'

type Step = 'books' | 'confirm' | 'receipt'

interface PlaceBetModalProps {
  trade: Trade
}

export function PlaceBetModal({ trade }: PlaceBetModalProps) {
  const placeBet = useTradeStore((s) => s.placeBet)
  const bankroll = useTradeStore((s) => s.bankroll)
  const isPremium = useTradeStore((s) => s.user.tier === 'premium')

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('books')
  const [selectedBook, setSelectedBook] = useState<string | null>(null)
  const [stake, setStake] = useState('')

  const books = useMemo(() => {
    return Object.entries(trade.books)
      .map(([name, book]) => ({
        name,
        odds: book.currentOdds,
        available: book.available,
        spread: book.spread,
      }))
      .sort(compareBooksByOdds)
  }, [trade.books])

  const bestBookName = books.find((b) => b.available)?.name ?? null
  const selected = books.find((b) => b.name === selectedBook)
  const stakeNum = Number(stake)
  const stakeValid = Number.isFinite(stakeNum) && stakeNum > 0

  const suggested = selected
    ? calculateSuggestedStake(bankroll, selected.odds, trade.fairValueProbability)
    : null

  function reset() {
    setStep('books')
    setSelectedBook(null)
    setStake('')
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleSelectBook(name: string) {
    setSelectedBook(name)
    setStep('confirm')
  }

  function handleConfirm() {
    if (!selected || !stakeValid) return
    placeBet(trade.id, {
      bookName: selected.name,
      odds: selected.odds,
      stake: stakeNum,
    })
    setStep('receipt')
  }

  const alreadyPlaced = trade.userAction === 'placed' && trade.status === 'active'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="positive"
          className="flex-1 sm:flex-none"
          disabled={trade.status === 'settled' || trade.status === 'expired'}
        >
          {alreadyPlaced ? 'Place Another' : 'Place Bet Now'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        {step === 'books' && (
          <>
            <DialogHeader>
              <DialogTitle>Select a book</DialogTitle>
              <DialogDescription>
                Compare mock odds for {trade.proposition}. No sportsbook is contacted.
              </DialogDescription>
            </DialogHeader>
            <ul className="mt-2 space-y-2">
              {books.map((book) => {
                const isBest = book.name === bestBookName && book.available
                return (
                  <li key={book.name}>
                    <button
                      type="button"
                      disabled={!book.available}
                      onClick={() => handleSelectBook(book.name)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md border px-3 py-3 text-left transition-colors',
                        isBest
                          ? 'border-edge-positive bg-emerald-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50',
                        !book.available && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{book.name}</p>
                        <p className="tabular-nums text-xs text-slate-500">
                          Line {book.spread}
                          {!book.available ? ' · unavailable' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums text-base font-semibold text-slate-900">
                          {formatAmericanOdds(book.odds)}
                        </p>
                        {isBest && (
                          <Badge className="mt-1 bg-emerald-100 text-edge-positive normal-case">
                            Best odds
                          </Badge>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {step === 'confirm' && selected && (
          <>
            <DialogHeader>
              <DialogTitle>Review & Confirm</DialogTitle>
              <DialogDescription>
                {trade.matchup.away} @ {trade.matchup.home} · {selected.name}{' '}
                {formatAmericanOdds(selected.odds)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="stake">Stake ($)</Label>
                <Input
                  id="stake"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="decimal"
                  placeholder="Enter stake"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="tabular-nums"
                />
              </div>

              {isPremium && suggested && suggested.amount > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Suggested Stake
                  </p>
                  <button
                    type="button"
                    onClick={() => setStake(String(suggested.amount))}
                    className="mt-2 inline-flex items-center rounded-md border border-edge-positive bg-white px-3 py-1.5 text-sm font-semibold tabular-nums text-edge-positive hover:bg-emerald-50"
                  >
                    {formatUsdPrecise(suggested.amount)}
                  </button>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Based on your bankroll and how often we expect this to hit, a disciplined
                    stake is {formatUsdPrecise(suggested.amount)}.
                    {suggested.capped
                      ? ' Capped at 20% of bankroll for safety.'
                      : ''}
                  </p>
                </div>
              )}

              {!isPremium && (
                <p className="text-xs text-amber-700">
                  Upgrade to Premium — $29.99/mo for suggested stake sizing.
                </p>
              )}

              <div className="rounded-md border border-slate-200 px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Potential return</span>
                  <span className="tabular-nums font-semibold text-slate-900">
                    {stakeValid
                      ? formatUsdPrecise(potentialReturn(stakeNum, selected.odds))
                      : '—'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('books')}>
                  Back
                </Button>
                <Button
                  variant="positive"
                  className="flex-1"
                  disabled={!stakeValid}
                  onClick={handleConfirm}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 'receipt' && selected && (
          <>
            <DialogHeader>
              <DialogTitle>Bet placed</DialogTitle>
              <DialogDescription>
                Mock receipt — nothing was sent to a sportsbook.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <ReceiptRow
                label="Matchup"
                value={`${trade.matchup.away} @ ${trade.matchup.home}`}
              />
              <ReceiptRow label="Prop" value={trade.proposition} />
              <ReceiptRow label="Book" value={selected.name} />
              <ReceiptRow
                label="Odds"
                value={formatAmericanOdds(selected.odds)}
                mono
              />
              <ReceiptRow
                label="Stake"
                value={formatUsdPrecise(stakeNum)}
                mono
              />
              <ReceiptRow
                label="Potential return"
                value={formatUsdPrecise(potentialReturn(stakeNum, selected.odds))}
                mono
              />
            </div>
            <Button className="mt-4 w-full" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ReceiptRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={cn('text-right font-medium text-slate-900', mono && 'tabular-nums')}>
        {value}
      </span>
    </div>
  )
}
