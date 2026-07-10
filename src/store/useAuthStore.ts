import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  error: string | null
  /** Local demo mode when Supabase env is not configured. */
  demoAuthenticated: boolean
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: true,
  error: null,
  demoAuthenticated: false,

  init: async () => {
    if (!isSupabaseConfigured || !supabase) {
      const demo = localStorage.getItem('edge-demo-auth') === '1'
      set({ loading: false, demoAuthenticated: demo })
      return
    }

    const { data } = await supabase.auth.getSession()
    set({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null })
    })
  },

  signIn: async (email, password) => {
    set({ error: null, loading: true })

    if (!isSupabaseConfigured || !supabase) {
      if (!email || password.length < 6) {
        set({
          error: 'Enter a valid email and a password of at least 6 characters.',
          loading: false,
        })
        return false
      }
      localStorage.setItem('edge-demo-auth', '1')
      set({ demoAuthenticated: true, loading: false })
      return true
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ error: error.message, loading: false })
      return false
    }
    set({ loading: false })
    return true
  },

  signUp: async (email, password) => {
    set({ error: null, loading: true })

    if (!isSupabaseConfigured || !supabase) {
      if (!email || password.length < 6) {
        set({
          error: 'Enter a valid email and a password of at least 6 characters.',
          loading: false,
        })
        return false
      }
      localStorage.setItem('edge-demo-auth', '1')
      set({ demoAuthenticated: true, loading: false })
      return true
    }

    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      set({ error: error.message, loading: false })
      return false
    }
    set({ loading: false })
    return true
  },

  signOut: async () => {
    if (!isSupabaseConfigured || !supabase) {
      localStorage.removeItem('edge-demo-auth')
      set({ demoAuthenticated: false, session: null, user: null })
      return
    }
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },

  clearError: () => set({ error: null }),
}))

export function useIsAuthenticated() {
  return useAuthStore((s) => Boolean(s.session) || s.demoAuthenticated)
}
