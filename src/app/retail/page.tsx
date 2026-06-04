'use client';

import { useState, useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@supabase/supabase-js';
import { SmartLineItem, SmartLineItemHeader, createLineItem, LineItem } from '@/components/ui/SmartLineItem';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RETAILER_BRANCHES: Record<string, string[]> = {
  Shoprite: ['Shoprite Katutura', 'Shoprite Okuryangava', 'Shoprite Khomasdal', 'Shoprite Brakwater', 'Shoprite Ongwediva', 'Shoprite Rundu', 'Shoprite Katima Mulilo', 'Shoprite Otjiwarongo', 'Shoprite Gobabis', 'Shoprite Okahandja'],
  Checkers: ['Checkers Grove Mall', 'Checkers Maerua Mall', 'Checkers Kleine Kuppe', 'Checkers Eros', 'Checkers Windhoek North'],
  Usave: ['Usave Katutura', 'Usave Havana', 'Usave Okuryangava', 'Usave Wanaheda', 'Usave Ongwediva', 'Usave Rundu'],
  'OK Foods': ['OK Foods Windhoek', 'OK Foods Swakopmund', 'OK Foods Walvis Bay', 'OK Foods Otjiwarongo'],
  'Pick n Pay': ['Pick n Pay Grove', 'Pick n Pay Maerua', 'Pick n Pay Okuryangava'],
  Spar: ['Spar Windhoek', 'Spar Swakopmund', 'Spar Walvis Bay'],
  Other: ['Other Branch'],
};

const RETAILERS = Object.keys(RETAILER_BRANCHES);
const WORKERS = [
  { id: 'nicole', name: 'Nicole' },
  { id: 'geraldo', name: 'Geraldo' },
  { id: 'bets-mari', name: 'Bets-Mari' },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  designing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  printing: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ready: 'bg-green-500/20 text-green-400 border-green-500/30',
  delivered: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

interface RetailJob {
  id: string;
  job_number: string;
  branch_name: string;
  retailer: string;
  contact_name: string;
  status: string;
  notes: string;
  items: LineItem[];
  subtotal: number;
  vat_amount: number;
  total: number;
  created_at: string;
}

export default function RetailPage() {
  const [jobs, setJobs] = useState<RetailJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editJob, setEditJob] = useState<RetailJob | null>(null);
  const [search, setSearch] = useState('');
  const [filterRetailer, setFilterRetailer] = useState('all');
  const [saveError, setSaveError] = useState('');
  // Worker stored in notes as prefix since assigned_to col doesn't exist in retail_branches
  const [form, setForm] = useState({
    retailer: 'Shoprite',
    branch_name: '',
    contact_name: '',
    worker: '',   // stored in notes field
    status: 'pending',
    notes: '',
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([createLineItem()]);
  const [saving, setSaving] = useState(false);
  const branches = RETAILER_BRANCHES[form.retailer] || [];

  useEffect(() => { loadJobs(); }, []);
  useEffect(() => { setForm(f => ({ ...f, branch_name: '' })); }, [form.retailer]);

  async function loadJobs() {
    setLoading(true);
    const { data } = await supabase
      .from('retail_branches')
      .select('*, job_card_items(*)')
      .order('created_at', { ascending: false });
    if (data) {
      setJobs(data.map((j: any) => ({
        ...j,
        items: (j.job_card_items || []).map((i: any) => ({
          id: i.id,
          description: i.description || '',
          widthMm: '', heightMm: '', sqm: null,
          qty: i.quantity || 1,
          unitPrice: i.unit_price || null,
          priceType: 'manual' as const,
          total: i.line_total || 0,
        })),
      })));
    }
    setLoading(false);
  }

  function openNew() {
    setEditJob(null);
    setForm({ retailer: 'Shoprite', branch_name: '', contact_name: '', worker: '', status: 'pending', notes: '' });
    setLineItems([createLineItem()]);
    setSaveError('');
    setShowForm(true);
  }

  function openEdit(job: RetailJob) {
    setEditJob(job);
    setForm({ retailer: job.retailer || 'Shoprite', branch_name: job.branch_name || '', contact_name: job.contact_name || '', worker: '', status: job.status || 'pending', notes: job.notes || '' });
    setLineItems(job.items.length > 0 ? job.items : [createLineItem()]);
    setSaveError('');
    setShowForm(true);
  }

  function openDuplicate(job: RetailJob) {
    setEditJob(null);
    setForm({ retailer: job.retailer || 'Shoprite', branch_name: job.branch_name || '', contact_name: job.contact_name || '', worker: '', status: 'pending', notes: job.notes || '' });
    setLineItems(job.items.map(i => ({ ...i, id: crypto.randomUUID() })));
    setSaveError('');
    setShowForm(true);
  }

  const subtotal = lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  async function handleSave() {
    if (!form.branch_name || form.branch_name === 'custom') { setSaveError('Please select or enter a branch name'); return; }
    setSaving(true);
    setSaveError('');
    try {
      // Only safe columns that exist in retail_branches
      const jobData: any = {
        branch_name: form.branch_name,
        retailer: form.retailer,
        contact_name: form.contact_name,
        status: form.status,
        subtotal,
        vat_amount: vat,
        total,
      };
      // Store worker in notes since assigned_to doesn't exist on retail_branches
      const workerName = WORKERS.find(w => w.id === form.worker)?.name;
      jobData.notes = [
        workerName ? `Worker: ${workerName}` : '',
        form.notes,
      ].filter(Boolean).join('\n');

      let jobId: string;
      if (editJob) {
        const { error } = await supabase.from('retail_branches').update(jobData).eq('id', editJob.id);
        if (error) throw error;
        jobId = editJob.id;
        await supabase.from('job_card_items').delete().eq('job_card_id', jobId);
      } else {
        const { data, error } = await supabase.from('retail_branches').insert(jobData).select('id').single();
        if (error) throw error;
        jobId = data.id;
      }

      const validItems = lineItems.filter(i => i.description || i.unitPrice);
      if (validItems.length > 0) {
        const { error: itemError } = await supabase.from('job_card_items').insert(
          validItems.map(i => ({
            job_card_id: jobId,
            description: i.description,
            quantity: i.qty || 1,
            unit_price: i.unitPrice || 0,
            line_total: i.total || 0,
          }))
        );
        if (itemError) console.warn('Items warning:', itemError.message);
      }

      setShowForm(false);
      loadJobs();
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save. Check connection and try again.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this retail job?')) return;
    await supabase.from('job_card_items').delete().eq('job_card_id', id);
    await supabase.from('retail_branches').delete().eq('id', id);
    loadJobs();
  }

  const filtered = jobs.filter(j => {
    const matchSearch = !search || j.branch_name?.toLowerCase().includes(search.toLowerCase()) || j.retailer?.toLowerCase().includes(search.toLowerCase());
    const matchRetailer = filterRetailer === 'all' || j.retailer === filterRetailer;
    return matchSearch && matchRetailer;
  });

  const sel = "mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500";
  const inp = "mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500";

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Retail</h1>
            <p className="text-gray-400 text-sm mt-1">{jobs.length} total retail jobs</p>
          </div>
          <button onClick={openNew} className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg">+ New Retail Job</button>
        </div>

        <div className="flex gap-3 mb-6 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search retail jobs..."
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-yellow-500" />
          <select value={filterRetailer} onChange={e => setFilterRetailer(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
            <option value="all">All Retailers</option>
            {RETAILERS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {loading ? <div className="text-gray-400 text-center py-12">Loading...</div>
          : filtered.length === 0 ? <div className="text-gray-500 text-center py-12">No retail jobs yet</div>
          : (
            <div className="grid gap-4">
              {filtered.map(job => (
                <div key={job.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-yellow-400 font-mono text-sm">{job.job_number}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">{job.retailer}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium uppercase ${STATUS_COLORS[job.status] || STATUS_COLORS.pending}`}>{job.status}</span>
                      </div>
                      <h3 className="text-white font-semibold mt-1">{job.branch_name}</h3>
                      {job.contact_name && <p className="text-gray-400 text-sm">{job.contact_name}</p>}
                      {job.total > 0 && <p className="text-yellow-400 text-sm font-semibold mt-1">N${job.total?.toFixed(2)}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button onClick={() => openDuplicate(job)} className="p-2 text-gray-400 hover:text-blue-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      </button>
                      <button onClick={() => openEdit(job)} className="p-2 text-gray-400 hover:text-yellow-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(job.id)} className="p-2 text-gray-400 hover:text-red-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h2 className="text-white font-bold text-lg">{editJob ? 'Edit Retail Job' : 'New Retail Job'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Retailer</label>
                  <select value={form.retailer} onChange={e => setForm(f => ({ ...f, retailer: e.target.value }))} className={sel}>
                    {RETAILERS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Branch</label>
                  <select value={form.branch_name} onChange={e => setForm(f => ({ ...f, branch_name: e.target.value }))} className={sel}>
                    <option value="">— Select Branch —</option>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                    <option value="custom">Other (type below)</option>
                  </select>
                  {form.branch_name === 'custom' && (
                    <input placeholder="Type branch name..." onChange={e => setForm(f => ({ ...f, branch_name: e.target.value }))} className={inp + " mt-2"} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Contact Name</label>
                  <input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Contact person" className={inp} />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Assigned Worker</label>
                  <select value={form.worker} onChange={e => setForm(f => ({ ...f, worker: e.target.value }))} className={sel}>
                    <option value="">— Unassigned —</option>
                    {WORKERS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={sel}>
                    <option value="pending">Pending</option>
                    <option value="designing">Designing</option>
                    <option value="printing">Printing</option>
                    <option value="ready">Ready</option>
                    <option value="delivered">Delivered</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes..." className={inp + " resize-none"} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Line Items</label>
                  <button type="button" onClick={() => setLineItems(i => [...i, createLineItem()])} className="text-xs text-yellow-400 hover:text-yellow-300 font-medium">+ Add Item</button>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <SmartLineItemHeader />
                  {lineItems.map((item, idx) => (
                    <SmartLineItem key={item.id} item={item} index={idx}
                      onChange={(id, updated) => setLineItems(items => items.map(i => i.id === id ? updated : i))}
                      onRemove={(id) => setLineItems(items => items.filter(i => i.id !== id))} />
                  ))}
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-400"><span>Subtotal</span><span>N${subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-gray-400"><span>VAT (15%)</span><span>N${vat.toFixed(2)}</span></div>
                  <div className="flex justify-between text-white font-bold text-base border-t border-gray-700 pt-2 mt-2"><span>TOTAL</span><span>N${total.toFixed(2)}</span></div>
                </div>
              </div>
              {saveError && <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">{saveError}</div>}
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-700">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2.5 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold py-2.5 rounded-lg">
                {saving ? 'Saving...' : editJob ? 'Save Changes' : 'Create Retail Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
