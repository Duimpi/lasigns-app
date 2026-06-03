'use client'
import { Suspense, useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TableSkeleton } from '@/components/ui/Loading'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, formatCurrency, debounce, downloadBlob } from '@/lib/utils'
import { generateJobCardPDF, generateTwoJobCardsPDF } from '@/lib/pdf/generator'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Plus, Download, Mail, Printer, Trash2, X, Briefcase, CheckSquare, Square, Layers, MessageSquare } from 'lucide-react'
import type { JobCard, JobCardStatus, Priority, Worker, Client, Quote } from '@/types'

const STATUSES: JobCardStatus[] = ['pending', 'designing', 'printing', 'installation', 'completed', 'delivered']
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent']
const WORKERS: Worker[] = ['Nicole', 'Geraldo', 'Bets-Mari']
const VAT_RATE = 15

const lineItemSchema = z.object({
  description: z.string().default(''),
  quantity: z.coerce.number().default(1),
  unit_price: z.coerce.number().default(0),
  width: z.string().optional().default(''),
  height: z.string().optional().default(''),
})

const jobSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  client_id: z.string().optional(),
  client_name: z.string().optional().default(''),
  status: z.enum(['pending', 'designing', 'printing', 'installation', 'completed', 'delivered']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  assigned_worker: z.string().optional().default(''),
  due_date: z.string().optional().default(''),
  linked_quote_id: z.string().optional(),
  date_completed: z.string().optional().default(''),
  items: z.array(lineItemSchema),
})

type JobFormData = z.infer<typeof jobSchema>

interface JobWithItems extends Omit<JobCard, 'items'> {
  items: { id: string; description: string; quantity: number; unit_price: number; total: number; size?: string; sort_order: number }[]
  client?: Client & { phones?: { phone: string }[]; emails?: { email: string }[] }
}

function JobCardsPageInner() {
  const { profile } = useAuthStore()
  // @ts-ignore
  const searchParams = useSearchParams()
  const router = useRouter()

  const [jobs, setJobs] = useState<JobWithItems[]>([])
  const [filtered, setFiltered] = useState<JobWithItems[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [workerFilter, setWorkerFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<JobWithItems | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<JobWithItems | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedForPrint, setSelectedForPrint] = useState<string[]>([])
  const [printSelectMode, setPrintSelectMode] = useState(false)
  const [jobComments, setJobComments] = useState<{ id: string; content: string; created_at: string; author: { full_name: string } | null }[]>([])
  const [newComment, setNewComment] = useState('')
  const [isSendingComment, setIsSendingComment] = useState(false)

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<JobFormData>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      title: '', description: '', notes: '', client_name: '',
      status: 'pending', priority: 'normal', assigned_worker: '',
      due_date: '', date_completed: '',
      items: [{ description: '', quantity: 1, unit_price: 0, width: '', height: '' }],
    },
  })

  const { fields: itemFields, append: addItem, remove: removeItem } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')

  const subtotal = watchItems?.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unit_price) || 0), 0) || 0
  const vatAmount = subtotal * (VAT_RATE / 100)
  const total = subtotal + vatAmount

  useEffect(() => { loadJobs(); loadClients(); loadQuotes() }, [])

  useEffect(() => {
    const openId = searchParams.get('open')
    const isNew = searchParams.get('new')
    if (isNew) openCreate()
    else if (openId && jobs.length > 0) {
      const j = jobs.find(j => j.id === openId)
      if (j) openEdit(j)
    }
  }, [searchParams, jobs.length])

  useEffect(() => {
    const channel = supabase
      .channel('job-cards-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_cards' }, loadJobs)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_card_items' }, loadJobs)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const applyFilter = useCallback(
    debounce((list: JobWithItems[], q: string, status: string, worker: string) => {
      let result = list.filter(j => !j.is_retail)
      if (status !== 'all') result = result.filter(j => j.status === status)
      if (worker !== 'all') result = result.filter(j => j.assigned_worker === worker)
      if (q.trim()) {
        const ql = q.toLowerCase()
        result = result.filter(j =>
          j.title.toLowerCase().includes(ql) ||
          j.job_number.toLowerCase().includes(ql) ||
          (j.client_name || '').toLowerCase().includes(ql)
        )
      }
      result.sort((a, b) => {
        const po = { urgent: 0, high: 1, normal: 2, low: 3 }
        const pa = po[a.priority as keyof typeof po] ?? 2
        const pb = po[b.priority as keyof typeof po] ?? 2
        if (pa !== pb) return pa - pb
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })
      setFiltered(result)
    }, 120), []
  )

  useEffect(() => { applyFilter(jobs, search, statusFilter, workerFilter) }, [jobs, search, statusFilter, workerFilter])

  async function loadJobs() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('job_cards')
        .select(`*, items:job_card_items(*), client:clients(*, phones:client_phones(*), emails:client_emails(*))`)
        .eq('is_retail', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      setJobs((data as JobWithItems[]) || [])
    } catch { toast.error('Failed to load job cards') }
    finally { setIsLoading(false) }
  }

  async function loadClients() {
    const { data } = await supabase.from('clients').select('id, name, company').order('name')
    setClients((data as Client[]) || [])
  }

  async function loadQuotes() {
    const { data } = await supabase
      .from('quotes').select('id, quote_number, client_name, total')
      .eq('is_retail', false).in('status', ['approved', 'in_production'])
      .order('created_at', { ascending: false })
    setQuotes((data as Quote[]) || [])
  }

  async function loadComments(jobId: string) {
    const { data } = await supabase
      .from('comments').select('id, content, created_at, author:profiles!author_id(full_name)')
      .eq('job_card_id', jobId).order('created_at', { ascending: true })
    setJobComments((data as any) || [])
  }

  function openCreate() {
    setEditingJob(null)
    setJobComments([])
    reset({
      title: '', description: '', notes: '', client_name: '',
      status: 'pending', priority: 'normal', assigned_worker: '',
      due_date: '', date_completed: '',
      items: [{ description: '', quantity: 1, unit_price: 0, width: '', height: '' }],
    })
    setIsFormOpen(true)
    router.push('/job-cards')
  }

  function openEdit(job: JobWithItems) {
    setEditingJob(job)
    loadComments(job.id)
    reset({
      title: job.title,
      description: job.description || '',
      notes: job.notes || '',
      client_id: job.client_id || undefined,
      client_name: job.client_name || '',
      status: job.status,
      priority: job.priority,
      assigned_worker: job.assigned_worker || '',
      due_date: job.due_date || '',
      linked_quote_id: job.linked_quote_id || undefined,
      date_completed: job.date_completed || '',
      items: job.items.length > 0
        ? job.items.sort((a, b) => a.sort_order - b.sort_order).map(i => {
            const parts = (i.size || '').split('x')
            return {
              description: i.description,
              quantity: i.quantity,
              unit_price: i.unit_price,
              width: parts[0] || '',
              height: parts[1] || '',
            }
          })
        : [{ description: '', quantity: 1, unit_price: 0, width: '', height: '' }],
    })
    setIsFormOpen(true)
  }

  async function onSubmit(data: JobFormData) {
    setIsSaving(true)
    try {
      let jobNumber = editingJob?.job_number
      if (!editingJob) {
        const { data: numData, error: numErr } = await supabase.rpc('get_next_job_number')
        if (numErr || !numData) {
          // Fallback: use timestamp-based number
          const year = new Date().getFullYear()
          const rand = Math.floor(Math.random() * 9000) + 1000
          jobNumber = `JC-${rand}-${year}`
        } else {
          jobNumber = numData
        }
      }

      const sub = data.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
      const vat = sub * (VAT_RATE / 100)

      const payload: Record<string, unknown> = {
        title: data.title,
        description: data.description || null,
        notes: data.notes || null,
        client_id: data.client_id || null,
        client_name: data.client_name || null,
        status: data.status,
        priority: data.priority,
        assigned_worker: data.assigned_worker || null,
        due_date: data.due_date || null,
        linked_quote_id: data.linked_quote_id || null,
        is_retail: false,
        sales_rep: null,
        date_completed: data.date_completed || null,
        vat_rate: VAT_RATE,
        subtotal: sub,
        vat_amount: vat,
        total: sub + vat,
        created_by: profile?.id || null,
      }

      let jobId: string

      if (editingJob) {
        const { error } = await supabase.from('job_cards').update(payload).eq('id', editingJob.id)
        if (error) throw new Error(error.message)
        jobId = editingJob.id
        await supabase.from('job_card_items').delete().eq('job_card_id', jobId)
      } else {
        payload.job_number = jobNumber
        const { data: created, error } = await supabase.from('job_cards').insert(payload).select().single()
        if (error) throw new Error(error.message)
        jobId = created.id
      }

      const validItems = data.items.filter(item => item.description.trim())
      if (validItems.length > 0) {
        const itemsToInsert = validItems.map((item, i) => ({
          job_card_id: jobId,
          description: item.description,
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          total: (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
          size: item.width && item.height ? `${item.width}x${item.height}` : (item.width || item.height || null),
          sort_order: i,
        }))
        const { error: itemErr } = await supabase.from('job_card_items').insert(itemsToInsert)
        if (itemErr) throw new Error(itemErr.message)
      }

      await supabase.from('activity_logs').insert({
        entity_type: 'job_card',
        entity_id: jobId,
        action: editingJob ? 'updated' : 'created',
        details: { title: data.title, job_number: jobNumber },
        performed_by: profile?.id,
      })

      // Notify admins if job completed/delivered
      if (['completed', 'delivered'].includes(data.status) && profile) {
        const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
        if (admins) {
          const worker = data.assigned_worker || profile.full_name
          await supabase.from('notifications').insert(admins.map((a: any) => ({
            recipient_id: a.id, sender_id: profile.id, type: 'job_completed',
            title: `Job ${data.status === 'delivered' ? 'Delivered' : 'Completed'}`,
            message: `${jobNumber} — ${data.title} marked as ${data.status} by ${worker}`,
            entity_type: 'job_card', entity_id: jobId,
          })))
        }
      }

      toast.success(editingJob ? 'Job card updated' : 'Job card created')
      setIsFormOpen(false)
      loadJobs()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err)
      toast.error(`Save failed: ${msg}`)
    } finally { setIsSaving(false) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('job_cards').delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast.success('Job card deleted')
      setDeleteTarget(null)
      loadJobs()
    } catch (err: any) { toast.error(`Delete failed: ${err?.message || err}`) }
    finally { setIsDeleting(false) }
  }

  async function duplicateJob(job: JobCard) {
    const { data: original } = await supabase
      .from('job_cards')
      .select('*, items:job_card_items(*)')
      .eq('id', job.id).single()
    if (!original) return

    const year = new Date().getFullYear()
    const { data: numData } = await supabase.rpc('get_next_job_number', { year_param: year })
    const jobNumber = numData || `LA-J${Date.now()}`

    const { data: newJob, error } = await supabase.from('job_cards').insert({
      job_number: jobNumber,
      title: `${original.title} (Copy)`,
      client_id: original.client_id,
      client_name: original.client_name,
      description: original.description,
      notes: original.notes,
      status: 'pending',
      priority: original.priority,
      assigned_worker: original.assigned_worker,
      is_retail: original.is_retail,
      subtotal: original.subtotal,
      vat_rate: original.vat_rate,
      vat_amount: original.vat_amount,
      total: original.total,
      created_by: profile?.id,
    }).select().single()

    if (error) { toast.error('Failed to duplicate'); return }

    // Copy items
    if (original.items?.length > 0) {
      await supabase.from('job_card_items').insert(
        original.items.map((item: any) => ({
          job_card_id: newJob.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total: item.total,
          width: item.width,
          height: item.height,
        }))
      )
    }

    toast.success('Job card duplicated!')
    loadJobs()
  }

  async function sendComment() {
    if (!newComment.trim() || !profile || !editingJob) return
    setIsSendingComment(true)
    try {
      await supabase.from('comments').insert({
        job_card_id: editingJob.id,
        author_id: profile.id,
        content: newComment.trim(),
      })
      setNewComment('')
      loadComments(editingJob.id)
    } finally { setIsSendingComment(false) }
  }

  function downloadPDF(job: JobWithItems) {
    const doc = generateJobCardPDF(job as any)
    doc.save(`${job.job_number}.pdf`)
    toast.success('Job card downloaded')
  }

  function printJob(job: JobWithItems) {
    const doc = generateJobCardPDF(job as any)
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    win?.print()
  }

  async function emailJobCard(job: JobWithItems) {
    const doc = generateJobCardPDF(job as any)
    const pdfBlob = doc.output('blob')
    downloadBlob(pdfBlob, `${job.job_number}.pdf`)
    toast.success(`PDF downloaded — attach to email and send to baganiholdings@gmail.com`, { duration: 6000 })
  }

  function togglePrintSelect(jobId: string) {
    setSelectedForPrint(prev => {
      if (prev.includes(jobId)) return prev.filter(id => id !== jobId)
      if (prev.length >= 2) { toast.error('Select max 2 jobs'); return prev }
      return [...prev, jobId]
    })
  }

  function printTwoJobs() {
    if (selectedForPrint.length !== 2) { toast.error('Select exactly 2 jobs'); return }
    const job1 = jobs.find(j => j.id === selectedForPrint[0])
    const job2 = jobs.find(j => j.id === selectedForPrint[1])
    if (!job1 || !job2) return
    const doc = generateTwoJobCardsPDF(job1 as any, job2 as any)
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')?.print()
    setPrintSelectMode(false)
    setSelectedForPrint([])
  }

  const filteredClients = clients.filter(c =>
    clientSearch ? c.name.toLowerCase().includes(clientSearch.toLowerCase()) : true
  ).slice(0, 8)

  return (
    <AppShell>
      <PageHeader
        title="JOB CARDS"
        subtitle={`${filtered.length} job cards`}
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => { setPrintSelectMode(!printSelectMode); setSelectedForPrint([]) }}
              className={`btn-sm ${printSelectMode ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Layers className="w-4 h-4" />
              {printSelectMode ? 'Cancel' : 'Print 2 Jobs'}
            </button>
            {printSelectMode && selectedForPrint.length === 2 && (
              <button onClick={printTwoJobs} className="btn-primary btn-sm">
                <Printer className="w-4 h-4" /> Print ({selectedForPrint.length}/2)
              </button>
            )}
            <button onClick={openCreate} className="btn-primary btn-sm">
              <Plus className="w-4 h-4" /> New Job Card
            </button>
          </div>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search job cards..." className="max-w-xs" />
          <div className="flex gap-1 flex-wrap">
            {['all', ...STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === s ? 'bg-accent text-text-inverse' : 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border'
                }`}
              >{s === 'all' ? 'All' : s}</button>
            ))}
          </div>
          <select value={workerFilter} onChange={(e) => setWorkerFilter(e.target.value)} className="input w-auto text-sm">
            <option value="all">All Workers</option>
            {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>

        {printSelectMode && (
          <div className="bg-accent-muted border border-accent/30 rounded-lg px-4 py-3 text-sm text-accent flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Select 2 job cards to print them together on one A4 page.
          </div>
        )}

        <div className="card overflow-hidden">
          {isLoading ? <TableSkeleton rows={8} cols={7} /> : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Briefcase className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-text-muted">No job cards found</p>
              <button onClick={openCreate} className="btn-primary btn-sm mt-4">Create first job card</button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  {printSelectMode && <th className="w-8"></th>}
                  <th>Job #</th><th>Title</th><th>Client</th><th>Worker</th>
                  <th>Priority</th><th>Status</th><th>Due</th><th className="w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(job => {
                  const isSelected = selectedForPrint.includes(job.id)
                  return (
                    <tr key={job.id} onClick={() => printSelectMode ? togglePrintSelect(job.id) : openEdit(job)}
                      className={isSelected ? 'bg-accent-muted border-l-2 border-accent' : ''}
                    >
                      {printSelectMode && (
                        <td onClick={e => { e.stopPropagation(); togglePrintSelect(job.id) }}>
                          {isSelected ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4 text-text-muted" />}
                        </td>
                      )}
                      <td><span className="font-mono text-accent font-semibold text-sm">{job.job_number}</span></td>
                      <td><div className="font-medium max-w-[180px] truncate">{job.title}</div></td>
                      <td className="text-text-secondary">{job.client_name || '—'}</td>
                      <td className="text-text-secondary text-sm">{job.assigned_worker || <span className="text-text-muted">—</span>}</td>
                      <td><StatusBadge status={job.priority} type="priority" /></td>
                      <td><StatusBadge status={job.status} /></td>
                      <td className="text-text-muted text-sm">
                        {job.due_date ? (
                          <span className={new Date(job.due_date) < new Date() && !['completed','delivered'].includes(job.status) ? 'text-red-400' : ''}>
                            {formatDate(job.due_date)}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button onClick={() => downloadPDF(job)} className="btn-icon" title="Download"><Download className="w-3.5 h-3.5" /></button>
                          <button onClick={() => printJob(job)} className="btn-icon" title="Print"><Printer className="w-3.5 h-3.5" /></button>
                          <button onClick={() => emailJobCard(job)} className="btn-icon" title="Email"><Mail className="w-3.5 h-3.5" /></button>
                          {profile?.role === 'admin' && (
                            <button onClick={() => setDeleteTarget(job)} className="btn-icon text-red-400/50 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Job Card Form — ALL IN ONE, NO TABS */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingJob ? `Edit — ${editingJob.job_number}` : 'New Job Card'}
        size="xl"
        preventOutsideClose={true}
        actions={editingJob && (
          <div className="flex gap-2">
            <button onClick={() => downloadPDF(editingJob)} className="btn-secondary btn-sm"><Download className="w-3.5 h-3.5" /> PDF</button>
            <button onClick={() => printJob(editingJob)} className="btn-secondary btn-sm"><Printer className="w-3.5 h-3.5" /> Print</button>
            <button onClick={() => emailJobCard(editingJob)} className="btn-secondary btn-sm"><Mail className="w-3.5 h-3.5" /> Email</button>
          </div>
        )}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-6">

            {/* ── SECTION 1: JOB INFO ── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Job Details</p>
              <div className="space-y-4">
                <div>
                  <label className="label">Job Title *</label>
                  <input {...register('title')} className="input" placeholder="e.g. Vehicle Wrap — Toyota Hilux" />
                  {errors.title && <p className="form-error">{errors.title.message}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="relative">
                    <label className="label">Client</label>
                    <input {...register('client_name')} className="input" placeholder="Search client..."
                      onChange={(e) => { register('client_name').onChange(e); setClientSearch(e.target.value) }}
                    />
                    {clientSearch && filteredClients.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-20 bg-bg-elevated border border-border rounded-md shadow-elevated mt-1 max-h-48 overflow-y-auto">
                        {filteredClients.map(c => (
                          <div key={c.id} className="px-3 py-2.5 hover:bg-bg-hover cursor-pointer"
                            onMouseDown={() => { setValue('client_id', c.id); setValue('client_name', c.name); setClientSearch('') }}>
                            <p className="text-sm text-text-primary">{c.name}</p>
                            {c.company && <p className="text-xs text-text-muted">{c.company}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="label">Linked Quote</label>
                    <select {...register('linked_quote_id')} className="input">
                      <option value="">— None —</option>
                      {quotes.map(q => <option key={q.id} value={q.id}>{q.quote_number} — {q.client_name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="label">Status</label>
                    <select {...register('status')} className="input">
                      {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Priority</label>
                    <select {...register('priority')} className="input">
                      {PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Assigned Worker</label>
                    <select {...register('assigned_worker')} className="input">
                      <option value="">— Unassigned —</option>
                      {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div><label className="label">Due Date</label><input {...register('due_date')} type="date" className="input" /></div>
                  <div><label className="label">Date Completed</label><input {...register('date_completed')} type="date" className="input" /></div>
                </div>

                <div><label className="label">Description</label><textarea {...register('description')} className="input min-h-[70px] resize-none" /></div>
                <div><label className="label">Notes</label><textarea {...register('notes')} className="input min-h-[60px] resize-none" /></div>
              </div>
            </div>

            {/* ── SECTION 2: LINE ITEMS ── */}
            <div className="border-t border-border pt-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Line Items</p>
                <button type="button" onClick={() => addItem({ description: '', quantity: 1, unit_price: 0, width: '', height: '' })}
                  className="btn-ghost btn-sm text-accent">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>

              <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted px-1 mb-2">
                <div className="col-span-4">Description</div>
                <div className="col-span-3">Size (W × H)</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-1"></div>
              </div>

              <div className="space-y-2">
                {itemFields.map((field, i) => {
                  const qty = Number(watchItems?.[i]?.quantity) || 0
                  const price = Number(watchItems?.[i]?.unit_price) || 0
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <input {...register(`items.${i}.description`)} className="input" placeholder="Description" />
                      </div>
                      <div className="col-span-3 flex items-center gap-1">
                        <input {...register(`items.${i}.width`)} className="input" placeholder="W" />
                        <span className="text-text-muted text-sm font-bold shrink-0">×</span>
                        <input {...register(`items.${i}.height`)} className="input" placeholder="H" />
                      </div>
                      <div className="col-span-2">
                        <input {...register(`items.${i}.quantity`)} type="number" step="any" min="0" className="input" />
                      </div>
                      <div className="col-span-2">
                        <input {...register(`items.${i}.unit_price`)} type="number" step="0.01" min="0" className="input" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {itemFields.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} className="btn-icon text-red-400/50 hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-border pt-4 mt-3 space-y-1.5">
                <div className="flex justify-between text-sm text-text-secondary"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-sm text-text-secondary"><span>VAT (15%)</span><span>{formatCurrency(vatAmount)}</span></div>
                <div className="flex justify-between text-base font-bold text-text-primary border-t border-border pt-1.5"><span>TOTAL</span><span>{formatCurrency(total)}</span></div>
              </div>
            </div>

            {/* ── SECTION 3: COMMENTS ── */}
            {editingJob && (
              <div className="border-t border-border pt-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3 flex items-center gap-2">
                  <MessageSquare className="w-3.5 h-3.5" /> Comments
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
                  {jobComments.length === 0 ? (
                    <p className="text-text-muted text-sm italic">No comments yet</p>
                  ) : (
                    jobComments.map(c => (
                      <div key={c.id} className="bg-bg-elevated rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-accent">{c.author?.full_name || 'Unknown'}</span>
                          <span className="text-xs text-text-muted">{formatDate(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-text-primary">{c.content}</p>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <input value={newComment} onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment() } }}
                    className="input flex-1" placeholder="Add a comment..." />
                  <button type="button" onClick={sendComment} disabled={isSendingComment || !newComment.trim()} className="btn-primary">
                    {isSendingComment ? <span className="spinner w-4 h-4" /> : 'Send'}
                  </button>
                </div>
              </div>
            )}

            {/* ── SAVE BUTTON ── */}
            <div className="flex gap-3 pt-2 border-t border-border">
              <button type="button" onClick={() => setIsFormOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={isSaving} className="btn-primary flex-1">
                {isSaving ? <><span className="spinner w-4 h-4" /> Saving...</> : editingJob ? 'Update Job Card' : 'Create Job Card'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Job Card"
        message={`Delete "${deleteTarget?.job_number} — ${deleteTarget?.title}"?`}
        confirmLabel="Delete" danger={true} isLoading={isDeleting}
      />
    </AppShell>
  )
}

export default function JobCardsPage() {
  return (
    <Suspense fallback={null}>
      <JobCardsPageInner />
    </Suspense>
  )
}
