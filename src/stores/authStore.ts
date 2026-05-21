import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Profile } from '@/types'

interface AuthState {
  profile: Profile | null
  isLoading: boolean
  setProfile: (profile: Profile | null) => void
  setLoading: (loading: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      profile: null,
      isLoading: true,
      setProfile: (profile) => set({ profile }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'la-signs-auth',
      partialize: (state) => ({ profile: state.profile }),
    }
  )
)
