'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PRICE_ITEMS } from '@/data/priceData';

const STORAGE_KEY = 'la-signs-price-overrides';
const CUSTOM_KEY = 'la-signs-custom-prices';

interface PriceRow {
  id: string | number;
  category: string;
  description: string;
  size: string;
  price: number;
  priceType: 'psm' | 'fixed';
  isCustom?: boolean;
  isEdited?: boolean;
}

function loadOverrides(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveOverrides(o: Record<string, any>) { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); }
function loadCustom(): PriceRow[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || '[]'); } catch { return []; }
}
function saveCustom(c: PriceRow[]) { localStorage.setItem(CUSTOM_KEY, JSON.stringify(c)); }

export default function SettingsPage() {
  const [tab, setTab] = useState<'rates' | 'ctrlp' | 'maizey'>('rates');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState<Partial<PriceRow>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ category: '', description: '', size: '', price: '', priceType: 'psm' as 'psm' | 'fixed' });

  useEffect(() => {
    const overrides = loadOverrides();
    const custom = loadCustom();
    const base: PriceRow[] = PRICE_ITEMS.map(item => ({
      id: item.id,
      category: item.category,
      description: item.description,
      size: item.size || '',
      price: item.price,
      priceType: item.priceType,
      isEdited: !!overrides[item.id],
      ...(overrides[item.id] || {}),
    }));
    setRows([...base, ...custom]);
  }, []);

  const allCategories = Array.from(new Set(rows.map(r => r.category))).filter(Boolean).sort();

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !search || r.description?.toLowerCase().includes(q) || r.category?.toLowerCase().includes(q);
    const matchCat = filterCat === 'all' || r.category === filterCat;
    return matchSearch && matchCat;
  });

  function startEdit(row: PriceRow) {
    setEditingId(row.id);
    setEditForm({ category: row.category, description: row.description, size: row.size || '', price: row.price, priceType: row.priceType });
  }

  function saveEdit() {
    if (!editingId) return;
    const overrides = loadOverrides();
    overrides[editingId] = editForm;
    saveOverrides(overrides);

    setRows(prev => prev.map(r => r.id === editingId ? { ...r, ...editForm, isEdited: !r.isCustom } : r));

    // If custom, update custom storage too
    const custom = loadCustom();
    const idx = custom.findIndex(c => c.id === editingId);
    if (idx >= 0) { custom[idx] = { ...custom[idx], ...editForm }; saveCustom(custom); }

    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  function resetToOriginal(id: string | number) {
    if (!confirm('Reset to original price?')) return;
    const overrides = loadOverrides();
    delete overrides[id];
    saveOverrides(overrides);
    const original = PRICE_ITEMS.find(i => i.id === id);
    if (original) {
      setRows(prev => prev.map(r => r.id === id ? { ...original, id: original.id, size: original.size || '', isEdited: false } : r));
    }
  }

  function deleteCustom(id: string | number) {
    if (!confirm('Delete this item?')) return;
    const custom = loadCustom().filter(c => c.id !== id);
    saveCustom(custom);
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function handleAdd() {
    if (!addForm.description || !addForm.price) return;
    const id = `custom-${Date.now()}`;
    const newRow: PriceRow = {
      id,
      category: addForm.category || 'Custom',
      description: addForm.description,
      size: addForm.size || '',
      price: parseFloat(addForm.price) || 0,
      priceType: addForm.priceType,
      isCustom: true,
    };
    const custom = loadCustom();
    custom.push(newRow);
    saveCustom(custom);
    setRows(prev => [...prev, newRow]);
    setAddForm({ category: '', description: '', size: '', price: '', priceType: 'psm' });
    setShowAdd(false);
  }

  const inp = "bg-gray-800 border border-gray-600 text-white rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500 w-full";

  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 text-sm mt-1">Rates, pricing and price lists</p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-700">
          {[{ key: 'rates', label: 'Rates & Pricing' }, { key: 'ctrlp', label: 'Ctrl-P Price List' }, { key: 'maizey', label: 'Maizey Plastics' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-yellow-500 text-yellow-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'rates' && (
          <div>
            {/* Toolbar */}
            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search prices..."
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-yellow-500" />
              <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
                <option value="all">All Categories ({rows.length})</option>
                {allCategories.map(c => <option key={c} value={c}>{c} ({rows.filter(r => r.category === c).length})</option>)}
              </select>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-gray-500 text-sm">{filtered.length} items</span>
                <button onClick={() => setShowAdd(v => !v)}
                  className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
                  + Add Custom Price
                </button>
              </div>
            </div>

            {/* Add Form */}
            {showAdd && (
              <div className="bg-[#1a1f2e] border border-yellow-500/30 rounded-xl p-4 mb-4">
                <h3 className="text-white font-semibold text-sm mb-3">Add New Price Item</h3>
                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-1">
                    <label className="text-xs text-gray-400 uppercase mb-1 block">Category</label>
                    <input value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Vinyl" list="cat-suggestions" className={inp} />
                    <datalist id="cat-suggestions">{allCategories.map(c => <option key={c} value={c} />)}</datalist>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-400 uppercase mb-1 block">Description *</label>
                    <input value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="e.g. 5 Year Cast Vinyl" className={inp} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs text-gray-400 uppercase mb-1 block">Size</label>
                    <input value={addForm.size} onChange={e => setAddForm(f => ({ ...f, size: e.target.value }))}
                      placeholder="e.g. A4" className={inp} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs text-gray-400 uppercase mb-1 block">Price (N$) *</label>
                    <input type="number" value={addForm.price} onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="0.00" className={inp} />
                  </div>
                  <div className="col-span-1">
                    <label className="text-xs text-gray-400 uppercase mb-1 block">Type</label>
                    <select value={addForm.priceType} onChange={e => setAddForm(f => ({ ...f, priceType: e.target.value as any }))} className={inp}>
                      <option value="psm">Per m²</option>
                      <option value="fixed">Fixed</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Cancel</button>
                  <button onClick={handleAdd} className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black font-semibold rounded-lg text-sm">Save Item</button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="bg-[#1a1f2e] border border-gray-700/50 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-700 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <div className="col-span-2">Category</div>
                <div className="col-span-4">Description</div>
                <div className="col-span-1">Size</div>
                <div className="col-span-1 text-center">Type</div>
                <div className="col-span-2 text-right">Price (N$)</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>

              <div className="divide-y divide-gray-700/30 max-h-[58vh] overflow-y-auto">
                {filtered.map(row => (
                  <div key={row.id}>
                    {editingId === row.id ? (
                      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-800/60 items-center">
                        <div className="col-span-2">
                          <input value={editForm.category || ''} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                            list="cat-suggestions" className={inp} />
                        </div>
                        <div className="col-span-4">
                          <input value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className={inp} />
                        </div>
                        <div className="col-span-1">
                          <input value={editForm.size || ''} onChange={e => setEditForm(f => ({ ...f, size: e.target.value }))} placeholder="—" className={inp} />
                        </div>
                        <div className="col-span-1">
                          <select value={editForm.priceType} onChange={e => setEditForm(f => ({ ...f, priceType: e.target.value as any }))} className={inp}>
                            <option value="psm">Per m²</option>
                            <option value="fixed">Fixed</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input type="number" step="0.01" value={editForm.price ?? ''} onChange={e => setEditForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} className={inp + " text-right"} />
                        </div>
                        <div className="col-span-2 flex justify-end gap-2">
                          <button onClick={saveEdit} className="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-black text-xs font-semibold rounded">Save</button>
                          <button onClick={cancelEdit} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className={`grid grid-cols-12 gap-2 px-4 py-3 hover:bg-gray-800/40 transition-colors items-center ${row.isCustom ? 'bg-yellow-500/3' : ''}`}>
                        <div className="col-span-2 flex items-center gap-1 flex-wrap">
                          <span className="text-xs text-yellow-400/80 font-medium">{row.category}</span>
                          {row.isCustom && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1 py-0.5 rounded">custom</span>}
                          {row.isEdited && !row.isCustom && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded">edited</span>}
                        </div>
                        <div className="col-span-4"><span className="text-sm text-white">{row.description}</span></div>
                        <div className="col-span-1"><span className="text-xs text-gray-500">{row.size || '—'}</span></div>
                        <div className="col-span-1 flex justify-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${row.priceType === 'psm' ? 'bg-orange-500/20 text-orange-400' : 'bg-green-500/20 text-green-400'}`}>
                            {row.priceType === 'psm' ? '/m²' : 'fixed'}
                          </span>
                        </div>
                        <div className="col-span-2 text-right"><span className="text-sm text-white font-mono font-semibold">{(row.price || 0).toFixed(2)}</span></div>
                        <div className="col-span-2 flex justify-end gap-1">
                          <button onClick={() => startEdit(row)} className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors" title="Edit">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          {row.isEdited && !row.isCustom && (
                            <button onClick={() => resetToOriginal(row.id)} className="p-1.5 text-gray-500 hover:text-blue-400 transition-colors" title="Reset to original">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            </button>
                          )}
                          {row.isCustom && (
                            <button onClick={() => deleteCustom(row.id)} className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Delete">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && <div className="px-4 py-8 text-center text-gray-600 text-sm">No items match</div>}
              </div>
            </div>
            <p className="text-gray-700 text-xs mt-2">Edits saved in browser — apply instantly to all quotes, job cards and retail.</p>
          </div>
        )}

        {tab === 'ctrlp' && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-sm font-medium text-gray-400">Ctrl-P Price List</p>
            <p className="text-xs mt-1">Coming soon — upload your Ctrl-P supplier prices here</p>
          </div>
        )}
        {tab === 'maizey' && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-sm font-medium text-gray-400">Maizey Plastics</p>
            <p className="text-xs mt-1">Coming soon — upload your Maizey Plastics prices here</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
