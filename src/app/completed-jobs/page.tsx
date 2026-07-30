'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { TableSkeleton } from '@/components/ui/Loading'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { generateJobCardPDF, generateQuoteJobCardPDF } from '@/lib/pdf/generator'
import { BriefcaseBusiness, CheckCircle2, DollarSign, Download, Eye, FileText, Printer, RotateCcw, ShoppingBag, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

type CompletedType = 'quote' | 'retail' | 'job_card'

type CompletedRow = {
  id: string
  number: string
  client_name: string | null
  title: string | null
  store: string | null
  branch: string | null
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
    title: row.title || null,
    store: row.store || null,
    branch: row.branch || null,
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

const storeColors: Record<string, string> = {
  Shoprite: 'text-red-400',
  Checkers: 'text-blue-400',
  Usave: 'text-amber-400',
}

function tagValue(notes: string | null | undefined, key: string) {
  const match = String(notes || '').match(new RegExp('\\[LA_' + key + ':([^\\]]*)\\]', 'i'))
  if (!match?.[1]) return ''
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

function visibleNotes(notes?: string | null) {
  return String(notes || '')
    .replace(/\[LA_[^\]]+\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function itemDescription(item: any) {
  return String(item?.description || '').replace(/\s*\[LA_ITEM_NOTE:[^\]]*\]/gi, '').trim()
}

function itemNote(item: any) {
  return tagValue(item?.description, 'ITEM_NOTE') || String(item?.note || '').trim()
}

function missingSchemaColumn(error: any) {
  const message = String(error?.message || '')
  const match = message.match(/Could not find the '([^']+)' column/i)
  return match?.[1] || null
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
  const [viewRow, setViewRow] = useState<CompletedRow | null>(null)
  const [viewData, setViewData] = useState<any>(null)
  const [isViewLoading, setIsViewLoading] = useState(false)

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


  async function viewCompleted(row: CompletedRow) {
    setViewRow(row)
    setViewData(null)
    setIsViewLoading(true)

    try {
      if (row.type === 'quote') {
        const { data, error } = await supabase
          .from('quotes')
          .select('*, items:quote_items(*)')
          .eq('id', row.id)
          .single()
        if (error) throw error
        setViewData(data)
        return
      }

      const { data, error } = await supabase
        .from('job_cards')
        .select('*, items:job_card_items(*), client:clients(id, name, company, address, vat_number, emails:client_emails(*), phones:client_phones(*))')
        .eq('id', row.id)
        .single()
      if (error) throw error
      setViewData(data)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load completed job')
      setViewRow(null)
    } finally {
      setIsViewLoading(false)
    }
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

  async function moveQuoteBack(row: CompletedRow) {
    if (row.type !== 'quote') return
    if (!confirm(`Move ${row.number} back to active Quotes?`)) return

    const updatePayload: Record<string, any> = {
      status: 'draft',
      completed_at: null,
      completed_by: null,
    }

    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { error } = await supabase.from('quotes').update(updatePayload).eq('id', row.id)
        if (!error) {
          toast.success(`${row.number} moved back to Quotes`)
          loadCompleted()
          return
        }

        const missingColumn = missingSchemaColumn(error)
        if (!missingColumn || !(missingColumn in updatePayload)) throw error
        delete updatePayload[missingColumn]
      }
      throw new Error('Move back failed')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to move quote back')
    }
  }

  async function markCompletedPaid(row: CompletedRow) {
    if (String(row.payment_status || '').toLowerCase() === 'paid') return
    if (!confirm(`Mark ${row.number} as paid for ${formatCurrency(row.amount)}?`)) return

    const table = row.type === 'quote' ? 'quotes' : 'job_cards'
    const paidAt = new Date().toISOString()
    const paymentNote = `PAID: N$${row.amount.toFixed(2)} (Completed Jobs) on ${new Date(paidAt).toLocaleDateString()}`
    const existingNotes = String(row.notes || '').trim()
    const nextNotes = existingNotes ? `${paymentNote}\n${existingNotes}` : paymentNote
    const updatePayload: Record<string, any> = {
      amount_paid: row.amount,
      payment_status: 'paid',
      payment_method: 'completed_jobs',
      payment_date: paidAt,
      notes: nextNotes,
    }

    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase.from(table).update(updatePayload).eq('id', row.id)
        if (!error) {
          toast.success(`${row.number} marked as paid`)
          loadCompleted()
          return
        }

        const missingColumn = missingSchemaColumn(error)
        if (!missingColumn || !(missingColumn in updatePayload)) throw error
        delete updatePayload[missingColumn]
      }
      throw new Error('Payment update failed')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark completed job as paid')
    }
  }
  async function downloadCompleted(row: CompletedRow) {
    try {
      if (row.type === 'quote') {
        const { data, error } = await supabase
          .from('quotes')
          .select('*, items:quote_items(*)')
          .eq('id', row.id)
          .single()
        if (error) throw error
        const quote = {
          ...data,
          items: ((data as any).items || [])
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((item: any) => ({
              ...item,
              total: Number(item.line_total ?? item.total ?? 0),
            })),
        }
        generateQuoteJobCardPDF(quote as any).save(`${row.number || 'completed-quote'}.pdf`)
        toast.success('PDF downloaded')
        return
      }

      const { data, error } = await supabase
        .from('job_cards')
        .select('*, items:job_card_items(*), client:clients(id, name, company, emails:client_emails(*), phones:client_phones(*))')
        .eq('id', row.id)
        .single()
      if (error) throw error
      const job = {
        ...data,
        items: ((data as any).items || [])
          .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((item: any) => ({
            ...item,
            total: Number(item.line_total ?? item.total ?? 0),
          })),
      }
      generateJobCardPDF(job as any, row.type === 'retail').save(`${row.number || 'completed-job'}.pdf`)
      toast.success('PDF downloaded')
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download completed job')
    }
  }
  async function printCompleted(row: CompletedRow) {
    try {
      if (row.type === 'quote') {
        const { data, error } = await supabase
          .from('quotes')
          .select('*, items:quote_items(*)')
          .eq('id', row.id)
          .single()
        if (error) throw error
        const quote = {
          ...data,
          items: ((data as any).items || [])
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
            .map((item: any) => ({
              ...item,
              total: Number(item.line_total ?? item.total ?? 0),
            })),
        }
        const doc = generateQuoteJobCardPDF(quote as any)
        const blob = doc.output('blob')
        const url = URL.createObjectURL(blob)
        window.open(url, '_blank')?.print()
        return
      }

      const { data, error } = await supabase
        .from('job_cards')
        .select('*, items:job_card_items(*), client:clients(id, name, company, emails:client_emails(*), phones:client_phones(*))')
        .eq('id', row.id)
        .single()
      if (error) throw error
      const job = {
        ...data,
        items: ((data as any).items || [])
          .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))
          .map((item: any) => ({
            ...item,
            total: Number(item.line_total ?? item.total ?? 0),
          })),
      }
      const doc = generateJobCardPDF(job as any, row.type === 'retail')
      const blob = doc.output('blob')
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')?.print()
    } catch (err: any) {
      toast.error(err?.message || 'Failed to print completed job')
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
        return [
          row.number,
          row.client_name,
          row.title,
          row.store,
          row.branch,
        ].some(value => String(value || '').toLowerCase().includes(q))
      })
      .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime())
  }, [rows, search, startDate, endDate, typeFilter, clientFilter, statusFilter, paymentFilter])

  const retailRows = filtered.filter(row => row.type === 'retail')
  const quoteRows = filtered.filter(row => row.type === 'quote')
  const jobCardRows = filtered.filter(row => row.type === 'job_card')

  function completedSection(sectionRows: CompletedRow[], type: CompletedType) {
    if (sectionRows.length === 0) return null

    const sectionDetails = {
      retail: {
        title: 'Retail Jobs',
        subtitle: 'Shoprite, Checkers and Usave',
        icon: ShoppingBag,
      },
      quote: {
        title: 'Quotes',
        subtitle: 'Completed customer quotes',
        icon: FileText,
      },
      job_card: {
        title: 'Job Cards',
        subtitle: 'Completed production job cards',
        icon: BriefcaseBusiness,
      },
    }[type]
    const SectionIcon = sectionDetails.icon

    return (
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border bg-bg-elevated">
          <div className="flex items-center gap-2.5">
            <SectionIcon className="w-4 h-4 text-accent" />
            <div>
              <h2 className="font-semibold text-text-primary">{sectionDetails.title}</h2>
              <p className="text-xs text-text-muted">{sectionDetails.subtitle}</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-text-secondary">{sectionRows.length} completed</span>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-[1100px]">
            <thead>
              <tr>
                <th>Number</th>
                {type === 'retail' && <th>Store / Branch</th>}
                <th>{type === 'retail' ? 'Title / Client' : 'Client'}</th>
                <th>Amount</th>
                <th>Payment Status</th>
                <th>Completed Date</th>
                <th>Completed By</th>
                <th className="w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sectionRows.map(row => (
                <tr key={`${row.type}-${row.id}`}>
                  <td className="font-mono text-accent font-semibold">{row.number}</td>
                  {type === 'retail' && (
                    <td>
                      <span className={`font-semibold text-sm ${storeColors[row.store || ''] || 'text-text-primary'}`}>
                        {row.store || '-'}
                      </span>
                      {row.branch && <p className="text-xs text-text-muted">{row.branch}</p>}
                    </td>
                  )}
                  <td>
                    {type === 'retail' ? (
                      <>
                        <span className="font-medium text-text-primary">{row.title || row.client_name || '-'}</span>
                        {row.title && row.client_name && <p className="text-xs text-text-muted">{row.client_name}</p>}
                      </>
                    ) : (
                      row.client_name || '-'
                    )}
                  </td>
                  <td className="font-semibold">{formatCurrency(row.amount)}</td>
                  <td><StatusBadge status={row.payment_status} /></td>
                  <td>{row.completed_at ? formatDate(row.completed_at) : '-'}</td>
                  <td>{row.completed_by_name}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => viewCompleted(row)} className="btn-icon" title="View"><Eye className="w-3.5 h-3.5" /></button>
                      {row.type === 'quote' && (
                        <button onClick={() => moveQuoteBack(row)} className="btn-icon text-accent" title="Move back to Quotes"><RotateCcw className="w-3.5 h-3.5" /></button>
                      )}
                      {String(row.payment_status || '').toLowerCase() !== 'paid' && (
                        <button onClick={() => markCompletedPaid(row)} className="btn-icon text-emerald-400" title="Mark paid"><DollarSign className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => downloadCompleted(row)} className="btn-icon" title="Download PDF"><Download className="w-3.5 h-3.5" /></button>
                      <button onClick={() => printCompleted(row)} className="btn-icon" title="Print"><Printer className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteCompleted(row)} className="btn-icon text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

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

        {isLoading ? (
          <div className="card overflow-hidden"><TableSkeleton rows={8} cols={7} /></div>
        ) : filtered.length === 0 ? (
          <div className="card overflow-hidden">
            <div className="py-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-text-muted">No completed jobs found for this filter.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {completedSection(retailRows, 'retail')}
            {completedSection(quoteRows, 'quote')}
            {completedSection(jobCardRows, 'job_card')}
          </div>
        )}
      </div>

      <Modal
        isOpen={!!viewRow}
        onClose={() => {
          setViewRow(null)
          setViewData(null)
        }}
        title={viewRow ? `View - ${viewRow.number}` : 'Completed Job'}
        subtitle={viewRow ? `${typeLabel(viewRow.type)} - Read only` : undefined}
        size="2xl"
        preventOutsideClose={false}
        actions={viewRow && viewData ? (
          <div className="flex items-center gap-2">
            <button onClick={() => downloadCompleted(viewRow)} className="btn-secondary btn-sm">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            <button onClick={() => printCompleted(viewRow)} className="btn-secondary btn-sm">
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        ) : undefined}
      >
        {isViewLoading ? (
          <div className="py-20 flex items-center justify-center">
            <span className="spinner w-6 h-6" />
          </div>
        ) : viewRow && viewData ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="border border-border rounded-md p-4">
                <h3 className="text-xs font-semibold uppercase text-text-muted mb-3">Client Information</h3>
                <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-text-muted">Client</dt>
                  <dd className="font-semibold text-text-primary">{viewData.client_name || viewData.client?.name || '-'}</dd>
                  {(viewRow.type === 'retail' || viewData.client?.company) && (
                    <>
                      <dt className="text-text-muted">Company</dt>
                      <dd>{tagValue(viewData.notes, 'RETAIL_COMPANY') || viewData.client?.company || '-'}</dd>
                    </>
                  )}
                  <dt className="text-text-muted">Phone</dt>
                  <dd>{viewData.client_phone || tagValue(viewData.notes, viewRow.type === 'retail' ? 'RETAIL_PHONE' : 'CLIENT_NUMBER') || viewData.client?.phones?.[0]?.phone || '-'}</dd>
                  <dt className="text-text-muted">Email</dt>
                  <dd className="break-all">{viewData.client_email || tagValue(viewData.notes, 'RETAIL_EMAIL') || viewData.client?.emails?.[0]?.email || '-'}</dd>
                  <dt className="text-text-muted">Address</dt>
                  <dd>{viewData.client_address || viewData.client?.address || '-'}</dd>
                </dl>
              </section>

              <section className="border border-border rounded-md p-4">
                <h3 className="text-xs font-semibold uppercase text-text-muted mb-3">Job Details</h3>
                <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-text-muted">Number</dt>
                  <dd className="font-mono font-semibold text-accent">{viewRow.number}</dd>
                  {viewData.title && (
                    <>
                      <dt className="text-text-muted">Title</dt>
                      <dd className="font-semibold">{viewData.title}</dd>
                    </>
                  )}
                  {viewRow.type === 'retail' && (
                    <>
                      <dt className="text-text-muted">Store</dt>
                      <dd className={`font-semibold ${storeColors[viewData.store || ''] || ''}`}>{viewData.store || '-'}</dd>
                      <dt className="text-text-muted">Branch</dt>
                      <dd>{viewData.branch || '-'}</dd>
                    </>
                  )}
                  {(tagValue(viewData.notes, 'ORDER_NUMBER') || viewData.order_number) && (
                    <>
                      <dt className="text-text-muted">Order Number</dt>
                      <dd>{viewData.order_number || tagValue(viewData.notes, 'ORDER_NUMBER')}</dd>
                    </>
                  )}
                  {viewData.priority && (
                    <>
                      <dt className="text-text-muted">Priority</dt>
                      <dd className="capitalize">{viewData.priority}</dd>
                    </>
                  )}
                  {(viewData.valid_until || viewData.due_date) && (
                    <>
                      <dt className="text-text-muted">{viewData.valid_until ? 'Valid Until' : 'Due Date'}</dt>
                      <dd>{formatDate(viewData.valid_until || viewData.due_date)}</dd>
                    </>
                  )}
                  <dt className="text-text-muted">Status</dt>
                  <dd><StatusBadge status={viewData.status || viewRow.status || 'completed'} /></dd>
                  <dt className="text-text-muted">Worker</dt>
                  <dd>{viewData.assigned_worker || tagValue(viewData.notes, 'WORKER') || '-'}</dd>
                  <dt className="text-text-muted">Completed</dt>
                  <dd>{viewRow.completed_at ? formatDate(viewRow.completed_at) : '-'}</dd>
                  <dt className="text-text-muted">Completed By</dt>
                  <dd>{viewRow.completed_by_name}</dd>
                </dl>
              </section>
            </div>

            <section>
              <h3 className="text-xs font-semibold uppercase text-text-muted mb-3">Line Items</h3>
              <div className="border border-border rounded-md overflow-x-auto">
                <table className="data-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Description</th><th>Size</th><th>Qty</th><th>Unit Price</th><th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((viewData.items || []) as any[])
                      .slice()
                      .sort((a, b) => numberValue(a.sort_order) - numberValue(b.sort_order))
                      .map((item, index) => {
                        const quantity = numberValue(item.quantity)
                        const unitPrice = numberValue(item.unit_price)
                        const lineTotal = numberValue(item.line_total ?? item.total) || quantity * unitPrice
                        const size = item.size || [item.width, item.height].filter(Boolean).join(' x ')
                        return (
                          <tr key={item.id || index}>
                            <td>
                              <p className="font-medium text-text-primary whitespace-pre-wrap">{itemDescription(item) || '-'}</p>
                              {itemNote(item) && <p className="text-xs text-text-muted mt-1 whitespace-pre-wrap">{itemNote(item)}</p>}
                            </td>
                            <td>{size || '-'}</td>
                            <td>{quantity}</td>
                            <td>{formatCurrency(unitPrice)}</td>
                            <td className="font-semibold">{formatCurrency(lineTotal)}</td>
                          </tr>
                        )
                      })}
                    {(!viewData.items || viewData.items.length === 0) && (
                      <tr><td colSpan={5} className="text-center text-text-muted py-8">No line items saved.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
              <section className="border border-border rounded-md p-4 min-h-[120px]">
                <h3 className="text-xs font-semibold uppercase text-text-muted mb-3">Description & Notes</h3>
                {viewData.description && <p className="text-sm whitespace-pre-wrap mb-3">{viewData.description}</p>}
                {visibleNotes(viewData.notes) ? (
                  <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{visibleNotes(viewData.notes)}</p>
                ) : !viewData.description ? (
                  <p className="text-sm text-text-muted">No notes saved.</p>
                ) : null}
              </section>

              <section className="border border-border rounded-md p-4 space-y-2 text-sm">
                <div className="flex justify-between text-text-secondary"><span>Subtotal</span><span>{formatCurrency(numberValue(viewData.subtotal))}</span></div>
                {numberValue(viewData.discount) > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Discount ({numberValue(viewData.discount)}%)</span>
                    <span>-{formatCurrency(numberValue(viewData.subtotal) * numberValue(viewData.discount) / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between text-text-secondary"><span>VAT ({numberValue(viewData.vat_rate)}%)</span><span>{formatCurrency(numberValue(viewData.vat_amount))}</span></div>
                <div className="flex justify-between text-base font-bold text-text-primary border-t border-border pt-2"><span>Total</span><span>{formatCurrency(numberValue(viewData.total))}</span></div>
                <div className="flex justify-between text-emerald-400"><span>Amount Paid</span><span>{formatCurrency(numberValue(viewData.amount_paid))}</span></div>
                <div className="flex justify-between items-center pt-1"><span className="text-text-muted">Payment</span><StatusBadge status={viewData.payment_status || viewRow.payment_status} /></div>
              </section>
            </div>
          </div>
        ) : (
          <div className="py-16 text-center text-text-muted">Could not load this completed job.</div>
        )}
      </Modal>
    </AppShell>
  )
}

