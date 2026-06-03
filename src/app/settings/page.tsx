'use client'

import { useEffect, useState, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Plus, Trash2, Edit2, Check, Tag, Upload, FileText } from 'lucide-react'

interface RateItem {
  id: string
  category: string
  name: string
  description: string
  unit: string
  price_per_unit: number
  is_active: boolean
  sort_order: number
}

const CATEGORIES = [
  { key: 'vinyl', label: 'Vinyl', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  { key: 'substrate', label: 'Substrate', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { key: 'printing', label: 'Printing', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  { key: 'other', label: 'Other', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
]
const UNITS = ['sqm', 'linear m', 'each', 'hour', 'set', 'sheet', 'kg']
type SettingsTab = 'rates' | 'ctrl_p' | 'maizey'

export default function SettingsPage() {
  const { profile } = useAuthStore()
  const [activeTab, setActiveTab] = useState<SettingsTab>('rates')
  const [rates, setRates] = useState<RateItem[]>([])
  const [activeCategory, setActiveCategory] = useState('vinyl')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [ctrlPItems, setCtrlPItems] = useState<any[]>([])
  const [maizeyItems, setMaizeyItems] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    category: 'vinyl', name: '', description: '', unit: 'sqm', price_per_unit: ''
  })

  useEffect(() => {
    loadRates()
    loadPriceLists()
  }, [])

  async function loadRates() {
    const { data } = await supabase.from('rate_items').select('*')
      .eq('is_active', true).order('sort_order').order('name')
    setRates((data as RateItem[]) || [])
    setIsLoading(false)
  }

  async function loadPriceLists() {
    // Load saved price list items from activity_logs
    const { data: ctrlp } = await supabase.from('activity_logs').select('*')
      .eq('entity_type', 'ctrlp_item').order('created_at', { ascending: false })
    const { data: maizey } = await supabase.from('activity_logs').select('*')
      .eq('entity_type', 'maizey_item').order('created_at', { ascending: false })
    setCtrlPItems((ctrlp || []).map((r: any) => r.details))
    setMaizeyItems((maizey || []).map((r: any) => r.details))
  }

  async function saveRate() {
    if (!form.name.trim() || !form.price_per_unit) return
    const payload = {
      category: form.category, name: form.name.trim(),
      description: form.description.trim(), unit: form.unit,
      price_per_unit: parseFloat(form.price_per_unit), created_by: profile?.id,
    }
    if (editingId) {
      const { error } = await supabase.from('rate_items').update(payload).eq('id', editingId)
      if (error) { toast.error('Failed to update'); return }
      toast.success('Rate updated')
    } else {
      const { error } = await supabase.from('rate_items').insert(payload)
      if (error) { toast.error('Failed to add'); return }
      toast.success('Rate added')
    }
    setForm({ category: activeCategory, name: '', description: '', unit: 'sqm', price_per_unit: '' })
    setEditingId(null); setIsAdding(false)
    loadRates()
  }

  async function deleteRate(id: string) {
    if (!confirm('Delete this rate?')) return
    await supabase.from('rate_items').update({ is_active: false }).eq('id', id)
    toast.success('Rate removed')
    loadRates()
  }

  function startEdit(rate: RateItem) {
    setForm({ category: rate.category, name: rate.name, description: rate.description || '', unit: rate.unit, price_per_unit: rate.price_per_unit.toString() })
    setEditingId(rate.id); setIsAdding(true)
  }

  function cancelForm() {
    setForm({ category: activeCategory, name: '', description: '', unit: 'sqm', price_per_unit: '' })
    setEditingId(null); setIsAdding(false)
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, listType: 'ctrl_p' | 'maizey') {
    const file = e.target.files?.[0]
    if (!file) return
    toast('Reading file...', { icon: '📄' })

    // Parse CSV or text file
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    const items: any[] = []

    lines.forEach((line, i) => {
      if (i === 0) return // skip header
      const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
      if (cols.length >= 2) {
        const name = cols[0]
        const price = parseFloat(cols[1]?.replace(/[^0-9.]/g, '') || '0')
        const unit = cols[2] || 'each'
        const desc = cols[3] || ''
        if (name && price > 0) items.push({ name, price, unit, description: desc })
      }
    })

    if (items.length === 0) {
      toast.error('No valid items found. Format: Name, Price, Unit, Description')
      return
    }

    // Save to activity_logs
    const entityType = listType === 'ctrl_p' ? 'ctrlp_item' : 'maizey_item'

    // Clear old items first
    await supabase.from('activity_logs').delete().eq('entity_type', entityType)

    // Insert new
    for (const item of items) {
      await supabase.from('activity_logs').insert({
        entity_type: entityType,
        entity_id: crypto.randomUUID(),
        action: 'imported',
        details: item,
        performed_by: profile?.id,
      })
    }

    toast.success(`${items.length} items imported from ${file.name}`)
    loadPriceLists()
    e.target.value = ''
  }

  async function addPriceListToRates(item: any, category: string) {
    const { error } = await supabase.from('rate_items').insert({
      category, name: item.name, description: item.description || '',
      unit: item.unit || 'each', price_per_unit: item.price,
      created_by: profile?.id,
    })
    if (error) { toast.error('Failed'); return }
    toast.success(`${item.name} added to rates`)
    loadRates()
  }

  const filteredRates = rates.filter(r => r.category === activeCategory)

  if (profile?.role !== 'admin') {
    return <AppShell><div className="flex items-center justify-center min-h-screen"><p className="text-text-muted">Admin access required</p></div></AppShell>
  }

  const TABS = [
    { key: 'rates', label: 'Rates & Pricing' },
    { key: 'ctrl_p', label: 'Ctrl-P Price List' },
    { key: 'maizey', label: 'Maizey Plastics' },
  ]

  const PriceListTab = ({ items, listType }: { items: any[], listType: 'ctrl_p' | 'maizey' }) => (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <Upload className="w-4 h-4 text-accent" />
          <div>
            <p className="font-semibold text-text-primary text-sm">Upload Price List</p>
            <p className="text-xs text-text-muted">Upload a CSV file with columns: Name, Price, Unit, Description</p>
          </div>
        </div>
        <input type="file" accept=".csv,.txt" onChange={e => handleFileUpload(e, listType)}
          className="hidden" ref={fileRef} />
        <button onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm w-full">
          <Upload className="w-4 h-4" /> Choose CSV File
        </button>
        <p className="text-[11px] text-text-muted mt-2 text-center">Format: Name, Price, Unit (sqm/each/m), Description</p>
      </div>

      {items.length === 0 ? (
        <div className="card py-10 text-center">
          <FileText className="w-8 h-8 text-text-muted mx-auto mb-2 opacity-30" />
          <p className="text-text-muted text-sm">No items yet — upload a CSV</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="font-semibold text-text-primary text-sm">{items.length} items</p>
            <p className="text-xs text-text-muted">Click + to add to your rates</p>
          </div>
          <div className="divide-y divide-border/50 max-h-96 overflow-y-auto">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{item.name}</p>
                  {item.description && <p className="text-xs text-text-muted truncate">{item.description}</p>}
                  <p className="text-xs text-text-muted">per {item.unit || 'each'}</p>
                </div>
                <p className="font-bold text-accent shrink-0">{formatCurrency(item.price)}</p>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {CATEGORIES.map(cat => (
                    <button key={cat.key} onClick={() => addPriceListToRates(item, cat.key)}
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cat.color}`}
                      title={`Add to ${cat.label} rates`}>
                      +{cat.label.slice(0,3)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <AppShell>
      <PageHeader title="SETTINGS" subtitle="Rates, pricing and price lists" />
      <div className="px-6 pb-6 space-y-5">

        {/* Section tabs */}
        <div className="flex gap-1 border-b border-border">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as SettingsTab)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>{t.label}</button>
          ))}
        </div>

        {/* RATES TAB */}
        {activeTab === 'rates' && (
          <div className="space-y-4">
            {/* Category tabs */}
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => { setActiveCategory(cat.key); setIsAdding(false) }}
                  className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                    activeCategory === cat.key ? cat.color : 'border-border text-text-muted hover:border-border-strong'
                  }`}>
                  {cat.label} <span className="opacity-60 ml-1">({rates.filter(r => r.category === cat.key).length})</span>
                </button>
              ))}
            </div>

            {/* Add/Edit form */}
            {isAdding ? (
              <div className="card p-5 space-y-4 border-accent/30">
                <h3 className="font-semibold text-text-primary">{editingId ? 'Edit Rate' : 'Add New Rate'}</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="label">Item Name *</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g. Clear Vinyl 3 Year" />
                  </div>
                  <div className="col-span-2">
                    <label className="label">Description</label>
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" placeholder="e.g. Transparent cast vinyl, 3 year outdoor durability" />
                  </div>
                  <div>
                    <label className="label">Category</label>
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input">
                      {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Unit</label>
                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="input">
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="label">Price per {form.unit} (N$)</label>
                    <input value={form.price_per_unit} onChange={e => setForm(f => ({ ...f, price_per_unit: e.target.value }))} className="input text-lg font-bold" type="number" step="0.01" placeholder="0.00" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={cancelForm} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={saveRate} className="btn-primary flex-1"><Check className="w-4 h-4" /> {editingId ? 'Update' : 'Add Rate'}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setIsAdding(true); setForm(f => ({ ...f, category: activeCategory })) }} className="btn-primary btn-sm">
                <Plus className="w-4 h-4" /> Add Rate
              </button>
            )}

            {/* Rates list */}
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-text-primary flex items-center gap-2">
                  <Tag className="w-4 h-4 text-accent" />
                  {CATEGORIES.find(c => c.key === activeCategory)?.label} Rates
                </h3>
                <span className="text-xs text-text-muted">{filteredRates.length} items</span>
              </div>
              {isLoading ? <div className="py-8 text-center text-text-muted text-sm">Loading...</div>
                : filteredRates.length === 0 ? <div className="py-8 text-center text-text-muted text-sm">No rates yet — add one above</div>
                : (
                  <div className="divide-y divide-border/50">
                    {filteredRates.map(rate => (
                      <div key={rate.id} className="flex items-center gap-3 px-4 py-3 hover:bg-bg-hover group">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-text-primary">{rate.name}</p>
                          {rate.description && <p className="text-xs text-text-muted mt-0.5 truncate">{rate.description}</p>}
                          <p className="text-xs text-text-muted mt-0.5">per {rate.unit}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-accent">{formatCurrency(rate.price_per_unit)}</p>
                          <p className="text-xs text-text-muted">/{rate.unit}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => startEdit(rate)} className="btn-icon w-7 h-7"><Edit2 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteRate(rate.id)} className="btn-icon w-7 h-7 text-red-400/50 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )}

        {activeTab === 'ctrl_p' && <PriceListTab items={ctrlPItems} listType="ctrl_p" />}
        {activeTab === 'maizey' && <PriceListTab items={maizeyItems} listType="maizey" />}
      </div>
    </AppShell>
  )
}
