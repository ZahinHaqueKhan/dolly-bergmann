'use client'
import { create } from 'zustand'
import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister } from '@/lib/api'

export type UserRole = 'customer' | 'wholesale' | 'admin'

export interface CurrentUser {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

interface AuthState {
  user: CurrentUser | null
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated'
  // Hydrate the store from the /api/auth/me cookie. Called once on Header
  // mount. The result determines the initial sign-in / user-menu render.
  hydrate: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (data: { email: string; password: string; first_name: string; last_name: string }) => Promise<void>
  signOut: () => Promise<void>
  setUser: (user: CurrentUser | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',

  hydrate: async () => {
    set({ status: 'loading' })
    try {
      const user = await getMe()
      set({ user, status: 'authenticated' })
    } catch {
      set({ user: null, status: 'unauthenticated' })
    }
  },

  signIn: async (email, password) => {
    await apiLogin(email, password)
    // The /login response sets the cookies. Hit /me to populate the store
    // from the DB so we always have fresh user data (not stale cached
    // values from before a password change or role change).
    const user = await getMe()
    set({ user, status: 'authenticated' })
  },

  signUp: async (data) => {
    await apiRegister(data)
    const user = await getMe()
    set({ user, status: 'authenticated' })
  },

  signOut: async () => {
    try {
      await apiLogout()
    } finally {
      set({ user: null, status: 'unauthenticated' })
    }
  },

  setUser: (user) =>
    set({ user, status: user ? 'authenticated' : 'unauthenticated' }),
}))
