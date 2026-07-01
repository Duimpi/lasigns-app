'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import {
  FileText, Briefcase, Users, ShoppingBag,
  TrendingUp, AlertCircle, CheckCircle2, Clock
} from 'lucide-react'
import Link from 'next/link'
import type { Quote } from '@/types'

interface Stats {
  totalClients: number
  activeQuotes: number
  activeJobs: number
  urgentJobs: number
  completedThisMonth: number
  retailJobs: number
}

interface WorkerJob {
  id: string
  job_number: string
  title: string
  client_name?: string
  status: string
  priority: string
  assigned_worker?: string | null
  due_date?: string | null
  is_retail: boolean
  source_type: 'job_card' | 'retail' | 'quote'
}

const WORKERS = ['Nicole', 'Geraldo', 'Bets-Mari']
const DASHBOARD_JOB_LIMIT = 6
const QUOTE_WORKER_RE = /\[LA_WORKER:([^\]]+)\]/i
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
const STATUS_ORDER: Record<string, number> = { 
  pending: 0, draft: 0,
  designing: 1, sent: 1,
  printing: 2, approved: 2,
  installation: 3, in_production: 3,
  completed: 4, delivered: 5 
}

function getQuoteWorker(notes?: string | null) {
  const worker = String(notes || '').match(QUOTE_WORKER_RE)?.[1]?.trim()
  return worker && WORKERS.includes(worker) ? worker : ''
}

function toWorkerJobs(jobs: any[] = [], quotes: any[] = []): WorkerJob[] {
  const jobRows = jobs.map(job => ({
    ...job,
    source_type: job.is_retail ? 'retail' : 'job_card',
  })) as WorkerJob[]

  const quoteRows = quotes.map(quote => ({
    id: quote.id,
    job_number: quote.quote_number,
    title: `Quote ${quote.quote_number}`,
    client_name: quote.client_name || 'Unknown client',
    status: quote.status,
    priority: 'normal',
    assigned_worker: quote.assigned_worker || getQuoteWorker(quote.notes) || null,
    due_date: quote.valid_until || null,
    is_retail: false,
    source_type: 'quote',
    created_at: quote.created_at,
  })) as WorkerJob[]

  return [...jobRows, ...quoteRows]
}

function JobRow({ job, router }: { job: any, router: any }) {
  const isOverdue = job.due_date && new Date(job.due_date) < new Date() && !['completed','delivered'].includes(job.status)
  const isUrgent = job.priority === 'urgent'
  const route = job.source_type === 'quote'
    ? `/quotes?open=${job.id}`
    : `/${job.is_retail ? 'retail' : 'job-cards'}?open=${job.id}`
  const typeLabel = job.source_type === 'quote' ? 'Quote' : job.is_retail ? 'Retail' : ''
  return (
    <div
      onClick={() => router.push(route)}
      className={`px-4 py-3 hover:bg-bg-hover cursor-pointer transition-colors ${isUrgent ? 'border-l-2 border-red-400' : isOverdue ? 'border-l-2 border-amber-400' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-text-primary truncate">{job.title}</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            {job.job_number}{job.client_name ? ` · ${job.client_name}` : ''}{job.is_retail ? ' · Retail' : ''}
          </p>
          {job.due_date && (
            <p className={`text-[11px] mt-0.5 flex items-center gap-1 ${isOverdue ? 'text-red-400 font-semibold' : 'text-text-muted'}`}>
              <Clock className="w-2.5 h-2.5" />
              {isOverdue ? 'OVERDUE · ' : 'Due '}{formatDate(job.due_date)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatusBadge status={job.status} />
          {typeLabel && <span className="text-[10px] font-semibold text-accent uppercase">{typeLabel}</span>}
          {isUrgent && <span className="text-[10px] font-bold text-red-400 uppercase">Urgent</span>}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({
    totalClients: 0, activeQuotes: 0, activeJobs: 0,
    urgentJobs: 0, completedThisMonth: 0, retailJobs: 0,
  })
  const [allActiveJobs, setAllActiveJobs] = useState<WorkerJob[]>([])
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedWorker, setSelectedWorker] = useState<string>('All')
  const [expandedJobLists, setExpandedJobLists] = useState<Record<string, boolean>>({})

  useEffect(() => { loadDashboard() }, [])

  async function loadDashboard() {
    setIsLoading(true)
    try {
      const [
        { count: clientCount },
        { count: quoteCount },
        { count: jobCount },
        { count: urgentCount },
        { count: completedCount },
        { count: retailCount },
        { data: activeJobs },
        { data: activeQuotes },
        { data: quotes },
      ] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }),
        supabase.from('quotes').select('*', { count: 'exact', head: true })
          .in('status', ['draft', 'sent', 'approved', 'in_production']),
        supabase.from('job_cards').select('*', { count: 'exact', head: true })
          .eq('is_retail', false)
          .in('status', ['pending', 'designing', 'printing', 'installation']),
        supabase.from('job_cards').select('*', { count: 'exact', head: true })
          .eq('priority', 'urgent')
          .not('status', 'in', '(completed,delivered)'),
        supabase.from('job_cards').select('*', { count: 'exact', head: true })
          .in('status', ['completed', 'delivered'])
          .gte('updated_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
        supabase.from('job_cards').select('*', { count: 'exact', head: true })
          .eq('is_retail', true)
          .in('status', ['pending', 'designing', 'printing', 'installation']),
        supabase.from('job_cards')
          .select('*')
          .not('status', 'in', '(completed,delivered)')
          .order('created_at', { ascending: false }),
        supabase.from('quotes')
          .select('id, quote_number, client_name, status, notes, valid_until, created_at, is_retail')
          .eq('is_retail', false)
          .in('status', ['draft', 'sent', 'approved', 'in_production'])
          .order('created_at', { ascending: false }),
        supabase.from('quotes')
          .select('*')
          .eq('is_retail', false)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      setStats({
        totalClients: clientCount || 0,
        activeQuotes: quoteCount || 0,
        activeJobs: jobCount || 0,
        urgentJobs: urgentCount || 0,
        completedThisMonth: completedCount || 0,
        retailJobs: retailCount || 0,
      })
      setAllActiveJobs(toWorkerJobs((activeJobs as any[]) || [], (activeQuotes as any[]) || []))
      setRecentQuotes((quotes as Quote[]) || [])
    } finally {
      setIsLoading(false)
    }
  }

  const statCards = [
    { label: 'Total Clients', value: stats.totalClients, icon: Users, color: 'text-blue-400', href: '/clients' },
    { label: 'Active Quotes', value: stats.activeQuotes, icon: FileText, color: 'text-purple-400', href: '/quotes' },
    { label: 'Active Jobs', value: stats.activeJobs, icon: Briefcase, color: 'text-accent', href: '/job-cards' },
    { label: 'Urgent Jobs', value: stats.urgentJobs, icon: AlertCircle, color: 'text-red-400', href: '/job-cards' },
    { label: 'Done This Month', value: stats.completedThisMonth, icon: CheckCircle2, color: 'text-emerald-400', href: '/job-cards' },
    { label: 'Active Retail', value: stats.retailJobs, icon: ShoppingBag, color: 'text-amber-400', href: '/retail' },
  ]

  // Sort jobs: urgent first, then by priority, then by due date
  function sortJobs(jobs: WorkerJob[]) {
    return [...jobs].sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2
      const pb = PRIORITY_ORDER[b.priority] ?? 2
      if (pa !== pb) return pa - pb
      // Overdue first
      const aOverdue = a.due_date && new Date(a.due_date) < new Date() ? 0 : 1
      const bOverdue = b.due_date && new Date(b.due_date) < new Date() ? 0 : 1
      if (aOverdue !== bOverdue) return aOverdue - bOverdue
      return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    })
  }

  function visibleJobs(listKey: string, jobs: WorkerJob[]) {
    return expandedJobLists[listKey] ? jobs : jobs.slice(0, DASHBOARD_JOB_LIMIT)
  }

  function toggleJobList(listKey: string) {
    setExpandedJobLists(prev => ({ ...prev, [listKey]: !prev[listKey] }))
  }

  // Unassigned jobs
  const unassignedJobs = sortJobs(allActiveJobs.filter(j => !j.assigned_worker))
  const shownUnassignedJobs = visibleJobs('unassigned', unassignedJobs)
  const hiddenUnassignedCount = unassignedJobs.length - shownUnassignedJobs.length

  return (
    <AppShell>
      <PageHeader
        title="DASHBOARD"
        showGreeting={true}
        subtitle="LA Signs & Graphics CC — Operations Overview"
      />

      <div className="px-6 pb-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {statCards.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link href={stat.href} className="card p-4 block hover:border-border-strong transition-colors group">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  <TrendingUp className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {isLoading ? '—' : stat.value}
                </p>
                <p className="text-xs text-text-muted mt-0.5">{stat.label}</p>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* DAILY WORK */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" />
              Daily Work
            </h2>
            <div className="flex items-center gap-3">
              <select
                value={selectedWorker}
                onChange={(e) => setSelectedWorker(e.target.value)}
                className="input w-auto text-sm py-1.5"
              >
                <option value="All">All Staff</option>
                {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
              <Link href="/job-cards" className="text-xs text-accent hover:text-accent-glow">View all →</Link>
            </div>
          </div>

          {selectedWorker === 'All' ? (
            // Show all workers in 3 columns
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {WORKERS.map(worker => {
                const workerJobs = sortJobs(allActiveJobs.filter(j => j.assigned_worker === worker))
                const shownJobs = visibleJobs(worker, workerJobs)
                const hiddenCount = workerJobs.length - shownJobs.length
                return (
                  <div key={worker} className="card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg-elevated/50">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
                          <span className="text-xs font-bold text-accent">{worker[0]}</span>
                        </div>
                        <span className="font-semibold text-sm text-text-primary">{worker}</span>
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        workerJobs.length === 0 ? 'bg-bg-elevated text-text-muted' :
                        workerJobs.some(j => j.priority === 'urgent') ? 'bg-red-500/20 text-red-400' :
                        'bg-accent/20 text-accent'
                      }`}>
                        {workerJobs.length} job{workerJobs.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="divide-y divide-border/40">
                      {isLoading ? (
                        <div className="py-6 text-center text-xs text-text-muted">Loading...</div>
                      ) : workerJobs.length === 0 ? (
                        <div className="py-6 text-center text-xs text-text-muted">No active jobs</div>
                      ) : (
                        <>
                          {shownJobs.map(job => <JobRow key={job.id} job={job} router={router} />)}
                          {workerJobs.length > DASHBOARD_JOB_LIMIT && (
                            <button
                              onClick={() => toggleJobList(worker)}
                              className="w-full px-4 py-2.5 text-xs font-semibold text-accent hover:bg-accent/10 transition-colors"
                            >
                              {expandedJobLists[worker] ? 'Show less' : `See all (${hiddenCount} more)`}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            // Show single worker full width
            (() => {
              const workerJobs = sortJobs(allActiveJobs.filter(j => j.assigned_worker === selectedWorker))
              const shownJobs = visibleJobs(selectedWorker, workerJobs)
              const hiddenCount = workerJobs.length - shownJobs.length
              return <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-bg-elevated/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-accent">{selectedWorker[0]}</span>
                  </div>
                  <span className="font-semibold text-sm text-text-primary">{selectedWorker}</span>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  workerJobs.length === 0
                    ? 'bg-bg-elevated text-text-muted'
                    : workerJobs.some(j => j.priority === 'urgent')
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-accent/20 text-accent'
                }`}>
                  {workerJobs.length} jobs
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {isLoading ? (
                  <div className="py-6 text-center text-xs text-text-muted">Loading...</div>
                ) : workerJobs.length === 0 ? (
                  <div className="py-6 text-center text-xs text-text-muted">No active jobs for {selectedWorker}</div>
                ) : (
                  <>
                    {shownJobs.map(job => <JobRow key={job.id} job={job} router={router} />)}
                    {workerJobs.length > DASHBOARD_JOB_LIMIT && (
                      <button
                        onClick={() => toggleJobList(selectedWorker)}
                        className="w-full px-4 py-2.5 text-xs font-semibold text-accent hover:bg-accent/10 transition-colors"
                      >
                        {expandedJobLists[selectedWorker] ? 'Show less' : `See all (${hiddenCount} more)`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            })()
          )}

          {/* Unassigned jobs */}
          {unassignedJobs.length > 0 && (
            <div className="card overflow-hidden mt-4">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-amber-500/5">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="font-semibold text-sm text-amber-400">Unassigned Jobs</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                  {unassignedJobs.length}
                </span>
              </div>
              <div className="divide-y divide-border/40">
                {shownUnassignedJobs.map(job => (
                  <div
                    key={job.id}
                    onClick={() => router.push(job.source_type === 'quote' ? `/quotes?open=${job.id}` : `/${job.is_retail ? 'retail' : 'job-cards'}?open=${job.id}`)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-bg-hover cursor-pointer"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">{job.title}</p>
                      <p className="text-xs text-text-muted">{job.job_number} · {job.client_name || 'No client'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={job.priority} type="priority" />
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                ))}
                {unassignedJobs.length > DASHBOARD_JOB_LIMIT && (
                  <button
                    onClick={() => toggleJobList('unassigned')}
                    className="w-full px-4 py-2.5 text-xs font-semibold text-accent hover:bg-accent/10 transition-colors"
                  >
                    {expandedJobLists.unassigned ? 'Show less' : `See all (${hiddenUnassignedCount} more)`}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Recent Quotes */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-text-primary flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              Recent Quotes
            </h2>
            <Link href="/quotes" className="text-xs text-accent hover:text-accent-glow">View all →</Link>
          </div>
          <div className="divide-y divide-border/50">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted text-sm">Loading...</div>
            ) : recentQuotes.length === 0 ? (
              <div className="py-8 text-center text-text-muted text-sm">No quotes yet</div>
            ) : (
              recentQuotes.map(quote => (
                <div
                  key={quote.id}
                  onClick={() => router.push(`/quotes?open=${quote.id}`)}
                  className="flex items-center justify-between px-4 py-3 hover:bg-bg-hover cursor-pointer transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{quote.client_name || 'Unknown client'}</p>
                    <p className="text-xs text-text-muted">{quote.quote_number} · {formatDate(quote.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    <span className="text-sm font-semibold text-text-primary">{formatCurrency(quote.total)}</span>
                    <StatusBadge status={quote.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/quotes?new=1" className="btn-primary btn-sm">+ New Quote</Link>
          <Link href="/job-cards?new=1" className="btn-secondary btn-sm">+ New Job Card</Link>
          <Link href="/clients?new=1" className="btn-secondary btn-sm">+ Add Client</Link>
          <Link href="/retail?new=1" className="btn-secondary btn-sm">+ New Retail Job</Link>
        </div>
      </div>
    </AppShell>
  )
}
