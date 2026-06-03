'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { StaffJobsPanel } from '@/components/staff/StaffJobsPanel'
import { MessagingWindow } from '@/components/messaging/MessagingWindow'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase/client'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, setProfile, setLoading } = useAuthStore()
  const router = useRouter()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        setProfile(null)
        setLoading(false)
        router.replace('/login')
        return
      }

      // If profile already in store and matches session, don't reload
      const current = useAuthStore.getState().profile
      if (current?.id === session.user.id) {
        setLoading(false)
        return
      }

      try {
        const { data } = await supabase
          .from('profiles').select('*').eq('id', session.user.id).single()
        setProfile(data || {
          id: session.user.id,
          email: session.user.email || '',
          full_name: session.user.email?.split('@')[0] || 'User',
          role: 'staff', created_at: '', updated_at: '',
        })
      } catch {
        if (!current) router.replace('/login')
      }
      setLoading(false)
    }).catch(() => {
      const current = useAuthStore.getState().profile
      if (!current) router.replace('/login')
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        router.replace('/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Always render if we have a profile (cached or fresh)
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
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
      <div className="fixed bottom-4 right-4 z-40 flex flex-row items-end gap-2">
        <MessagingWindow />
        <StaffJobsPanel />
      </div>
    </div>
  )
}
