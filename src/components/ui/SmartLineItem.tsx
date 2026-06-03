'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PRICE_ITEMS, PriceItem } from '@/data/priceData';

export interface LineItem {
  id: string;
  description: string;
  widthMm: string;
  heightMm: string;
  sqm: number | null;
  qty: number;
  unitPrice: number | null;
  priceType: 'psm' | 'fixed' | 'manual';
  total: number;
}

interface SmartLineItemProps {
  item: LineItem;
  index: number;
  onChange: (id: string, updated: LineItem) => void;
  onRemove: (id: string) => void;
}

function calcSqm(wMm: string, hMm: string): number | null {
  const w = parseFloat(wMm);
  const h = parseFloat(hMm);
  if (!w || !h || w <= 0 || h <= 0) return null;
  return parseFloat(((w / 1000) * (h / 1000)).toFixed(6));
}

function calcTotal(item: LineItem): number {
  const qty = item.qty || 1;
  if (item.priceType === 'psm' && item.sqm && item.unitPrice) {
    return parseFloat((item.sqm * item.unitPrice * qty).toFixed(2));
  }
  if (item.unitPrice) {
    return parseFloat((item.unitPrice * qty).toFixed(2));
  }
  return 0;
}

function searchItems(query: string): PriceItem[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return PRICE_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
  ).slice(0, 12);
}

export function SmartLineItem({ item, index, onChange, onRemove }: SmartLineItemProps) {
  const [query, setQuery] = useState(item.description);
  const [results, setResults] = useState<PriceItem[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep query in sync when item.description changes externally
  useEffect(() => {
    setQuery(item.description);
  }, [item.description]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleDescriptionChange = useCallback(
    (val: string) => {
      setQuery(val);
      const found = searchItems(val);
      setResults(found);
      setOpen(found.length > 0);
      setHighlighted(0);
      const updated: LineItem = {
        ...item,
        description: val,
        priceType: 'manual',
      };
      onChange(item.id, { ...updated, total: calcTotal(updated) });
    },
    [item, onChange]
  );

  const handleSelect = useCallback(
    (priceItem: PriceItem) => {
      setQuery(priceItem.label);
      setOpen(false);
      setResults([]);
      const updated: LineItem = {
        ...item,
        description: priceItem.label,
        unitPrice: priceItem.price,
        priceType: priceItem.priceType,
        sqm: priceItem.priceType === 'psm' ? calcSqm(item.widthMm, item.heightMm) : null,
      };
      updated.total = calcTotal(updated);
      onChange(item.id, updated);
    },
    [item, onChange]
  );

  const handleSizeChange = useCallback(
    (field: 'widthMm' | 'heightMm', val: string) => {
      const newW = field === 'widthMm' ? val : item.widthMm;
      const newH = field === 'heightMm' ? val : item.heightMm;
      const sqm = item.priceType === 'psm' ? calcSqm(newW, newH) : null;
      const updated: LineItem = { ...item, [field]: val, sqm };
      updated.total = calcTotal(updated);
      onChange(item.id, updated);
    },
    [item, onChange]
  );

  const handlePriceChange = useCallback(
    (val: string) => {
      const price = parseFloat(val) || null;
      const updated: LineItem = { ...item, unitPrice: price, priceType: item.priceType === 'psm' ? 'psm' : 'manual' };
      updated.total = calcTotal(updated);
      onChange(item.id, updated);
    },
    [item, onChange]
  );

  const handleQtyChange = useCallback(
    (val: string) => {
      const qty = parseInt(val) || 1;
      const updated: LineItem = { ...item, qty };
      updated.total = calcTotal(updated);
      onChange(item.id, updated);
    },
    [item, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[highlighted]) handleSelect(results[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  const sqmDisplay = item.sqm != null ? item.sqm.toFixed(4) : '—';
  const totalDisplay = item.total > 0 ? `N$${item.total.toFixed(2)}` : '—';

  return (
    <div className="relative grid grid-cols-12 gap-2 items-start py-2 border-b border-gray-700 last:border-0">
      <div className="col-span-1 flex items-center justify-center pt-2">
        <span className="text-xs text-gray-500 font-mono">{index + 1}</span>
      </div>

      <div className="col-span-4 relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          onFocus={() => {
            if (query.length >= 2) {
              const found = searchItems(query);
              setResults(found);
              setOpen(found.length > 0);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type to search items…"
          className="w-full text-sm bg-gray-700 border border-gray-600 text-white rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent placeholder-gray-500"
        />
        {open && results.length > 0 && (
          <div ref={dropdownRef} className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl max-h-64 overflow-y-auto">
            {results.map((r, i) => (
              <button key={r.id} type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                className={`w-full text-left px-3 py-2 text-xs border-b border-gray-700 last:border-0 hover:bg-gray-700 transition-colors ${i === highlighted ? 'bg-gray-700' : ''}`}
              >
                <div className="font-medium text-white truncate">{r.label}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-semibold ${r.priceType === 'psm' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                    N${r.price.toFixed(2)} {r.priceType === 'psm' ? '/m²' : 'fixed'}
                  </span>
                  <span className="text-gray-400">{r.category}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="col-span-1">
        <input type="number" value={item.widthMm}
          onChange={(e) => handleSizeChange('widthMm', e.target.value)}
          placeholder="W"
          className="w-full text-sm bg-gray-700 border border-gray-600 text-white rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>

      <div className="col-span-1">
        <input type="number" value={item.heightMm}
          onChange={(e) => handleSizeChange('heightMm', e.target.value)}
          placeholder="H"
          className="w-full text-sm bg-gray-700 border border-gray-600 text-white rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>

      <div className="col-span-1 flex items-center justify-center pt-2">
        <span className={`text-xs font-mono ${item.sqm ? 'text-yellow-400 font-semibold' : 'text-gray-600'}`}>
          {sqmDisplay}
        </span>
      </div>

      <div className="col-span-1">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">N$</span>
          <input type="number" step="0.01" value={item.unitPrice ?? ''}
            onChange={(e) => handlePriceChange(e.target.value)}
            placeholder="0.00"
            className="w-full text-sm bg-gray-700 border border-gray-600 text-white rounded pl-6 pr-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-500"
          />
        </div>
        {item.priceType === 'psm' && (
          <div className="text-[10px] text-orange-400 mt-0.5 text-center">per m²</div>
        )}
      </div>

      <div className="col-span-1">
        <input type="number" min="1" value={item.qty}
          onChange={(e) => handleQtyChange(e.target.value)}
          className="w-full text-sm bg-gray-700 border border-gray-600 text-white rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
      </div>

      <div className="col-span-1 flex items-center justify-end pt-2">
        <span className={`text-sm font-semibold font-mono ${item.total > 0 ? 'text-white' : 'text-gray-600'}`}>
          {totalDisplay}
        </span>
      </div>

      <div className="col-span-1 flex items-center justify-center pt-1">
        <button type="button" onClick={() => onRemove(item.id)}
          className="p-1 text-gray-600 hover:text-red-400 transition-colors rounded">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function SmartLineItemHeader() {
  return (
    <div className="grid grid-cols-12 gap-2 px-0 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-600 mb-1">
      <div className="col-span-1 text-center">#</div>
      <div className="col-span-4">Description</div>
      <div className="col-span-1">W (mm)</div>
      <div className="col-span-1">H (mm)</div>
      <div className="col-span-1 text-center">m²</div>
      <div className="col-span-1">Price</div>
      <div className="col-span-1">Qty</div>
      <div className="col-span-1 text-right">Total</div>
      <div className="col-span-1" />
    </div>
  );
}

export function createLineItem(): LineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    widthMm: '',
    heightMm: '',
    sqm: null,
    qty: 1,
    unitPrice: null,
    priceType: 'manual',
    total: 0,
  };
}
