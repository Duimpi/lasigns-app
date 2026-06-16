'use client';

import { useState, useRef, useEffect } from 'react';
import { PRICE_ITEMS } from '@/data/priceData';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelectPrice: (price: number, priceType: 'psm' | 'fixed') => void;
  placeholder?: string;
  className?: string;
}

export function PriceAutocomplete({ value, onChange, onSelectPrice, placeholder = 'Description', className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);

  const results = value.length >= 2
    ? PRICE_ITEMS.filter(item =>
        item.label.toLowerCase().includes(value.toLowerCase()) ||
        item.category.toLowerCase().includes(value.toLowerCase()) ||
        item.description.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 10)
    : [];

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

  function handleSelect(item: typeof PRICE_ITEMS[0]) {
    onChange(item.label);
    onSelectPrice(item.price, item.priceType);
    setOpen(false);
    // Restore focus after selection
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
                  N${item.price.toFixed(2)} {item.priceType === 'psm' ? '/m²' : 'fixed'}
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
