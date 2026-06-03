'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { X, Calculator } from 'lucide-react'

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

export function SmartLineItem({ index, item, onChange, onRemove, showRemove }: Props) {
  const [rates, setRates] = useState<RateItem[]>([])
  const [suggestions, setSuggestions] = useState<RateItem[]>([])
  const [selectedRate, setSelectedRate] = useState<RateItem | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const descRef = useRef<HTMLInputElement>(null)
  const suggestRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('rate_items').select('*').eq('is_active', true)
      .order('category').order('name')
      .then(({ data }) => setRates((data as RateItem[]) || []))
  }, [])

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node) &&
          descRef.current && !descRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Recalculate when width/height change
  useEffect(() => {
    if (!selectedRate || !width || !height) return
    if (selectedRate.unit === 'sqm') {
      const sqm = parseFloat(width) * parseFloat(height)
      if (!isNaN(sqm) && sqm > 0) {
        onChange(index, 'unit_price', parseFloat((sqm * selectedRate.price_per_unit).toFixed(2)))
        onChange(index, 'size', `${width}m × ${height}m`)
      }
    }
  }, [width, height])

  function handleDescChange(val: string) {
    onChange(index, 'description', val)
    if (val.length >= 2) {
      const matches = rates.filter(r =>
        r.name.toLowerCase().includes(val.toLowerCase()) ||
        r.description?.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 6)
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
    onChange(index, 'unit_price', rate.price_per_unit)
    onChange(index, 'quantity', 1)
    setShowSuggestions(false)
    setSuggestions([])
    // If sqm, show calc automatically
    if (rate.unit === 'sqm') setShowCalc(true)
  }

  const qty = Number(item.quantity) || 0
  const price = Number(item.unit_price) || 0
  const lineTotal = qty * price

  const CATEGORY_COLORS: Record<string, string> = {
    vinyl: 'text-blue-400',
    substrate: 'text-amber-400',
    printing: 'text-purple-400',
    other: 'text-emerald-400',
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 items-start">
        {/* Description with autocomplete */}
        <div className="col-span-5 relative">
          <div className="flex gap-1">
            <div className="relative flex-1">
              <input
                ref={descRef}
                value={item.description}
                onChange={e => handleDescChange(e.target.value)}
                onFocus={() => item.description.length >= 2 && suggestions.length > 0 && setShowSuggestions(true)}
                className="input text-sm"
                placeholder="Type to search prices..."
              />
              {showSuggestions && suggestions.length > 0 && (
                <div ref={suggestRef} className="absolute top-full left-0 right-0 z-50 bg-bg-surface border border-border rounded-xl shadow-modal mt-1 max-h-52 overflow-y-auto">
                  {suggestions.map(r => (
                    <div key={r.id} onMouseDown={() => selectRate(r)}
                      className="flex items-center justify-between px-3 py-2.5 hover:bg-bg-hover cursor-pointer border-b border-border/30 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase ${CATEGORY_COLORS[r.category] || 'text-text-muted'}`}>
                            {r.category}
                          </span>
                          <span className="text-sm font-medium text-text-primary truncate">{r.name}</span>
                        </div>
                        {r.description && <p className="text-xs text-text-muted truncate">{r.description}</p>}
                      </div>
                      <div className="shrink-0 ml-2 text-right">
                        <p className="text-sm font-bold text-accent">{formatCurrency(r.price_per_unit)}</p>
                        <p className="text-[10px] text-text-muted">/{r.unit}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedRate?.unit === 'sqm' && (
              <button type="button" onClick={() => setShowCalc(!showCalc)}
                className={`btn-icon shrink-0 ${showCalc ? 'text-accent' : 'text-text-muted'}`}
                title="Size calculator">
                <Calculator className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Size calculator inline */}
          {showCalc && selectedRate && (
            <div className="mt-1.5 p-2.5 bg-bg-elevated border border-accent/30 rounded-xl space-y-2">
              <p className="text-xs text-accent font-semibold">{selectedRate.name} — {formatCurrency(selectedRate.price_per_unit)}/sqm</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Width (m)</label>
                  <input value={width} onChange={e => setWidth(e.target.value)}
                    className="input py-1 text-sm" type="number" step="0.01" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted uppercase tracking-wide">Height (m)</label>
                  <input value={height} onChange={e => setHeight(e.target.value)}
                    className="input py-1 text-sm" type="number" step="0.01" placeholder="0.00" />
                </div>
              </div>
              {width && height && parseFloat(width) > 0 && parseFloat(height) > 0 && (
                <div className="flex items-center justify-between bg-bg-surface rounded-lg px-2.5 py-1.5">
                  <p className="text-xs text-text-muted">
                    {width}m × {height}m = <span className="font-semibold text-text-primary">{(parseFloat(width) * parseFloat(height)).toFixed(3)} sqm</span>
                  </p>
                  <p className="text-sm font-bold text-accent">
                    = {formatCurrency(parseFloat(width) * parseFloat(height) * selectedRate.price_per_unit)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Size field */}
        <div className="col-span-2">
          <input
            value={item.size}
            onChange={e => onChange(index, 'size', e.target.value)}
            className="input text-sm"
            placeholder="e.g. 1.2×0.6m"
          />
        </div>

        {/* Qty */}
        <div className="col-span-1">
          <input
            value={item.quantity}
            onChange={e => onChange(index, 'quantity', parseFloat(e.target.value) || 0)}
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
    </div>
  )
}
