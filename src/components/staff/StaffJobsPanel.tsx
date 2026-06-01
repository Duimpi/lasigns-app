'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase/client'
import { useStaffPanelStore } from '@/stores/staffPanelStore'
import { useAuthStore } from '@/stores/authStore'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import {
  ChevronDown, ChevronUp, Users, Clock, AlertTriangle,
  MessageSquare, Plus
} from 'lucide-react'
import type { JobCard, Worker } from '@/types'
import toast from 'react-hot-toast'

const WORKERS: Worker[] = ['Nicole', 'Geraldo', 'Bets-Mari']

const WORKER_COLORS: Record<Worker, string> = {
  Nicole: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  Geraldo: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'Bets-Mari': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
}

interface DailyUpdate {
  id: string
  worker: Worker
  message: string
  created_at: string
  job_card?: { title: string; job_number: string } | null
  profile?: { full_name: string } | null
}

export function StaffJobsPanel() {
  const { isOpen, activeTab, jobsByWorker, setIsOpen, setActiveTab, setJobsByWorker, toggle } = useStaffPanelStore()
  const { profile } = useAuthStore()
  const [updates, setUpdates] = useState<DailyUpdate[]>([])
  const [newUpdateWorker, setNewUpdateWorker] = useState<Worker>('Nicole')
  const [newUpdateMsg, setNewUpdateMsg] = useState('')
  const [selectedJob, setSelectedJob] = useState('')
  const [availableJobs, setAvailableJobs] = useState<JobCard[]>([])
  const [isSendingUpdate, setIsSendingUpdate] = useState(false)

  useEffect(() => {
    loadJobs()
    loadUpdates()
    loadAvailableJobs()

    // Realtime for job cards
    const jobChannel = supabase
      .channel('staff-panel-jobs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_cards' }, loadJobs)
      .subscribe()

    // Realtime for daily updates
    const updateChannel = supabase
      .channel('staff-panel-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'daily_updates' }, () => {
        loadUpdates()
        toast('New daily update posted', { icon: '📋' })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(jobChannel)
      supabase.removeChannel(updateChannel)
    }
  }, [])

  async function loadJobs() {
    const { data, error } = await supabase
      .from('job_cards')
      .select('*')
      .not('status', 'in', '(completed,delivered)')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Staff panel loadJobs error:', error)
      return
    }

    const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
    const grouped: Record<string, JobCard[]> = {}
    WORKERS.forEach(w => { grouped[w] = [] })

    for (const job of (data as JobCard[]) || []) {
      if (job.assigned_worker && grouped[job.assigned_worker]) {
        grouped[job.assigned_worker].push(job)
      }
    }

    // Sort each worker's jobs by priority
    WORKERS.forEach(w => {
      grouped[w].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
    })

    setJobsByWorker(grouped)
  }

  async function loadUpdates() {
    const { data } = await supabase
      .from('daily_updates')
      .select(`
        *,
        job_card:job_cards(title, job_number),
        profile:profiles!created_by(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(20)
    setUpdates((data as DailyUpdate[]) || [])
  }

  async function loadAvailableJobs() {
    const { data } = await supabase
      .from('job_cards')
      .select('id, title, job_number')
      .eq('is_retail', false)
      .not('status', 'in', '(completed,delivered)')
      .order('created_at', { ascending: false })
    setAvailableJobs((data as JobCard[]) || [])
  }

  async function postUpdate() {
    if (!newUpdateMsg.trim() || !profile) return
    setIsSendingUpdate(true)
    try {
      await supabase.from('daily_updates').insert({
        worker: newUpdateWorker,
        job_card_id: selectedJob || null,
        message: newUpdateMsg.trim(),
        created_by: profile.id,
      })
      setNewUpdateMsg('')
      setSelectedJob('')
      toast.success('Update posted')
      loadUpdates()
    } catch { toast.error('Failed to post update') }
    finally { setIsSendingUpdate(false) }
  }

  const totalJobs = Object.values(jobsByWorker).reduce((sum, jobs) => sum + jobs.length, 0)
  const urgentCount = Object.values(jobsByWorker).flat().filter(j => j.priority === 'urgent').length

  return (
    // Position: bottom-right, leaves space for chat bubble
    <div className="relative w-80">
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="bg-bg-surface border border-border rounded-xl shadow-modal overflow-hidden mb-1"
            style={{ maxHeight: '480px' }}
          >
            {/* Panel Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab('jobs')}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'jobs' ? 'text-accent border-b-2 border-accent bg-accent-muted/50' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Staff Jobs
                {totalJobs > 0 && (
                  <span className="unread-dot">{totalJobs}</span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('updates')}
                className={`flex-1 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 ${
                  activeTab === 'updates' ? 'text-accent border-b-2 border-accent bg-accent-muted/50' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Daily Update
              </button>
            </div>

            {/* JOBS TAB */}
            {activeTab === 'jobs' && (
              <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
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
                      <div className={`flex items-center justify-between px-3 py-2 border-b border-border/30`}>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${WORKER_COLORS[worker]}`}>
                            {worker}
                          </span>
                        </div>
                        <span className="text-xs text-text-muted">{workerJobs.length} job{workerJobs.length !== 1 ? 's' : ''}</span>
                      </div>
                      {workerJobs.length === 0 ? (
                        <div className="px-4 py-2.5 text-xs text-text-muted italic">No active jobs</div>
                      ) : (
                        workerJobs.map(job => (
                          <div
                            key={job.id}
                            className="px-3 py-2.5 hover:bg-bg-hover cursor-pointer flex items-center justify-between gap-2 group"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                {job.priority === 'urgent' && (
                                  <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                                )}
                                <p className="text-xs font-medium text-text-primary truncate">{job.title}</p>
                              </div>
                              <p className="text-[10px] text-text-muted mt-0.5">
                                {job.job_number}
                                {job.due_date ? ` · Due ${formatDate(job.due_date)}` : ''}
                              </p>
                            </div>
                            <StatusBadge status={job.status} className="text-[9px] shrink-0" />
                          </div>
                        ))
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* DAILY UPDATES TAB */}
            {activeTab === 'updates' && (
              <div className="flex flex-col" style={{ maxHeight: '400px' }}>
                {/* Post update form */}
                <div className="p-3 border-b border-border bg-bg-elevated/50 space-y-2">
                  <div className="flex gap-2">
                    <select
                      value={newUpdateWorker}
                      onChange={(e) => setNewUpdateWorker(e.target.value as Worker)}
                      className="input text-xs py-1.5 flex-1"
                    >
                      {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                    <select
                      value={selectedJob}
                      onChange={(e) => setSelectedJob(e.target.value)}
                      className="input text-xs py-1.5 flex-1"
                    >
                      <option value="">No job</option>
                      {availableJobs.map(j => (
                        <option key={j.id} value={j.id}>{j.job_number}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newUpdateMsg}
                      onChange={(e) => setNewUpdateMsg(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') postUpdate() }}
                      className="input text-xs py-1.5 flex-1"
                      placeholder="Post a daily update..."
                    />
                    <button
                      onClick={postUpdate}
                      disabled={isSendingUpdate || !newUpdateMsg.trim()}
                      className="btn-primary px-3 py-1.5 text-xs"
                    >
                      {isSendingUpdate ? <span className="spinner w-3 h-3" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Updates list */}
                <div className="overflow-y-auto flex-1">
                  {updates.length === 0 ? (
                    <div className="py-6 text-center text-xs text-text-muted">No updates yet</div>
                  ) : (
                    updates.map(update => (
                      <div key={update.id} className="px-3 py-2.5 border-b border-border/50 last:border-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${WORKER_COLORS[update.worker] || 'text-text-secondary'}`}>
                            {update.worker}
                          </span>
                          {update.job_card && (
                            <span className="text-[10px] text-accent font-mono">{update.job_card.job_number}</span>
                          )}
                          <span className="text-[10px] text-text-muted ml-auto">{formatDate(update.created_at)}</span>
                        </div>
                        <p className="text-xs text-text-secondary">{update.message}</p>
                        {update.profile && (
                          <p className="text-[10px] text-text-muted mt-0.5">— {update.profile.full_name}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-bg-elevated border border-border rounded-lg hover:border-border-strong transition-colors shadow-elevated"
      >
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          <span className="text-sm font-semibold text-text-primary">Staff Panel</span>
          {totalJobs > 0 && (
            <span className="unread-dot">{totalJobs}</span>
          )}
          {urgentCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-red-400">
              <AlertTriangle className="w-3 h-3" />
              {urgentCount} urgent
            </span>
          )}
        </div>
        {isOpen ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronUp className="w-4 h-4 text-text-muted" />}
      </button>
    </div>
  )
}
