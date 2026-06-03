'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X } from 'lucide-react'

interface RateItem {
  id: string
  category: string
  name: string
  description: string
  unit: string
  price_per_unit: number
}

interface LineItemData {
  description: string
  size: string
  quantity: number
  unit_price: number
}

interface Props {
  index: number
  item: LineItemData
  onChange: (index: number, field: keyof LineItemData, value: string | number) => void
  onRemove: (index: number) => void
  showRemove: boolean
}

// All rates loaded once globally
let cachedRates: RateItem[] = []

function parseSize(val: string): { w: number; h: number } | null {
  // Remove spaces and mm/cm
  let clean = val.trim().replace(/\s/g, '').replace(/mm$/i, '').replace(/cm$/i, '')
  // Replace × with x
  clean = clean.replace(/[×*]/g, 'x')
  // Match patterns: 1.2x0.6, 1200x600, 1,2x0,6
  const match = clean.match(/^([0-9]+[.,]?[0-9]*)x([0-9]+[.,]?[0-9]*)$/i)
  if (!match) return null
  let w = parseFloat(match[1].replace(',', '.'))
  let h = parseFloat(match[2].replace(',', '.'))
  if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return null
  // If both values > 10, assume mm and convert to meters
  if (w > 10) w = w / 1000
  if (h > 10) h = h / 1000
  return { w, h }
}

const CATEGORY_COLORS: Record<string, string> = {
  vinyl: 'text-blue-400',
  substrate: 'text-amber-400',
  printing: 'text-purple-400',
  other: 'text-emerald-400',
}

export function SmartLineItem({ index, item, onChange, onRemove, showRemove }: Props) {
  const [rates, setRates] = useState<RateItem[]>(cachedRates)
  const [suggestions, setSuggestions] = useState<RateItem[]>([])
  const [selectedRate, setSelectedRate] = useState<RateItem | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cachedRates.length > 0) { setRates(cachedRates); return }
    supabase.from('rate_items').select('*').eq('is_active', true)
      .order('category').order('name')
      .then(({ data }) => {
        cachedRates = (data as RateItem[]) || []
        setRates(cachedRates)
      })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleDescChange(val: string) {
    onChange(index, 'description', val)
    if (val.length >= 2) {
      const q = val.toLowerCase()
      const matches = rates.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      ).slice(0, 7)
      setSuggestions(matches)
      setShowSuggestions(matches.length > 0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }

  function selectRate(rate: RateItem) {
    setSelectedRate(rate)
    onChange(index, 'description', rate.name)
    // For per-unit items, set price directly
    if (rate.unit !== 'sqm') {
      onChange(index, 'unit_price', rate.price_per_unit)
    }
    // For sqm items, wait for size input
    setShowSuggestions(false)
    setSuggestions([])
  }

  function handleSizeChange(val: string) {
    onChange(index, 'size', val)
    if (!selectedRate) return
    const parsed = parseSize(val)
    if (parsed) {
      const sqm = parsed.w * parsed.h
      const qty = Number(item.quantity) || 1
      const totalPrice = parseFloat((sqm * qty * selectedRate.price_per_unit).toFixed(2))
      onChange(index, 'unit_price', totalPrice)
    }
  }

  function handleQtyChange(val: number) {
    onChange(index, 'quantity', val)
    if (!selectedRate || selectedRate.unit !== 'sqm' || !item.size) return
    const parsed = parseSize(item.size)
    if (parsed) {
      const sqm = parsed.w * parsed.h
      onChange(index, 'unit_price', parseFloat((sqm * val * selectedRate.price_per_unit).toFixed(2)))
    }
  }

  const qty = Number(item.quantity) || 0
  const price = Number(item.unit_price) || 0
  const lineTotal = qty * price

  // Show sqm hint
  const sizeHint = selectedRate?.unit === 'sqm' && item.size ? (() => {
    const p = parseSize(item.size)
    if (p) return `${(p.w * p.h).toFixed(3)} sqm`
    return null
  })() : null

  return (
    <div ref={wrapperRef} className="grid grid-cols-12 gap-2 items-start">
      {/* Description with autocomplete */}
      <div className="col-span-5 relative">
        <input
          value={item.description}
          onChange={e => handleDescChange(e.target.value)}
          onFocus={() => {
            if (item.description.length >= 2 && suggestions.length > 0) setShowSuggestions(true)
          }}
          className="input text-sm"
          placeholder="Type to search prices..."
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 bg-bg-surface border border-border rounded-xl shadow-modal mt-1 max-h-56 overflow-y-auto">
            {suggestions.map(r => (
              <div key={r.id} onMouseDown={(e) => { e.preventDefault(); selectRate(r) }}
                className="flex items-center justify-between px-3 py-2.5 hover:bg-bg-hover cursor-pointer border-b border-border/30 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[9px] font-bold uppercase ${CATEGORY_COLORS[r.category] || 'text-text-muted'}`}>{r.category}</span>
                    <span className="text-sm font-medium text-text-primary truncate">{r.name}</span>
                  </div>
                  {r.description && <p className="text-xs text-text-muted truncate">{r.description}</p>}
                </div>
                <div className="shrink-0 ml-3 text-right">
                  <p className="text-sm font-bold text-accent">{formatCurrency(r.price_per_unit)}</p>
                  <p className="text-[10px] text-text-muted">/{r.unit}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {selectedRate && (
          <p className="text-[10px] text-accent mt-0.5">
            {selectedRate.name} — {formatCurrency(selectedRate.price_per_unit)}/{selectedRate.unit}
          </p>
        )}
      </div>

      {/* Size */}
      <div className="col-span-2">
        <input
          value={item.size}
          onChange={e => handleSizeChange(e.target.value)}
          className="input text-sm"
          placeholder={selectedRate?.unit === 'sqm' ? '1.2x0.6' : 'Size'}
        />
        {sizeHint && <p className="text-[10px] text-accent mt-0.5">{sizeHint}</p>}
        {selectedRate?.unit === 'sqm' && !sizeHint && item.size && (
          <p className="text-[10px] text-amber-400 mt-0.5">Format: 1.2x0.6 or 1200x600</p>
        )}
      </div>

      {/* Qty */}
      <div className="col-span-1">
        <input
          value={item.quantity}
          onChange={e => handleQtyChange(parseFloat(e.target.value) || 1)}
          type="number" step="any" min="0"
          className="input text-sm"
        />
      </div>

      {/* Unit price */}
      <div className="col-span-2">
        <input
          value={item.unit_price}
          onChange={e => onChange(index, 'unit_price', parseFloat(e.target.value) || 0)}
          type="number" step="0.01" min="0"
          className="input text-sm"
        />
      </div>

      {/* Total */}
      <div className="col-span-1 text-right text-sm font-semibold text-text-primary pt-2">
        {formatCurrency(lineTotal)}
      </div>

      {/* Remove */}
      <div className="col-span-1 flex justify-end pt-1">
        {showRemove && (
          <button type="button" onClick={() => onRemove(index)}
            className="btn-icon text-red-400/50 hover:text-red-400">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
