'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase/client'
import {
  LayoutDashboard, Briefcase, CreditCard,
  MessageSquare, User, LogOut, ChevronRight
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/mobile/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/mobile/jobs', icon: Briefcase, label: 'Jobs' },
  { href: '/mobile/reception', icon: CreditCard, label: 'Reception' },
  { href: '/mobile/messages', icon: MessageSquare, label: 'Messages' },
]

export function MobileShell({ children }: { children: React.ReactNode }) {
  const { profile, setProfile, setLoading } = useAuthStore()
  const router = useRouter()
  const pathname = usePathname()
  const initialized = useRef(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const current = useAuthStore.getState().profile
      if (current?.id === session.user.id) { setReady(true); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      setProfile(data)
      setLoading(false)
      setReady(true)
    }).catch(() => {
      const current = useAuthStore.getState().profile
      if (current) setReady(true)
      else router.replace('/login')
    })
  }, [])

  if (!ready || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col max-w-md mx-auto relative">
      {/* Status bar spacer */}
      <div className="h-safe-top bg-bg-surface" />

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-20">
        {children}
      </main>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-bg-surface border-t border-border z-50">
        <div className="flex items-center">
          {NAV.map(item => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  'flex-1 flex flex-col items-center gap-1 py-3 transition-colors',
                  isActive ? 'text-accent' : 'text-text-muted'
                )}>
                <item.icon className={cn('w-5 h-5', isActive && 'text-accent')} />
                <span className="text-[10px] font-semibold">{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              localStorage.removeItem('la-signs-auth')
              router.replace('/login')
            }}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-text-muted hover:text-red-400 transition-colors">
            <LogOut className="w-5 h-5" />
            <span className="text-[10px] font-semibold">Out</span>
          </button>
        </div>
        {/* Home indicator */}
        <div className="h-safe-bottom bg-bg-surface" />
      </div>
    </div>
  )
}
