'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { StaffJobsPanel } from '@/components/staff/StaffJobsPanel'
import { MessagingWindow } from '@/components/messaging/MessagingWindow'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase/client'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { profile, setProfile, setLoading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); setLoading(false); return }
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(profileData)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) { setProfile(null); router.push('/login'); return }
      if (event === 'SIGNED_IN' && session) {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        setProfile(profileData)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-4">
          <div className="spinner w-8 h-8" />
          <p className="text-text-muted text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen overflow-x-hidden">
        <div className="min-h-screen pb-24">{children}</div>
      </main>

      {/* Bottom-right: chat bubbles + Messages button + Staff Panel — all in one row */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-row items-end gap-2">
        <MessagingWindow />
        <StaffJobsPanel />
      </div>
    </div>
  )
}
