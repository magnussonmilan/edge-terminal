import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/useAuthStore'
import { useTradeStore } from '@/store/useTradeStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type NavEntry = {
  to: string
  label: string
  end?: boolean
  /** Match query string for sport-specific Compare links. */
  search?: string
}

type NavSection = {
  label: string
  items: NavEntry[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Model',
    items: [
      { to: '/predictions', label: 'Predictions' },
      { to: '/rankings', label: 'Rankings' },
    ],
  },
  {
    label: 'Markets',
    items: [
      { to: '/compare', label: 'Compare' },
      {
        to: '/compare',
        search: '?sport=mlb',
        label: 'MLB vs markets',
      },
      { to: '/lines', label: 'Lines' },
      { to: '/stacks', label: 'Stacks' },
      { to: '/arb', label: 'Arb' },
    ],
  },
  {
    label: 'Transparency',
    items: [
      { to: '/backtest', label: 'Backtest' },
      { to: '/mlb-elo', label: 'MLB Elo' },
      { to: '/how-it-works', label: 'How it works' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/', label: 'Feed', end: true },
      { to: '/portfolio', label: 'Portfolio' },
    ],
  },
]

export function AppLayout() {
  const signOut = useAuthStore((s) => s.signOut)
  const tier = useTradeStore((s) => s.user.tier)

  return (
    <div className="min-h-svh bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="shrink-0 text-sm font-semibold tracking-tight text-primary">
              Edge Terminal
            </span>
            <div className="flex min-w-0 flex-wrap items-start gap-x-4 gap-y-2">
              {NAV_SECTIONS.map((section) => (
                <NavGroup key={section.label} section={section} />
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
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

function NavGroup({ section }: { section: NavSection }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {section.label}
      </span>
      <div className="flex flex-wrap gap-0.5">
        {section.items.map((item) => (
          <NavItem
            key={`${item.to}${item.search ?? ''}-${item.label}`}
            to={item.to}
            search={item.search}
            end={item.end}
          >
            {item.label}
          </NavItem>
        ))}
      </div>
    </div>
  )
}

function NavItem({
  to,
  search,
  end,
  children,
}: {
  to: string
  search?: string
  end?: boolean
  children: ReactNode
}) {
  const location = useLocation()
  const href = `${to}${search ?? ''}`
  const isMlbMarkets = search === '?sport=mlb'
  const isCompare = to === '/compare' && !search

  return (
    <NavLink
      to={href}
      end={end}
      className={() => {
        let active = false
        if (isMlbMarkets) {
          active =
            location.pathname === '/compare' &&
            new URLSearchParams(location.search).get('sport') === 'mlb'
        } else if (isCompare) {
          active =
            location.pathname === '/compare' &&
            new URLSearchParams(location.search).get('sport') !== 'mlb'
        } else if (end) {
          active = location.pathname === to
        } else {
          active =
            location.pathname === to ||
            (to !== '/' && location.pathname.startsWith(`${to}/`))
        }
        return cn(
          'rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
          active
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-500 hover:text-slate-800',
          isMlbMarkets && !active && 'text-emerald-700 hover:text-emerald-900',
        )
      }}
    >
      {children}
    </NavLink>
  )
}
