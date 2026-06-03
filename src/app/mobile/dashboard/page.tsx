'use client'

import { useEffect, useState } from 'react'
import { MobileShell } from '@/components/mobile/MobileShell'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, CheckCircle2, Briefcase, Users, FileText } from 'lucide-react'

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export default function MobileDashboard() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState({ clients: 0, quotes: 0, jobs: 0, urgent: 0 })
  const [myJobs, setMyJobs] = useState<any[]>([])
  const [allJobs, setAllJobs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const isWorker = ['Nicole', 'Geraldo', 'Bets-Mari'].includes(profile?.full_name || '')
  const isAdmin = profile?.role === 'admin'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      const [
        { count: clientCount },
        { count: quoteCount },
        { count: jobCount },
        { count: urgentCount },
        { data: jobs },
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('quotes').select('*', { count: 'exact', head: true }).in('status', ['draft', 'sent', 'approved']),
        supabase.from('job_cards').select('*', { count: 'exact', head: true }).not('status', 'in', '(completed,delivered)'),
        supabase.from('job_cards').select('*', { count: 'exact', head: true }).eq('priority', 'urgent').not('status', 'in', '(completed,delivered)'),
        supabase.from('job_cards').select('*').not('status', 'in', '(completed,delivered)').order('created_at', { ascending: false }),
      ])

      setStats({ clients: clientCount || 0, quotes: quoteCount || 0, jobs: jobCount || 0, urgent: urgentCount || 0 })

      const sorted = ((jobs || []) as any[]).sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
      setAllJobs(sorted)
      setMyJobs(sorted.filter(j => j.assigned_worker === profile?.full_name))
    } finally { setIsLoading(false) }
  }

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const displayJobs = isWorker ? myJobs : allJobs

  return (
    <MobileShell>
      <div className="px-4 pt-6 pb-4">
        {/* Header */}
        <div className="mb-6">
          <p className="text-text-muted text-sm">{greeting()}</p>
          <h1 className="text-2xl font-bold text-text-primary">{profile?.full_name}</h1>
          <p className="text-xs text-text-muted capitalize">{profile?.role} · LA Signs</p>
        </div>

        {/* Stats - admin only */}
        {isAdmin && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: 'Clients', value: stats.clients, icon: Users, color: 'text-blue-400' },
              { label: 'Quotes', value: stats.quotes, icon: FileText, color: 'text-purple-400' },
              { label: 'Active Jobs', value: stats.jobs, icon: Briefcase, color: 'text-accent' },
              { label: 'Urgent', value: stats.urgent, icon: AlertTriangle, color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="bg-bg-surface border border-border rounded-2xl p-4">
                <s.icon className={`w-5 h-5 ${s.color} mb-2`} />
                <p className="text-2xl font-bold text-text-primary">{isLoading ? '—' : s.value}</p>
                <p className="text-xs text-text-muted">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* My Jobs / All Jobs */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-text-primary flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            {isWorker ? 'My Jobs' : 'All Active Jobs'}
          </h2>
          <span className="text-xs text-text-muted">{displayJobs.length} jobs</span>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 bg-bg-elevated rounded-2xl animate-pulse" />)}
          </div>
        ) : displayJobs.length === 0 ? (
          <div className="bg-bg-surface border border-border rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-50" />
            <p className="text-text-muted text-sm">No active jobs</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayJobs.map(job => {
              const isOverdue = job.due_date && new Date(job.due_date) < new Date()
              const isUrgent = job.priority === 'urgent'
              return (
                <div key={job.id}
                  onClick={() => router.push(`/mobile/jobs?open=${job.id}`)}
                  className={`bg-bg-surface border rounded-2xl p-4 active:scale-[0.98] transition-transform cursor-pointer ${
                    isUrgent ? 'border-red-500/50' : isOverdue ? 'border-amber-500/50' : 'border-border'
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isUrgent && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        <p className="font-semibold text-text-primary truncate">{job.title}</p>
                      </div>
                      <p className="text-xs text-text-muted">
                        {job.job_number}
                        {job.client_name ? ` · ${job.client_name}` : ''}
                      </p>
                      {job.due_date && (
                        <p className={`text-xs mt-1 ${isOverdue ? 'text-red-400 font-semibold' : 'text-text-muted'}`}>
                          {isOverdue ? '⚠ OVERDUE · ' : 'Due '}{formatDate(job.due_date)}
                        </p>
                      )}
                      {!isWorker && job.assigned_worker && (
                        <p className="text-xs text-text-muted mt-0.5">→ {job.assigned_worker}</p>
                      )}
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
