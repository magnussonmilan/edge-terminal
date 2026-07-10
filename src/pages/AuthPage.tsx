import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore, useIsAuthenticated } from '@/store/useAuthStore'
import { isSupabaseConfigured } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AuthPage() {
  const isAuthenticated = useIsAuthenticated()
  const { signIn, signUp, error, loading, clearError } = useAuthStore()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    clearError()
    if (mode === 'signin') {
      await signIn(email, password)
    } else {
      await signUp(email, password)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Edge Terminal</h1>
        <p className="mt-1 text-sm text-slate-500">
          {mode === 'signin' ? 'Sign in with email' : 'Create an account'}
        </p>

        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Supabase env not configured — demo auth is active. Any email + password
            (6+ chars) will sign you in locally. Copy <code>.env.example</code> to{' '}
            <code>.env</code> for real email/password auth.
          </p>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-800"
          onClick={() => {
            clearError()
            setMode(mode === 'signin' ? 'signup' : 'signin')
          }}
        >
          {mode === 'signin'
            ? 'Need an account? Sign up'
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}
