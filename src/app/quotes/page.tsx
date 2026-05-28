'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TableSkeleton } from '@/components/ui/Loading'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, formatCurrency, debounce } from '@/lib/utils'
import { generateQuotePDF } from '@/lib/pdf/generator'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  Plus, Lock, Unlock, Download, Mail, Printer,
  Trash2, ChevronRight, X, FileText
} from 'lucide-react'
import type { Quote, QuoteStatus, Client } from '@/types'

const STATUSES: QuoteStatus[] = ['draft', 'sent', 'approved', 'in_production', 'completed', 'cancelled']

const lineItemSchema = z.object({
  description: z.string().default(''),
  quantity: z.coerce.number().default(1),
  unit_price: z.coerce.number().default(0),
  size: z.string().optional().default(''),
})

const quoteSchema = z.object({
  client_id: z.string().optional(),
  client_name: z.string().min(1, 'Client name is required'),
  client_email: z.string().email().or(z.literal('').optional()),
  client_address: z.string().optional(),
  status: z.enum(['draft', 'sent', 'approved', 'in_production', 'completed', 'cancelled']),
  vat_rate: z.coerce.number().default(15),
  notes: z.string().optional(),
  valid_until: z.string().optional(),
  items: z.array(lineItemSchema),
})

type QuoteFormData = z.infer<typeof quoteSchema>

interface QuoteWithItems extends Quote {
  items: {
    id: string
    description: string
    quantity: number
    unit_price: number
    total: number
    size?: string
    sort_order: number
  }[]
}

function QuotesPageInner() {
  const { profile } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [quotes, setQuotes] = useState<QuoteWithItems[]>([])
  const [filtered, setFiltered] = useState<QuoteWithItems[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingQuote, setEditingQuote] = useState<QuoteWithItems | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<QuoteWithItems | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearch, setClientSearch] = useState('')

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      client_name: '', client_email: '', client_address: '',
      status: 'draft', vat_rate: 15, notes: '', valid_until: '',
      items: [{ description: '', quantity: 1, unit_price: 0, size: '' }],
    },
  })

  const { fields: itemFields, append: addItem, remove: removeItem } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')
  const watchVatRate = watch('vat_rate')

  // Calculate totals
  const subtotal = watchItems?.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unit_price) || 0), 0) || 0
  const vatAmount = subtotal * (watchVatRate / 100)
  const total = subtotal + vatAmount

  useEffect(() => { loadQuotes(); loadClients() }, [])

  // Handle URL params for opening specific quote
  useEffect(() => {
    const openId = searchParams.get('open')
    const isNew = searchParams.get('new')
    if (isNew) openCreate()
    else if (openId && quotes.length > 0) {
      const q = quotes.find(q => q.id === openId)
      if (q) openEdit(q)
    }
  }, [searchParams, quotes.length])

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('quotes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadQuotes)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const applyFilter = useCallback(
    debounce((list: QuoteWithItems[], q: string, status: string) => {
      let result = list.filter(quote => !quote.is_retail)
      if (status !== 'all') result = result.filter(quote => quote.status === status)
      if (q.trim()) {
        const ql = q.toLowerCase()
        result = result.filter(quote =>
          quote.quote_number.toLowerCase().includes(ql) ||
          (quote.client_name || '').toLowerCase().includes(ql)
        )
      }
      setFiltered(result)
    }, 120),
    []
  )

  useEffect(() => { applyFilter(quotes, search, statusFilter) }, [quotes, search, statusFilter])

  async function loadQuotes() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`*, items:quote_items(*)`)
        .eq('is_retail', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      setQuotes((data as QuoteWithItems[]) || [])
    } catch { toast.error('Failed to load quotes') }
    finally { setIsLoading(false) }
  }

  async function loadClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, name, company')
      .order('name')
    setClients((data as Client[]) || [])
  }

  function openCreate() {
    setEditingQuote(null)
    reset({
      client_name: '', client_email: '', client_address: '',
      status: 'draft', vat_rate: 15, notes: '', valid_until: '',
      items: [{ description: '', quantity: 1, unit_price: 0, size: '' }],
    })
    setIsFormOpen(true)
    router.push('/quotes')
  }

  function openEdit(quote: QuoteWithItems) {
    setEditingQuote(quote)
    reset({
      client_id: quote.client_id || undefined,
      client_name: quote.client_name || '',
      client_email: quote.client_email || '',
      client_address: quote.client_address || '',
      status: quote.status,
      vat_rate: quote.vat_rate,
      notes: quote.notes || '',
      valid_until: quote.valid_until || '',
      items: quote.items.length > 0
        ? quote.items.sort((a, b) => a.sort_order - b.sort_order).map(i => ({
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            size: i.size || '',
          }))
        : [{ description: '', quantity: 1, unit_price: 0, size: '' }],
    })
    setIsFormOpen(true)
  }

  async function onSubmit(data: QuoteFormData) {
    if (editingQuote?.is_locked && profile?.role !== 'admin') {
      toast.error('Quote is locked. Only admins can edit locked quotes.')
      return
    }
    setIsSaving(true)
    try {
      let quoteNumber = editingQuote?.quote_number
      if (!editingQuote) {
        const { data: numData } = await supabase.rpc('get_next_quote_number')
        quoteNumber = numData
      }

      const sub = data.items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
      const vat = sub * (data.vat_rate / 100)

      const quotePayload = {
        client_id: data.client_id || null,
        client_name: data.client_name,
        client_email: data.client_email || null,
        client_address: data.client_address || null,
        status: data.status,
        vat_rate: data.vat_rate,
        subtotal: sub,
        vat_amount: vat,
        total: sub + vat,
        notes: data.notes || null,
        valid_until: data.valid_until || null,
        is_retail: false,
        created_by: profile?.id || null,
      }

      let quoteId: string

      if (editingQuote) {
        const { error } = await supabase.from('quotes').update(quotePayload).eq('id', editingQuote.id)
        if (error) throw error
        quoteId = editingQuote.id
        await supabase.from('quote_items').delete().eq('quote_id', quoteId)
      } else {
        const { data: created, error } = await supabase
          .from('quotes')
          .insert({ ...quotePayload, quote_number: quoteNumber })
          .select()
          .single()
        if (error) throw error
        quoteId = created.id
      }

      if (data.items.length > 0) {
        await supabase.from('quote_items').insert(
          data.items.map((item, i) => ({
            quote_id: quoteId,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: item.quantity * item.unit_price,
            size: item.size || null,
            sort_order: i,
          }))
        )
      }

      await supabase.from('activity_logs').insert({
        entity_type: 'quote',
        entity_id: quoteId,
        action: editingQuote ? 'updated' : 'created',
        details: { quote_number: quoteNumber },
        performed_by: profile?.id,
      })

      toast.success(editingQuote ? 'Quote updated' : 'Quote created')
      setIsFormOpen(false)
      loadQuotes()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save quote')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleToggleLock(quote: QuoteWithItems) {
    if (profile?.role !== 'admin') {
      toast.error('Only admins can lock/unlock quotes')
      return
    }
    const { error } = await supabase
      .from('quotes')
      .update({ is_locked: !quote.is_locked })
      .eq('id', quote.id)
    if (error) toast.error('Failed to update lock')
    else {
      toast.success(quote.is_locked ? 'Quote unlocked' : 'Quote locked')
      loadQuotes()
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('quotes').delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast.success('Quote deleted')
      setDeleteTarget(null)
      loadQuotes()
    } catch (err: any) { toast.error(`Delete failed: ${err?.message || err}`) }
    finally { setIsDeleting(false) }
  }

  function downloadPDF(quote: QuoteWithItems) {
    const doc = generateQuotePDF(quote)
    doc.save(`${quote.quote_number}.pdf`)
    toast.success('PDF downloaded')
  }

  async function emailQuote(quote: QuoteWithItems) {
    toast.success('Preparing email...')
    // TODO: integrate with email API route
    const doc = generateQuotePDF(quote)
    doc.save(`${quote.quote_number}.pdf`)
    toast('PDF ready — please attach manually to email for now', { icon: '📧' })
  }

  const filteredClients = clients.filter(c =>
    clientSearch ? c.name.toLowerCase().includes(clientSearch.toLowerCase()) : true
  ).slice(0, 8)

  return (
    <AppShell>
      <PageHeader
        title="QUOTES"
        subtitle={`${filtered.length} quotes`}
        actions={
          <button onClick={openCreate} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" />
            New Quote
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search quotes..." className="max-w-xs" />
          <div className="flex gap-1">
            {['all', ...STATUSES].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === s ? 'bg-accent text-text-inverse' : 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border'
                }`}
              >
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          {isLoading ? <TableSkeleton rows={8} cols={6} /> : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-text-muted">No quotes found</p>
              <button onClick={openCreate} className="btn-primary btn-sm mt-4">Create first quote</button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Client</th>
                  <th>Status</th>
                  <th>Subtotal</th>
                  <th>VAT</th>
                  <th>Total</th>
                  <th>Date</th>
                  <th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(quote => (
                  <tr key={quote.id} onClick={() => openEdit(quote)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-accent font-semibold">{quote.quote_number}</span>
                        {quote.is_locked && <Lock className="w-3 h-3 text-text-muted" />}
                      </div>
                    </td>
                    <td className="font-medium">{quote.client_name || '—'}</td>
                    <td><StatusBadge status={quote.status} /></td>
                    <td className="text-text-secondary">{formatCurrency(quote.subtotal)}</td>
                    <td className="text-text-secondary">{formatCurrency(quote.vat_amount)}</td>
                    <td className="font-semibold">{formatCurrency(quote.total)}</td>
                    <td className="text-text-muted text-sm">{formatDate(quote.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => downloadPDF(quote)} className="btn-icon" title="Download PDF">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => emailQuote(quote)} className="btn-icon" title="Email">
                          <Mail className="w-3.5 h-3.5" />
                        </button>
                        {profile?.role === 'admin' && (
                          <>
                            <button onClick={() => handleToggleLock(quote)} className="btn-icon" title={quote.is_locked ? 'Unlock' : 'Lock'}>
                              {quote.is_locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setDeleteTarget(quote)} className="btn-icon text-red-400/50 hover:text-red-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quote Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingQuote ? `Edit — ${editingQuote.quote_number}` : 'New Quotation'}
        size="xl"
        preventOutsideClose={true}
        actions={
          editingQuote && (
            <div className="flex gap-2">
              <button onClick={() => downloadPDF(editingQuote)} className="btn-secondary btn-sm">
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
              <button onClick={() => emailQuote(editingQuote)} className="btn-secondary btn-sm">
                <Mail className="w-3.5 h-3.5" /> Email
              </button>
            </div>
          )
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Client section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Client Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="label">Client Name *</label>
                <input
                  {...register('client_name')}
                  className="input"
                  placeholder="Search or type client name..."
                  onChange={(e) => {
                    register('client_name').onChange(e)
                    setClientSearch(e.target.value)
                  }}
                />
                {clientSearch && filteredClients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-bg-elevated border border-border rounded-md shadow-elevated mt-1 max-h-48 overflow-y-auto">
                    {filteredClients.map(c => (
                      <div
                        key={c.id}
                        className="px-3 py-2.5 hover:bg-bg-hover cursor-pointer"
                        onMouseDown={() => {
                          setValue('client_id', c.id)
                          setValue('client_name', c.name)
                          setClientSearch('')
                        }}
                      >
                        <p className="text-sm text-text-primary">{c.name}</p>
                        {c.company && <p className="text-xs text-text-muted">{c.company}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {errors.client_name && <p className="form-error">{errors.client_name.message}</p>}
              </div>
              <div>
                <label className="label">Client Email</label>
                <input {...register('client_email')} type="email" className="input" placeholder="client@example.com" />
              </div>
            </div>
            <div>
              <label className="label">Client Address</label>
              <input {...register('client_address')} className="input" placeholder="Full address" />
            </div>
          </div>

          {/* Quote details */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Status</label>
              <select {...register('status')} className="input">
                {STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">VAT Rate (%)</label>
              <input
                {...register('vat_rate')}
                type="number" step="0.01" min="0" max="100"
                className="input"
              />
            </div>
            <div>
              <label className="label">Valid Until</label>
              <input {...register('valid_until')} type="date" className="input" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Line Items</h3>
              <button
                type="button"
                onClick={() => addItem({ description: '', quantity: 1, unit_price: 0, size: '' })}
                className="btn-ghost btn-sm text-accent"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 px-1">
              <div className="col-span-5">Description</div>
              <div className="col-span-2">Size</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Unit Price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1"></div>
            </div>

            <div className="space-y-2">
              {itemFields.map((field, i) => {
                const qty = Number(watchItems?.[i]?.quantity) || 0
                const price = Number(watchItems?.[i]?.unit_price) || 0
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <input {...register(`items.${i}.description`)} className="input" placeholder="Description" />
                    </div>
                    <div className="col-span-2">
                      <input {...register(`items.${i}.size`)} className="input" placeholder="e.g. 1200×600mm" />
                    </div>
                    <div className="col-span-1">
                      <input {...register(`items.${i}.quantity`)} type="number" step="any" min="0" className="input" />
                    </div>
                    <div className="col-span-2">
                      <input {...register(`items.${i}.unit_price`)} type="number" step="0.01" min="0" className="input" />
                    </div>
                    <div className="col-span-1 text-right text-sm font-semibold text-text-primary">
                      {formatCurrency(qty * price)}
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

            {/* Totals */}
            <div className="mt-4 border-t border-border pt-4 space-y-1.5">
              <div className="flex justify-between text-sm text-text-secondary">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-text-secondary">
                <span>VAT ({watchVatRate}%)</span>
                <span>{formatCurrency(vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-text-primary border-t border-border pt-1.5">
                <span>TOTAL</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input min-h-[80px] resize-none" placeholder="Additional notes..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSaving} className="btn-primary flex-1">
              {isSaving ? <><span className="spinner w-4 h-4" /> Saving...</> : editingQuote ? 'Update Quote' : 'Create Quote'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Quote"
        message={`Delete quote ${deleteTarget?.quote_number}? This cannot be undone.`}
        confirmLabel="Delete"
        danger={true}
        isLoading={isDeleting}
      />
    </AppShell>
  )
}

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuotesPageInner />
    </Suspense>
  )
}
