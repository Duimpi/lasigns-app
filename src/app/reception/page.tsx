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
  AlertCircle, Search, Plus, X
} from 'lucide-react'

type PaymentMethod = 'cash' | 'card' | 'eft'
type Tab = 'outstanding' | 'paid_today' | 'walkin'

interface PayableItem {
  id: string
  type: 'quote' | 'job'
  number: string
  client_name: string
  total: number
  amount_paid: number
  payment_status: string
  status: string
  created_at: string
}

function ReceptionPageInner() {
  const { profile } = useAuthStore()
  const [tab, setTab] = useState<Tab>('outstanding')
  const [items, setItems] = useState<PayableItem[]>([])
  const [paidToday, setPaidToday] = useState<PayableItem[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [payingItem, setPayingItem] = useState<PayableItem | null>(null)
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [walkinName, setWalkinName] = useState('')
  const [walkinPhone, setWalkinPhone] = useState('')
  const [walkinAmount, setWalkinAmount] = useState('')
  const [walkinMethod, setWalkinMethod] = useState<PaymentMethod>('cash')
  const [walkinNote, setWalkinNote] = useState('')
  const [isSavingWalkin, setIsSavingWalkin] = useState(false)
  const [walkins, setWalkins] = useState<any[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      const [{ data: quotes }, { data: jobs }, { data: paidQ }, { data: paidJ }] = await Promise.all([
        supabase.from('quotes').select('id, quote_number, client_name, total, amount_paid, payment_status, status, created_at')
          .in('payment_status', ['unpaid', 'partial']).not('status', 'in', '(draft,cancelled)').order('created_at', { ascending: false }),
        supabase.from('job_cards').select('id, job_number, client_name, total, amount_paid, payment_status, status, created_at')
          .in('payment_status', ['unpaid', 'partial']).not('status', 'in', '(pending)').order('created_at', { ascending: false }),
        supabase.from('quotes').select('id, quote_number, client_name, total, amount_paid, payment_status, status, created_at')
          .eq('payment_status', 'paid').gte('payment_date', today),
        supabase.from('job_cards').select('id, job_number, client_name, total, amount_paid, payment_status, status, created_at')
          .eq('payment_status', 'paid').gte('payment_date', today),
      ])

      setItems([
        ...((quotes || []).map((q: any) => ({ ...q, type: 'quote' as const, number: q.quote_number }))),
        ...((jobs || []).map((j: any) => ({ ...j, type: 'job' as const, number: j.job_number }))),
      ])
      setPaidToday([
        ...((paidQ || []).map((q: any) => ({ ...q, type: 'quote' as const, number: q.quote_number }))),
        ...((paidJ || []).map((j: any) => ({ ...j, type: 'job' as const, number: j.job_number }))),
      ])
      // Load walk-ins
      try {
        const { data: walkinData } = await supabase
          .from('activity_logs')
          .select('*')
          .eq('entity_type', 'walkin_payment')
          .order('created_at', { ascending: false })
          .limit(50)
        setWalkins((walkinData || []).map((w: any) => ({
          id: w.id,
          client_name: w.details?.client_name,
          phone: w.details?.phone,
          amount: w.details?.amount,
          payment_method: w.details?.payment_method,
          note: w.details?.note,
          created_at: w.created_at,
        })))
      } catch { setWalkins([]) }
    } finally { setIsLoading(false) }
  }

  async function recordPayment() {
    if (!payingItem || !payAmount) return
    setIsSaving(true)
    try {
      const amount = parseFloat(payAmount)
      const newPaid = (payingItem.amount_paid || 0) + amount
      const newStatus = newPaid >= payingItem.total ? 'paid' : 'partial'
      const table = payingItem.type === 'quote' ? 'quotes' : 'job_cards'
      const { error } = await supabase.from(table).update({
        payment_status: newStatus, payment_method: payMethod,
        amount_paid: newPaid, payment_date: new Date().toISOString(), payment_note: payNote || null,
      }).eq('id', payingItem.id)
      if (error) throw error

      // Notify admins
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (admins && profile) {
        await supabase.from('notifications').insert(admins.map(a => ({
          recipient_id: a.id, sender_id: profile.id, type: 'payment_received',
          title: 'Payment Received',
          message: `${payingItem.client_name} paid ${formatCurrency(amount)} (${payMethod}) for ${payingItem.number}`,
          entity_type: payingItem.type, entity_id: payingItem.id,
        })))
      }

      toast.success(newStatus === 'paid' ? '✅ Fully paid!' : '⚠️ Partial payment recorded')
      setPayingItem(null); setPayAmount(''); setPayNote('')
      loadData()
    } catch (err: any) { toast.error(`Failed: ${err.message}`) }
    finally { setIsSaving(false) }
  }

  async function saveWalkin() {
    if (!walkinName.trim() || !walkinAmount) return
    setIsSavingWalkin(true)
    try {
      const total = parseFloat(walkinAmount)
      // Store walk-in as activity log (bypasses schema cache issues)
      const fakeId = crypto.randomUUID()
      const { error } = await supabase.from('activity_logs').insert({
        entity_type: 'walkin_payment',
        entity_id: fakeId,
        action: 'created',
        details: {
          client_name: walkinName.trim(),
          phone: walkinPhone || null,
          amount: total,
          payment_method: walkinMethod,
          note: walkinNote || null,
        },
        performed_by: profile?.id,
      })
      if (error) throw error

      // Notify admins
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin')
      if (admins && profile) {
        await supabase.from('notifications').insert(admins.map((a: any) => ({
          recipient_id: a.id, sender_id: profile.id, type: 'payment_received',
          title: 'Walk-in Payment',
          message: `${walkinName} paid ${formatCurrency(total)} cash (walk-in)`,
          entity_type: 'walkin', entity_id: null,
        })))
      }

      toast.success(`Walk-in recorded — ${walkinName} paid ${formatCurrency(total)}`)
      setWalkinName(''); setWalkinPhone(''); setWalkinAmount(''); setWalkinNote('')
      loadData()
    } catch (err: any) { toast.error(`Failed: ${err.message}`) }
    finally { setIsSavingWalkin(false) }
  }

  const filtered = items.filter(i =>
    search ? (i.client_name || '').toLowerCase().includes(search.toLowerCase()) || i.number.toLowerCase().includes(search.toLowerCase()) : true
  )
  const totalOutstanding = filtered.reduce((sum, i) => sum + (i.total - (i.amount_paid || 0)), 0)
  const totalPaidToday = paidToday.reduce((sum, i) => sum + i.total, 0)

  const MethodBtn = ({ method, icon: Icon, label }: { method: PaymentMethod, icon: any, label: string }) => (
    <button onClick={() => { setPayMethod(method); setWalkinMethod(method) }}
      className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
        payMethod === method || walkinMethod === method
          ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary'
      }`}>
      <Icon className="w-4 h-4" />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  )

  return (
    <AppShell>
      <PageHeader title="RECEPTION" subtitle="Payment collection — Michelle" />
      <div className="px-6 pb-6 space-y-4">

        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4 text-amber-400" /><span className="text-sm text-text-muted">Outstanding</span></div>
            <p className="text-2xl font-bold text-amber-400">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-text-muted mt-1">{filtered.length} items</p>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span className="text-sm text-text-muted">Paid Today</span></div>
            <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalPaidToday)}</p>
            <p className="text-xs text-text-muted mt-1">{paidToday.length} payments</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border">
          {[
            { key: 'outstanding', label: 'Outstanding', count: items.length },
            { key: 'paid_today', label: 'Paid Today', count: paidToday.length },
            { key: 'walkin', label: '+ Walk-in' },
      { key: 'walkins_list', label: 'Walk-in List', count: walkins.length },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as Tab)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-accent/20 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Outstanding */}
        {tab === 'outstanding' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" placeholder="Search by name or number..." />
            </div>
            {isLoading ? <div className="card py-12 text-center text-text-muted">Loading...</div>
              : filtered.length === 0 ? (
                <div className="card py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3 opacity-50" />
                  <p className="text-text-muted">All accounts settled!</p>
                </div>
              ) : filtered.map(item => {
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
                          <span className="text-sm text-text-muted">Total: <span className="text-text-primary font-medium">{formatCurrency(item.total)}</span></span>
                          {(item.amount_paid || 0) > 0 && <span className="text-sm text-text-muted">Paid: <span className="text-emerald-400 font-medium">{formatCurrency(item.amount_paid)}</span></span>}
                          <span className="text-sm text-text-muted">Due: <span className="text-amber-400 font-bold">{formatCurrency(outstanding)}</span></span>
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

        {/* Paid today */}
        {tab === 'paid_today' && (
          <div className="space-y-3">
            {paidToday.length === 0
              ? <div className="card py-12 text-center text-text-muted">No payments today yet</div>
              : paidToday.map(item => (
                <div key={item.id} className="card p-4 border-l-4 border-emerald-500">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs text-accent">{item.number}</span>
                      <p className="font-semibold text-text-primary">{item.client_name}</p>
                    </div>
                    <p className="text-lg font-bold text-emerald-400">{formatCurrency(item.total)}</p>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Walk-in */}
        {tab === 'walkin' && (
          <div className="card p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-text-primary mb-1">Quick Walk-in Payment</h3>
              <p className="text-xs text-text-muted">For clients paying cash without a quote or job card</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Client Name *</label>
                <input value={walkinName} onChange={e => setWalkinName(e.target.value)} className="input" placeholder="Full name" />
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
                {(['cash', 'card', 'eft'] as PaymentMethod[]).map(m => (
                  <button key={m} onClick={() => setWalkinMethod(m)}
                    className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${walkinMethod === m ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary'}`}>
                    {m === 'cash' ? <Banknote className="w-4 h-4" /> : m === 'card' ? <CreditCard className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                    <span className="text-xs font-semibold capitalize">{m}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Note</label>
              <input value={walkinNote} onChange={e => setWalkinNote(e.target.value)} className="input" placeholder="e.g. Business cards" />
            </div>
            <button onClick={saveWalkin} disabled={isSavingWalkin || !walkinName || !walkinAmount} className="btn-primary w-full">
              {isSavingWalkin ? <><span className="spinner w-4 h-4" /> Saving...</> : <><Plus className="w-4 h-4" /> Record Walk-in</>}
            </button>
          </div>
        )}
      </div>

      {/* Walk-ins list */}
      {tab === 'walkins_list' && (
        <div className="space-y-3">
          {walkins.length === 0 ? (
            <div className="card py-12 text-center text-text-muted">No walk-in payments yet</div>
          ) : walkins.map((w: any) => (
            <div key={w.id} className="card p-4 border-l-4 border-blue-500">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-text-primary">{w.client_name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {w.phone && <span className="text-xs text-text-muted">{w.phone}</span>}
                    <span className="text-xs text-text-muted capitalize">{w.payment_method}</span>
                    {w.note && <span className="text-xs text-text-muted">{w.note}</span>}
                  </div>
                  <p className="text-[11px] text-text-muted mt-1">{new Date(w.created_at).toLocaleString()}</p>
                </div>
                <p className="text-lg font-bold text-emerald-400">{formatCurrency(w.amount)}</p>
              </div>
            </div>
          ))}
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
                  {(['cash', 'card', 'eft'] as PaymentMethod[]).map(m => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all ${payMethod === m ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary'}`}>
                      {m === 'cash' ? <Banknote className="w-4 h-4" /> : m === 'card' ? <CreditCard className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                      <span className="text-xs font-semibold capitalize">{m}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Note</label>
                <input value={payNote} onChange={e => setPayNote(e.target.value)} className="input" placeholder="Optional note" />
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
