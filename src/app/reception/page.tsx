'use client'

import { useEffect, useState } from 'react'
import { MobileShell } from '@/components/mobile/MobileShell'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import { PackageCheck, Banknote, CreditCard, Building2, Plus, X, Search } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'collection' | 'walkin' | 'walkin_list'
type Method = 'cash' | 'card' | 'eft'

export default function MobileReception() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('collection')
  const [collections, setCollections] = useState<any[]>([])
  const [walkins, setWalkins] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Walk-in form
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<Method>('cash')
  const [note, setNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [clientId, setClientId] = useState<string|null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setIsLoading(true)
    const [{ data: coll }, { data: wi }] = await Promise.all([
      supabase.from('job_cards').select('id, job_number, title, client_name, total, status')
        .eq('status', 'completed').not('job_number', 'like', 'WI-%').order('created_at', { ascending: false }),
      supabase.from('job_cards').select('id, job_number, client_name, total, notes, created_at')
        .like('job_number', 'WI-%').order('created_at', { ascending: false }).limit(30),
    ])
    setCollections(coll || [])
    setWalkins(wi || [])
    setIsLoading(false)
  }

  async function markCollected(item: any) {
    const { error } = await supabase.from('job_cards').update({ status: 'delivered' }).eq('id', item.id)
    if (error) { toast.error('Failed'); return }
    const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
    if (admins && profile) {
      await supabase.from('notifications').insert(admins.map((a: any) => ({
        recipient_id: a.id, sender_id: profile.id, type: 'job_collected',
        title: '📦 Job Collected',
        message: `${item.client_name} collected ${item.job_number}`,
        entity_type: 'job_card', entity_id: item.id,
      })))
    }
    toast.success(`✅ Marked as collected`)
    loadData()
  }

  async function searchClients(val: string) {
    if (val.length < 2) { setSuggestions([]); return }
    const { data } = await supabase.from('clients').select('id, name').ilike('name', `%${val}%`).limit(5)
    setSuggestions(data || [])
  }

  async function saveWalkin() {
    if (!name.trim() || !amount) return
    setIsSaving(true)
    try {
      const total = parseFloat(amount)
      let cId = clientId
      if (!cId) {
        const { data: existing } = await supabase.from('clients').select('id').ilike('name', name.trim()).limit(1)
        if (existing && existing.length > 0) {
          cId = existing[0].id
        } else {
          const { data: nc } = await supabase.from('clients').insert({ name: name.trim(), created_by: profile?.id }).select('id').single()
          if (nc) {
            cId = nc.id
            if (phone) await supabase.from('client_phones').insert({ client_id: cId, phone, is_primary: true })
          }
        }
      }
      const year = new Date().getFullYear()
      const rand = Math.floor(Math.random() * 9000) + 1000
      const { error } = await supabase.from('job_cards').insert({
        job_number: `WI-${rand}-${year}`,
        title: note ? `Walk-in: ${note}` : 'Walk-in Payment',
        client_name: name.trim(), client_id: cId,
        status: 'delivered', priority: 'normal', is_retail: false,
        total, subtotal: parseFloat((total/1.15).toFixed(2)),
        vat_amount: parseFloat((total - total/1.15).toFixed(2)), vat_rate: 15,
        notes: `Walk-in | Method: ${method} | Amount: N$${total}${note ? ' | Note: ' + note : ''}`,
        created_by: profile?.id,
      })
      if (error) throw error
      toast.success(`Walk-in saved — ${formatCurrency(total)}`)
      setName(''); setPhone(''); setAmount(''); setNote(''); setClientId(null); setSuggestions([])
      loadData()
    } catch (err: any) { toast.error(`Failed: ${err.message}`) }
    finally { setIsSaving(false) }
  }

  return (
    <MobileShell>
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-text-primary mb-4">Reception</h1>

        {/* Tabs */}
        <div className="flex gap-1 bg-bg-elevated rounded-xl p-1 mb-4">
          {[
            { key: 'collection', label: `📦 Collect (${collections.length})` },
            { key: 'walkin', label: '+ Walk-in' },
            { key: 'walkin_list', label: `List (${walkins.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as Tab)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${tab === t.key ? 'bg-accent text-text-inverse' : 'text-text-muted'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Collections */}
        {tab === 'collection' && (
          <div className="space-y-3">
            {isLoading ? [1,2].map(i => <div key={i} className="h-20 bg-bg-elevated rounded-2xl animate-pulse" />) :
              collections.length === 0 ? (
                <div className="bg-bg-surface border border-border rounded-2xl p-8 text-center">
                  <PackageCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-50" />
                  <p className="text-text-muted text-sm">Nothing waiting for collection</p>
                </div>
              ) : collections.map(item => (
                <div key={item.id} className="bg-bg-surface border border-border rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-text-primary">{item.client_name || 'Unknown'}</p>
                      <p className="text-xs text-accent font-mono">{item.job_number}</p>
                      <p className="text-xs text-text-muted mt-0.5 truncate">{item.title}</p>
                      <p className="text-sm font-semibold text-text-primary mt-1">{formatCurrency(item.total)}</p>
                    </div>
                    <button onClick={() => markCollected(item)}
                      className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl px-3 py-2 text-xs font-semibold active:scale-95 transition-transform shrink-0">
                      ✓ Collected
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Walk-in form */}
        {tab === 'walkin' && (
          <div className="space-y-4">
            <div className="relative">
              <label className="label">Client Name *</label>
              <input value={name} onChange={e => { setName(e.target.value); setClientId(null); searchClients(e.target.value) }}
                className="input" placeholder="Search or type name..." />
              {clientId && <p className="text-xs text-emerald-400 mt-1">✓ Existing client</p>}
              {suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-20 bg-bg-elevated border border-border rounded-xl shadow-elevated mt-1">
                  {suggestions.map(c => (
                    <div key={c.id} className="px-3 py-3 hover:bg-bg-hover cursor-pointer border-b border-border/30 last:border-0"
                      onMouseDown={() => { setName(c.name); setClientId(c.id); setSuggestions([]) }}>
                      <p className="text-sm font-medium text-text-primary">{c.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label">Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} className="input" placeholder="081 234 5678" type="tel" />
            </div>

            <div>
              <label className="label">Amount *</label>
              <input value={amount} onChange={e => setAmount(e.target.value)} className="input text-xl font-bold" placeholder="0.00" type="number" step="0.01" inputMode="decimal" />
            </div>

            <div>
              <label className="label mb-2">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cash','card','eft'] as Method[]).map(m => (
                  <button key={m} onClick={() => setMethod(m)}
                    className={`flex flex-col items-center gap-2 py-4 rounded-2xl border-2 transition-all active:scale-95 ${method === m ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary'}`}>
                    {m === 'cash' ? <Banknote className="w-6 h-6" /> : m === 'card' ? <CreditCard className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
                    <span className="text-sm font-semibold capitalize">{m}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">What did they pay for?</label>
              <input value={note} onChange={e => setNote(e.target.value)} className="input" placeholder="e.g. Business cards, Vehicle wrap..." />
            </div>

            <button onClick={saveWalkin} disabled={isSaving || !name || !amount}
              className="btn-primary w-full py-4 text-base rounded-2xl">
              {isSaving ? <><span className="spinner w-5 h-5" /> Saving...</> : <><Plus className="w-5 h-5" /> Record Walk-in</>}
            </button>
          </div>
        )}

        {/* Walk-in list */}
        {tab === 'walkin_list' && (
          <div className="space-y-3">
            {walkins.length === 0 ? (
              <div className="bg-bg-surface border border-border rounded-2xl p-8 text-center">
                <p className="text-text-muted text-sm">No walk-in payments yet</p>
              </div>
            ) : walkins.map(w => (
              <div key={w.id} className="bg-bg-surface border border-blue-500/30 border-l-4 border-l-blue-500 rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-text-primary">{w.client_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs text-accent">{w.job_number}</span>
                      {w.notes?.includes('Method: cash') && <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">Cash</span>}
                      {w.notes?.includes('Method: card') && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-semibold">Card</span>}
                      {w.notes?.includes('Method: eft') && <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-semibold">EFT</span>}
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">{new Date(w.created_at).toLocaleString()}</p>
                  </div>
                  <p className="text-xl font-bold text-emerald-400">{formatCurrency(w.total)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  )
}
