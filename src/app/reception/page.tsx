'use client'

import { useEffect, useState, Suspense } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import {
  CreditCard, Banknote, Building2, CheckCircle2,
  AlertCircle, Search, Plus, X, Package, PackageCheck, CheckCheck
} from 'lucide-react'

type PaymentMethod = 'cash' | 'card' | 'eft'
type Tab = 'collection' | 'outstanding' | 'walkin' | 'walkin_list' | 'history'

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
  collection_status: string | null
  is_retail: boolean
  created_at: string
}

function ReceptionPageInner() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('collection')
  const [items, setItems] = useState<PayableItem[]>([])
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([])
  const [collectedItems, setCollectedItems] = useState<CollectionItem[]>([])
  const [walkinList, setWalkinList] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [payingItem, setPayingItem] = useState<PayableItem | null>(null)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showCollected, setShowCollected] = useState(false)
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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      // ALL completed/delivered jobs waiting for or already collected (both retail and non-retail)
      const { data: collData } = await supabase
        .from('job_cards')
        .select('id, job_number, title, client_name, total, status, collection_status, is_retail, created_at')
        .in('status', ['completed', 'delivered'])
        .not('job_number', 'like', 'WI-%')
        .order('created_at', { ascending: false })

      const pending = (collData || []).filter((j: any) => j.collection_status !== 'collected')
      const collected = (collData || []).filter((j: any) => j.collection_status === 'collected')
      setCollectionItems(pending as CollectionItem[])
      setCollectedItems(collected as CollectionItem[])

      // Outstanding payments
      const [{ data: quotes }, { data: jobs }] = await Promise.all([
        supabase.from('quotes').select('id, quote_number, client_name, total, status, created_at')
          .not('status', 'in', '(draft,cancelled)').order('created_at', { ascending: false }).limit(20),
        supabase.from('job_cards').select('id, job_number, client_name, total, status, created_at')
          .in('status', ['completed']).not('job_number', 'like', 'WI-%').order('created_at', { ascending: false }),
      ])

      setItems([
        ...((quotes || []).map((q: any) => ({ ...q, type: 'quote' as const, number: q.quote_number }))),
        ...((jobs || []).map((j: any) => ({ ...j, type: 'job' as const, number: j.job_number }))),
      ])

      // Walk-in list
      const { data: wiData } = await supabase
        .from('job_cards')
        .select('id, job_number, client_name, total, notes, created_at')
        .like('job_number', 'WI-%')
        .order('created_at', { ascending: false })
        .limit(50)
      setWalkinList(wiData || [])

      // Payment history - job cards and quotes with PAID notes
      const { data: histData } = await supabase
        .from('job_cards')
        .select('id, job_number, title, client_name, total, notes, updated_at')
        .like('notes', 'PAID:%')
        .not('job_number', 'like', 'WI-%')
        .order('updated_at', { ascending: false })
        .limit(50)
      setPaymentHistory(histData || [])

    } finally { setIsLoading(false) }
  }

  async function markCollected(item: CollectionItem) {
    const { error } = await supabase.from('job_cards').update({
      collection_status: 'collected',
      collected_at: new Date().toISOString(),
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
        entity_type: 'job_card', entity_id: item.id,
      })))
    }

    toast.success(`✅ ${item.client_name} collected their order`)
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
      // Remove from outstanding by changing status to delivered when fully paid
      if (fullyPaid) {
        updatePayload.status = 'delivered'
      }
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
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><Package className="w-4 h-4 text-blue-400" /><span className="text-sm text-text-muted">Ready to Collect</span></div>
            <p className="text-2xl font-bold text-blue-400">{collectionItems.length}</p>
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

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {[
            { key: 'collection', label: '📦 Collections', count: collectionItems.length },
            { key: 'outstanding', label: '💳 Outstanding', count: filteredItems.length },
            { key: 'walkin', label: '+ Walk-in' },
            { key: 'walkin_list', label: 'Walk-in List', count: walkinList.length },
            { key: 'history', label: '🕑 History', count: paymentHistory.length },
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
                          <span className="font-mono text-xs text-accent">{item.job_number}</span>
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
                          <span className="font-mono text-xs text-accent">{item.job_number}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase bg-emerald-500/20 text-emerald-300">
                            Collected ✓
                          </span>
                        </div>
                        <p className="font-semibold text-text-primary">{item.client_name || 'Unknown'}</p>
                        <p className="text-sm text-text-muted mt-0.5 truncate">{item.title}</p>
                        <p className="text-sm font-semibold text-text-primary mt-1">{formatCurrency(item.total)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                        <span className="font-mono text-xs text-accent">{item.job_number}</span>
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
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-emerald-400">
                        N${amountMatch ? amountMatch[1] : item.total}
                      </p>
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
    </AppShell>
  )
}

export default function ReceptionPage() {
  return <Suspense fallback={null}><ReceptionPageInner /></Suspense>
}
