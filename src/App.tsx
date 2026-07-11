import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore, useIsAuthenticated } from '@/store/useAuthStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { AuthPage } from '@/pages/AuthPage'
import { FeedPage } from '@/pages/FeedPage'
import { PortfolioPage } from '@/pages/PortfolioPage'
import { PredictionsPage } from '@/pages/PredictionsPage'
import { StacksPage } from '@/pages/StacksPage'
import { BacktestPage } from '@/pages/BacktestPage'
import { HowItWorksPage } from '@/pages/HowItWorksPage'
import { ArbMonitorPage } from '@/pages/ArbMonitorPage'
import { LinesPage } from '@/pages/LinesPage'
import { MlbEloPage } from '@/pages/MlbEloPage'
import { Skeleton } from '@/components/ui/skeleton'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated()
  const loading = useAuthStore((s) => s.loading)

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-50">
        <div className="w-full max-w-md space-y-3 px-4">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />
  }

  return children
}

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    void init()
  }, [init])

  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<FeedPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/predictions" element={<PredictionsPage />} />
        <Route path="/stacks" element={<StacksPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/arb" element={<ArbMonitorPage />} />
        <Route path="/lines" element={<LinesPage />} />
        <Route path="/mlb-elo" element={<MlbEloPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
