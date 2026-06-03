'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Calculator, ChevronDown, Plus } from 'lucide-react'

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

export function RateCalculator({ onAdd }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [rates, setRates] = useState<RateItem[]>([])
  const [selectedRate, setSelectedRate] = useState<RateItem | null>(null)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [qty, setQty] = useState('1')
  const [category, setCategory] = useState('all')

  useEffect(() => {
    supabase.from('rate_items').select('*').eq('is_active', true).order('category').order('name')
      .then(({ data }) => setRates((data as RateItem[]) || []))
  }, [])

  const sqm = width && height ? (parseFloat(width) * parseFloat(height)).toFixed(3) : null
  const unitQty = sqm ? parseFloat(sqm) * parseFloat(qty || '1') : parseFloat(qty || '1')
  const total = selectedRate ? unitQty * selectedRate.price_per_unit : 0

  const categories = ['all', ...Array.from(new Set(rates.map(r => r.category)))]
  const filtered = category === 'all' ? rates : rates.filter(r => r.category === category)

  function addToQuote() {
    if (!selectedRate) return
    const description = sqm
      ? `${selectedRate.name} (${width}m × ${height}m = ${sqm}sqm × ${qty} qty)`
      : `${selectedRate.name} × ${qty}`
    onAdd(description, 1, total)
    setSelectedRate(null); setWidth(''); setHeight(''); setQty('1')
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-2 bg-bg-elevated border border-border rounded-lg text-sm text-text-secondary hover:border-accent hover:text-accent transition-colors">
        <Calculator className="w-3.5 h-3.5" />
        Rate Calculator
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-bg-surface border border-border rounded-xl shadow-modal w-96 p-4 space-y-3">
          <p className="font-semibold text-text-primary text-sm flex items-center gap-2">
            <Calculator className="w-4 h-4 text-accent" /> Quick Rate Calculator
          </p>

          {/* Category filter */}
          <div className="flex gap-1 flex-wrap">
            {categories.map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  category === c ? 'bg-accent text-text-inverse' : 'bg-bg-elevated text-text-muted hover:text-text-primary'
                }`}>{c}</button>
            ))}
          </div>

          {/* Rate selector */}
          <select value={selectedRate?.id || ''} onChange={e => setSelectedRate(rates.find(r => r.id === e.target.value) || null)} className="input text-sm">
            <option value="">Select material / service...</option>
            {filtered.map(r => (
              <option key={r.id} value={r.id}>{r.name} — {formatCurrency(r.price_per_unit)}/{r.unit}</option>
            ))}
          </select>

          {selectedRate && (
            <>
              {selectedRate.unit === 'sqm' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label text-xs">Width (m)</label>
                    <input value={width} onChange={e => setWidth(e.target.value)} className="input py-1.5 text-sm" type="number" step="0.01" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="label text-xs">Height (m)</label>
                    <input value={height} onChange={e => setHeight(e.target.value)} className="input py-1.5 text-sm" type="number" step="0.01" placeholder="0.00" />
                  </div>
                </div>
              )}

              <div>
                <label className="label text-xs">Quantity</label>
                <input value={qty} onChange={e => setQty(e.target.value)} className="input py-1.5 text-sm" type="number" min="1" />
              </div>

              {sqm && <p className="text-xs text-text-muted">Area: <span className="font-semibold text-text-primary">{sqm} sqm × {qty} = {(parseFloat(sqm) * parseFloat(qty || '1')).toFixed(3)} sqm total</span></p>}

              <div className="bg-bg-elevated rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-muted">{selectedRate.name}</p>
                  <p className="text-xs text-text-muted">{formatCurrency(selectedRate.price_per_unit)}/{selectedRate.unit} × {unitQty.toFixed(3)}</p>
                </div>
                <p className="text-lg font-bold text-accent">{formatCurrency(total)}</p>
              </div>

              <button type="button" onClick={addToQuote} className="btn-primary w-full">
                <Plus className="w-4 h-4" /> Add to Quote
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
