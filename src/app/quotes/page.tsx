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
import { generateQuotePDF, generateQuoteJobCardPDF } from '@/lib/pdf/generator'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { PriceAutocomplete } from '@/components/ui/PriceAutocomplete'
import { ensureClientRecord, normalizeClientPhone } from '@/lib/clients/ensureClientRecord'
import {
  Plus, Lock, Unlock, Download, Mail, Printer,
  Trash2, X, FileText, CheckCircle2, CheckSquare, Square, Layers
} from 'lucide-react'
import type { Quote, QuoteStatus, Client, Worker } from '@/types'

const STATUSES: QuoteStatus[] = ['draft', 'sent', 'approved', 'in_production', 'completed', 'cancelled']
const ACTIVE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'approved', 'in_production', 'cancelled']
const WORKERS: Worker[] = ['Nicole', 'Geraldo', 'Bets-Mari']
const QUOTE_WORKER_RE = /\[LA_WORKER:([^\]]+)\]/i
const QUOTE_CLIENT_NUMBER_RE = /\[LA_CLIENT_NUMBER:([^\]]+)\]/i
const COLLECTION_PENDING_TAG = '[LA_COLLECTION_PENDING]'
const COLLECTION_COLLECTED_TAG = '[LA_COLLECTION_COLLECTED]'
const DELIVERY_PENDING_TAG = '[LA_DELIVERY_PENDING]'
const DELIVERY_DELIVERED_TAG = '[LA_DELIVERY_DELIVERED]'
const COURIER_PENDING_TAG = '[LA_COURIER_PENDING]'
const COURIER_COURIERED_TAG = '[LA_COURIER_COURIERED]'
const INSTALL_PENDING_TAG = '[LA_INSTALL_PENDING]'
const INSTALL_DONE_TAG = '[LA_INSTALL_DONE]'
const RECEPTION_APPROVED_TAG = '[LA_RECEPTION_APPROVED]'
const RECEPTION_QUOTE_TAG_RE = /\[LA_RECEPTION_(APPROVED_AT|APPROVED_BY|APPROVED_NOTE|PAYMENT_NOTE|PAYMENT_AMOUNT|PAYMENT_METHOD|PAYMENT_AT|PAYMENT_BY):[^\]]*\]/gi
const FULFILLMENT_TAGS = [
  COLLECTION_PENDING_TAG,
  COLLECTION_COLLECTED_TAG,
  DELIVERY_PENDING_TAG,
  DELIVERY_DELIVERED_TAG,
  COURIER_PENDING_TAG,
  COURIER_COURIERED_TAG,
  INSTALL_PENDING_TAG,
  INSTALL_DONE_TAG,
]

const lineItemSchema = z.object({
  description: z.string().default(''),
  quantity: z.coerce.number().default(1),
  unit_price: z.coerce.number().default(0),
  width: z.string().optional().default(''),
  height: z.string().optional().default(''),
  priceType: z.enum(['psm', 'fixed', 'manual']).default('manual'),
})

const quoteSchema = z.object({
  client_id: z.string().optional(),
  client_name: z.string().min(1, 'Client name is required'),
  client_email: z.string().email().or(z.literal('').optional()),
  client_phone: z.string().optional().default(''),
  client_address: z.string().optional(),
  order_number: z.string().optional().default(''),
  status: z.enum(['draft', 'sent', 'approved', 'in_production', 'completed', 'cancelled']),
  vat_rate: z.coerce.number().default(15),
  notes: z.string().optional(),
  valid_until: z.string().optional(),
  assigned_worker: z.string().optional().default(''),
  discount: z.coerce.number().default(0),
  fulfillment_method: z.enum(['none', 'collection', 'delivery', 'courier', 'installation']).default('none'),
  delivery_name: z.string().optional().default(''),
  delivery_number: z.string().optional().default(''),
  delivery_address: z.string().optional().default(''),
  courier_company: z.string().optional().default(''),
  courier_address: z.string().optional().default(''),
  courier_contact_person: z.string().optional().default(''),
  courier_payment: z.enum(['pay_on_delivery', 'we_pay', 'account']).default('pay_on_delivery'),
  courier_notes: z.string().optional().default(''),
  install_address: z.string().optional().default(''),
  install_contact_person: z.string().optional().default(''),
  install_contact_number: z.string().optional().default(''),
  install_preferred_date: z.string().optional().default(''),
  install_notes: z.string().optional().default(''),
  items: z.array(lineItemSchema),
})

type QuoteFormData = z.infer<typeof quoteSchema>

interface QuoteWithItems extends Quote {
  items: Quote['items']
  assigned_worker?: Worker | ''
  client_phone?: string | null
  raw_notes?: string | null
  reception_status?: string
  reception_note?: string
  reception_amount?: string
  reception_method?: string
}

function getQuoteWorker(notes?: string | null): Worker | '' {
  const match = String(notes || '').match(QUOTE_WORKER_RE)
  const worker = match?.[1]?.trim()
  return worker && WORKERS.includes(worker as Worker) ? worker as Worker : ''
}

function getQuoteClientNumber(notes?: string | null) {
  return String(notes || '').match(QUOTE_CLIENT_NUMBER_RE)?.[1]?.trim() || ''
}

function cleanClientNumber(phone?: string | null) {
  return normalizeClientPhone(phone)
}

function tagValue(notes: string | null | undefined, key: string) {
  const match = String(notes || '').match(new RegExp('\\[LA_' + key + ':([^\\]]*)\\]', 'i'))
  if (!match?.[1]) return ''
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

function makeTag(key: string, value?: string | null) {
  const clean = String(value || '').trim()
  return clean ? '[LA_' + key + ':' + encodeURIComponent(clean) + ']' : ''
}

function stripFulfillmentTags(notes?: string | null) {
  let clean = String(notes || '')
  FULFILLMENT_TAGS.forEach(tag => { clean = clean.replaceAll(tag, '') })
  clean = clean
    .replace(/\[LA_DELIVERY_(NAME|NUMBER|ADDRESS):[^\]]*\]/gi, '')
    .replace(/\[LA_COURIER_(COMPANY|ADDRESS|CONTACT|PAYMENT|NOTES):[^\]]*\]/gi, '')
    .replace(/\[LA_INSTALL_(ADDRESS|CONTACT|NUMBER|DATE|NOTES):[^\]]*\]/gi, '')
    .replace(/(Collected|Delivered|Couriered|Installed \/ Applied) on .+$/gm, '')
  return clean.trim()
}

function getFulfillmentDetails(notes?: string | null) {
  const text = String(notes || '')
  const method = text.includes(INSTALL_PENDING_TAG) || text.includes(INSTALL_DONE_TAG)
    ? 'installation'
    : text.includes(DELIVERY_PENDING_TAG) || text.includes(DELIVERY_DELIVERED_TAG)
    ? 'delivery'
    : text.includes(COURIER_PENDING_TAG) || text.includes(COURIER_COURIERED_TAG)
      ? 'courier'
      : text.includes(COLLECTION_PENDING_TAG) || text.includes(COLLECTION_COLLECTED_TAG)
        ? 'collection'
        : 'none'

  return {
    method,
    delivery_name: tagValue(text, 'DELIVERY_NAME'),
    delivery_number: tagValue(text, 'DELIVERY_NUMBER'),
    delivery_address: tagValue(text, 'DELIVERY_ADDRESS'),
    courier_company: tagValue(text, 'COURIER_COMPANY'),
    courier_address: tagValue(text, 'COURIER_ADDRESS'),
    courier_contact_person: tagValue(text, 'COURIER_CONTACT'),
    courier_payment: tagValue(text, 'COURIER_PAYMENT') || 'pay_on_delivery',
    courier_notes: tagValue(text, 'COURIER_NOTES'),
    install_address: tagValue(text, 'INSTALL_ADDRESS'),
    install_contact_person: tagValue(text, 'INSTALL_CONTACT'),
    install_contact_number: tagValue(text, 'INSTALL_NUMBER'),
    install_preferred_date: tagValue(text, 'INSTALL_DATE'),
    install_notes: tagValue(text, 'INSTALL_NOTES'),
  }
}

function fulfillmentTagsForQuote(data: QuoteFormData) {
  const method = data.fulfillment_method || 'none'
  const tags: string[] = []

  if (method === 'collection') tags.push(COLLECTION_PENDING_TAG)
  if (method === 'delivery') {
    tags.push(
      DELIVERY_PENDING_TAG,
      makeTag('DELIVERY_NAME', data.delivery_name),
      makeTag('DELIVERY_NUMBER', data.delivery_number),
      makeTag('DELIVERY_ADDRESS', data.delivery_address),
    )
  }
  if (method === 'courier') {
    tags.push(
      COURIER_PENDING_TAG,
      makeTag('COURIER_COMPANY', data.courier_company),
      makeTag('COURIER_ADDRESS', data.courier_address),
      makeTag('COURIER_CONTACT', data.courier_contact_person),
      makeTag('COURIER_PAYMENT', data.courier_payment),
      makeTag('COURIER_NOTES', data.courier_notes),
    )
  }
  if (method === 'installation') {
    tags.push(
      INSTALL_PENDING_TAG,
      makeTag('INSTALL_ADDRESS', data.install_address),
      makeTag('INSTALL_CONTACT', data.install_contact_person),
      makeTag('INSTALL_NUMBER', data.install_contact_number),
      makeTag('INSTALL_DATE', data.install_preferred_date),
      makeTag('INSTALL_NOTES', data.install_notes),
    )
  }

  return tags.filter(Boolean)
}

function stripQuoteHiddenTags(notes?: string | null) {
  return stripFulfillmentTags(notes)
    .replace(QUOTE_WORKER_RE, '')
    .replace(QUOTE_CLIENT_NUMBER_RE, '')
    .replace(/\[LA_ORDER_NUMBER:[^\]]*\]/gi, '')
    .replace(RECEPTION_APPROVED_TAG, '')
    .replace(RECEPTION_QUOTE_TAG_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripQuoteWorkerTag(notes?: string | null) {
  return stripQuoteHiddenTags(notes)
}

function getReceptionQuoteTags(notes?: string | null) {
  const text = String(notes || '')
  return [
    text.includes(RECEPTION_APPROVED_TAG) ? RECEPTION_APPROVED_TAG : '',
    ...Array.from(text.matchAll(new RegExp(RECEPTION_QUOTE_TAG_RE.source, 'gi'))).map(match => match[0]),
  ].filter(Boolean)
}

function notesWithQuoteMeta(notes?: string | null, worker?: string | null, clientNumber?: string | null, data?: QuoteFormData, originalNotes?: string | null) {
  const cleanNotes = stripQuoteHiddenTags(notes)
  const cleanNumber = cleanClientNumber(clientNumber)
  return [
    cleanNotes,
    worker ? '[LA_WORKER:' + worker + ']' : '',
    cleanNumber ? '[LA_CLIENT_NUMBER:' + cleanNumber + ']' : '',
    data ? makeTag('ORDER_NUMBER', data.order_number) : '',
    ...(data ? fulfillmentTagsForQuote(data) : []),
    ...getReceptionQuoteTags(originalNotes),
  ].filter(Boolean).join('\n')
}

function normalizeQuoteSearch(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isQuoteNumberSearch(value: string) {
  const normalized = normalizeQuoteSearch(value.trim())
  return /^laq\d+$/.test(normalized) || /^q\d+$/.test(normalized) || /^\d{2,}$/.test(normalized)
}

function notesWithQuoteWorker(notes?: string | null, worker?: string | null) {
  return notesWithQuoteMeta(notes, worker, getQuoteClientNumber(notes))
}

function normalizeQuoteForUi(quote: QuoteWithItems): QuoteWithItems {
  const rawNotes = quote.notes
  const paymentNote = tagValue(rawNotes, 'RECEPTION_PAYMENT_NOTE')
  const approvalNote = tagValue(rawNotes, 'RECEPTION_APPROVED_NOTE')
  const receptionAmount = tagValue(rawNotes, 'RECEPTION_PAYMENT_AMOUNT')
  const receptionMethod = tagValue(rawNotes, 'RECEPTION_PAYMENT_METHOD')
  const hasReceptionApproval = String(rawNotes || '').includes(RECEPTION_APPROVED_TAG)
  return {
    ...quote,
    raw_notes: rawNotes,
    notes: stripQuoteHiddenTags(quote.notes),
    assigned_worker: ((quote as any).assigned_worker || getQuoteWorker(quote.notes)) as Worker | '',
    client_phone: cleanClientNumber((quote as any).client_phone || getQuoteClientNumber(quote.notes)),
    reception_status: receptionAmount ? 'Payment received' : hasReceptionApproval ? 'Approved by Reception' : '',
    reception_note: paymentNote || approvalNote,
    reception_amount: receptionAmount,
    reception_method: receptionMethod,
  }
}

function quoteForPrint(quote: QuoteWithItems) {
  const sourceNotes = quote.raw_notes || quote.notes
  const fulfillment = getFulfillmentDetails(sourceNotes)
  const deliveryLines = [
        fulfillment.delivery_name ? `Contact: ${fulfillment.delivery_name}` : '',
        fulfillment.delivery_number ? `Cell: ${fulfillment.delivery_number}` : '',
        fulfillment.delivery_address ? `Address: ${fulfillment.delivery_address}` : '',
      ].filter(Boolean)
  const courierLines = [
          fulfillment.courier_company ? `Courier: ${fulfillment.courier_company}` : '',
          fulfillment.courier_contact_person ? `Contact: ${fulfillment.courier_contact_person}` : '',
          fulfillment.courier_address ? `Address: ${fulfillment.courier_address}` : '',
          fulfillment.courier_payment ? `Payment: ${fulfillment.courier_payment === 'we_pay' ? 'We pay' : fulfillment.courier_payment === 'account' ? 'Account' : 'Pay on Delivery'}` : '',
          fulfillment.courier_notes ? `Notes: ${fulfillment.courier_notes}` : '',
        ].filter(Boolean)
  const installLines = [
            fulfillment.install_contact_person ? `Contact: ${fulfillment.install_contact_person}` : '',
            fulfillment.install_contact_number ? `Cell: ${fulfillment.install_contact_number}` : '',
            fulfillment.install_address ? `Address: ${fulfillment.install_address}` : '',
            fulfillment.install_preferred_date ? `Preferred: ${fulfillment.install_preferred_date}` : '',
            fulfillment.install_notes ? `Notes: ${fulfillment.install_notes}` : '',
          ].filter(Boolean)
  const fulfillmentLines = fulfillment.method === 'delivery' && deliveryLines.length
    ? ['Fulfilment: Delivery', ...deliveryLines]
    : fulfillment.method === 'courier' && courierLines.length
      ? ['Fulfilment: Courier', ...courierLines]
      : fulfillment.method === 'installation' && installLines.length
        ? ['Fulfilment: Installation / Application', ...installLines]
        : []
  return {
    ...quote,
    notes: stripQuoteHiddenTags(quote.notes),
    assigned_worker: ((quote as any).assigned_worker || getQuoteWorker(quote.notes)) as Worker | '',
    client_phone: cleanClientNumber(quote.client_phone || getQuoteClientNumber(quote.notes)),
    order_number: tagValue(sourceNotes, 'ORDER_NUMBER'),
    fulfillment_lines: fulfillmentLines,
  }
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
  const [selectedForPrint, setSelectedForPrint] = useState<string[]>([])
  const [printSelectMode, setPrintSelectMode] = useState(false)
  const [emailedQuoteIds, setEmailedQuoteIds] = useState<Set<string>>(new Set())

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      client_name: '', client_email: '', client_address: '',
      status: 'draft', vat_rate: 15, notes: '', valid_until: '', assigned_worker: '', client_phone: '', order_number: '', discount: 0,
      fulfillment_method: 'none', delivery_name: '', delivery_number: '', delivery_address: '',
      courier_company: '', courier_address: '', courier_contact_person: '', courier_payment: 'pay_on_delivery', courier_notes: '',
      install_address: '', install_contact_person: '', install_contact_number: '', install_preferred_date: '', install_notes: '',
      items: [{ description: '', quantity: 1, unit_price: 0, width: '', height: '', priceType: 'manual' as const }],
    },
  })

  const { fields: itemFields, append: addItem, remove: removeItem } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')
  const watchVatRate = watch('vat_rate')
  const watchDiscount = watch('discount')
  const fulfillmentMethod = watch('fulfillment_method')

  const subtotal = watchItems?.reduce((sum, item) => {
    const w = parseFloat(item.width || '0') / 1000
    const h = parseFloat(item.height || '0') / 1000
    const lineTotal = item.priceType === 'psm' && w && h
      ? (Number(item.quantity) || 0) * w * h * (Number(item.unit_price) || 0)
      : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
    return sum + lineTotal
  }, 0) || 0
  const discountAmount = subtotal * ((watchDiscount || 0) / 100)
  const discountedSubtotal = subtotal - discountAmount
  const vatAmount = discountedSubtotal * (watchVatRate / 100)
  const total = discountedSubtotal + vatAmount

  useEffect(() => { loadQuotes(); loadClients() }, [])

  useEffect(() => {
    const openId = searchParams.get('open')
    const isNew = searchParams.get('new')
    if (isNew) openCreate()
    else if (openId && quotes.length > 0) {
      const q = quotes.find(q => q.id === openId)
      if (q) openEdit(q)
    }
  }, [searchParams, quotes.length])

  useEffect(() => {
    const channel = supabase
      .channel('quotes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, loadQuotes)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const applyFilter = useCallback(
    debounce((list: QuoteWithItems[], q: string, status: string) => {
      const query = q.trim()
      const quoteNumberSearch = isQuoteNumberSearch(query)
      let result = list.filter(quote => !quote.is_retail && quote.status !== 'completed')
      if (status !== 'all' && !quoteNumberSearch) result = result.filter(quote => quote.status === status)
      if (query) {
        const ql = query.toLowerCase()
        const normalizedQuery = normalizeQuoteSearch(query)
        result = result.filter(quote => {
          const quoteNumber = quote.quote_number || ''
          return quoteNumber.toLowerCase().includes(ql) ||
            normalizeQuoteSearch(quoteNumber).includes(normalizedQuery) ||
            (quote.client_name || '').toLowerCase().includes(ql)
        })
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
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
      if (error) throw error
      setQuotes(((data as QuoteWithItems[]) || []).map(normalizeQuoteForUi))
    } catch { toast.error('Failed to load quotes') }
    finally { setIsLoading(false) }
  }

  async function loadClients() {
    const { data } = await supabase.from('clients').select('id, name, company').order('name')
    setClients((data as Client[]) || [])
  }

  function openCreate() {
    setEditingQuote(null)
    reset({
      client_name: '', client_email: '', client_address: '',
      status: 'draft', vat_rate: 15, notes: '', valid_until: '', assigned_worker: '', client_phone: '', order_number: '', discount: 0,
      fulfillment_method: 'none', delivery_name: '', delivery_number: '', delivery_address: '',
      courier_company: '', courier_address: '', courier_contact_person: '', courier_payment: 'pay_on_delivery', courier_notes: '',
      install_address: '', install_contact_person: '', install_contact_number: '', install_preferred_date: '', install_notes: '',
      items: [{ description: '', quantity: 1, unit_price: 0, width: '', height: '', priceType: 'manual' as const }],
    })
    setIsFormOpen(true)
    router.push('/quotes')
  }

  function openEdit(quote: QuoteWithItems) {
    setEditingQuote(quote)
    const sourceNotes = quote.raw_notes || quote.notes
    const fulfillment = getFulfillmentDetails(sourceNotes)
    reset({
      client_id: quote.client_id || undefined,
      client_name: quote.client_name || '',
      client_email: quote.client_email || '',
      client_address: quote.client_address || '',
      status: quote.status,
      vat_rate: quote.vat_rate,
      notes: stripQuoteWorkerTag(sourceNotes),
      valid_until: quote.valid_until || '',
      assigned_worker: quote.assigned_worker || getQuoteWorker(sourceNotes),
      client_phone: cleanClientNumber(quote.client_phone || getQuoteClientNumber(sourceNotes)),
      order_number: tagValue(sourceNotes, 'ORDER_NUMBER'),
      discount: (quote as any).discount || 0,
      fulfillment_method: fulfillment.method as QuoteFormData['fulfillment_method'],
      delivery_name: fulfillment.delivery_name,
      delivery_number: fulfillment.delivery_number,
      delivery_address: fulfillment.delivery_address,
      courier_company: fulfillment.courier_company,
      courier_address: fulfillment.courier_address,
      courier_contact_person: fulfillment.courier_contact_person,
      courier_payment: fulfillment.courier_payment as QuoteFormData['courier_payment'],
      courier_notes: fulfillment.courier_notes,
      install_address: fulfillment.install_address,
      install_contact_person: fulfillment.install_contact_person,
      install_contact_number: fulfillment.install_contact_number,
      install_preferred_date: fulfillment.install_preferred_date,
      install_notes: fulfillment.install_notes,
      items: quote.items.length > 0
        ? quote.items.sort((a, b) => a.sort_order - b.sort_order).map(i => ({
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
            width: i.size?.split('x')[0] || '',
            height: i.size?.split('x')[1] || '',
            priceType: 'manual' as const,
          }))
        : [{ description: '', quantity: 1, unit_price: 0, width: '', height: '' }],
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

      const sub = data.items.reduce((s, i) => {
        const iw = parseFloat(i.width || '0') / 1000
        const ih = parseFloat(i.height || '0') / 1000
        return s + (i.priceType === 'psm' && iw && ih ? i.quantity * iw * ih * i.unit_price : i.quantity * i.unit_price)
      }, 0)
      const discAmt = sub * ((data.discount || 0) / 100)
      const discountedSub = sub - discAmt
      const vat = discountedSub * (data.vat_rate / 100)
      const client = await ensureClientRecord({
        clientId: data.client_id,
        name: data.client_name,
        email: data.client_email,
        phone: data.client_phone,
        address: data.client_address,
        createdBy: profile?.id,
      })

      const quotePayload = {
        client_id: client?.id || null,
        client_name: client?.name || data.client_name,
        client_email: data.client_email || null,
        client_address: data.client_address || null,
        status: data.status,
        vat_rate: data.vat_rate,
        subtotal: discountedSub,
        
        vat_amount: vat,
        total: discountedSub + vat,
        notes: notesWithQuoteMeta(data.notes, data.assigned_worker, cleanClientNumber(data.client_phone), data, editingQuote?.raw_notes || editingQuote?.notes) || null,
        valid_until: data.valid_until || null,
        is_retail: false,
        created_by: null,
      }

      let quoteId: string

      if (editingQuote) {
        const { error } = await supabase.from('quotes').update(quotePayload).eq('id', editingQuote.id)
        if (error) throw error
        quoteId = editingQuote.id
        const { error: deleteItemsError } = await supabase.from('quote_items').delete().eq('quote_id', quoteId)
        if (deleteItemsError) throw deleteItemsError
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
        const { error: itemError } = await supabase.from('quote_items').insert(
          data.items.map((item, idx) => ({
            quote_id: quoteId,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: (() => {
              const iw = parseFloat(item.width || '0') / 1000
              const ih = parseFloat(item.height || '0') / 1000
              return item.priceType === 'psm' && iw && ih
                ? item.quantity * iw * ih * item.unit_price
                : item.quantity * item.unit_price
            })(),
            size: item.width && item.height ? `${item.width}x${item.height}` : null,
            sort_order: idx,
          }))
        )
        if (itemError) throw itemError
      }

      const { error: activityError } = await supabase.from('activity_logs').insert({
        entity_type: 'quote',
        entity_id: quoteId,
        action: editingQuote ? 'updated' : 'created',
        metadata: { quote_number: quoteNumber },
        user_id: profile?.id,
      })
      if (activityError) console.warn('Activity log failed:', activityError)

      toast.success(editingQuote ? 'Quote updated' : 'Quote created')
      setIsFormOpen(false)
      loadQuotes()
    } catch (err: unknown) {
      console.error('Quote save failed:', err)
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message)
        : 'Failed to save quote'
      const code = err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code)
        : ''
      toast.error(code ? `${message} (${code})` : message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleComplete(quote: QuoteWithItems) {
    if (!confirm(`Mark ${quote.quote_number} as complete?`)) return
    const { data: freshQuote } = await supabase
      .from('quotes')
      .select('id, quote_number, client_name, client_address, notes')
      .eq('id', quote.id)
      .eq('is_retail', false)
      .single()

    const { error } = await supabase.from('quotes').update({
      status: 'completed',
    }).eq('id', quote.id).eq('is_retail', false)
    if (error) { toast.error(`Complete failed: ${error.message}`); return }

    const completionNotes = String((freshQuote as any)?.notes || quote.notes || '')
    if (completionNotes.includes(INSTALL_PENDING_TAG) && profile) {
      const { data: wilvertProfiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .ilike('full_name', '%Wilvert%')
        .limit(5)

      if (wilvertProfiles?.length) {
        const address = tagValue(completionNotes, 'INSTALL_ADDRESS') || (freshQuote as any)?.client_address || quote.client_address || ''
        const contact = tagValue(completionNotes, 'INSTALL_CONTACT') || (freshQuote as any)?.client_name || quote.client_name || ''
        const number = tagValue(completionNotes, 'INSTALL_NUMBER') || cleanClientNumber(quote.client_phone || getQuoteClientNumber(completionNotes))
        const preferredDate = tagValue(completionNotes, 'INSTALL_DATE')
        const installNotes = tagValue(completionNotes, 'INSTALL_NOTES')
        const message = [
          `${(freshQuote as any)?.quote_number || quote.quote_number} - ${(freshQuote as any)?.client_name || quote.client_name}`,
          address ? `Address: ${address}` : '',
          contact ? `Contact: ${contact}` : '',
          number ? `Number: ${number}` : '',
          preferredDate ? `Preferred date: ${preferredDate}` : '',
          installNotes ? `Notes: ${installNotes}` : '',
        ].filter(Boolean).join('\n')

        await supabase.from('notifications').insert(wilvertProfiles.map((worker: any) => ({
          recipient_id: worker.id,
          sender_id: profile.id,
          type: 'installation_ready',
          title: 'Installation / Application Ready',
          message,
        })))
        toast.success('Quote completed and Wilvert notified')
      } else {
        toast.success('Quote completed. Wilvert profile was not found for notification.')
      }
    } else {
      toast.success('Quote completed')
    }
    loadQuotes()
  }
  async function handleToggleLock(quote: QuoteWithItems) {
    if (profile?.role !== 'admin') { toast.error('Only admins can lock/unlock quotes'); return }
    const { error } = await supabase.from('quotes').update({ is_locked: !quote.is_locked }).eq('id', quote.id)
    if (error) toast.error('Failed to update lock')
    else { toast.success(quote.is_locked ? 'Quote unlocked' : 'Quote locked'); loadQuotes() }
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
    const doc = generateQuoteJobCardPDF(quoteForPrint(quote))
    doc.save(`${quote.quote_number}.pdf`)
    toast.success('PDF downloaded')
  }

  function printQuote(quote: QuoteWithItems) {
    const doc = generateQuoteJobCardPDF(quoteForPrint(quote))
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    win?.print()
  }

  function togglePrintSelect(quoteId: string) {
    setSelectedForPrint(prev => {
      if (prev.includes(quoteId)) return prev.filter(id => id !== quoteId)
      if (prev.length >= 2) { toast.error('Select max 2 quotes'); return prev }
      return [...prev, quoteId]
    })
  }

  function printSelectedQuotes() {
    if (selectedForPrint.length === 0) { toast.error('Select 1 or 2 quotes'); return }
    const quote1 = quotes.find(q => q.id === selectedForPrint[0])
    const quote2 = selectedForPrint[1] ? quotes.find(q => q.id === selectedForPrint[1]) : quote1
    if (!quote1 || !quote2) return
    const doc = generateQuoteJobCardPDF(quoteForPrint(quote1), quoteForPrint(quote2))
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')?.print()
    setPrintSelectMode(false)
    setSelectedForPrint([])
  }

  async function emailQuote(quote: QuoteWithItems) {
    const doc = generateQuotePDF(quoteForPrint(quote))
    const pdfBase64 = doc.output('datauristring').split(',')[1]
    const toastId = toast.loading('Sending email...')
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64,
          fileName: `${quote.quote_number}.pdf`,
          subject: `Quote ${quote.quote_number} — ${quote.client_name || 'Client'}`,
          clientName: quote.client_name || 'Client',
          type: 'quote',
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.dismiss(toastId)
      setEmailedQuoteIds(prev => new Set(prev).add(quote.id))
      toast.success('Email sent to finance@lasigns.com.na ✅')
    } catch (err: any) {
      toast.dismiss(toastId)
      toast.error(`Email failed: ${err.message}`)
    }
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
          <div className="flex gap-2">
            <button
              onClick={() => { setPrintSelectMode(!printSelectMode); setSelectedForPrint([]) }}
              className={`btn-sm ${printSelectMode ? 'btn-primary' : 'btn-secondary'}`}
            >
              <Layers className="w-4 h-4" />
              {printSelectMode ? 'Cancel' : 'Print 2 Quotes'}
            </button>
            {printSelectMode && selectedForPrint.length > 0 && (
              <button onClick={printSelectedQuotes} className="btn-primary btn-sm">
                <Printer className="w-4 h-4" /> Print ({selectedForPrint.length}/2)
              </button>
            )}
            <button onClick={openCreate} className="btn-primary btn-sm">
              <Plus className="w-4 h-4" /> New Quote
            </button>
          </div>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="Search quotes..." className="max-w-xs" />
          <div className="flex gap-1">
            {['all', ...STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === s ? 'bg-accent text-text-inverse' : 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border'
                }`}>
                {s === 'all' ? 'All' : s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {printSelectMode && (
          <div className="bg-accent-muted border border-accent/30 rounded-lg px-4 py-3 text-sm text-accent flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Select 1 quote to print two copies, or select 2 quotes to print them together on one A4 page.
          </div>
        )}

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
                  {printSelectMode && <th className="w-8"></th>}
                  <th>Quote #</th><th>Client</th><th>Worker</th><th>Status</th>
                  <th>Subtotal</th><th>VAT</th><th>Total</th>
                  <th>Date</th><th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(quote => {
                  const isSelected = selectedForPrint.includes(quote.id)
                  return (
                  <tr key={quote.id} onClick={() => printSelectMode ? togglePrintSelect(quote.id) : openEdit(quote)}
                    className={isSelected ? 'bg-accent-muted border-l-2 border-accent' : ''}>
                    {printSelectMode && (
                      <td onClick={e => { e.stopPropagation(); togglePrintSelect(quote.id) }}>
                        {isSelected ? <CheckSquare className="w-4 h-4 text-accent" /> : <Square className="w-4 h-4 text-text-muted" />}
                      </td>
                    )}
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-accent font-semibold">{quote.quote_number}</span>
                        {quote.is_locked && <Lock className="w-3 h-3 text-text-muted" />}
                      </div>
                      {quote.reception_status && (
                        <div className="mt-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] leading-snug text-emerald-300 max-w-[210px]">
                          <span className="font-semibold">{quote.reception_status}</span>
                          {quote.reception_amount && <span> · {formatCurrency(Number(quote.reception_amount))}{quote.reception_method ? ` ${quote.reception_method}` : ''}</span>}
                          {quote.reception_note && <p className="text-emerald-200/80 truncate">{quote.reception_note}</p>}
                        </div>
                      )}
                    </td>
                    <td className="font-medium">{quote.client_name || '—'}</td>
                    <td className="text-text-secondary text-sm">{quote.assigned_worker || <span className="text-text-muted">-</span>}</td>
                    <td><StatusBadge status={quote.status} /></td>
                    <td className="text-text-secondary">{formatCurrency(quote.subtotal)}</td>
                    <td className="text-text-secondary">{formatCurrency(quote.vat_amount)}</td>
                    <td className="font-semibold">{formatCurrency(quote.total)}</td>
                    <td className="text-text-muted text-sm">{formatDate(quote.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => downloadPDF(quote)} className="btn-icon" title="Download PDF"><Download className="w-3.5 h-3.5" /></button>
                        <button onClick={() => printQuote(quote)} className="btn-icon" title="Print"><Printer className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => emailQuote(quote)}
                          className={`btn-icon ${emailedQuoteIds.has(quote.id) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : ''}`}
                          title={emailedQuoteIds.has(quote.id) ? 'Email sent' : 'Email'}
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleComplete(quote)} className="btn-icon text-emerald-400" title="Complete"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                        {profile?.role === 'admin' && (
                          <>
                            <button onClick={() => handleToggleLock(quote)} className="btn-icon" title={quote.is_locked ? 'Unlock' : 'Lock'}>
                              {quote.is_locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setDeleteTarget(quote)} className="btn-icon text-red-400/50 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingQuote ? `Edit — ${editingQuote.quote_number}` : 'New Quotation'}
        size="xl"
        preventOutsideClose={true}
        actions={editingQuote && (
          <div className="flex gap-2">
            <button onClick={() => downloadPDF(editingQuote)} className="btn-secondary btn-sm"><Download className="w-3.5 h-3.5" /> PDF</button>
            <button onClick={() => printQuote(editingQuote)} className="btn-secondary btn-sm"><Printer className="w-3.5 h-3.5" /> Print</button>
            <button
              onClick={() => emailQuote(editingQuote)}
              className={`btn-secondary btn-sm ${emailedQuoteIds.has(editingQuote.id) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : ''}`}
            >
              <Mail className="w-3.5 h-3.5" /> {emailedQuoteIds.has(editingQuote.id) ? 'Sent' : 'Email'}
            </button>
          </div>
        )}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Client section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Client Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <label className="label">Client Name *</label>
                <input
                  {...register('client_name')}
                  className="input"
                  placeholder="Search or type client name..."
                  onChange={(e) => { register('client_name').onChange(e); setClientSearch(e.target.value) }}
                />
                {clientSearch && filteredClients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-bg-elevated border border-border rounded-md shadow-elevated mt-1 max-h-48 overflow-y-auto">
                    {filteredClients.map(c => (
                      <div key={c.id} className="px-3 py-2.5 hover:bg-bg-hover cursor-pointer"
                        onMouseDown={async () => {
                          setValue('client_id', c.id)
                          setValue('client_name', c.name)
                          setClientSearch('')
                          const { data: cd } = await supabase.from('clients').select('address').eq('id', c.id).single()
                          if (cd?.address) setValue('client_address', cd.address)
                          const { data: ed } = await supabase.from('client_emails').select('email').eq('client_id', c.id).limit(1).single()
                          if (ed?.email) setValue('client_email', ed.email)
                          const { data: pd } = await supabase.from('client_phones').select('phone').eq('client_id', c.id).limit(1).single()
                          if (pd?.phone) setValue('client_phone', cleanClientNumber(pd.phone))
                        }}>
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
              <div>
                <label className="label">Client Number</label>
                <input {...register('client_phone', { setValueAs: cleanClientNumber })} className="input" placeholder="081 234 5678" />
              </div>
            </div>
            <div>
              <label className="label">Client Address</label>
              <input {...register('client_address')} className="input" placeholder="Full address" />
            </div>
          </div>

          {/* Quote details */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="label">Status</label>
              <select {...register('status')} className="input">
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label">VAT Rate (%)</label>
              <input {...register('vat_rate')} type="number" step="0.01" min="0" max="100" className="input" />
            </div>
            <div>
              <label className="label">Valid Until</label>
              <input {...register('valid_until')} type="date" className="input" />
            </div>
            <div>
              <label className="label">Order Number</label>
              <input {...register('order_number')} className="input" placeholder="Customer order no." />
            </div>
            <div>
              <label className="label">Assigned Worker</label>
              <select {...register('assigned_worker')} className="input">
                <option value="">-- Unassigned --</option>
                {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="label">Reception</label>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
                <input {...register('fulfillment_method')} type="radio" value="collection" className="accent-accent" />
                Client will collect this job
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
                <input {...register('fulfillment_method')} type="radio" value="delivery" className="accent-accent" />
                Delivery
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
                <input {...register('fulfillment_method')} type="radio" value="courier" className="accent-accent" />
                Courier
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text-secondary">
                <input {...register('fulfillment_method')} type="radio" value="installation" className="accent-accent" />
                To Install / Applicate
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-text-muted">
              <input {...register('fulfillment_method')} type="radio" value="none" className="accent-accent" />
              No reception action
            </label>
            {fulfillmentMethod === 'delivery' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div><label className="label">Delivery Client Name</label><input {...register('delivery_name')} className="input" /></div>
                <div><label className="label">Delivery Number</label><input {...register('delivery_number')} className="input" /></div>
                <div><label className="label">Delivery Address</label><input {...register('delivery_address')} className="input" /></div>
              </div>
            )}
            {fulfillmentMethod === 'courier' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><label className="label">Courier Company</label><input {...register('courier_company')} className="input" /></div>
                  <div><label className="label">Address</label><input {...register('courier_address')} className="input" /></div>
                  <div><label className="label">Contact Person</label><input {...register('courier_contact_person')} className="input" /></div>
                </div>
                <div>
                  <label className="label">Courier Payment</label>
                  <select {...register('courier_payment')} className="input max-w-xs">
                    <option value="pay_on_delivery">Pay on Delivery</option>
                    <option value="we_pay">We pay</option>
                    <option value="account">Account</option>
                  </select>
                </div>
                <div>
                  <label className="label">Courier Notes / Delivery Address</label>
                  <textarea {...register('courier_notes')} className="input min-h-[90px] resize-y overflow-y-auto" placeholder="Extra courier instructions, delivery address, reference number, or account details..." />
                </div>
              </div>
            )}
            {fulfillmentMethod === 'installation' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label className="label">Installation Address</label><input {...register('install_address')} className="input" /></div>
                  <div><label className="label">Contact Person</label><input {...register('install_contact_person')} className="input" /></div>
                  <div><label className="label">Contact Number</label><input {...register('install_contact_number')} className="input" /></div>
                  <div><label className="label">Preferred Date</label><input {...register('install_preferred_date')} type="date" className="input" /></div>
                </div>
                <div><label className="label">Installation Notes</label><textarea {...register('install_notes')} className="input min-h-[110px] resize-y overflow-y-auto" /></div>
                <p className="text-xs text-text-muted">Wilvert will be notified when this quote is marked complete.</p>
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">Line Items</h3>
              <button type="button" onClick={() => addItem({ description: '', quantity: 1, unit_price: 0, width: '', height: '', priceType: 'manual' as const })}
                className="btn-ghost btn-sm text-accent">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>

            <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted mb-2 px-1">
              <div className="col-span-4">Description</div>
              <div className="col-span-1">W (mm)</div>
              <div className="col-span-1">H (mm)</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Unit Price</div>
              <div className="col-span-1 text-right">Total</div>
              <div className="col-span-1">m²</div>
              <div className="col-span-1"></div>
            </div>

            <div className="space-y-2">
              {itemFields.map((field, i) => {
                const qty = Number(watchItems?.[i]?.quantity) || 0
                const price = Number(watchItems?.[i]?.unit_price) || 0
                const w = parseFloat(watchItems?.[i]?.width || '0') / 1000
                const h = parseFloat(watchItems?.[i]?.height || '0') / 1000
                const sqm = w && h ? (w * h).toFixed(4) : null
                return (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <Controller
                        control={control}
                        name={`items.${i}.description`}
                        render={({ field: descField }) => (
                          <PriceAutocomplete
                            value={descField.value}
                            onChange={descField.onChange}
                            onSelectPrice={(selectedPrice, priceType) => {
                              setValue(`items.${i}.unit_price`, selectedPrice)
                              setValue(`items.${i}.priceType`, priceType)
                            }}
                            placeholder="Description"
                            className="input"
                          />
                        )}
                      />
                    </div>
                    <div className="col-span-1">
                      <input {...register(`items.${i}.width`)} className="input" placeholder="W" />
                    </div>
                    <div className="col-span-1">
                      <input {...register(`items.${i}.height`)} className="input" placeholder="H" />
                    </div>
                    <div className="col-span-1">
                      <input {...register(`items.${i}.quantity`)} type="number" step="any" min="0" className="input" />
                    </div>
                    <div className="col-span-2">
                      <input {...register(`items.${i}.unit_price`)} type="number" step="0.01" min="0" className="input" />
                    </div>
                    <div className="col-span-1 text-right text-sm font-semibold text-text-primary">
                      {formatCurrency(
                        watchItems?.[i]?.priceType === 'psm' && w && h
                          ? qty * w * h * price
                          : qty * price
                      )}
                    </div>
                    <div className="col-span-1 text-xs text-text-muted text-center">
                      {sqm ? <span className="text-accent font-semibold">{sqm}</span> : '—'}
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

            <div className="mt-4 border-t border-border pt-4 space-y-1.5">
              <div className="flex justify-between text-sm text-text-secondary">
                <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-text-secondary">
                <div className="flex items-center gap-2">
                  <span>Discount</span>
                  <input {...register('discount')} type="number" min="0" max="100" step="0.1"
                    className="input w-20 py-0.5 text-xs" placeholder="0" />
                  <span>%</span>
                </div>
                <span className="text-red-400">-{formatCurrency(discountAmount)}</span>
              </div>
              <div className="flex justify-between text-sm text-text-secondary">
                <span>VAT ({watchVatRate}%)</span><span>{formatCurrency(vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-text-primary border-t border-border pt-1.5">
                <span>TOTAL</span><span>{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input min-h-[130px] resize-y overflow-y-auto" placeholder="Additional notes..." />
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
        confirmLabel="Delete" danger={true} isLoading={isDeleting}
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


