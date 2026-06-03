'use client';

import { useState, useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@supabase/supabase-js';
import { SmartLineItem, SmartLineItemHeader, createLineItem, LineItem } from '@/components/ui/SmartLineItem';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Quote {
  id: string;
  quote_number: string;
  client_id: string | null;
  client_name: string;
  title: string;
  notes: string;
  status: string;
  valid_until: string | null;
  items: LineItem[];
  subtotal: number;
  vat_amount: number;
  total: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
  declined: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editQuote, setEditQuote] = useState<Quote | null>(null);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    client_name: '',
    title: '',
    notes: '',
    status: 'draft',
    valid_until: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([createLineItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadQuotes(); }, []);

  async function loadQuotes() {
    setLoading(true);
    const { data } = await supabase
      .from('quotes')
      .select('*, quote_items(*)')
      .order('created_at', { ascending: false });
    if (data) {
      setQuotes(data.map((q: any) => ({
        ...q,
        items: (q.quote_items || []).map((i: any) => ({
          id: i.id,
          description: i.description || '',
          widthMm: i.width_mm?.toString() || '',
          heightMm: i.height_mm?.toString() || '',
          sqm: i.sqm || null,
          qty: i.qty || 1,
          unitPrice: i.unit_price || null,
          priceType: i.price_type || 'manual',
          total: i.total || 0,
        })),
      })));
    }
    setLoading(false);
  }

  function openNew() {
    setEditQuote(null);
    setForm({ client_name: '', title: '', notes: '', status: 'draft', valid_until: '' });
    setLineItems([createLineItem()]);
    setShowForm(true);
  }

  function openEdit(q: Quote) {
    setEditQuote(q);
    setForm({ client_name: q.client_name || '', title: q.title || '', notes: q.notes || '', status: q.status || 'draft', valid_until: q.valid_until || '' });
    setLineItems(q.items.length > 0 ? q.items : [createLineItem()]);
    setShowForm(true);
  }

  function openDuplicate(q: Quote) {
    setEditQuote(null);
    setForm({ client_name: q.client_name || '', title: q.title + ' (Copy)', notes: q.notes || '', status: 'draft', valid_until: '' });
    setLineItems(q.items.map(i => ({ ...i, id: crypto.randomUUID() })));
    setShowForm(true);
  }

  const subtotal = lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  async function handleSave() {
    if (!form.client_name) return;
    setSaving(true);
    try {
      const quoteData = {
        client_name: form.client_name,
        title: form.title,
        notes: form.notes,
        status: form.status,
        valid_until: form.valid_until || null,
        subtotal,
        vat_amount: vat,
        total,
      };

      let quoteId: string;
      if (editQuote) {
        await supabase.from('quotes').update(quoteData).eq('id', editQuote.id);
        quoteId = editQuote.id;
        await supabase.from('quote_items').delete().eq('quote_id', quoteId);
      } else {
        const { data } = await supabase.from('quotes').insert(quoteData).select().single();
        quoteId = data.id;
      }

      const itemsToSave = lineItems
        .filter(i => i.description || i.unitPrice)
        .map(i => ({
          quote_id: quoteId,
          description: i.description,
          width_mm: parseFloat(i.widthMm) || null,
          height_mm: parseFloat(i.heightMm) || null,
          sqm: i.sqm,
          qty: i.qty,
          unit_price: i.unitPrice,
          price_type: i.priceType,
          total: i.total,
        }));

      if (itemsToSave.length > 0) {
        await supabase.from('quote_items').insert(itemsToSave);
      }

      setShowForm(false);
      loadQuotes();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this quote?')) return;
    await supabase.from('quote_items').delete().eq('quote_id', id);
    await supabase.from('quotes').delete().eq('id', id);
    loadQuotes();
  }

  const filtered = quotes.filter(q =>
    !search ||
    q.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    q.title?.toLowerCase().includes(search.toLowerCase()) ||
    q.quote_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Quotes</h1>
            <p className="text-gray-400 text-sm mt-1">{quotes.length} total quotes</p>
          </div>
          <button onClick={openNew} className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg transition-colors">
            + New Quote
          </button>
        </div>

        <div className="mb-6">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search quotes..."
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-yellow-500" />
        </div>

        {loading ? (
          <div className="text-gray-400 text-center py-12">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 text-center py-12">No quotes found</div>
        ) : (
          <div className="grid gap-4">
            {filtered.map(q => (
              <div key={q.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-yellow-400 font-mono text-sm">{q.quote_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium uppercase ${STATUS_COLORS[q.status] || STATUS_COLORS.draft}`}>
                        {q.status}
                      </span>
                    </div>
                    <h3 className="text-white font-semibold mt-1">{q.title || q.client_name}</h3>
                    <p className="text-gray-400 text-sm">{q.client_name}</p>
                    <div className="flex gap-4 mt-2 text-xs text-gray-500">
                      {q.valid_until && <span>Valid until: {new Date(q.valid_until).toLocaleDateString()}</span>}
                      {q.total > 0 && <span className="text-yellow-400 font-semibold">N${q.total?.toFixed(2)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => openDuplicate(q)} title="Duplicate" className="p-2 text-gray-400 hover:text-blue-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <button onClick={() => openEdit(q)} className="p-2 text-gray-400 hover:text-yellow-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDelete(q.id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-white font-bold text-lg">{editQuote ? 'Edit Quote' : 'New Quote'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Client Name</label>
                  <input value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="Client name"
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Title / Job Description</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Shop Front Signage"
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="accepted">Accepted</option>
                    <option value="declined">Declined</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Valid Until</label>
                  <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Notes for client..."
                  className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 resize-none" />
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Line Items</label>
                  <button type="button" onClick={() => setLineItems(i => [...i, createLineItem()])}
                    className="text-xs text-yellow-400 hover:text-yellow-300 font-medium">
                    + Add Item
                  </button>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <SmartLineItemHeader />
                  {lineItems.map((item, idx) => (
                    <SmartLineItem key={item.id} item={item} index={idx}
                      onChange={(id, updated) => setLineItems(items => items.map(i => i.id === id ? updated : i))}
                      onRemove={(id) => setLineItems(items => items.filter(i => i.id !== id))} />
                  ))}
                </div>

                <div className="mt-3 space-y-1 text-sm text-right">
                  <div className="flex justify-between text-gray-400">
                    <span>Subtotal</span><span>N${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>VAT (15%)</span><span>N${vat.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-white font-bold text-base border-t border-gray-700 pt-2 mt-2">
                    <span>TOTAL</span><span>N${total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-gray-700">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2.5 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold py-2.5 rounded-lg transition-colors">
                {saving ? 'Saving...' : editQuote ? 'Save Changes' : 'Create Quote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
