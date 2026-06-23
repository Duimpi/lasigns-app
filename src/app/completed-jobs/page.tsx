'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TableSkeleton } from '@/components/ui/Loading'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle2, Eye, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

type CompletedType = 'quote' | 'retail' | 'job_card'

type CompletedRow = {
  id: string
  number: string
  client_name: string | null
  type: CompletedType
  status: string | null
  payment_status: string
  amount: number
  amount_paid: number
  completed_at: string | null
  completed_by: string | null
  completed_by_name: string
  notes?: string | null
}

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

function firstOfMonth() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
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

function inferPaymentStatus(row: any) {
  const explicit = String(row.payment_status || '').toLowerCase()
  if (explicit && explicit !== 'unpaid') return explicit
  const paid = parsePaidAmount(row.notes)
  if (paid <= 0) return 'unpaid'
  return paid < numberValue(row.total) ? 'partial' : 'paid'
}

function completedDate(row: any) {
  return row.completed_at || row.date_completed || row.updated_at || row.created_at || null
}

function normalize(row: any, type: CompletedType, profiles: Map<string, string>): CompletedRow {
  const amountPaid = numberValue(row.amount_paid) || parsePaidAmount(row.notes)
  const completedBy = row.completed_by || null
  return {
    id: row.id,
    number: row.quote_number || row.job_number || '',
    client_name: row.client_name || null,
    type,
    status: row.status || null,
    payment_status: inferPaymentStatus(row),
    amount: numberValue(row.total),
    amount_paid: amountPaid,
    completed_at: completedDate(row),
    completed_by: completedBy,
    completed_by_name: completedBy ? profiles.get(completedBy) || 'Unknown' : '-',
    notes: row.notes || null,
  }
}

function typeLabel(type: CompletedType) {
  if (type === 'job_card') return 'Job Card'
  if (type === 'retail') return 'Retail'
  return 'Quote'
}

export default function CompletedJobsPage() {
  const [rows, setRows] = useState<CompletedRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState(firstOfMonth())
  const [endDate, setEndDate] = useState(todayInput())
  const [typeFilter, setTypeFilter] = useState<'all' | CompletedType>('all')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [paymentFilter, setPaymentFilter] = useState('all')

  useEffect(() => { loadCompleted() }, [])

  async function loadCompleted() {
    setIsLoading(true)
    try {
      const [quotesResult, jobsResult, profilesResult] = await Promise.all([
        supabase.from('quotes').select('*').eq('status', 'completed'),
        supabase.from('job_cards').select('*').eq('status', 'completed').not('job_number', 'like', 'WI-%'),
        supabase.from('profiles').select('id, full_name'),
      ])
      if (quotesResult.error) throw quotesResult.error
      if (jobsResult.error) throw jobsResult.error

      const profiles = new Map<string, string>((profilesResult.data || []).map((p: any) => [p.id, p.full_name]))
      const completedRows = [
        ...((quotesResult.data || []) as any[]).map(row => normalize(row, 'quote', profiles)),
        ...((jobsResult.data || []) as any[]).map(row => normalize(row, row.is_retail ? 'retail' : 'job_card', profiles)),
      ]
      setRows(completedRows)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load completed jobs')
    } finally {
      setIsLoading(false)
    }
  }


  function viewCompleted(row: CompletedRow) {
    alert([
      `Number: ${row.number}`,
      `Client: ${row.client_name || '-'}`,
      `Type: ${typeLabel(row.type)}`,
      `Amount: ${formatCurrency(row.amount)}`,
      `Payment: ${row.payment_status}`,
      `Completed: ${row.completed_at ? formatDate(row.completed_at) : '-'}`,
      `Notes: ${row.notes || '-'}`,
    ].join('\n'))
  }

  async function deleteCompleted(row: CompletedRow) {
    if (!confirm(`Delete ${row.number}? This will remove it from Completed Jobs and Reports.`)) return
    try {
      const table = row.type === 'quote' ? 'quotes' : 'job_cards'
      const { error } = await supabase.from(table).delete().eq('id', row.id)
      if (error) throw error
      toast.success('Completed job deleted')
      loadCompleted()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete completed job')
    }
  }
  const clients = useMemo(() => Array.from(new Set(rows.map(row => row.client_name).filter(Boolean) as string[])).sort(), [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return rows
      .filter(row => {
        const day = (row.completed_at || '').slice(0, 10)
        if (!day || day < startDate || day > endDate) return false
        if (typeFilter !== 'all' && row.type !== typeFilter) return false
        if (clientFilter && row.client_name !== clientFilter) return false
        if (statusFilter !== 'all' && row.status !== statusFilter) return false
        if (paymentFilter !== 'all' && row.payment_status !== paymentFilter) return false
        if (!q) return true
        return row.number.toLowerCase().includes(q) || String(row.client_name || '').toLowerCase().includes(q)
      })
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
  }, [rows, search, startDate, endDate, typeFilter, clientFilter, statusFilter, paymentFilter])

  return (
    <AppShell>
      <PageHeader title="COMPLETED JOBS" subtitle={`${filtered.length} completed records`} />

      <div className="px-6 pb-6 space-y-4">
        <div className="card p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Start date</label>
            <input type="date" className="input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">End date</label>
            <input type="date" className="input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
              <option value="all">All</option>
              <option value="quote">Quote</option>
              <option value="retail">Retail</option>
              <option value="job_card">Job Card</option>
            </select>
          </div>
          <div>
            <label className="label">Client</label>
            <select className="input" value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
              <option value="">All clients</option>
              {clients.map(client => <option key={client} value={client}>{client}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="label">Payment Status</label>
            <select className="input" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Search number or client..." className="max-w-xs" />
        </div>

        <div className="card overflow-hidden">
          {isLoading ? <TableSkeleton rows={8} cols={7} /> : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-text-muted">No completed jobs found for this filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1000px]">
                <thead>
                  <tr>
                    <th>Number</th><th>Client</th><th>Type</th><th>Amount</th><th>Payment Status</th><th>Completed Date</th><th>Completed By</th><th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={`${row.type}-${row.id}`}>
                      <td className="font-mono text-accent font-semibold">{row.number}</td>
                      <td>{row.client_name || '-'}</td>
                      <td>{typeLabel(row.type)}</td>
                      <td className="font-semibold">{formatCurrency(row.amount)}</td>
                      <td><StatusBadge status={row.payment_status} /></td>
                      <td>{row.completed_at ? formatDate(row.completed_at) : '-'}</td>
                      <td>{row.completed_by_name}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => viewCompleted(row)} className="btn-icon" title="View"><Eye className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteCompleted(row)} className="btn-icon text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
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