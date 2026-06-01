'use client'

import Link from 'next/link'
import Image from 'next/image'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Users, FileText, Briefcase,
  ShoppingBag, MessageSquare, UserCog, Settings, LogOut, CreditCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/clients', icon: Users, label: 'Clients' },
  { href: '/quotes', icon: FileText, label: 'Quotes' },
  { href: '/job-cards', icon: Briefcase, label: 'Job Cards' },
  { href: '/retail', icon: ShoppingBag, label: 'Retail' },
  { href: '/messaging', icon: MessageSquare, label: 'Messages' },
  { href: '/reception', icon: CreditCard, label: 'Reception' },
]

const adminItems = [
  { href: '/staff', icon: UserCog, label: 'Staff' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const { profile } = useAuthStore()
  const router = useRouter()

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
            </Link>
          )
        })}

        {profile?.role === 'admin' && (
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
