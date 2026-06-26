'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  CreditCard, Banknote, Building2, CheckCircle2,
  AlertCircle, Search, Plus, X, Package, PackageCheck, CheckCheck, Trash2
} from 'lucide-react'

type PaymentMethod = 'cash' | 'card' | 'eft'
type Tab = 'collection' | 'delivery' | 'courier' | 'installation' | 'quote_payments' | 'outstanding' | 'walkin' | 'walkin_list' | 'history'
const COLLECTION_PENDING_TAG = '[LA_COLLECTION_PENDING]'
const COLLECTION_COLLECTED_TAG = '[LA_COLLECTION_COLLECTED]'
const DELIVERY_PENDING_TAG = '[LA_DELIVERY_PENDING]'
const DELIVERY_DELIVERED_TAG = '[LA_DELIVERY_DELIVERED]'
const COURIER_PENDING_TAG = '[LA_COURIER_PENDING]'
const COURIER_COURIERED_TAG = '[LA_COURIER_COURIERED]'
const INSTALL_PENDING_TAG = '[LA_INSTALL_PENDING]'
const INSTALL_DONE_TAG = '[LA_INSTALL_DONE]'
const RECEPTION_APPROVED_TAG = '[LA_RECEPTION_APPROVED]'

interface PayableItem {
  id: string
  type: 'quote' | 'job'
  number: string
  client_name: string
  total: number
  amount_paid?: number
  payment_status?: string
  status: string
  created_at: string
}

interface CollectionItem {
  id: string
  job_number: string
  title: string
  client_name: string
  total: number
  status: string
  notes?: string | null
  collection_status?: string | null
  is_retail: boolean
  created_at: string
  source_table?: 'quotes' | 'job_cards'
}

interface QuotePaymentItem {
  id: string
  quote_number: string
  client_id?: string | null
  client_name?: string | null
  client_email?: string | null
  client_address?: string | null
  company?: string | null
  status: string
  subtotal: number
  vat_amount: number
  total: number
  amount_paid?: number | null
  payment_status?: string | null
  payment_method?: string | null
  notes?: string | null
  created_at: string
  items?: { description: string; quantity: number; line_total: number; sort_order?: number }[]
}

function ReceptionPageInner() {
  const { profile } = useAuthStore()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('collection')
  const [items, setItems] = useState<PayableItem[]>([])
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([])
  const [collectedItems, setCollectedItems] = useState<CollectionItem[]>([])
  const [deliveryItems, setDeliveryItems] = useState<CollectionItem[]>([])
  const [deliveredItems, setDeliveredItems] = useState<CollectionItem[]>([])
  const [courierItems, setCourierItems] = useState<CollectionItem[]>([])
  const [courieredItems, setCourieredItems] = useState<CollectionItem[]>([])
  const [installItems, setInstallItems] = useState<CollectionItem[]>([])
  const [installedItems, setInstalledItems] = useState<CollectionItem[]>([])
  const [quotePaymentItems, setQuotePaymentItems] = useState<QuotePaymentItem[]>([])
  const [walkinList, setWalkinList] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [payingItem, setPayingItem] = useState<PayableItem | null>(null)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showCollected, setShowCollected] = useState(false)
  const [showDelivered, setShowDelivered] = useState(false)
  const [showCouriered, setShowCouriered] = useState(false)
  const [showInstalled, setShowInstalled] = useState(false)
  const [paymentHistory, setPaymentHistory] = useState<any[]>([])

  // Walk-in
  const [walkinName, setWalkinName] = useState('')
  const [walkinPhone, setWalkinPhone] = useState('')
  const [walkinAmount, setWalkinAmount] = useState('')
  const [walkinMethod, setWalkinMethod] = useState<PaymentMethod>('cash')
  const [walkinNote, setWalkinNote] = useState('')
  const [isSavingWalkin, setIsSavingWalkin] = useState(false)
  const [clientSuggestions, setClientSuggestions] = useState<any[]>([])
  const [walkinClientId, setWalkinClientId] = useState<string | null>(null)
  const [editingWalkin, setEditingWalkin] = useState<any | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editMethod, setEditMethod] = useState<PaymentMethod>('cash')
  const [quotePaymentTarget, setQuotePaymentTarget] = useState<QuotePaymentItem | null>(null)
  const [quotePayAmount, setQuotePayAmount] = useState('')
  const [quotePayMethod, setQuotePayMethod] = useState<PaymentMethod>('cash')
  const [quotePayNote, setQuotePayNote] = useState('')

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const requestedTab = searchParams.get('tab') as Tab | null
    if (requestedTab && ['collection', 'delivery', 'courier', 'installation', 'quote_payments', 'outstanding', 'walkin', 'walkin_list', 'history'].includes(requestedTab)) {
      setTab(requestedTab)
    }
  }, [searchParams])

  useEffect(() => {
    const jobId = searchParams.get('job')
    if (!jobId || isLoading) return
    const timer = window.setTimeout(() => {
      document.getElementById(`reception-job-${jobId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => window.clearTimeout(timer)
  }, [searchParams, isLoading, tab])

  async function loadData() {
    setIsLoading(true)
    try {
      // Completed quotes waiting for collection, delivery, or courier.
      const { data: quoteFulfillmentData } = await supabase
        .from('quotes')
        .select('id, quote_number, client_name, total, status, notes, is_retail, created_at')
        .eq('status', 'completed')
        .eq('is_retail', false)
        .order('created_at', { ascending: false })
      const collData = (quoteFulfillmentData || []).map((q: any) => ({
        id: q.id,
        job_number: q.quote_number,
        title: `Quote ${q.quote_number}`,
        client_name: q.client_name,
        total: q.total,
        status: q.status,
        notes: q.notes,
        is_retail: q.is_retail,
        created_at: q.created_at,
        source_table: 'quotes' as const,
      }))

      const pending = (collData || []).filter((j: any) => {
        const notes = String(j.notes || '')
        return notes.includes(COLLECTION_PENDING_TAG) && !notes.includes(COLLECTION_COLLECTED_TAG)
      })
      const collected = (collData || []).filter((j: any) => String(j.notes || '').includes(COLLECTION_COLLECTED_TAG))
      const deliveryPending = (collData || []).filter((j: any) => {
        const notes = String(j.notes || '')
        return notes.includes(DELIVERY_PENDING_TAG) && !notes.includes(DELIVERY_DELIVERED_TAG)
      })
      const delivered = (collData || []).filter((j: any) => String(j.notes || '').includes(DELIVERY_DELIVERED_TAG))
      const courierPending = (collData || []).filter((j: any) => {
        const notes = String(j.notes || '')
        return notes.includes(COURIER_PENDING_TAG) && !notes.includes(COURIER_COURIERED_TAG)
      })
      const couriered = (collData || []).filter((j: any) => String(j.notes || '').includes(COURIER_COURIERED_TAG))
      const installPending = (collData || []).filter((j: any) => {
        const notes = String(j.notes || '')
        return notes.includes(INSTALL_PENDING_TAG) && !notes.includes(INSTALL_DONE_TAG)
      })
      const installed = (collData || []).filter((j: any) => String(j.notes || '').includes(INSTALL_DONE_TAG))
      setCollectionItems(pending as CollectionItem[])
      setCollectedItems(collected as CollectionItem[])
      setDeliveryItems(deliveryPending as CollectionItem[])
      setDeliveredItems(delivered as CollectionItem[])
      setCourierItems(courierPending as CollectionItem[])
      setCourieredItems(couriered as CollectionItem[])
      setInstallItems(installPending as CollectionItem[])
      setInstalledItems(installed as CollectionItem[])

      // Outstanding payments: Reception only handles completed non-retail job cards.
      const { data: jobs } = await supabase
        .from('job_cards')
        .select('id, job_number, client_name, total, status, notes, created_at, amount_paid, payment_status')
        .eq('status', 'completed')
        .eq('is_retail', false)
        .not('job_number', 'like', 'WI-%')
        .order('created_at', { ascending: false })

      setItems(
        ((jobs || []) as any[])
          .filter((j: any) => {
            const notes = String(j.notes || '')
            const paymentStatus = String(j.payment_status || '').toLowerCase()
            return !notes.startsWith('PAYMENT_REMOVED:') && (!notes.startsWith('PAID:') || paymentStatus === 'partial')
          })
          .map((j: any) => ({ ...j, type: 'job' as const, number: j.job_number }))
      )

      const { data: activeQuotes } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false })

      const quoteRows = ((activeQuotes || []) as any[]).filter((q: any) => {
        const status = String(q.status || '').toLowerCase()
        return q.is_retail === false && status !== 'completed' && status !== 'cancelled'
      })
      const quoteIds = quoteRows.map(q => q.id)
      let itemsByQuote: Record<string, any[]> = {}
      if (quoteIds.length > 0) {
        const { data: quoteItems } = await supabase
          .from('quote_items')
          .select('quote_id, description, quantity, line_total, sort_order')
          .in('quote_id', quoteIds)
          .order('sort_order', { ascending: true })
        itemsByQuote = ((quoteItems || []) as any[]).reduce((acc: Record<string, any[]>, item: any) => {
          acc[item.quote_id] = [...(acc[item.quote_id] || []), item]
          return acc
        }, {})
      }

      const clientIds = Array.from(new Set(quoteRows.map(q => q.client_id).filter(Boolean)))
      let companyByClient: Record<string, string> = {}
      if (clientIds.length > 0) {
        const { data: quoteClients } = await supabase
          .from('clients')
          .select('id, company')
          .in('id', clientIds)
        companyByClient = Object.fromEntries(((quoteClients || []) as any[]).map(c => [c.id, c.company || '']))
      }
      setQuotePaymentItems(quoteRows.map(q => ({
        ...q,
        company: q.client_id ? companyByClient[q.client_id] || null : null,
        items: itemsByQuote[q.id] || [],
      })))

      // Walk-in list
      const { data: wiData } = await supabase
        .from('job_cards')
        .select('id, job_number, client_name, total, notes, created_at')
        .like('job_number', 'WI-%')
        .order('created_at', { ascending: false })
        .limit(50)
      setWalkinList(wiData || [])

      // Payment history: completed non-retail job cards only.
      const { data: jobHist } = await supabase
        .from('job_cards')
        .select('id, job_number, title, client_name, total, notes, status, updated_at')
        .like('notes', 'PAID:%')
        .eq('status', 'completed')
        .eq('is_retail', false)
        .not('job_number', 'like', 'WI-%')
        .order('updated_at', { ascending: false })
        .limit(50)

      const history = ((jobHist || []) as any[])
        .map((j: any) => ({ ...j, type: 'job', number: j.job_number }))
        .sort((a: any, b: any) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())
      setPaymentHistory(history.slice(0, 50))
    } finally { setIsLoading(false) }
  }

  async function markCollected(item: CollectionItem) {
    const currentNotes = String(item.notes || '')
    const nextNotes = currentNotes.includes(COLLECTION_PENDING_TAG)
      ? currentNotes.replace(COLLECTION_PENDING_TAG, COLLECTION_COLLECTED_TAG)
      : [currentNotes, COLLECTION_COLLECTED_TAG].filter(Boolean).join('\n')
    const table = item.source_table || 'job_cards'
    const { error } = await supabase.from(table).update({
      notes: `${nextNotes}\nCollected on ${new Date().toLocaleDateString()}`,
    }).eq('id', item.id)

    if (error) { toast.error(`Failed: ${error.message}`); return }

    // Notify admins
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
    if (admins && profile) {
      await supabase.from('notifications').insert(admins.map((a: any) => ({
        recipient_id: a.id, sender_id: profile.id,
        type: 'job_collected',
        title: '📦 Job Collected',
        message: `${item.client_name} collected ${item.job_number} — ${item.title}`,
        entity_type: table === 'quotes' ? 'quote' : 'job_card', entity_id: item.id,
      })))
    }

    toast.success(`✅ ${item.client_name} collected their order`)
    loadData()
  }
  function getNoteValue(notes: string | null | undefined, key: string) {
    const match = String(notes || '').match(new RegExp('\\[LA_' + key + ':([^\\]]*)\\]', 'i'))
    if (!match?.[1]) return ''
    try { return decodeURIComponent(match[1]) } catch { return match[1] }
  }

  function courierPaymentLabel(value?: string) {
    if (value === 'we_pay') return 'We pay'
    if (value === 'account') return 'Account'
    return 'Pay on Delivery'
  }

  function fulfillmentRows(item: CollectionItem, type: 'delivery' | 'courier' | 'installation') {
    if (type === 'delivery') {
      return [
        ['Fulfilment', 'Delivery'],
        ['Contact', getNoteValue(item.notes, 'DELIVERY_NAME') || item.client_name || 'Unknown'],
        ['Cell', getNoteValue(item.notes, 'DELIVERY_NUMBER')],
        ['Address', getNoteValue(item.notes, 'DELIVERY_ADDRESS')],
      ].filter(([, value]) => value)
    }
    if (type === 'courier') {
      return [
        ['Fulfilment', 'Courier'],
        ['Courier', getNoteValue(item.notes, 'COURIER_COMPANY') || 'Courier'],
        ['Contact', getNoteValue(item.notes, 'COURIER_CONTACT')],
        ['Address', getNoteValue(item.notes, 'COURIER_ADDRESS')],
        ['Payment', courierPaymentLabel(getNoteValue(item.notes, 'COURIER_PAYMENT'))],
        ['Notes', getNoteValue(item.notes, 'COURIER_NOTES')],
      ].filter(([, value]) => value)
    }
    return [
      ['Fulfilment', 'Installation / Application'],
      ['Contact', getNoteValue(item.notes, 'INSTALL_CONTACT') || item.client_name || 'Unknown'],
      ['Cell', getNoteValue(item.notes, 'INSTALL_NUMBER')],
      ['Address', getNoteValue(item.notes, 'INSTALL_ADDRESS')],
      ['Preferred', getNoteValue(item.notes, 'INSTALL_DATE')],
      ['Notes', getNoteValue(item.notes, 'INSTALL_NOTES')],
      ['Applicator', 'Wilvert'],
    ].filter(([, value]) => value)
  }

  function makeNoteTag(key: string, value?: string | null) {
    const clean = String(value || '').trim()
    return clean ? '[LA_' + key + ':' + encodeURIComponent(clean) + ']' : ''
  }

  function stripReceptionQuoteTags(notes?: string | null) {
    return String(notes || '')
      .replace(RECEPTION_APPROVED_TAG, '')
      .replace(/\[LA_RECEPTION_(APPROVED_AT|APPROVED_BY|APPROVED_NOTE|PAYMENT_NOTE|PAYMENT_AMOUNT|PAYMENT_METHOD|PAYMENT_AT|PAYMENT_BY):[^\]]*\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  function quotePaidAmount(quote: QuotePaymentItem) {
    return Number(quote.amount_paid || getNoteValue(quote.notes, 'RECEPTION_PAYMENT_AMOUNT') || 0)
  }

  function quotePaymentStatus(quote: QuotePaymentItem) {
    if (quote.payment_status) return quote.payment_status
    const paid = quotePaidAmount(quote)
    if (paid <= 0) return ''
    return paid >= Number(quote.total || 0) ? 'paid' : 'partial'
  }

  async function approveQuoteFromReception(quote: QuotePaymentItem) {
    const comment = window.prompt('Comment for the quote team (optional):') || ''
    const approvedAt = new Date().toISOString()
    const tags = [
      RECEPTION_APPROVED_TAG,
      makeNoteTag('RECEPTION_APPROVED_AT', approvedAt),
      makeNoteTag('RECEPTION_APPROVED_BY', profile?.full_name || 'Reception'),
      makeNoteTag('RECEPTION_APPROVED_NOTE', comment),
    ].filter(Boolean).join('\n')
    const nextNotes = [stripReceptionQuoteTags(quote.notes), tags].filter(Boolean).join('\n')
    const { error } = await supabase.from('quotes').update({
      status: 'approved',
      notes: nextNotes,
    }).eq('id', quote.id)
    if (error) { toast.error(`Approve failed: ${error.message}`); return }
    toast.success('Quote marked approved')
    loadData()
  }

  async function recordQuotePayment() {
    if (!quotePaymentTarget || !quotePayAmount) return
    setIsSaving(true)
    try {
      const amount = parseFloat(quotePayAmount)
      const previousPaid = quotePaidAmount(quotePaymentTarget)
      const totalPaid = previousPaid + amount
      const fullyPaid = totalPaid >= Number(quotePaymentTarget.total || 0)
      const paidAt = new Date().toISOString()
      const tags = [
        RECEPTION_APPROVED_TAG,
        makeNoteTag('RECEPTION_PAYMENT_AMOUNT', totalPaid.toFixed(2)),
        makeNoteTag('RECEPTION_PAYMENT_METHOD', quotePayMethod),
        makeNoteTag('RECEPTION_PAYMENT_AT', paidAt),
        makeNoteTag('RECEPTION_PAYMENT_BY', profile?.full_name || 'Reception'),
        makeNoteTag('RECEPTION_PAYMENT_NOTE', quotePayNote),
      ].filter(Boolean).join('\n')
      const nextNotes = [stripReceptionQuoteTags(quotePaymentTarget.notes), tags].filter(Boolean).join('\n')
      const status = quotePaymentTarget.status === 'draft' || quotePaymentTarget.status === 'sent' ? 'approved' : quotePaymentTarget.status
      const paymentPayload = {
        status,
        amount_paid: totalPaid,
        payment_status: fullyPaid ? 'paid' : 'partial',
        payment_method: quotePayMethod,
        payment_date: paidAt,
        notes: nextNotes,
      }
      const { error } = await supabase.from('quotes').update(paymentPayload).eq('id', quotePaymentTarget.id)
      if (error) {
        const schemaMessage = String(error.message || '').toLowerCase()
        if (!schemaMessage.includes('schema cache') && !schemaMessage.includes('column')) throw error
        const { error: fallbackError } = await supabase.from('quotes').update({
          status,
          notes: nextNotes,
        }).eq('id', quotePaymentTarget.id)
        if (fallbackError) throw fallbackError
      }

      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (admins && profile) {
        await supabase.from('notifications').insert(admins.map((a: any) => ({
          recipient_id: a.id, sender_id: profile.id, type: 'quote_payment_received',
          title: 'Quote Payment Received',
          message: `${quotePaymentTarget.client_name || 'Client'} paid ${formatCurrency(amount)} (${quotePayMethod}) for ${quotePaymentTarget.quote_number}`,
          entity_type: 'quote', entity_id: quotePaymentTarget.id,
        })))
      }

      toast.success(fullyPaid ? 'Quote paid in full' : 'Quote partial payment recorded')
      setQuotePaymentTarget(null); setQuotePayAmount(''); setQuotePayNote('')
      loadData()
    } catch (err: any) { toast.error(`Payment failed: ${err.message}`) }
    finally { setIsSaving(false) }
  }

  async function markFulfillmentDone(item: CollectionItem, pendingTag: string, doneTag: string, label: 'Delivered' | 'Couriered' | 'Installed / Applied') {
    const currentNotes = String(item.notes || '')
    const nextNotes = currentNotes.includes(pendingTag)
      ? currentNotes.replace(pendingTag, doneTag)
      : [currentNotes, doneTag].filter(Boolean).join('\n')
    const { error } = await supabase.from(item.source_table || 'job_cards').update({
      notes: nextNotes + '\n' + label + ' on ' + new Date().toLocaleDateString(),
    }).eq('id', item.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success(label + ' recorded')
    loadData()
  }

  async function deleteFulfillmentHistory(item: CollectionItem, pendingTag: string, doneTag: string, doneLabel: string) {
    if (!confirm(`Remove ${doneLabel.toLowerCase()} history for ${item.client_name || 'this client'}?`)) return
    const nextNotes = String(item.notes || '')
      .replace(doneTag, '')
      .replace(pendingTag, '')
      .split('\n')
      .filter(line => !line.startsWith(doneLabel + ' on '))
      .join('\n')
      .trim()
    const { error } = await supabase.from(item.source_table || 'job_cards').update({ notes: nextNotes || null }).eq('id', item.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success(doneLabel + ' history removed')
    loadData()
  }

  async function deleteCollectedItem(item: CollectionItem) {
    if (!confirm(`Remove collected history for ${item.client_name || 'this client'}?`)) return
    const nextNotes = String(item.notes || '')
      .replace(COLLECTION_COLLECTED_TAG, '')
      .replace(COLLECTION_PENDING_TAG, '')
      .replace(/Collected on .+$/m, '')
      .trim()
    const { error } = await supabase.from(item.source_table || 'job_cards').update({
      notes: nextNotes || null,
    }).eq('id', item.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Collected history removed')
    loadData()
  }
  async function recordPayment() {
    if (!payingItem || !payAmount) return
    setIsSaving(true)
    try {
      const amount = parseFloat(payAmount)
      const fullyPaid = amount >= payingItem.total
      const table = payingItem.type === 'quote' ? 'quotes' : 'job_cards'
      const paymentNote = `PAID: N$${amount} (${payMethod})${payNote ? ' - ' + payNote : ''} on ${new Date().toLocaleDateString()}`
      const updatePayload: any = { notes: paymentNote }
      updatePayload.amount_paid = amount
      updatePayload.payment_status = fullyPaid ? 'paid' : 'partial'
      updatePayload.payment_method = payMethod
      updatePayload.payment_date = new Date().toISOString()
      const { error } = await supabase.from(table).update(updatePayload).eq('id', payingItem.id)
      if (error) throw error

      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (admins && profile) {
        await supabase.from('notifications').insert(admins.map((a: any) => ({
          recipient_id: a.id, sender_id: profile.id, type: 'payment_received',
          title: '💰 Payment Received',
          message: `${payingItem.client_name} paid ${formatCurrency(amount)} (${payMethod}) for ${payingItem.number}`,
          entity_type: payingItem.type, entity_id: payingItem.id,
        })))
      }

      toast.success(fullyPaid ? '✅ Fully paid!' : '⚠️ Partial payment recorded')
      setPayingItem(null); setPayAmount(''); setPayNote('')
      setTab('history')
      loadData()
    } catch (err: any) { toast.error(`Failed: ${err.message}`) }
    finally { setIsSaving(false) }
  }

  async function deletePaymentHistory(item: any) {
    if (!confirm(`Remove payment history for ${item.client_name || 'this client'}?`)) return
    const updatePayload: any = { notes: 'PAYMENT_REMOVED: hidden from reception history' }
    const table = item.type === 'quote' ? 'quotes' : 'job_cards'
    const { error } = await supabase.from(table).update(updatePayload).eq('id', item.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Payment history removed')
    loadData()
  }

  async function deleteWalkin(id: string) {
    if (!confirm('Delete this walk-in payment?')) return
    const { error } = await supabase.from('job_cards').delete().eq('id', id)
    if (error) { toast.error('Failed to delete'); return }
    toast.success('Walk-in deleted')
    loadData()
  }

  async function saveEditWalkin() {
    if (!editingWalkin || !editAmount) return
    const total = parseFloat(editAmount)
    const notes = `Walk-in | Method: ${editMethod} | Amount: N$${total}${editNote ? ' | Note: ' + editNote : ''}`
    const { error } = await supabase.from('job_cards').update({
      total,
      subtotal: parseFloat((total / 1.15).toFixed(2)),
      vat_amount: parseFloat((total - total / 1.15).toFixed(2)),
      notes,
    }).eq('id', editingWalkin.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Walk-in updated')
    setEditingWalkin(null)
    loadData()
  }

  async function searchClients(name: string) {
    if (!name.trim() || name.length < 2) { setClientSuggestions([]); return }
    const { data } = await supabase.from('clients')
      .select('id, name, company').ilike('name', `%${name}%`).limit(5)
    setClientSuggestions(data || [])
  }

  async function saveWalkin() {
    if (!walkinName.trim() || !walkinAmount) return
    setIsSavingWalkin(true)
    try {
      const total = parseFloat(walkinAmount)
      let clientId = walkinClientId
      if (!clientId) {
        const { data: existing } = await supabase.from('clients')
          .select('id').ilike('name', walkinName.trim()).limit(1)
        if (existing && existing.length > 0) {
          clientId = existing[0].id
        } else {
          const { data: newClient } = await supabase.from('clients')
            .insert({ name: walkinName.trim(), created_by: profile?.id }).select('id').single()
          if (newClient) {
            clientId = newClient.id
            if (walkinPhone) {
              await supabase.from('client_phones').insert({
                client_id: clientId, phone: walkinPhone, is_primary: true
              })
            }
          }
        }
      }

      const year = new Date().getFullYear()
      const rand = Math.floor(Math.random() * 9000) + 1000
      const { error } = await supabase.from('job_cards').insert({
        job_number: `WI-${rand}-${year}`,
        title: walkinNote ? `Walk-in: ${walkinNote}` : `Walk-in Payment`,
        client_name: walkinName.trim(),
        client_id: clientId,
        status: 'delivered',
        priority: 'normal',
        is_retail: false,
        total,
        subtotal: parseFloat((total / 1.15).toFixed(2)),
        vat_amount: parseFloat((total - total / 1.15).toFixed(2)),
        vat_rate: 15,
        notes: `Walk-in | Method: ${walkinMethod} | Amount: N$${total}`,
        created_by: profile?.id,
      })
      if (error) throw error

      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (admins && profile) {
        await supabase.from('notifications').insert(admins.map((a: any) => ({
          recipient_id: a.id, sender_id: profile.id, type: 'payment_received',
          title: '💰 Walk-in Payment',
          message: `${walkinName} paid ${formatCurrency(total)} (${walkinMethod}) — walk-in`,
          entity_type: 'job_card', entity_id: null,
        })))
      }

      toast.success(`Walk-in recorded — ${walkinName} paid ${formatCurrency(total)}`)
      setWalkinName(''); setWalkinPhone(''); setWalkinAmount('')
      setWalkinNote(''); setWalkinClientId(null); setClientSuggestions([])
      loadData()
    } catch (err: any) { toast.error(`Failed: ${err.message}`) }
    finally { setIsSavingWalkin(false) }
  }

  const filteredItems = items.filter(i =>
    search ? (i.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
             i.number.toLowerCase().includes(search.toLowerCase()) : true
  )
  const totalOutstanding = filteredItems.reduce((sum, i) => sum + (i.total || 0), 0)

  const MethodBtn = ({ method, label, icon: Icon, state, setState }: any) => (
    <button onClick={() => setState(method)}
      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${
        state === method ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary'
      }`}>
      <Icon className="w-4 h-4" />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )

  return (
    <AppShell>
      <PageHeader title="RECEPTION" subtitle="Collections & Payments" />
      <div className="px-6 pb-6 space-y-4">

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><Package className="w-4 h-4 text-blue-400" /><span className="text-sm text-text-muted">Ready to Collect</span></div>
            <p className="text-2xl font-bold text-blue-400">{collectionItems.length}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><PackageCheck className="w-4 h-4 text-emerald-400" /><span className="text-sm text-text-muted">Delivery/Courier/Install</span></div>
            <p className="text-2xl font-bold text-emerald-400">{deliveryItems.length + courierItems.length + installItems.length}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4 text-amber-400" /><span className="text-sm text-text-muted">Outstanding</span></div>
            <p className="text-2xl font-bold text-amber-400">{formatCurrency(totalOutstanding)}</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-sm text-text-muted">Walk-ins Today</span></div>
            <p className="text-2xl font-bold text-emerald-400">
              {walkinList.filter(w => new Date(w.created_at).toDateString() === new Date().toDateString()).length}
            </p>
          </div>
        </div>

        {(collectionItems.length + deliveryItems.length + courierItems.length + installItems.length + quotePaymentItems.length) > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {[
              { key: 'collection', label: 'Collections', count: collectionItems.length, tone: 'border-blue-500 text-blue-300' },
              { key: 'delivery', label: 'Delivery', count: deliveryItems.length, tone: 'border-emerald-500 text-emerald-300' },
              { key: 'courier', label: 'Courier', count: courierItems.length, tone: 'border-purple-500 text-purple-300' },
              { key: 'installation', label: 'Installation', count: installItems.length, tone: 'border-orange-500 text-orange-300' },
              { key: 'quote_payments', label: 'Quote Payments', count: quotePaymentItems.length, tone: 'border-accent text-accent' },
            ].filter(item => item.count > 0).map(item => (
              <button
                key={item.key}
                onClick={() => setTab(item.key as Tab)}
                className={`card p-4 text-left border-l-4 ${item.tone} hover:bg-bg-hover transition-colors`}
              >
                <p className="text-xs uppercase tracking-wide text-text-muted">Needs Action</p>
                <p className="mt-1 text-2xl font-bold">{item.count}</p>
                <p className="text-sm font-semibold text-text-primary">{item.label}</p>
              </button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {[
            { key: 'collection', label: 'Collections', count: collectionItems.length },
            { key: 'delivery', label: 'Delivery', count: deliveryItems.length },
            { key: 'courier', label: 'Courier', count: courierItems.length },
            { key: 'installation', label: 'Installation', count: installItems.length },
            { key: 'quote_payments', label: 'Quote Payments', count: quotePaymentItems.length },
            { key: 'outstanding', label: 'Outstanding', count: filteredItems.length },
            { key: 'walkin', label: '+ Walk-in' },
            { key: 'walkin_list', label: 'Walk-in List', count: walkinList.length },
            { key: 'history', label: 'History', count: paymentHistory.length },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as Tab)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
                tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-accent/20 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* COLLECTIONS TAB */}
        {tab === 'collection' && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="card py-12 text-center text-text-muted">Loading...</div>
            ) : collectionItems.length === 0 ? (
              <div className="card py-12 text-center">
                <PackageCheck className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-50" />
                <p className="text-text-muted">No orders waiting for collection</p>
              </div>
            ) : (
              <>
                {collectionItems.map(item => (
                  <div key={item.id} className="card p-4 border-l-4 border-blue-500">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-accent">{item.number || item.job_number}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-blue-500/20 text-blue-300">
                            {item.status}
                          </span>
                          {item.is_retail && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-red-500/20 text-red-300">
                              Retail
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-text-primary">{item.client_name || 'Unknown'}</p>
                        <p className="text-sm text-text-muted mt-0.5 truncate">{item.title}</p>
                        <p className="text-sm font-semibold text-text-primary mt-1">{formatCurrency(item.total)}</p>
                      </div>
                      <button
                        onClick={() => markCollected(item)}
                        className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors"
                      >
                        <CheckCheck className="w-4 h-4" />
                        Collected
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Show collected history toggle */}
            {collectedItems.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowCollected(!showCollected)}
                  className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 mb-3"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {showCollected ? 'Hide' : 'Show'} collected ({collectedItems.length})
                </button>
                {showCollected && collectedItems.map(item => (
                  <div key={item.id} className="card p-4 border-l-4 border-emerald-500 opacity-60 mb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-accent">{item.number || item.job_number}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-emerald-500/20 text-emerald-300">
                            Collected ✓
                          </span>
                        </div>
                        <p className="font-semibold text-text-primary">{item.client_name || 'Unknown'}</p>
                        <p className="text-sm text-text-muted mt-0.5 truncate">{item.title}</p>
                        <p className="text-sm font-semibold text-text-primary mt-1">{formatCurrency(item.total)}</p>
                      </div>
                      <button
                        onClick={() => deleteCollectedItem(item)}
                        className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 font-semibold text-xs transition-colors"
                        title="Remove collected history"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}



        {/* DELIVERY TAB */}
        {tab === 'delivery' && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="card py-12 text-center text-text-muted">Loading...</div>
            ) : deliveryItems.length === 0 ? (
              <div className="card py-12 text-center text-text-muted">No orders waiting for delivery</div>
            ) : deliveryItems.map(item => (
              <div id={`reception-job-${item.id}`} key={item.id} className="card p-4 border-l-4 border-emerald-500">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-accent">{item.job_number}</span>
                    <p className="font-semibold text-text-primary mt-1">{getNoteValue(item.notes, 'DELIVERY_NAME') || item.client_name || 'Unknown'}</p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {fulfillmentRows(item, 'delivery').map(([label, value]) => (
                        <p key={label} className="text-sm text-text-secondary"><span className="text-text-muted">{label}:</span> {value}</p>
                      ))}
                    </div>
                    <p className="text-xs text-text-muted mt-1">{item.title}</p>
                  </div>
                  <button onClick={() => markFulfillmentDone(item, DELIVERY_PENDING_TAG, DELIVERY_DELIVERED_TAG, 'Delivered')} className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors">
                    <CheckCheck className="w-4 h-4" /> Delivered
                  </button>
                </div>
              </div>
            ))}
            {deliveredItems.length > 0 && (
              <div className="mt-4">
                <button onClick={() => setShowDelivered(!showDelivered)} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 mb-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {showDelivered ? 'Hide' : 'Show'} delivered ({deliveredItems.length})
                </button>
                {showDelivered && deliveredItems.map(item => (
                  <div key={item.id} className="card p-4 border-l-4 border-emerald-500 opacity-60 mb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-accent">{item.job_number}</span>
                        <p className="font-semibold text-text-primary">{getNoteValue(item.notes, 'DELIVERY_NAME') || item.client_name || 'Unknown'}</p>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          {fulfillmentRows(item, 'delivery').map(([label, value]) => (
                            <p key={label} className="text-sm text-text-secondary"><span className="text-text-muted">{label}:</span> {value}</p>
                          ))}
                        </div>
                        <p className="text-xs text-text-muted">{item.title}</p>
                      </div>
                      <button onClick={() => deleteFulfillmentHistory(item, DELIVERY_PENDING_TAG, DELIVERY_DELIVERED_TAG, 'Delivered')} className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 font-semibold text-xs transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COURIER TAB */}
        {tab === 'courier' && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="card py-12 text-center text-text-muted">Loading...</div>
            ) : courierItems.length === 0 ? (
              <div className="card py-12 text-center text-text-muted">No orders waiting for courier</div>
            ) : courierItems.map(item => (
              <div id={`reception-job-${item.id}`} key={item.id} className="card p-4 border-l-4 border-purple-500">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-accent">{item.job_number}</span>
                    <p className="font-semibold text-text-primary mt-1">{getNoteValue(item.notes, 'COURIER_COMPANY') || 'Courier'}</p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {fulfillmentRows(item, 'courier').map(([label, value]) => (
                        <p key={label} className="text-sm text-text-secondary"><span className="text-text-muted">{label}:</span> {value}</p>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => markFulfillmentDone(item, COURIER_PENDING_TAG, COURIER_COURIERED_TAG, 'Couriered')} className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-semibold text-sm transition-colors">
                    <CheckCheck className="w-4 h-4" /> Couriered
                  </button>
                </div>
              </div>
            ))}
            {courieredItems.length > 0 && (
              <div className="mt-4">
                <button onClick={() => setShowCouriered(!showCouriered)} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 mb-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {showCouriered ? 'Hide' : 'Show'} couriered ({courieredItems.length})
                </button>
                {showCouriered && courieredItems.map(item => (
                  <div key={item.id} className="card p-4 border-l-4 border-purple-500 opacity-60 mb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-accent">{item.job_number}</span>
                        <p className="font-semibold text-text-primary">{getNoteValue(item.notes, 'COURIER_COMPANY') || 'Courier'}</p>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                          {fulfillmentRows(item, 'courier').map(([label, value]) => (
                            <p key={label} className="text-sm text-text-secondary"><span className="text-text-muted">{label}:</span> {value}</p>
                          ))}
                        </div>
                        <p className="text-xs text-text-muted">{item.title}</p>
                      </div>
                      <button onClick={() => deleteFulfillmentHistory(item, COURIER_PENDING_TAG, COURIER_COURIERED_TAG, 'Couriered')} className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 font-semibold text-xs transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* INSTALLATION TAB */}
        {tab === 'installation' && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="card py-12 text-center text-text-muted">Loading...</div>
            ) : installItems.length === 0 ? (
              <div className="card py-12 text-center text-text-muted">No orders waiting for installation/application</div>
            ) : installItems.map(item => (
              <div key={item.id} className="card p-4 border-l-4 border-orange-500">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-xs text-accent">{item.job_number}</span>
                    <p className="font-semibold text-text-primary mt-1">{getNoteValue(item.notes, 'INSTALL_CONTACT') || item.client_name || 'Unknown'}</p>
                    <p className="text-sm text-text-muted">{getNoteValue(item.notes, 'INSTALL_NUMBER')}</p>
                    <p className="text-sm text-text-muted">{getNoteValue(item.notes, 'INSTALL_ADDRESS')}</p>
                    {getNoteValue(item.notes, 'INSTALL_DATE') && <p className="text-xs text-text-muted mt-1">Preferred: {getNoteValue(item.notes, 'INSTALL_DATE')}</p>}
                    {getNoteValue(item.notes, 'INSTALL_NOTES') && <p className="text-xs text-text-muted mt-1">{getNoteValue(item.notes, 'INSTALL_NOTES')}</p>}
                    <p className="text-xs text-text-muted mt-1">Applicator: Wilvert</p>
                  </div>
                  <button onClick={() => markFulfillmentDone(item, INSTALL_PENDING_TAG, INSTALL_DONE_TAG, 'Installed / Applied')} className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-semibold text-sm transition-colors">
                    <CheckCheck className="w-4 h-4" /> Installed / Applied
                  </button>
                </div>
              </div>
            ))}
            {installedItems.length > 0 && (
              <div className="mt-4">
                <button onClick={() => setShowInstalled(!showInstalled)} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1 mb-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {showInstalled ? 'Hide' : 'Show'} installed/applied ({installedItems.length})
                </button>
                {showInstalled && installedItems.map(item => (
                  <div key={item.id} className="card p-4 border-l-4 border-orange-500 opacity-60 mb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-xs text-accent">{item.job_number}</span>
                        <p className="font-semibold text-text-primary">{getNoteValue(item.notes, 'INSTALL_CONTACT') || item.client_name || 'Unknown'}</p>
                        <p className="text-xs text-text-muted">{item.title}</p>
                      </div>
                      <button onClick={() => deleteFulfillmentHistory(item, INSTALL_PENDING_TAG, INSTALL_DONE_TAG, 'Installed / Applied')} className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 font-semibold text-xs transition-colors">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QUOTE PAYMENTS TAB */}
        {tab === 'quote_payments' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search quote, client or company..." />
            </div>
            {isLoading ? (
              <div className="card py-12 text-center text-text-muted">Loading...</div>
            ) : quotePaymentItems.filter(q => {
              const ql = search.toLowerCase()
              return !ql || q.quote_number.toLowerCase().includes(ql) || String(q.client_name || '').toLowerCase().includes(ql) || String(q.company || '').toLowerCase().includes(ql)
            }).length === 0 ? (
              <div className="card py-12 text-center text-text-muted">No active quotes for reception payments</div>
            ) : quotePaymentItems.filter(q => {
              const ql = search.toLowerCase()
              return !ql || q.quote_number.toLowerCase().includes(ql) || String(q.client_name || '').toLowerCase().includes(ql) || String(q.company || '').toLowerCase().includes(ql)
            }).map(quote => {
              const paid = quotePaidAmount(quote)
              const outstanding = Math.max(Number(quote.total || 0) - paid, 0)
              const paymentStatus = quotePaymentStatus(quote)
              const isPaid = String(paymentStatus || '').toLowerCase() === 'paid' || outstanding <= 0
              const itemsPreview = (quote.items || []).slice(0, 3)
              return (
                <div key={quote.id} className="card p-4 border-l-4 border-accent">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-accent">{quote.quote_number}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-blue-500/20 text-blue-300">{quote.status}</span>
                        {paymentStatus && <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${isPaid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>{paymentStatus}</span>}
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary">{quote.client_name || 'Unknown client'}</p>
                        {quote.company && <p className="text-sm text-text-secondary">{quote.company}</p>}
                        {quote.client_email && <p className="text-xs text-text-muted">{quote.client_email}</p>}
                      </div>
                      {itemsPreview.length > 0 && (
                        <div className="rounded-lg bg-bg-elevated border border-border divide-y divide-border/60 max-w-2xl">
                          {itemsPreview.map((item, index) => (
                            <div key={`${quote.id}-${index}`} className="flex justify-between gap-3 px-3 py-2 text-xs">
                              <span className="text-text-secondary truncate">{item.quantity} x {item.description}</span>
                              <span className="font-semibold text-text-primary shrink-0">{formatCurrency(item.line_total || 0)}</span>
                            </div>
                          ))}
                          {(quote.items || []).length > 3 && <div className="px-3 py-2 text-xs text-text-muted">+ {(quote.items || []).length - 3} more items</div>}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 lg:w-64 space-y-3">
                      <div className="rounded-lg bg-bg-elevated border border-border p-3 space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-text-muted">Total</span><span className="font-semibold">{formatCurrency(quote.total)}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">Paid</span><span className="font-semibold text-emerald-400">{formatCurrency(paid)}</span></div>
                        <div className="flex justify-between"><span className="text-text-muted">Outstanding</span><span className="font-bold text-amber-400">{formatCurrency(outstanding)}</span></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => approveQuoteFromReception(quote)} disabled={quote.status === 'approved'} className="btn-secondary btn-sm flex-1 disabled:opacity-50">
                          Approved
                        </button>
                        <button onClick={() => { setQuotePaymentTarget(quote); setQuotePayAmount(outstanding > 0 ? outstanding.toFixed(2) : ''); setQuotePayNote('') }} className="btn-primary btn-sm flex-1">
                          Receive
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* OUTSTANDING TAB */}
        {tab === 'outstanding' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search by name or number..." />
            </div>
            {isLoading ? <div className="card py-12 text-center text-text-muted">Loading...</div>
              : filteredItems.length === 0 ? (
                <div className="card py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-50" />
                  <p className="text-text-muted">All accounts settled!</p>
                </div>
              ) : filteredItems.map(item => {
                const outstanding = item.total - (item.amount_paid || 0)
                return (
                  <div key={item.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-accent">{item.number}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${item.type === 'quote' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {item.type === 'quote' ? 'Quote' : 'Job'}
                          </span>
                          {item.payment_status === 'partial' && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-amber-500/20 text-amber-300">Partial</span>}
                        </div>
                        <p className="font-semibold text-text-primary">{item.client_name || 'Unknown'}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-sm text-text-muted">Total: <span className="font-medium text-text-primary">{formatCurrency(item.total)}</span></span>
                          <span className="text-sm text-text-muted">Outstanding: <span className="text-amber-400 font-bold">{formatCurrency(outstanding)}</span></span>
                        </div>
                      </div>
                      <button onClick={() => { setPayingItem(item); setPayAmount(outstanding.toFixed(2)) }} className="btn-primary btn-sm shrink-0">
                        <Banknote className="w-3.5 h-3.5" /> Receive
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div className="space-y-3">
            {paymentHistory.length === 0 ? (
              <div className="card py-12 text-center text-text-muted">No payment history yet</div>
            ) : paymentHistory.map(item => {
              // Parse payment info from notes
              const amountMatch = item.notes?.match(/PAID: N\\$([\d.]+)/)
              const methodMatch = item.notes?.match(/\((cash|card|eft)\)/)
              const noteMatch = item.notes?.match(/\) - (.+?) on /)
              const dateMatch = item.notes?.match(/on (.+)$/)
              return (
                <div key={item.id} className="card p-4 border-l-4 border-emerald-500">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-accent">{item.number || item.job_number}</span>
                        {methodMatch && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                            methodMatch[1] === 'cash' ? 'bg-emerald-500/20 text-emerald-300' :
                            methodMatch[1] === 'card' ? 'bg-blue-500/20 text-blue-300' :
                            'bg-purple-500/20 text-purple-300'
                          }`}>{methodMatch[1]}</span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-emerald-500/20 text-emerald-300">Paid</span>
                      </div>
                      <p className="font-semibold text-text-primary">{item.client_name || 'Unknown'}</p>
                      <p className="text-xs text-text-muted mt-0.5 truncate">{item.title}</p>
                      {noteMatch && <p className="text-xs text-text-muted mt-0.5">Note: {noteMatch[1]}</p>}
                      {dateMatch && <p className="text-[11px] text-text-muted mt-1">{dateMatch[1]}</p>}
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-2">
                      <p className="text-lg font-bold text-emerald-400">
                        N${amountMatch ? amountMatch[1] : item.total}
                      </p>
                      <button
                        onClick={() => deletePaymentHistory(item)}
                        className="btn-sm px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg border border-red-500/30 flex items-center gap-1"
                        title="Remove payment history"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* WALK-IN TAB */}
        {tab === 'walkin' && (
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-text-primary mb-1">Quick Walk-in Payment</h3>
              <p className="text-xs text-text-muted">Search existing clients or add a new one</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 relative">
                <label className="label">Client Name *</label>
                <input value={walkinName}
                  onChange={e => { setWalkinName(e.target.value); setWalkinClientId(null); searchClients(e.target.value) }}
                  className="input" placeholder="Search or type name..." />
                {clientSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-bg-elevated border border-border rounded-md shadow-elevated mt-1 max-h-40 overflow-y-auto">
                    {clientSuggestions.map(c => (
                      <div key={c.id} className="px-3 py-2 hover:bg-bg-hover cursor-pointer"
                        onMouseDown={() => { setWalkinName(c.name); setWalkinClientId(c.id); setClientSuggestions([]) }}>
                        <p className="text-sm font-medium text-text-primary">{c.name}</p>
                        {c.company && <p className="text-xs text-text-muted">{c.company}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {walkinClientId && <p className="text-xs text-emerald-400 mt-1">✓ Existing client found</p>}
              </div>
              <div>
                <label className="label">Phone</label>
                <input value={walkinPhone} onChange={e => setWalkinPhone(e.target.value)} className="input" placeholder="081 234 5678" />
              </div>
              <div>
                <label className="label">Amount *</label>
                <input value={walkinAmount} onChange={e => setWalkinAmount(e.target.value)} className="input" placeholder="0.00" type="number" step="0.01" />
              </div>
            </div>
            <div>
              <label className="label mb-2">Payment Method</label>
              <div className="flex gap-2">
                <MethodBtn method="cash" label="Cash" icon={Banknote} state={walkinMethod} setState={setWalkinMethod} />
                <MethodBtn method="card" label="Card" icon={CreditCard} state={walkinMethod} setState={setWalkinMethod} />
                <MethodBtn method="eft" label="EFT" icon={Building2} state={walkinMethod} setState={setWalkinMethod} />
              </div>
            </div>
            <div>
              <label className="label">Note (what did they pay for?)</label>
              <input value={walkinNote} onChange={e => setWalkinNote(e.target.value)} className="input" placeholder="e.g. Business cards, Vehicle wrap deposit..." />
            </div>
            <button onClick={saveWalkin} disabled={isSavingWalkin || !walkinName || !walkinAmount} className="btn-primary w-full">
              {isSavingWalkin ? <><span className="spinner w-4 h-4" /> Saving...</> : <><Plus className="w-4 h-4" /> Record Walk-in Payment</>}
            </button>
          </div>
        )}

        {/* WALK-IN LIST TAB */}
        {tab === 'walkin_list' && (
          <div className="space-y-3">
            {walkinList.length === 0 ? (
              <div className="card py-12 text-center text-text-muted">No walk-in payments yet</div>
            ) : walkinList.map(w => (
              <div key={w.id} className="card p-4 border-l-4 border-blue-500">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-accent">{w.job_number}</span>
                      {w.notes?.includes('Method: cash') && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">Cash</span>}
                      {w.notes?.includes('Method: card') && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold">Card</span>}
                      {w.notes?.includes('Method: eft') && <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold">EFT</span>}
                      {!w.notes?.includes('Method:') && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">Cash</span>}
                    </div>
                    <p className="font-semibold text-text-primary">{w.client_name}</p>
                    {w.notes && <p className="text-xs text-text-muted mt-0.5">{w.notes}</p>}
                    <p className="text-[11px] text-text-muted mt-1">{new Date(w.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <p className="text-lg font-bold text-emerald-400">{formatCurrency(w.total)}</p>
                    <div className="flex gap-1">
                      <button onClick={() => {
                        setEditingWalkin(w)
                        setEditAmount(w.total.toString())
                        setEditNote(w.notes || '')
                        setEditMethod(w.notes?.includes('card') ? 'card' : w.notes?.includes('eft') ? 'eft' : 'cash')
                      }} className="btn-secondary btn-sm text-xs px-2 py-1">Edit</button>
                      <button onClick={() => deleteWalkin(w.id)} className="btn-sm px-2 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg border border-red-500/30">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit walkin modal */}
      {editingWalkin && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-2xl w-full max-w-sm shadow-modal">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <p className="font-semibold text-text-primary">Edit Walk-in</p>
                <p className="text-xs text-text-muted">{editingWalkin.client_name}</p>
              </div>
              <button onClick={() => setEditingWalkin(null)} className="btn-icon w-7 h-7"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Amount</label>
                <input value={editAmount} onChange={e => setEditAmount(e.target.value)} className="input text-lg font-bold" type="number" step="0.01" />
              </div>
              <div>
                <label className="label mb-2">Method</label>
                <div className="flex gap-2">
                  {(['cash', 'card', 'eft'] as PaymentMethod[]).map(m => (
                    <button key={m} onClick={() => setEditMethod(m)}
                      className={`flex-1 py-2 rounded-xl border-2 text-xs font-semibold transition-all ${editMethod === m ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary'}`}>
                      {m.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Note</label>
                <input value={editNote} onChange={e => setEditNote(e.target.value)} className="input" placeholder="Note..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingWalkin(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={saveEditWalkin} className="btn-primary flex-1">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {payingItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-2xl w-full max-w-sm shadow-modal">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <p className="font-semibold text-text-primary">Record Payment</p>
                <p className="text-xs text-text-muted">{payingItem.number} · {payingItem.client_name}</p>
              </div>
              <button onClick={() => setPayingItem(null)} className="btn-icon w-7 h-7"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-bg-elevated rounded-xl p-3 flex justify-between">
                <span className="text-sm text-text-muted">Outstanding</span>
                <span className="font-bold text-amber-400">{formatCurrency(payingItem.total - (payingItem.amount_paid || 0))}</span>
              </div>
              <div>
                <label className="label">Amount Received</label>
                <input value={payAmount} onChange={e => setPayAmount(e.target.value)} className="input text-lg font-bold" type="number" step="0.01" />
              </div>
              <div>
                <label className="label mb-2">Method</label>
                <div className="flex gap-2">
                  <MethodBtn method="cash" label="Cash" icon={Banknote} state={payMethod} setState={setPayMethod} />
                  <MethodBtn method="card" label="Card" icon={CreditCard} state={payMethod} setState={setPayMethod} />
                  <MethodBtn method="eft" label="EFT" icon={Building2} state={payMethod} setState={setPayMethod} />
                </div>
              </div>
              <div>
                <label className="label">Note</label>
                <input value={payNote} onChange={e => setPayNote(e.target.value)} className="input" placeholder="Optional" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPayingItem(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={recordPayment} disabled={isSaving || !payAmount} className="btn-primary flex-1">
                  {isSaving ? <><span className="spinner w-4 h-4" /> Saving...</> : '✓ Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote payment modal */}
      {quotePaymentTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-bg-surface border border-border rounded-2xl w-full max-w-sm shadow-modal">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <p className="font-semibold text-text-primary">Receive Quote Payment</p>
                <p className="text-xs text-text-muted">{quotePaymentTarget.quote_number} · {quotePaymentTarget.client_name}</p>
              </div>
              <button onClick={() => setQuotePaymentTarget(null)} className="btn-icon w-7 h-7"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="bg-bg-elevated rounded-xl p-3 flex justify-between">
                <span className="text-sm text-text-muted">Outstanding</span>
                <span className="font-bold text-amber-400">{formatCurrency(Math.max((quotePaymentTarget.total || 0) - quotePaidAmount(quotePaymentTarget), 0))}</span>
              </div>
              <div>
                <label className="label">Amount Received</label>
                <input value={quotePayAmount} onChange={e => setQuotePayAmount(e.target.value)} className="input text-lg font-bold" type="number" step="0.01" />
              </div>
              <div>
                <label className="label mb-2">Method</label>
                <div className="flex gap-2">
                  <MethodBtn method="cash" label="Cash" icon={Banknote} state={quotePayMethod} setState={setQuotePayMethod} />
                  <MethodBtn method="card" label="Card" icon={CreditCard} state={quotePayMethod} setState={setQuotePayMethod} />
                  <MethodBtn method="eft" label="EFT" icon={Building2} state={quotePayMethod} setState={setQuotePayMethod} />
                </div>
              </div>
              <div>
                <label className="label">Reception Comment</label>
                <input value={quotePayNote} onChange={e => setQuotePayNote(e.target.value)} className="input" placeholder="Deposit, full payment, EFT reference..." />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setQuotePaymentTarget(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={recordQuotePayment} disabled={isSaving || !quotePayAmount} className="btn-primary flex-1">
                  {isSaving ? <><span className="spinner w-4 h-4" /> Saving...</> : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

export default function ReceptionPage() {
  return <Suspense fallback={null}><ReceptionPageInner /></Suspense>
}
