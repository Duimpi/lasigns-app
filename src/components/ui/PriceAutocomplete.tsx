'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { PRICE_ITEMS } from '@/data/priceData';

const STORAGE_KEY = 'la-signs-price-overrides';
const CUSTOM_KEY = 'la-signs-custom-prices';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelectPrice: (price: number, priceType: 'psm' | 'fixed') => void;
  placeholder?: string;
  className?: string;
}

interface SearchPriceItem {
  id: string | number;
  category: string;
  description: string;
  size?: string | null;
  price: number;
  priceType: 'psm' | 'fixed';
  label: string;
}

function makeLabel(item: { category?: string; description?: string; size?: string | null }) {
  const category = item.category || 'Custom';
  const description = item.description || '';
  return item.size ? category + ' - ' + description + ' (' + item.size + ')' : category + ' - ' + description;
}

function loadPriceItems(): SearchPriceItem[] {
  if (typeof window === 'undefined') return PRICE_ITEMS;
  let overrides: Record<string, Partial<SearchPriceItem>> = {};
  let custom: Partial<SearchPriceItem>[] = [];
  try { overrides = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
  try { custom = JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch {}

  const base = PRICE_ITEMS.map(item => {
    const merged = { ...item, ...(overrides[item.id] || {}) } as SearchPriceItem;
    return { ...merged, label: makeLabel(merged) };
  });

  const customItems = custom.map((item, idx) => {
    const normalized = {
      id: item.id || 'custom-' + idx,
      category: item.category || 'Custom',
      description: item.description || '',
      size: item.size || '',
      price: Number(item.price) || 0,
      priceType: item.priceType === 'fixed' ? 'fixed' : 'psm',
    } as SearchPriceItem;
    return { ...normalized, label: makeLabel(normalized) };
  });

  return [...base, ...customItems];
}

export function PriceAutocomplete({ value, onChange, onSelectPrice, placeholder = 'Description', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [priceItems, setPriceItems] = useState<SearchPriceItem[]>(() => loadPriceItems());
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);

  const results = useMemo(() => {
    if (value.length < 2) return [];
    const q = value.toLowerCase();
    return priceItems.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [priceItems, value]);

  useEffect(() => {
    function refreshPrices() { setPriceItems(loadPriceItems()); }
    window.addEventListener('storage', refreshPrices);
    window.addEventListener('focus', refreshPrices);
    refreshPrices();
    return () => {
      window.removeEventListener('storage', refreshPrices);
      window.removeEventListener('focus', refreshPrices);
    };
  }, []);

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

  function handleSelect(item: SearchPriceItem) {
    onChange(item.label);
    onSelectPrice(item.price, item.priceType);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted(h => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); handleSelect(results[highlighted]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setOpen(e.target.value.length >= 2);
          setHighlighted(0);
        }}
        onFocus={() => {
          isFocused.current = true;
          setPriceItems(loadPriceItems());
          if (value.length >= 2 && results.length > 0) setOpen(true);
        }}
        onBlur={() => {
          isFocused.current = false;
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-[100] top-full left-0 right-0 mt-1 bg-bg-elevated border border-border rounded-md shadow-elevated max-h-64 overflow-y-auto"
        >
          {results.map((item, i) => (
            <div
              key={item.id}
              onMouseDown={e => {
                e.preventDefault();
                handleSelect(item);
              }}
              className={`px-3 py-2 cursor-pointer border-b border-border last:border-0 ${i === highlighted ? 'bg-bg-hover' : 'hover:bg-bg-hover'}`}
            >
              <p className="text-sm text-text-primary truncate">{item.label}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                  item.priceType === 'psm'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  N${item.price.toFixed(2)} {item.priceType === 'psm' ? '/m2' : 'fixed'}
                </span>
                <span className="text-xs text-text-muted">{item.category}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
