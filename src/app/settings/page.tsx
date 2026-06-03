'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PRICE_ITEMS, PriceItem } from '@/data/priceData';

const CATEGORIES = Array.from(new Set(PRICE_ITEMS.map(i => i.category))).sort();

export default function SettingsPage() {
  const [tab, setTab] = useState<'rates' | 'ctrlp' | 'maizey'>('rates');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');

  const filtered = PRICE_ITEMS.filter(item => {
    const matchSearch = !search ||
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === 'all' || item.category === filterCat;
    return matchSearch && matchCat;
  });

  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 text-sm mt-1">Rates, pricing and price lists</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-700">
          {[
            { key: 'rates', label: 'Rates & Pricing' },
            { key: 'ctrlp', label: 'Ctrl-P Price List' },
            { key: 'maizey', label: 'Maizey Plastics' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-yellow-500 text-yellow-400'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'rates' && (
          <div>
            {/* Search + Filter */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search prices..."
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-72 focus:outline-none focus:border-yellow-500" />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
                <option value="all">All Categories ({PRICE_ITEMS.length})</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c} ({PRICE_ITEMS.filter(i => i.category === c).length})</option>
                ))}
              </select>
              <div className="ml-auto flex items-center text-gray-400 text-sm">
                Showing {filtered.length} of {PRICE_ITEMS.length} items
              </div>
            </div>

            {/* Price Table */}
            <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-750 border-b border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <div className="col-span-3">Category</div>
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Size</div>
                <div className="col-span-1 text-center">Type</div>
                <div className="col-span-1 text-right">Price (N$)</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-gray-700/50 max-h-[60vh] overflow-y-auto">
                {filtered.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-700/30 transition-colors">
                    <div className="col-span-3">
                      <span className="text-xs text-yellow-400 font-medium">{item.category}</span>
                    </div>
                    <div className="col-span-5">
                      <span className="text-sm text-white">{item.description}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs text-gray-400">{item.size || '—'}</span>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                        item.priceType === 'psm'
                          ? 'bg-orange-500/20 text-orange-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        {item.priceType === 'psm' ? '/m²' : 'fixed'}
                      </span>
                    </div>
                    <div className="col-span-1 text-right">
                      <span className="text-sm text-white font-mono font-semibold">
                        {item.price.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500 text-sm">No items match your search</div>
                )}
              </div>
            </div>

            <p className="text-gray-600 text-xs mt-3">
              These prices are loaded from your LA Signs price list. To update prices, edit <code className="text-gray-500">src/data/priceData.ts</code> and redeploy.
            </p>
          </div>
        )}

        {tab === 'ctrlp' && (
          <div className="text-center py-16 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Ctrl-P Price List</p>
            <p className="text-xs text-gray-600 mt-1">Upload your Ctrl-P supplier price list CSV here</p>
          </div>
        )}

        {tab === 'maizey' && (
          <div className="text-center py-16 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm">Maizey Plastics</p>
            <p className="text-xs text-gray-600 mt-1">Upload your Maizey Plastics supplier price list here</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
