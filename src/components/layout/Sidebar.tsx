'use client'

import Link from 'next/link'
import Image from 'next/image'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Users, FileText, Briefcase,
  ShoppingBag, MessageSquare, UserCog, Settings, LogOut, CreditCard, BarChart3, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { isSuperAdmin } from '@/lib/auth/superAdmin'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/clients', icon: Users, label: 'Clients' },
  { href: '/quotes', icon: FileText, label: 'Quotes' },
  { href: '/job-cards', icon: Briefcase, label: 'Job Cards' },
  { href: '/retail', icon: ShoppingBag, label: 'Retail' },
  { href: '/production-sheet', icon: BarChart3, label: 'Production Sheet' },
  { href: '/completed-jobs', icon: CheckCircle2, label: 'Completed Jobs' },
  { href: '/messaging', icon: MessageSquare, label: 'Messages' },
  { href: '/reception', icon: CreditCard, label: 'Reception' },
]

const adminItems = [
  { href: '/staff', icon: UserCog, label: 'Staff' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

const reportsItems = [
  { href: '/reports', icon: BarChart3, label: 'Reports' },
]

const RECEPTION_PENDING_TAGS = [
  ['[LA_COLLECTION_PENDING]', '[LA_COLLECTION_COLLECTED]'],
  ['[LA_DELIVERY_PENDING]', '[LA_DELIVERY_DELIVERED]'],
  ['[LA_COURIER_PENDING]', '[LA_COURIER_COURIERED]'],
  ['[LA_INSTALL_PENDING]', '[LA_INSTALL_DONE]'],
]

function countReceptionWork(rows: any[] = []) {
  return rows.filter(row => {
    const notes = String(row.notes || '')
    return RECEPTION_PENDING_TAGS.some(([pending, done]) => notes.includes(pending) && !notes.includes(done))
  }).length
}

export function Sidebar() {
  const pathname = usePathname()
  const { profile } = useAuthStore()
  const router = useRouter()
  const [receptionCount, setReceptionCount] = useState(0)

  useEffect(() => {
    let isMounted = true

    async function loadReceptionCount() {
      const [quotesResult, jobsResult] = await Promise.all([
        supabase
          .from('quotes')
          .select('id, notes')
          .eq('status', 'completed')
          .eq('is_retail', false),
        supabase
          .from('job_cards')
          .select('id, notes')
          .eq('status', 'completed'),
      ])

      if (!isMounted) return
      const count = countReceptionWork(quotesResult.data || []) + countReceptionWork(jobsResult.data || [])
      setReceptionCount(count)
    }

    loadReceptionCount()
    const timer = window.setInterval(loadReceptionCount, 60000)
    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [])

  async function handleLogout() {
    try {
      await supabase.auth.signOut()
      localStorage.removeItem('la-signs-auth')
      toast.success('Signed out')
    } catch {
      localStorage.removeItem('la-signs-auth')
    }
    router.push('/login')
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-bg-surface border-r border-border flex flex-col z-30">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-center bg-black/80">
        <Image
          src="/logo.png"
          alt="LA Signs & Graphics"
          width={160}
          height={60}
          className="object-contain max-h-14"
          style={{ mixBlendMode: 'screen' }}
          priority
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href}
              className={cn('sidebar-link group relative', isActive && 'active')}
            >
              {isActive && (
                <motion.div layoutId="activeNav"
                  className="absolute inset-0 rounded bg-accent-muted"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <item.icon className={cn('w-4 h-4 relative z-10', isActive && 'text-accent')} />
              <span className="relative z-10">{item.label}</span>
              {item.href === '/reception' && receptionCount > 0 && (
                <span className="relative z-10 ml-auto min-w-5 h-5 px-1.5 rounded-full bg-accent text-text-inverse text-[11px] font-bold flex items-center justify-center">
                  {receptionCount}
                </span>
              )}
            </Link>
          )
        })}

        {(profile?.role === 'admin' || isSuperAdmin(profile)) && (
          <>
            <div className="pt-3 pb-1">
              <p className="text-[10px] uppercase tracking-widest text-text-muted px-3">Admin</p>
            </div>
            {adminItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link key={item.href} href={item.href} className={cn('sidebar-link', isActive && 'active')}>
                  <item.icon className={cn('w-4 h-4', isActive && 'text-accent')} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </>
        )}

        {isSuperAdmin(profile) && (
          <>
            <div className="pt-3 pb-1">
              <p className="text-[10px] uppercase tracking-widest text-text-muted px-3">Super Admin</p>
            </div>
            {reportsItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link key={item.href} href={item.href} className={cn('sidebar-link', isActive && 'active')}>
                  <item.icon className={cn('w-4 h-4', isActive && 'text-accent')} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </>
        )}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-border">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-text-inverse text-xs font-bold">
            {profile?.full_name?.[0] || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{profile?.full_name || '—'}</p>
            <p className="text-[10px] text-text-muted capitalize">{profile?.role}</p>
          </div>
          <NotificationBell />
        </div>
        <button onClick={handleLogout} className="sidebar-link w-full text-red-400/70 hover:text-red-400">
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
