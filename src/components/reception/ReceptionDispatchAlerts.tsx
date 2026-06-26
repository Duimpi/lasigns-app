'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChevronDown, ChevronUp, Truck, PackageCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

const ALLOWED_EMAILS = new Set(['lasigns.d@gmail.com', 'lareception32@gmail.com'])
const DELIVERY_PENDING_TAG = '[LA_DELIVERY_PENDING]'
const DELIVERY_DELIVERED_TAG = '[LA_DELIVERY_DELIVERED]'
const COURIER_PENDING_TAG = '[LA_COURIER_PENDING]'
const COURIER_COURIERED_TAG = '[LA_COURIER_COURIERED]'

type DispatchAlert = {
  id: string
  number: string
  client_name: string
  total: number
  created_at: string
  type: 'delivery' | 'courier'
  label: string
  detail: string
}

function getNoteValue(notes: string | null | undefined, key: string) {
  const match = String(notes || '').match(new RegExp('\\[LA_' + key + ':([^\\]]*)\\]', 'i'))
  if (!match?.[1]) return ''
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

function toDispatchAlerts(rows: any[] = []) {
  return rows.flatMap((row): DispatchAlert[] => {
    const notes = String(row.notes || '')
    const base = {
      id: row.id,
      number: row.quote_number || row.job_number || 'Reception job',
      client_name: row.client_name || 'Unknown client',
      total: Number(row.total || 0),
      created_at: row.created_at,
    }

    if (notes.includes(DELIVERY_PENDING_TAG) && !notes.includes(DELIVERY_DELIVERED_TAG)) {
      return [{
        ...base,
        type: 'delivery',
        label: 'Delivery',
        detail: getNoteValue(notes, 'DELIVERY_ADDRESS') || getNoteValue(notes, 'DELIVERY_NAME') || 'Delivery details',
      }]
    }

    if (notes.includes(COURIER_PENDING_TAG) && !notes.includes(COURIER_COURIERED_TAG)) {
      return [{
        ...base,
        type: 'courier',
        label: 'Courier',
        detail: getNoteValue(notes, 'COURIER_COMPANY') || getNoteValue(notes, 'COURIER_ADDRESS') || 'Courier details',
      }]
    }

    return []
  })
}

export function ReceptionDispatchAlerts() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [alerts, setAlerts] = useState<DispatchAlert[]>([])

  const canView = profile?.email ? ALLOWED_EMAILS.has(profile.email.toLowerCase()) : false

  useEffect(() => {
    if (!canView) return
    let isMounted = true

    async function loadAlerts() {
      const { data } = await supabase
        .from('quotes')
        .select('id, quote_number, client_name, total, notes, created_at')
        .eq('status', 'completed')
        .eq('is_retail', false)
        .order('created_at', { ascending: false })

      if (!isMounted) return
      setAlerts(toDispatchAlerts(data || []))
    }

    loadAlerts()
    const timer = window.setInterval(loadAlerts, 30000)
    const channel = supabase.channel('reception-dispatch-alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadAlerts)
      .subscribe()

    return () => {
      isMounted = false
      window.clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [canView])

  if (!canView || alerts.length === 0) return null

  function openJob(alert: DispatchAlert) {
    router.push(`/reception?tab=${alert.type}&job=${alert.id}`)
    setIsOpen(false)
  }

  const deliveryCount = alerts.filter(alert => alert.type === 'delivery').length
  const courierCount = alerts.filter(alert => alert.type === 'courier').length

  return (
    <div className="relative w-80">
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="bg-bg-surface border border-border rounded-xl shadow-modal overflow-hidden mb-1"
            style={{ maxHeight: '420px' }}
          >
            <div className="px-4 py-3 border-b border-border bg-accent-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-accent" />
                  <p className="text-sm font-semibold text-text-primary">Reception Dispatch</p>
                </div>
                <span className="text-[11px] font-bold text-accent">{alerts.length} waiting</span>
              </div>
              <p className="text-xs text-text-muted mt-1">
                {deliveryCount} delivery{deliveryCount === 1 ? '' : 'ies'} · {courierCount} courier
              </p>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '350px' }}>
              {alerts.map(alert => (
                <button
                  key={`${alert.type}-${alert.id}`}
                  onClick={() => openJob(alert)}
                  className="w-full px-4 py-3 border-b border-border/50 last:border-0 text-left hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      alert.type === 'delivery' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-purple-500/20 text-purple-300'
                    )}>
                      {alert.type === 'delivery' ? <Truck className="w-4 h-4" /> : <PackageCheck className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-accent">{alert.number}</span>
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase',
                          alert.type === 'delivery' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-purple-500/20 text-purple-300'
                        )}>
                          {alert.label}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-text-primary truncate mt-1">{alert.client_name}</p>
                      <p className="text-xs text-text-muted truncate">{alert.detail}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2.5 bg-bg-elevated border border-accent/40 rounded-lg hover:border-accent transition-colors shadow-elevated"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Reception Dispatch</span>
          <span className="unread-dot">{alerts.length}</span>
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronUp className="w-4 h-4 text-text-muted" />}
      </button>
    </div>
  )
}
