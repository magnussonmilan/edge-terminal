import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useTradeStore } from '@/store/useTradeStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const signOut = useAuthStore((s) => s.signOut)
  const tier = useTradeStore((s) => s.user.tier)

  return (
    <div className="min-h-svh bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight text-primary">
              Edge Terminal
            </span>
            <div className="flex gap-1">
              <NavItem to="/" end>
                Feed
              </NavItem>
              <NavItem to="/predictions">Predictions</NavItem>
              <NavItem to="/stacks">Stacks</NavItem>
              <NavItem to="/backtest">Backtest</NavItem>
              <NavItem to="/arb">Arb</NavItem>
              <NavItem to="/lines">Lines</NavItem>
              <NavItem to="/compare">Compare</NavItem>
              <NavItem to="/rankings">Rankings</NavItem>
              <NavItem to="/mlb-elo">MLB Elo</NavItem>
              <NavItem to="/how-it-works">How it works</NavItem>
              <NavItem to="/portfolio">Portfolio</NavItem>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs capitalize text-slate-500 sm:inline">
              {tier} tier
            </span>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  )
}

function NavItem({
  to,
  end,
  children,
}: {
  to: string
  end?: boolean
  children: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          isActive
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-500 hover:text-slate-800',
        )
      }
    >
      {children}
    </NavLink>
  )
}
