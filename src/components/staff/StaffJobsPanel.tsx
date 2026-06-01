'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { useStaffPanelStore } from '@/stores/staffPanelStore'
import { useAuthStore } from '@/stores/authStore'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import { Users, Clock, AlertTriangle, ChevronDown, ChevronUp, Plus, Link } from 'lucide-react'
import type { JobCard, Worker } from '@/types'

const WORKERS: Worker[] = ['Nicole', 'Geraldo', 'Bets-Mari']

const WORKER_COLORS: Record<Worker, string> = {
  'Nicole': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'Geraldo': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Bets-Mari': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

interface DailyUpdate {
  id: string
  worker: Worker
  job_card_id?: string
  message: string
  created_at: string
  profile?: { full_name: string }
  job_card?: { job_number: string; title: string }
}

export function StaffJobsPanel() {
  const { isOpen, activeTab, jobsByWorker, setIsOpen, setActiveTab, setJobsByWorker } = useStaffPanelStore()
  const { profile } = useAuthStore()

  const [updates, setUpdates] = useState<DailyUpdate[]>([])
  const [newUpdateMsg, setNewUpdateMsg] = useState('')
  const [isSendingUpdate, setIsSendingUpdate] = useState(false)
  const [allJobs, setAllJobs] = useState<(JobCard & { assigned_worker?: string })[]>([])

  useEffect(() => {
    loadJobs()
    loadUpdates()

    const channel = supabase.channel('staff-panel-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_cards' }, loadJobs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_updates' }, loadUpdates)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadJobs() {
    const { data, error } = await supabase
      .from('job_cards')
      .select('*')
      .not('status', 'in', '(completed,delivered)')
      .order('created_at', { ascending: true })

    if (error) return

    const now = new Date()
    const jobs = (data as (JobCard & { assigned_worker?: string })[]) || []

    // Auto-escalate to urgent if overdue by 3+ days
    const toEscalate = jobs.filter(j => {
      if (!j.due_date || j.priority === 'urgent') return false
      const due = new Date(j.due_date)
      const daysOverdue = (now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
      return daysOverdue >= 3
    })

    if (toEscalate.length > 0) {
      await supabase.from('job_cards')
        .update({ priority: 'urgent' })
        .in('id', toEscalate.map(j => j.id))
      // Update locally
      toEscalate.forEach(j => { j.priority = 'urgent' })
    }

    // Sort: urgent first, then overdue, then priority, then status
    const sorted = jobs.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2
      const pb = PRIORITY_ORDER[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      const aOver = a.due_date && new Date(a.due_date) < now ? 0 : 1
      const bOver = b.due_date && new Date(b.due_date) < now ? 0 : 1
      if (aOver !== bOver) return aOver - bOver
      return 0
    })

    setAllJobs(sorted)

    // Also build grouped by worker for staff jobs tab
    const grouped: Record<string, JobCard[]> = {}
    WORKERS.forEach(w => { grouped[w] = [] })
    for (const job of sorted) {
      if (job.assigned_worker && grouped[job.assigned_worker]) {
        grouped[job.assigned_worker].push(job)
      }
    }
    setJobsByWorker(grouped)
  }

  async function loadUpdates() {
    const { data } = await supabase
      .from('daily_updates')
      .select(`
        id, worker, job_card_id, message, created_at,
        profile:profiles!created_by(full_name),
        job_card:job_cards!job_card_id(job_number, title)
      `)
      .order('created_at', { ascending: false })
      .limit(20)
    setUpdates((data as DailyUpdate[]) || [])
  }

  async function postUpdate() {
    if (!newUpdateMsg.trim() || !profile) return
    setIsSendingUpdate(true)
    try {
      const worker = (WORKERS.includes(profile.full_name as Worker)
        ? profile.full_name
        : WORKERS[0]) as Worker

      await supabase.from('daily_updates').insert({
        worker,
        message: newUpdateMsg.trim(),
        created_by: profile.id,
      })
      setNewUpdateMsg('')
      loadUpdates()
    } finally { setIsSendingUpdate(false) }
  }

  const totalJobs = allJobs.length
  const urgentCount = allJobs.filter(j => j.priority === 'urgent').length
  const unassigned = allJobs.filter(j => !j.assigned_worker)

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
            style={{ maxHeight: '520px' }}
          >
            {/* Tabs */}
            <div className="flex border-b border-border">
              <button onClick={() => setActiveTab('jobs')}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'jobs' ? 'text-accent border-b-2 border-accent bg-accent-muted/50' : 'text-text-secondary hover:text-text-primary'
                }`}>
                <Users className="w-3.5 h-3.5" /> Staff Jobs
                {totalJobs > 0 && <span className="unread-dot">{totalJobs}</span>}
              </button>
              <button onClick={() => setActiveTab('updates')}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'updates' ? 'text-accent border-b-2 border-accent bg-accent-muted/50' : 'text-text-secondary hover:text-text-primary'
                }`}>
                <Clock className="w-3.5 h-3.5" /> Daily Update
              </button>
            </div>

            {/* STAFF JOBS TAB */}
            {activeTab === 'jobs' && (
              <div className="overflow-y-auto" style={{ maxHeight: '460px' }}>
                {urgentCount > 0 && (
                  <div className="px-3 py-2 bg-red-900/20 border-b border-red-800/30 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    <span className="text-xs text-red-400 font-semibold">{urgentCount} urgent job{urgentCount > 1 ? 's' : ''}</span>
                  </div>
                )}
                {WORKERS.map(worker => {
                  const workerJobs = jobsByWorker[worker] || []
                  return (
                    <div key={worker} className="border-b border-border/50 last:border-0">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${WORKER_COLORS[worker]}`}>
                          {worker}
                        </span>
                        <span className="text-xs text-text-muted">{workerJobs.length} job{workerJobs.length !== 1 ? 's' : ''}</span>
                      </div>
                      {workerJobs.length === 0 ? (
                        <div className="px-4 py-2.5 text-xs text-text-muted italic">No active jobs</div>
                      ) : workerJobs.map(job => {
                        const isOverdue = job.due_date && new Date(job.due_date) < new Date()
                        return (
                          <div key={job.id} className={`px-3 py-2.5 hover:bg-bg-hover cursor-pointer flex items-center justify-between gap-2 ${job.priority === 'urgent' ? 'border-l-2 border-red-400' : isOverdue ? 'border-l-2 border-amber-400' : ''}`}>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {job.priority === 'urgent' && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                                <p className="text-xs font-medium text-text-primary truncate">{job.title}</p>
                              </div>
                              <p className="text-[10px] text-text-muted mt-0.5">
                                {job.job_number}{job.due_date ? ` · Due ${formatDate(job.due_date)}` : ''}
                                {isOverdue ? ' · OVERDUE' : ''}
                              </p>
                            </div>
                            <StatusBadge status={job.status} className="text-[9px] shrink-0" />
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {unassigned.length > 0 && (
                  <div className="border-t border-border/50">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
                      <span className="text-xs font-semibold text-amber-400">Unassigned</span>
                      <span className="text-xs text-text-muted">{unassigned.length}</span>
                    </div>
                    {unassigned.map(job => (
                      <div key={job.id} className="px-3 py-2.5 hover:bg-bg-hover cursor-pointer flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-text-primary truncate">{job.title}</p>
                        <StatusBadge status={job.status} className="text-[9px] shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* DAILY UPDATES TAB - all jobs sorted, no dropdowns */}
            {activeTab === 'updates' && (
              <div className="flex flex-col" style={{ maxHeight: '460px' }}>
                {/* All active jobs sorted by priority */}
                <div className="overflow-y-auto flex-1">
                  {allJobs.length === 0 ? (
                    <div className="py-6 text-center text-xs text-text-muted">No active jobs</div>
                  ) : allJobs.map(job => {
                    const isOverdue = job.due_date && new Date(job.due_date) < new Date()
                    const isUrgent = job.priority === 'urgent'
                    return (
                      <div key={job.id} className={`px-3 py-3 border-b border-border/40 hover:bg-bg-hover ${isUrgent ? 'border-l-2 border-red-400' : isOverdue ? 'border-l-2 border-amber-400' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {isUrgent && <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />}
                              <p className="text-xs font-semibold text-text-primary truncate">{job.title}</p>
                            </div>
                            <p className="text-[10px] text-text-muted">
                              {job.job_number}
                              {(job as any).assigned_worker ? ` · ${(job as any).assigned_worker}` : ' · Unassigned'}
                              {isOverdue ? <span className="text-red-400 font-semibold"> · OVERDUE</span> : job.due_date ? ` · Due ${formatDate(job.due_date)}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <StatusBadge status={job.status} className="text-[9px]" />
                            {isUrgent && <span className="text-[9px] text-red-400 font-bold uppercase">Urgent</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Post update */}
                <div className="p-3 border-t border-border bg-bg-elevated/50">
                  <div className="flex gap-2">
                    <input
                      value={newUpdateMsg}
                      onChange={(e) => setNewUpdateMsg(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') postUpdate() }}
                      className="input text-xs py-1.5 flex-1"
                      placeholder="Post a daily update..."
                    />
                    <button onClick={postUpdate} disabled={isSendingUpdate || !newUpdateMsg.trim()}
                      className="btn-primary px-3 py-1.5 text-xs">
                      {isSendingUpdate ? <span className="spinner w-3 h-3" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {/* Recent updates */}
                  {updates.slice(0, 3).map(u => (
                    <div key={u.id} className="mt-2 text-[10px] text-text-muted border-t border-border/30 pt-1.5">
                      <span className="text-accent font-semibold">{u.worker}</span>
                      {u.job_card && <span className="text-text-muted"> · {u.job_card.job_number}</span>}
                      <span className="text-text-primary"> — {u.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <button onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2.5 bg-bg-elevated border border-border rounded-lg hover:border-border-strong transition-colors shadow-elevated">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Staff Panel</span>
          {totalJobs > 0 && <span className="unread-dot">{totalJobs}</span>}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronUp className="w-4 h-4 text-text-muted" />}
      </button>
    </div>
  )
}
