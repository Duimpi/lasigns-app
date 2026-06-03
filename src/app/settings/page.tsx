'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Plus, Trash2, Edit2, Check, X, Tag } from 'lucide-react'

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

const UNITS = ['sqm', 'linear m', 'each', 'hour', 'set', 'sheet']

export default function SettingsPage() {
  const { profile } = useAuthStore()
  const [rates, setRates] = useState<RateItem[]>([])
  const [activeCategory, setActiveCategory] = useState('vinyl')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const [form, setForm] = useState({
    category: 'vinyl', name: '', description: '', unit: 'sqm', price_per_unit: ''
  })

  useEffect(() => { loadRates() }, [])

  async function loadRates() {
    const { data } = await supabase.from('rate_items').select('*')
      .eq('is_active', true).order('sort_order').order('name')
    setRates((data as RateItem[]) || [])
    setIsLoading(false)
  }

  async function saveRate() {
    if (!form.name.trim() || !form.price_per_unit) return
    const payload = {
      category: form.category,
      name: form.name.trim(),
      description: form.description.trim(),
      unit: form.unit,
      price_per_unit: parseFloat(form.price_per_unit),
      created_by: profile?.id,
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
    setEditingId(null)
    setIsAdding(false)
    loadRates()
  }

  async function deleteRate(id: string) {
    if (!confirm('Delete this rate?')) return
    await supabase.from('rate_items').update({ is_active: false }).eq('id', id)
    toast.success('Rate removed')
    loadRates()
  }

  function startEdit(rate: RateItem) {
    setForm({
      category: rate.category,
      name: rate.name,
      description: rate.description || '',
      unit: rate.unit,
      price_per_unit: rate.price_per_unit.toString(),
    })
    setEditingId(rate.id)
    setIsAdding(true)
  }

  function cancelForm() {
    setForm({ category: activeCategory, name: '', description: '', unit: 'sqm', price_per_unit: '' })
    setEditingId(null)
    setIsAdding(false)
  }

  const filteredRates = rates.filter(r => r.category === activeCategory)

  if (profile?.role !== 'admin') {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-text-muted">Admin access required</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <PageHeader title="SETTINGS" subtitle="Manage rates and pricing" />
      <div className="px-6 pb-6 space-y-6">

        {/* Category tabs */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button key={cat.key} onClick={() => { setActiveCategory(cat.key); setIsAdding(false) }}
              className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${
                activeCategory === cat.key ? cat.color : 'border-border text-text-muted hover:border-border-strong'
              }`}>
              {cat.label}
              <span className="ml-2 text-xs opacity-70">
                ({rates.filter(r => r.category === cat.key).length})
              </span>
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
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="input" placeholder="e.g. Clear Vinyl 3 Year" />
              </div>
              <div className="col-span-2">
                <label className="label">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="input" placeholder="e.g. Transparent cast vinyl, 3 year outdoor durability" />
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
                <input value={form.price_per_unit} onChange={e => setForm(f => ({ ...f, price_per_unit: e.target.value }))}
                  className="input text-lg font-bold" type="number" step="0.01" placeholder="0.00" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={cancelForm} className="btn-secondary flex-1">Cancel</button>
              <button onClick={saveRate} className="btn-primary flex-1">
                <Check className="w-4 h-4" /> {editingId ? 'Update Rate' : 'Add Rate'}
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setIsAdding(true); setForm(f => ({ ...f, category: activeCategory })) }}
            className="btn-primary btn-sm">
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

          {isLoading ? (
            <div className="py-8 text-center text-text-muted text-sm">Loading...</div>
          ) : filteredRates.length === 0 ? (
            <div className="py-8 text-center text-text-muted text-sm">No rates yet — add one above</div>
          ) : (
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
                    <button onClick={() => startEdit(rate)} className="btn-icon w-7 h-7">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteRate(rate.id)} className="btn-icon w-7 h-7 text-red-400/50 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
