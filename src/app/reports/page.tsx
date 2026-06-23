'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BarChart3, Download, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { isSuperAdmin } from '@/lib/auth/superAdmin'

type QuickFilter = 'this_month' | 'last_month' | 'this_year'

type ReportRow = {
  id: string
  quote_number?: string
  job_number?: string
  record_type?: 'quote' | 'retail' | 'job_card' | 'walk_in'
  title?: string | null
  client_name?: string | null
  status?: string | null
  payment_status?: string | null
  payment_method?: string | null
  payment_date?: string | null
  completed_at?: string | null
  completed_by?: string | null
  date_completed?: string | null
  created_at?: string | null
  updated_at?: string | null
  notes?: string | null
  subtotal?: number | null
  vat_amount?: number | null
  total?: number | null
  amount_paid?: number | null
  is_retail?: boolean | null
  deleted_at?: string | null
}

type Summary = {
  totalIncome: number
  normalIncome: number
  retailIncome: number
  vatTotal: number
  paidCount: number
  partialCount: number
  outstanding: number
  averageSale: number
  completedJobCards: number
  walkInIncome: number
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function getQuickRange(filter: QuickFilter) {
  const now = new Date()
  if (filter === 'last_month') {
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { start: toDateInput(startOfMonth(last)), end: toDateInput(endOfMonth(last)) }
  }
  if (filter === 'this_year') {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
  }
  return { start: toDateInput(startOfMonth(now)), end: toDateInput(endOfMonth(now)) }
}

function numberValue(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function parsePaidAmount(notes?: string | null) {
  const match = String(notes || '').match(/PAID:\s*N\$([\d,.]+)/i)
  if (!match) return 0
  return numberValue(match[1].replace(/,/g, ''))
}

function parsePaymentMethod(notes?: string | null) {
  const match = String(notes || '').match(/\((cash|card|eft|other)\)/i)
  return match?.[1]?.toLowerCase() || null
}

function parsePaymentDate(notes?: string | null) {
  const match = String(notes || '').match(/\son\s(.+)$/i)
  if (!match) return null
  const date = new Date(match[1])
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeReportRow(row: any, source: 'quote' | 'job_card'): ReportRow {
  const notes = String(row.notes || '')
  const hasPaidNote = notes.startsWith('PAID:')
  const parsedAmount = parsePaidAmount(notes)
  const total = numberValue(row.total)
  const explicitPaymentStatus = String(row.payment_status || '').toLowerCase()
  const isWalkIn = source === 'job_card' && String(row.job_number || '').startsWith('WI-')
  const isCompletedJob = source === 'job_card' && String(row.status || '').toLowerCase() === 'completed'
  const isDeliveredWalkIn = isWalkIn && String(row.status || '').toLowerCase() === 'delivered'
  const paymentStatus = explicitPaymentStatus || (hasPaidNote
    ? parsedAmount > 0 && parsedAmount < total ? 'partial' : 'paid'
    : (isCompletedJob || isDeliveredWalkIn) ? 'paid' : 'unpaid')
  const recordType = source === 'quote' ? 'quote' : isWalkIn ? 'walk_in' : row.is_retail ? 'retail' : 'job_card'

  return {
    ...row,
    record_type: recordType,
    quote_number: row.quote_number || row.job_number || '',
    is_retail: recordType === 'retail',
    payment_status: paymentStatus,
    payment_method: row.payment_method || parsePaymentMethod(notes) || null,
    amount_paid: numberValue(row.amount_paid) || (hasPaidNote ? parsedAmount : paymentStatus === 'paid' ? total : 0),
    payment_date: row.payment_date || parsePaymentDate(notes) || (hasPaidNote ? row.updated_at : null) || null,
    completed_at: row.completed_at || row.date_completed || null,
  }
}

function reportDate(row: ReportRow) {
  return row.completed_at || row.payment_date || row.date_completed || row.created_at || ''
}

function isInRange(row: ReportRow, start: string, end: string) {
  const date = reportDate(row)
  if (!date) return false
  const day = date.slice(0, 10)
  return day >= start && day <= end
}

function isCountable(row: ReportRow) {
  const status = String(row.status || '').toLowerCase()
  const notes = String(row.notes || '')
  return !row.deleted_at && !notes.startsWith('PAYMENT_REMOVED:') && (status === 'completed' || row.record_type === 'walk_in')
}

function incomeFor(row: ReportRow) {
  const paymentStatus = String(row.payment_status || '').toLowerCase()
  if (paymentStatus === 'partial') return numberValue(row.amount_paid)
  if (paymentStatus === 'paid') return numberValue(row.total)
  return 0
}

function vatFor(row: ReportRow) {
  const total = numberValue(row.total)
  if (total <= 0) return 0
  return numberValue(row.vat_amount) * (incomeFor(row) / total)
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function downloadCsv(rows: ReportRow[], startDate: string, endDate: string) {
  const headers = [
    'Quote number', 'Client name', 'Type', 'Status', 'Payment status', 'Payment method',
    'Subtotal', 'VAT', 'Total', 'Amount paid', 'Date',
  ]
  const lines = rows.map(row => [
    row.quote_number || '',
    row.client_name || '',
    row.record_type === 'walk_in' ? 'Walk-in' : row.record_type === 'job_card' ? 'Job Card' : row.is_retail ? 'Retail' : 'Quote',
    row.status || '',
    row.payment_status || '',
    row.payment_method || '',
    numberValue(row.subtotal).toFixed(2),
    numberValue(row.vat_amount).toFixed(2),
    numberValue(row.total).toFixed(2),
    incomeFor(row).toFixed(2),
    reportDate(row).slice(0, 10),
  ].map(csvEscape).join(','))

  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `la-signs-reports-${startDate}-to-${endDate}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function groupSum<T extends string>(rows: ReportRow[], keyFn: (row: ReportRow) => T) {
  const map = new Map<T, number>()
  for (const row of rows) map.set(keyFn(row), (map.get(keyFn(row)) || 0) + incomeFor(row))
  return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

function SimpleBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-3">
      {data.length === 0 ? <p className="text-sm text-text-muted">No data</p> : data.map(item => (
        <div key={item.label}>
          <div className="flex justify-between text-xs mb-1 gap-3">
            <span className="text-text-secondary truncate">{item.label}</span>
            <span className="font-semibold text-text-primary">{formatCurrency(item.value)}</span>
          </div>
          <div className="h-2 rounded bg-bg-elevated overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-text-muted mb-2">{label}</p>
      <p className="text-2xl font-bold text-text-primary">{value}</p>
    </div>
  )
}

function ReportsPageInner() {
  const { profile } = useAuthStore()
  const initial = getQuickRange('this_month')
  const [startDate, setStartDate] = useState(initial.start)
  const [endDate, setEndDate] = useState(initial.end)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canView = isSuperAdmin(profile)

  async function loadRowsDirectly() {
    const [quotesResult, jobsResult] = await Promise.all([
      supabase.from('quotes').select('*').eq('status', 'completed'),
      supabase.from('job_cards').select('*').in('status', ['completed', 'delivered']),
    ])

    if (quotesResult.error) throw quotesResult.error
    if (jobsResult.error) throw jobsResult.error

    return [
      ...((quotesResult.data || []) as any[]).map(row => normalizeReportRow(row, 'quote')),
      ...((jobsResult.data || []) as any[]).map(row => normalizeReportRow(row, 'job_card')),
    ]
  }

  async function loadReport() {
    if (!canView) return
    setIsLoading(true)
    setError(null)
    try {
      const reportRows = await loadRowsDirectly()
      setRows(reportRows.filter(row => isCountable(row) && isInRange(row, startDate, endDate)))
    } catch (err: any) {
      const message = err?.message || 'Failed to load report'
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => { loadReport() }, [canView, startDate, endDate])

  const summary = useMemo<Summary>(() => {
    const totalIncome = rows.reduce((sum, row) => sum + incomeFor(row), 0)
    const normalIncome = rows.filter(row => row.record_type === 'quote').reduce((sum, row) => sum + incomeFor(row), 0)
    const retailIncome = rows.filter(row => row.record_type === 'retail').reduce((sum, row) => sum + incomeFor(row), 0)
    const walkInIncome = rows.filter(row => row.record_type === 'walk_in').reduce((sum, row) => sum + incomeFor(row), 0)
    const paidCount = rows.filter(row => String(row.payment_status || '').toLowerCase() === 'paid').length
    const partialCount = rows.filter(row => String(row.payment_status || '').toLowerCase() === 'partial').length
    const outstanding = rows.reduce((sum, row) => sum + Math.max(0, numberValue(row.total) - numberValue(row.amount_paid || (String(row.payment_status).toLowerCase() === 'paid' ? row.total : 0))), 0)
    return {
      totalIncome,
      normalIncome,
      retailIncome,
      vatTotal: rows.reduce((sum, row) => sum + vatFor(row), 0),
      paidCount,
      partialCount,
      outstanding,
      averageSale: rows.length ? totalIncome / rows.length : 0,
      completedJobCards: rows.filter(row => row.record_type === 'job_card').length,
      walkInIncome,
    }
  }, [rows])

  const monthly = useMemo(() => groupSum(rows, row => (reportDate(row).slice(0, 7) || 'Unknown')), [rows])
  const byStatus = useMemo(() => groupSum(rows, row => row.status || 'Unknown'), [rows])
  const retailVsNormal = useMemo(() => groupSum(rows, row => row.record_type === 'walk_in' ? 'Walk-ins' : row.record_type === 'job_card' ? 'Job Cards' : row.is_retail ? 'Retail' : 'Quotes'), [rows])
  const topClients = useMemo(() => groupSum(rows, row => row.client_name || 'Unknown').slice(0, 8), [rows])
  const paymentMethods = useMemo(() => groupSum(rows.filter(row => row.payment_method), row => row.payment_method || 'Unknown'), [rows])

  if (!canView) {
    return (
      <AppShell>
        <div className="px-6 py-10">
          <div className="card p-8 max-w-xl mx-auto text-center">
            <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-text-primary mb-2">Access denied</h1>
            <p className="text-text-muted">Only super admins can view Reports.</p>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <PageHeader
        title="REPORTS"
        subtitle={`${rows.length} completed records`}
        actions={
          <button onClick={() => downloadCsv(rows, startDate, endDate)} className="btn-primary btn-sm" disabled={rows.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-5">
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">End date</label>
            <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              ['this_month', 'This month'],
              ['last_month', 'Last month'],
              ['this_year', 'This year'],
            ] as [QuickFilter, string][]).map(([key, label]) => (
              <button key={key} className="btn-secondary btn-sm" onClick={() => { const r = getQuickRange(key); setStartDate(r.start); setEndDate(r.end) }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="card p-4 border-red-500/30 text-red-400">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard label="Total income" value={formatCurrency(summary.totalIncome)} />
          <StatCard label="Quote income" value={formatCurrency(summary.normalIncome)} />
          <StatCard label="Retail income" value={formatCurrency(summary.retailIncome)} />
          <StatCard label="Walk-in income" value={formatCurrency(summary.walkInIncome)} />
          <StatCard label="VAT total" value={formatCurrency(summary.vatTotal)} />
          <StatCard label="Paid records" value={summary.paidCount} />
          <StatCard label="Partial payments" value={summary.partialCount} />
          <StatCard label="Outstanding unpaid" value={formatCurrency(summary.outstanding)} />
          <StatCard label="Average sale value" value={formatCurrency(summary.averageSale)} />
          <StatCard label="Completed job cards" value={summary.completedJobCards} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {[
            ['Monthly income', monthly],
            ['Income by status', byStatus],
            ['Income by type', retailVsNormal],
            ['Top clients by income', topClients],
            ['Payment method breakdown', paymentMethods],
          ].map(([title, data]) => (
            <div key={title as string} className="card p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 className="w-4 h-4 text-accent" />
                <h2 className="font-semibold text-text-primary">{title as string}</h2>
              </div>
              <SimpleBars data={data as { label: string; value: number }[]} />
            </div>
          ))}
        </div>

        <div className="card overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-text-muted">Loading report...</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-text-muted">No completed records found for this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1100px]">
                <thead>
                  <tr>
                    <th>Number</th><th>Client</th><th>Type</th><th>Status</th><th>Payment</th><th>Method</th>
                    <th>Subtotal</th><th>VAT</th><th>Total</th><th>Amount paid</th><th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id}>
                      <td className="font-mono text-accent">{row.quote_number || '-'}</td>
                      <td>{row.client_name || '-'}</td>
                      <td>{row.record_type === 'walk_in' ? 'Walk-in' : row.record_type === 'job_card' ? 'Job Card' : row.is_retail ? 'Retail' : 'Quote'}</td>
                      <td>{row.status || '-'}</td>
                      <td>{row.payment_status || '-'}</td>
                      <td>{row.payment_method || '-'}</td>
                      <td>{formatCurrency(numberValue(row.subtotal))}</td>
                      <td>{formatCurrency(numberValue(row.vat_amount))}</td>
                      <td>{formatCurrency(numberValue(row.total))}</td>
                      <td>{formatCurrency(incomeFor(row))}</td>
                      <td>{reportDate(row) ? formatDate(reportDate(row)) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

export default function ReportsPage() {
  return <ReportsPageInner />
}
