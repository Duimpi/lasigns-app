'use client';

import { useState, useEffect, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { createClient } from '@supabase/supabase-js';
import { SmartLineItem, SmartLineItemHeader, createLineItem, LineItem } from '@/components/ui/SmartLineItem';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
};

interface JobCard {
  id: string;
  job_number: string;
  client_id: string | null;
  client_name: string;
  title: string;
  description: string;
  notes: string;
  status: string;
  priority: string;
  assigned_to: string | null;
  due_date: string | null;
  date_completed: string | null;
  items: LineItem[];
  subtotal: number;
  vat_amount: number;
  total: number;
  created_at: string;
}

export default function JobCardsPage() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editJob, setEditJob] = useState<JobCard | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [form, setForm] = useState({
    client_id: '',
    client_name: '',
    title: '',
    description: '',
    notes: '',
    status: 'pending',
    priority: 'normal',
    assigned_to: '',
    due_date: '',
    date_completed: '',
  });
  const [clientSearch, setClientSearch] = useState('');
  const [clientDropdown, setClientDropdown] = useState(false);
  const clientRef = useRef<HTMLDivElement>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([createLineItem()]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => { loadJobs(); loadClients(); }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (clientRef.current && !clientRef.current.contains(e.target as Node)) setClientDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function loadJobs() {
    setLoading(true);
    const { data } = await supabase
      .from('job_cards')
      .select('*, job_card_items(*)')
      .order('created_at', { ascending: false });
    if (data) {
      setJobs(data.map((j: any) => ({
        ...j,
        items: (j.job_card_items || []).map((i: any) => ({
          id: i.id,
          description: i.description || '',
          widthMm: '',
          heightMm: '',
          sqm: null,
          qty: i.qty || 1,
          unitPrice: i.unit_price || null,
          priceType: 'manual' as const,
          total: i.total || 0,
        })),
      })));
    }
    setLoading(false);
  }

  async function loadClients() {
    const { data: clientData } = await supabase.from('clients').select('id, name, phone').order('name');
    const { data: phoneData } = await supabase.from('client_phones').select('client_id, phone');
    if (clientData) {
      setClients(clientData.map((c: any) => ({
        ...c,
        phone: c.phone || (phoneData || []).find((p: any) => p.client_id === c.id)?.phone || null,
      })));
    }
  }

  const filteredClients = clients.filter(c =>
    clientSearch.length > 0 && c.name.toLowerCase().includes(clientSearch.toLowerCase())
  ).slice(0, 8);

  function selectClient(client: { id: string; name: string; phone: string | null }) {
    setForm(f => ({ ...f, client_id: client.id, client_name: client.name }));
    setClientSearch(client.name);
    setSelectedPhone(client.phone || '');
    setClientDropdown(false);
  }

  function openNew() {
    setEditJob(null);
    setForm({ client_id: '', client_name: '', title: '', description: '', notes: '', status: 'pending', priority: 'normal', assigned_to: '', due_date: '', date_completed: '' });
    setClientSearch('');
    setSelectedPhone('');
    setLineItems([createLineItem()]);
    setSaveError('');
    setShowForm(true);
  }

  function openEdit(job: JobCard) {
    setEditJob(job);
    setForm({
      client_id: job.client_id || '',
      client_name: job.client_name || '',
      title: job.title || '',
      description: job.description || '',
      notes: job.notes || '',
      status: job.status || 'pending',
      priority: job.priority || 'normal',
      assigned_to: job.assigned_to || '',
      due_date: job.due_date || '',
      date_completed: job.date_completed || '',
    });
    setClientSearch(job.client_name || '');
    setLineItems(job.items.length > 0 ? job.items : [createLineItem()]);
    setSaveError('');
    setShowForm(true);
  }

  function openDuplicate(job: JobCard) {
    setEditJob(null);
    setForm({
      client_id: job.client_id || '',
      client_name: job.client_name || '',
      title: job.title + ' (Copy)',
      description: job.description || '',
      notes: job.notes || '',
      status: 'pending',
      priority: job.priority || 'normal',
      assigned_to: job.assigned_to || '',
      due_date: '',
      date_completed: '',
    });
    setClientSearch(job.client_name || '');
    setLineItems(job.items.map(i => ({ ...i, id: crypto.randomUUID() })));
    setSaveError('');
    setShowForm(true);
  }

  const subtotal = lineItems.reduce((s, i) => s + (i.total || 0), 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  async function handleSave() {
    if (!form.client_name && !form.title) { setSaveError('Please enter a client name or job title'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const jobData: any = {
        client_name: form.client_name,
        title: form.title,
        description: form.description,
        notes: form.notes,
        status: form.status,
        priority: form.priority,
        subtotal,
        vat_amount: vat,
        total,
      };
      if (form.client_id) jobData.client_id = form.client_id;
      if (form.assigned_to) jobData.assigned_to = form.assigned_to;
      if (form.due_date) jobData.due_date = form.due_date;
      if (form.date_completed) jobData.date_completed = form.date_completed;

      let jobId: string;
      if (editJob) {
        const { error } = await supabase.from('job_cards').update(jobData).eq('id', editJob.id);
        if (error) throw error;
        jobId = editJob.id;
        await supabase.from('job_card_items').delete().eq('job_card_id', jobId);
      } else {
        const { data, error } = await supabase.from('job_cards').insert(jobData).select('id').single();
        if (error) throw error;
        jobId = data.id;
      }

      const validItems = lineItems.filter(i => i.description || i.unitPrice);
      if (validItems.length > 0) {
        const itemsPayload = validItems.map(i => ({
          job_card_id: jobId,
          description: i.description,
          qty: i.qty || 1,
          unit_price: i.unitPrice || 0,
          total: i.total || 0,
        }));
        const { error: itemError } = await supabase.from('job_card_items').insert(itemsPayload);
        if (itemError) console.warn('Items warning:', itemError.message);
      }

      setShowForm(false);
      loadJobs();
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save. Check your connection and try again.');
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this job card?')) return;
    await supabase.from('job_card_items').delete().eq('job_card_id', id);
    await supabase.from('job_cards').delete().eq('id', id);
    loadJobs();
  }

  const filtered = jobs.filter(j => {
    const matchSearch = !search || j.title?.toLowerCase().includes(search.toLowerCase()) || j.client_name?.toLowerCase().includes(search.toLowerCase()) || j.job_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || j.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <AppShell>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Job Cards</h1>
            <p className="text-gray-400 text-sm mt-1">{jobs.length} total jobs</p>
          </div>
          <button onClick={openNew} className="bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-4 py-2 rounded-lg transition-colors">
            + New Job Card
          </button>
        </div>

        <div className="flex gap-3 mb-6 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search jobs..."
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:border-yellow-500" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="designing">Designing</option>
            <option value="printing">Printing</option>
            <option value="ready">Ready</option>
            <option value="delivered">Delivered</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {loading ? (
          <div className="text-gray-400 text-center py-12">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-500 text-center py-12">No job cards yet — create one above</div>
        ) : (
          <div className="grid gap-4">
            {filtered.map(job => (
              <div key={job.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-yellow-400 font-mono text-sm">{job.job_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium uppercase ${STATUS_COLORS[job.status] || STATUS_COLORS.pending}`}>{job.status}</span>
                      {job.priority === 'urgent' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-medium uppercase">URGENT</span>}
                    </div>
                    <h3 className="text-white font-semibold mt-1 truncate">{job.title || job.client_name}</h3>
                    <p className="text-gray-400 text-sm">{job.client_name}</p>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      {job.due_date && <span>Due: {new Date(job.due_date).toLocaleDateString()}</span>}
                      {job.assigned_to && <span>Worker: {WORKERS.find(w => w.id === job.assigned_to)?.name || job.assigned_to}</span>}
                      {job.total > 0 && <span className="text-yellow-400 font-semibold">N${job.total?.toFixed(2)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => openDuplicate(job)} title="Duplicate" className="p-2 text-gray-400 hover:text-blue-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    </button>
                    <button onClick={() => openEdit(job)} className="p-2 text-gray-400 hover:text-yellow-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDelete(job.id)} className="p-2 text-gray-400 hover:text-red-400 transition-colors">
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
              <h2 className="text-white font-bold text-lg">{editJob ? 'Edit Job Card' : 'New Job Card'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Client Name</label>
                  <div ref={clientRef} className="relative mt-1">
                    <input
                      value={clientSearch}
                      onChange={e => {
                        setClientSearch(e.target.value);
                        setForm(f => ({ ...f, client_name: e.target.value, client_id: '' }));
                        setClientDropdown(true);
                      }}
                      onFocus={() => { if (clientSearch.length > 0) setClientDropdown(true); }}
                      placeholder="Type client name..."
                      className="w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500"
                    />
                    {clientDropdown && filteredClients.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {filteredClients.map(c => (
                          <button key={c.id} type="button"
                            onMouseDown={e => { e.preventDefault(); selectClient(c); }}
                            className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-700 border-b border-gray-700 last:border-0">
                            {c.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Job Title</label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Shop Signage, Vehicle Wrap"
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
                    <option value="pending">Pending</option>
                    <option value="designing">Designing</option>
                    <option value="printing">Printing</option>
                    <option value="ready">Ready</option>
                    <option value="delivered">Delivered</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Priority</label>
                  <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
                    <option value="normal">Normal</option>
                    <option value="urgent">Urgent</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Assigned Worker</label>
                  <select value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500">
                    <option value="">— Unassigned —</option>
                    {WORKERS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Due Date</label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 uppercase tracking-wide">Date Completed</label>
                  <input type="date" value={form.date_completed} onChange={e => setForm(f => ({ ...f, date_completed: e.target.value }))}
                    className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Job description..."
                  className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 resize-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Internal notes..."
                  className="mt-1 w-full bg-gray-800 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-yellow-500 resize-none" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Line Items</label>
                  <button type="button" onClick={() => setLineItems(i => [...i, createLineItem()])}
                    className="text-xs text-yellow-400 hover:text-yellow-300 font-medium">+ Add Item</button>
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

              {saveError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">{saveError}</div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-gray-700">
              <button onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2.5 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold py-2.5 rounded-lg transition-colors">
                {saving ? 'Saving...' : editJob ? 'Save Changes' : 'Create Job Card'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
