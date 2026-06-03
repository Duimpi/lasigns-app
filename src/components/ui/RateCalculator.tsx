'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Calculator, Plus, ChevronDown } from 'lucide-react'

interface RateItem {
  id: string
  category: string
  name: string
  description: string
  unit: string
  price_per_unit: number
}

interface Props {
  onAdd: (description: string, quantity: number, unit_price: number) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  vinyl: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  substrate: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  printing: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  other: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
}

export function RateCalculator({ onAdd }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [rates, setRates] = useState<RateItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedRate, setSelectedRate] = useState<RateItem | null>(null)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [qty, setQty] = useState('1')
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => {
    supabase.from('rate_items').select('*')
      .eq('is_active', true).order('category').order('name')
      .then(({ data }) => setRates((data as RateItem[]) || []))
  }, [])

  const categories = ['all', ...Array.from(new Set(rates.map(r => r.category)))]

  const filtered = rates.filter(r => {
    const matchCat = activeCategory === 'all' || r.category === activeCategory
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  const isSqm = selectedRate?.unit === 'sqm'
  const sqm = isSqm && width && height ? parseFloat(width) * parseFloat(height) : null
  const unitQty = sqm ? sqm * parseFloat(qty || '1') : parseFloat(qty || '1')
  const lineTotal = selectedRate ? unitQty * selectedRate.price_per_unit : 0

  function addItem() {
    if (!selectedRate) return
    let desc = selectedRate.name
    if (sqm) desc += ` (${width}m × ${height}m = ${sqm.toFixed(3)}sqm × ${qty})`
    else if (qty !== '1') desc += ` × ${qty} ${selectedRate.unit}`
    onAdd(desc, 1, lineTotal)
    setSelectedRate(null); setWidth(''); setHeight(''); setQty('1'); setSearch('')
    setIsOpen(false)
  }

  function selectRate(rate: RateItem) {
    setSelectedRate(rate)
    setSearch(rate.name)
  }

  return (
    <div>
      <button type="button" onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-semibold transition-all ${
          isOpen ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary hover:border-accent hover:text-accent'
        }`}>
        <Calculator className="w-3.5 h-3.5" />
        Rate Calculator
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="mt-3 border border-border/60 rounded-xl bg-bg-elevated/50 p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-4 h-4 text-accent" />
            <p className="text-sm font-semibold text-text-primary">Select material or service</p>
          </div>

          {/* Category pills */}
          <div className="flex gap-1.5 flex-wrap">
            {categories.map(c => (
              <button key={c} type="button" onClick={() => setActiveCategory(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize transition-all border ${
                  activeCategory === c
                    ? 'bg-accent text-text-inverse border-accent'
                    : `border ${CATEGORY_COLORS[c] || 'border-border text-text-muted'}`
                }`}>{c === 'all' ? 'All' : c}</button>
            ))}
          </div>

          {/* Search/select */}
          <div className="relative">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setSelectedRate(null) }}
              className="input text-sm"
              placeholder="Type to search rates..."
            />
            {search && !selectedRate && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 bg-bg-surface border border-border rounded-xl shadow-elevated mt-1 max-h-48 overflow-y-auto">
                {filtered.map(r => (
                  <div key={r.id} onMouseDown={() => selectRate(r)}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-bg-hover cursor-pointer border-b border-border/30 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{r.name}</p>
                      {r.description && <p className="text-xs text-text-muted">{r.description}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-bold text-accent">{formatCurrency(r.price_per_unit)}</p>
                      <p className="text-xs text-text-muted">/{r.unit}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calculator fields */}
          {selectedRate && (
            <div className="bg-bg-surface rounded-xl p-3 space-y-3 border border-border/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{selectedRate.name}</p>
                  {selectedRate.description && <p className="text-xs text-text-muted">{selectedRate.description}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${CATEGORY_COLORS[selectedRate.category] || 'border-border text-text-muted'}`}>
                  {selectedRate.category}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {isSqm && (
                  <>
                    <div>
                      <label className="label text-xs">Width (m)</label>
                      <input value={width} onChange={e => setWidth(e.target.value)}
                        className="input py-1.5 text-sm" type="number" step="0.01" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="label text-xs">Height (m)</label>
                      <input value={height} onChange={e => setHeight(e.target.value)}
                        className="input py-1.5 text-sm" type="number" step="0.01" placeholder="0.00" />
                    </div>
                  </>
                )}
                <div className={isSqm ? '' : 'col-span-3'}>
                  <label className="label text-xs">Qty</label>
                  <input value={qty} onChange={e => setQty(e.target.value)}
                    className="input py-1.5 text-sm" type="number" min="1" />
                </div>
              </div>

              {sqm && (
                <p className="text-xs text-text-muted">
                  {width}m × {height}m = <span className="font-semibold text-text-primary">{sqm.toFixed(3)} sqm</span>
                  {parseFloat(qty) > 1 && <> × {qty} = <span className="font-semibold text-text-primary">{unitQty.toFixed(3)} sqm total</span></>}
                </p>
              )}

              <div className="flex items-center justify-between bg-bg-elevated rounded-lg px-3 py-2.5">
                <div>
                  <p className="text-xs text-text-muted">{formatCurrency(selectedRate.price_per_unit)}/{selectedRate.unit} × {unitQty.toFixed(isSqm ? 3 : 0)}</p>
                </div>
                <p className="text-xl font-bold text-accent">{formatCurrency(lineTotal)}</p>
              </div>

              <button type="button" onClick={addItem} disabled={lineTotal === 0}
                className="btn-primary w-full">
                <Plus className="w-4 h-4" /> Add Line Item — {formatCurrency(lineTotal)}
              </button>
            </div>
          )}

          {!selectedRate && filtered.length === 0 && search && (
            <p className="text-xs text-text-muted text-center py-2">No rates found — add them in Settings → Rates</p>
          )}
        </div>
      )}
    </div>
  )
}
