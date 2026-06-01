'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { Bell, X, CheckCheck } from 'lucide-react'
import { formatTimeAgo } from '@/lib/utils'
import type { AppNotification } from '@/types'

export function NotificationBell() {
  const { profile } = useAuthStore()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!profile) return
    loadNotifications()
    const channel = supabase
      .channel('notif-bell')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `recipient_id=eq.${profile.id}`
      }, () => loadNotifications())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile])

  async function loadNotifications() {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications((data as AppNotification[]) || [])
  }

  async function markAllRead() {
    if (!profile) return
    await supabase.from('notifications').update({ is_read: true })
      .eq('recipient_id', profile.id).eq('is_read', false)
    loadNotifications()
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const unread = notifications.filter(n => !n.is_read).length

  if (!profile) return null

  const typeIcon: Record<string, string> = {
    payment_received: '💰',
    job_completed: '✅',
    delivery_ready: '🚚',
  }

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-bg-hover transition-colors">
        <Bell className="w-5 h-5 text-text-secondary" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-2 w-80 bg-bg-surface border border-border rounded-xl shadow-modal z-50 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-text-primary text-sm">Notifications</p>
                {unread > 0 && <span className="bg-red-500/20 text-red-400 text-xs font-bold px-1.5 py-0.5 rounded-full">{unread} new</span>}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button onClick={markAllRead} className="btn-icon w-6 h-6" title="Mark all read">
                    <CheckCheck className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="btn-icon w-6 h-6">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted">No notifications yet</div>
              ) : notifications.map(n => (
                <div key={n.id} onClick={() => markRead(n.id)}
                  className={`px-4 py-3 cursor-pointer transition-colors hover:bg-bg-hover ${!n.is_read ? 'bg-accent/5' : ''}`}>
                  <div className="flex items-start gap-2.5">
                    <span className="text-lg shrink-0 mt-0.5">{typeIcon[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${!n.is_read ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-text-muted mt-1">{formatTimeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 bg-accent rounded-full shrink-0 mt-1.5" />}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
