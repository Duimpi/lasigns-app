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
  TrendingUp, Clock, AlertCircle, CheckCircle2
} from 'lucide-react'
import Link from 'next/link'
import type { JobCard, Quote } from '@/types'

interface Stats {
  totalClients: number
  activeQuotes: number
  activeJobs: number
  urgentJobs: number
  completedThisMonth: number
  retailJobs: number
}

export default function DashboardPage() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({
    totalClients: 0, activeQuotes: 0, activeJobs: 0,
    urgentJobs: 0, completedThisMonth: 0, retailJobs: 0,
  })
  const [recentJobs, setRecentJobs] = useState<JobCard[]>([])
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

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
        { data: jobs },
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
          .eq('is_retail', false)
          .order('created_at', { ascending: false })
          .limit(6),
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
      setRecentJobs((jobs as JobCard[]) || [])
      setRecentQuotes((quotes as Quote[]) || [])
    } finally {
      setIsLoading(false)
    }
  }

  const statCards = [
    { label: 'Total Clients', value: stats.totalClients, icon: Users, color: 'text-blue-400', href: '/clients' },
    { label: 'Active Quotes', value: stats.activeQuotes, icon: FileText, color: 'text-purple-400', href: '/quotes' },
    { label: 'Active Jobs', value: stats.activeJobs, icon: Briefcase, color: 'text-accent', href: '/job-cards' },
    { label: 'Urgent Jobs', value: stats.urgentJobs, icon: AlertCircle, color: 'text-red-400', href: '/job-cards?priority=urgent' },
    { label: 'Completed (Month)', value: stats.completedThisMonth, icon: CheckCircle2, color: 'text-emerald-400', href: '/job-cards?status=completed' },
    { label: 'Active Retail', value: stats.retailJobs, icon: ShoppingBag, color: 'text-amber-400', href: '/retail' },
  ]

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

        {/* Recent content */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Recent Jobs */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-text-primary flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-accent" />
                Recent Job Cards
              </h2>
              <Link href="/job-cards" className="text-xs text-accent hover:text-accent-glow">View all →</Link>
            </div>
            <div className="divide-y divide-border/50">
              {isLoading ? (
                <div className="py-8 text-center text-text-muted text-sm">Loading...</div>
              ) : recentJobs.length === 0 ? (
                <div className="py-8 text-center text-text-muted text-sm">No job cards yet</div>
              ) : (
                recentJobs.map(job => (
                  <div
                    key={job.id}
                    onClick={() => router.push(`/job-cards?open=${job.id}`)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-bg-hover cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{job.title}</p>
                      <p className="text-xs text-text-muted">
                        {job.job_number} · {job.client_name || 'No client'} · {formatDate(job.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      {job.assigned_worker && (
                        <span className="text-xs text-text-muted">{job.assigned_worker}</span>
                      )}
                      <StatusBadge status={job.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
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
                      <p className="text-sm font-medium text-text-primary truncate">
                        {quote.client_name || 'Unknown client'}
                      </p>
                      <p className="text-xs text-text-muted">
                        {quote.quote_number} · {formatDate(quote.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className="text-sm font-semibold text-text-primary">
                        {formatCurrency(quote.total)}
                      </span>
                      <StatusBadge status={quote.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/quotes?new=1" className="btn-primary btn-sm">
            + New Quote
          </Link>
          <Link href="/job-cards?new=1" className="btn-secondary btn-sm">
            + New Job Card
          </Link>
          <Link href="/clients?new=1" className="btn-secondary btn-sm">
            + Add Client
          </Link>
          <Link href="/retail?new=1" className="btn-secondary btn-sm">
            + New Retail Job
          </Link>
        </div>
      </div>
    </AppShell>
  )
}
