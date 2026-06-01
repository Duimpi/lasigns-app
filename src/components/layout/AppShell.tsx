'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { StaffJobsPanel } from '@/components/staff/StaffJobsPanel'
import { MessagingWindow } from '@/components/messaging/MessagingWindow'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase/client'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, setProfile, setLoading } = useAuthStore()
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Timeout fallback - if auth takes too long, redirect to login
    const timeout = setTimeout(() => {
      setAuthChecked(true)
      setLoading(false)
    }, 5000)

    // Check session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      clearTimeout(timeout)
      if (!session) {
        setProfile(null)
        setLoading(false)
        setAuthChecked(true)
        router.push('/login')
        return
      }
      try {
        const { data: profileData } = await supabase
          .from('profiles').select('*').eq('id', session.user.id).single()
        setProfile(profileData)
      } catch {
        // Profile load failed but session exists - use basic profile
        setProfile({ id: session.user.id, email: session.user.email, full_name: session.user.email?.split('@')[0] || 'User', role: 'staff' } as any)
      }
      setLoading(false)
      setAuthChecked(true)
    }).catch(() => {
      clearTimeout(timeout)
      setProfile(null)
      setLoading(false)
      setAuthChecked(true)
      router.push('/login')
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        setProfile(null)
        setLoading(false)
        router.push('/login')
        return
      }
      if (event === 'SIGNED_IN' && session) {
        const { data: profileData } = await supabase
          .from('profiles').select('*').eq('id', session.user.id).single()
        setProfile(profileData)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Show loading only before auth check completes
  if (!authChecked || !profile) {
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
      <div className="fixed bottom-4 right-4 z-40 flex flex-row items-end gap-2">
        <MessagingWindow />
        <StaffJobsPanel />
      </div>
    </div>
  )
}
