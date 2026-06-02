'use client'

import { useEffect, useState, Suspense } from 'react'
import { MobileShell } from '@/components/mobile/MobileShell'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useSearchParams, useRouter } from 'next/navigation'
import { AlertTriangle, ChevronLeft, X, Check } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUSES = ['pending','designing','printing','installation','completed','delivered']
const WORKERS = ['Nicole', 'Geraldo', 'Bets-Mari', 'Unassigned']

function JobsInner() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const searchParams = useSearchParams()
  const openId = searchParams.get('open')

  const [jobs, setJobs] = useState<any[]>([])
  const [selectedJob, setSelectedJob] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all'|'mine'>('all')
  const [isUpdating, setIsUpdating] = useState(false)

  const isWorker = ['Nicole', 'Geraldo', 'Bets-Mari'].includes(profile?.full_name || '')

  useEffect(() => {
    loadJobs()
    if (openId) loadJob(openId)
  }, [])

  async function loadJobs() {
    setIsLoading(true)
    const { data } = await supabase.from('job_cards')
      .select('*').not('status', 'in', '(delivered)')
      .order('created_at', { ascending: false })
    setJobs(data || [])
    setIsLoading(false)
  }

  async function loadJob(id: string) {
    const { data } = await supabase.from('job_cards').select('*').eq('id', id).single()
    if (data) setSelectedJob(data)
  }

  async function updateStatus(job: any, status: string) {
    setIsUpdating(true)
    const { error } = await supabase.from('job_cards').update({ status }).eq('id', job.id)
    if (error) { toast.error('Failed to update'); setIsUpdating(false); return }

    // Notify admins if completed
    if (['completed', 'delivered'].includes(status) && profile) {
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (admins) {
        await supabase.from('notifications').insert(admins.map((a: any) => ({
          recipient_id: a.id, sender_id: profile.id, type: 'job_completed',
          title: `Job ${status === 'delivered' ? 'Delivered' : 'Completed'}`,
          message: `${job.job_number} — ${job.title} marked as ${status}`,
          entity_type: 'job_card', entity_id: job.id,
        })))
      }
    }

    toast.success(`Status updated to ${status}`)
    setSelectedJob({ ...job, status })
    loadJobs()
    setIsUpdating(false)
  }

  const displayJobs = (isWorker || filter === 'mine')
    ? jobs.filter(j => j.assigned_worker === profile?.full_name)
    : jobs

  if (selectedJob) {
    const isOverdue = selectedJob.due_date && new Date(selectedJob.due_date) < new Date()
    return (
      <MobileShell>
        <div className="px-4 pt-6">
          {/* Back */}
          <button onClick={() => setSelectedJob(null)} className="flex items-center gap-1 text-accent mb-4">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {/* Job header */}
          <div className={`bg-bg-surface border rounded-2xl p-4 mb-4 ${selectedJob.priority === 'urgent' ? 'border-red-500/50' : 'border-border'}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {selectedJob.priority === 'urgent' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                  <p className="font-bold text-text-primary text-lg leading-tight">{selectedJob.title}</p>
                </div>
                <p className="text-sm text-accent font-mono mt-1">{selectedJob.job_number}</p>
              </div>
              <StatusBadge status={selectedJob.status} />
            </div>

            {selectedJob.client_name && <p className="text-sm text-text-muted">Client: <span className="text-text-primary">{selectedJob.client_name}</span></p>}
            {selectedJob.due_date && <p className={`text-sm mt-1 ${isOverdue ? 'text-red-400 font-semibold' : 'text-text-muted'}`}>Due: {formatDate(selectedJob.due_date)}{isOverdue ? ' · OVERDUE' : ''}</p>}
            {selectedJob.assigned_worker && <p className="text-sm text-text-muted mt-1">Assigned: <span className="text-text-primary">{selectedJob.assigned_worker}</span></p>}
            {selectedJob.total > 0 && <p className="text-sm text-text-muted mt-1">Total: <span className="text-text-primary font-semibold">{formatCurrency(selectedJob.total)}</span></p>}
            {selectedJob.description && <p className="text-sm text-text-muted mt-2 border-t border-border/50 pt-2">{selectedJob.description}</p>}
            {selectedJob.notes && <p className="text-sm text-text-muted mt-1 italic">{selectedJob.notes}</p>}
          </div>

          {/* Update status */}
          <div className="bg-bg-surface border border-border rounded-2xl p-4">
            <p className="font-semibold text-text-primary mb-3">Update Status</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUSES.map(s => (
                <button key={s} disabled={isUpdating}
                  onClick={() => updateStatus(selectedJob, s)}
                  className={`py-3 px-3 rounded-xl border-2 text-sm font-semibold capitalize transition-all active:scale-95 ${
                    selectedJob.status === s
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-text-secondary hover:border-border-strong'
                  }`}>
                  {selectedJob.status === s && <Check className="w-3.5 h-3.5 inline mr-1" />}
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </MobileShell>
    )
  }

  return (
    <MobileShell>
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-text-primary">Jobs</h1>
          {!isWorker && (
            <div className="flex gap-1 bg-bg-elevated rounded-xl p-1">
              {['all', 'mine'].map(f => (
                <button key={f} onClick={() => setFilter(f as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === f ? 'bg-accent text-text-inverse' : 'text-text-muted'}`}>
                  {f === 'all' ? 'All' : 'Mine'}
                </button>
              ))}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-24 bg-bg-elevated rounded-2xl animate-pulse" />)}</div>
        ) : displayJobs.length === 0 ? (
          <div className="bg-bg-surface border border-border rounded-2xl p-8 text-center">
            <p className="text-text-muted">No jobs found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayJobs.map(job => {
              const isOverdue = job.due_date && new Date(job.due_date) < new Date()
              const isUrgent = job.priority === 'urgent'
              return (
                <div key={job.id} onClick={() => setSelectedJob(job)}
                  className={`bg-bg-surface border rounded-2xl p-4 active:scale-[0.98] transition-transform cursor-pointer ${
                    isUrgent ? 'border-red-500/50' : isOverdue ? 'border-amber-500/50' : 'border-border'
                  }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        {isUrgent && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        <p className="font-semibold text-text-primary truncate">{job.title}</p>
                      </div>
                      <p className="text-xs text-text-muted">{job.job_number}{job.client_name ? ` · ${job.client_name}` : ''}</p>
                      {!isWorker && job.assigned_worker && <p className="text-xs text-text-muted mt-0.5">→ {job.assigned_worker}</p>}
                      {isOverdue && <p className="text-xs text-red-400 font-semibold mt-0.5">⚠ OVERDUE</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <StatusBadge status={job.status} />
                      {job.total > 0 && <span className="text-xs font-semibold text-text-primary">{formatCurrency(job.total)}</span>}
                    </div>
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

export default function MobileJobs() {
  return <Suspense fallback={null}><JobsInner /></Suspense>
}
