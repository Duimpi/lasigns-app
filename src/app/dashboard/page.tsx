'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const WORKERS = ['Nicole', 'Geraldo', 'Bets-Mari'];

export default function DashboardPage() {
  const [stats, setStats] = useState({ jobs: 0, quotes: 0, clients: 0, ready: 0, urgent: 0, pending: 0 });
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [selectedWorker, setSelectedWorker] = useState('All');
  const [workerJobs, setWorkerJobs] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const [jobsRes, quotesRes, clientsRes, readyRes, urgentRes, pendingRes, recentRes] = await Promise.all([
      supabase.from('job_cards').select('id', { count: 'exact', head: true }),
      supabase.from('quotes').select('id', { count: 'exact', head: true }),
      supabase.from('clients').select('id', { count: 'exact', head: true }),
      supabase.from('job_cards').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
      supabase.from('job_cards').select('id', { count: 'exact', head: true }).eq('status', 'urgent'),
      supabase.from('job_cards').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('job_cards').select('id, job_number, client_name, title, status, priority, assigned_to, created_at').order('created_at', { ascending: false }).limit(8),
    ]);

    setStats({
      jobs: jobsRes.count || 0,
      quotes: quotesRes.count || 0,
      clients: clientsRes.count || 0,
      ready: readyRes.count || 0,
      urgent: urgentRes.count || 0,
      pending: pendingRes.count || 0,
    });

    const jobs = recentRes.data || [];
    setRecentJobs(jobs);

    // Group by worker
    const grouped: Record<string, any[]> = { Nicole: [], Geraldo: [], 'Bets-Mari': [] };
    jobs.forEach((j: any) => {
      const worker = j.assigned_to;
      if (worker && grouped[worker]) grouped[worker].push(j);
      else if (worker) {
        // match by id
        const name = WORKERS.find(w => w.toLowerCase().replace('-', '') === worker?.toLowerCase().replace('-', ''));
        if (name) grouped[name].push(j);
      }
    });
    setWorkerJobs(grouped);
    setLoading(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    designing: 'bg-blue-500/20 text-blue-400',
    printing: 'bg-purple-500/20 text-purple-400',
    ready: 'bg-green-500/20 text-green-400',
    delivered: 'bg-gray-500/20 text-gray-400',
    urgent: 'bg-red-500/20 text-red-400',
  };

  const displayJobs = selectedWorker === 'All'
    ? recentJobs
    : (workerJobs[selectedWorker] || []);

  return (
    <AppShell>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">{greeting} 👋</h1>
          <p className="text-gray-400 mt-1 text-sm">Here is what is happening at LA Signs today.</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-8 lg:grid-cols-6">
          {[
            { label: 'Total Jobs', value: stats.jobs, color: 'text-yellow-400', border: 'border-yellow-500/20', icon: '📋' },
            { label: 'Pending', value: stats.pending, color: 'text-orange-400', border: 'border-orange-500/20', icon: '⏳' },
            { label: 'Urgent', value: stats.urgent, color: 'text-red-400', border: 'border-red-500/20', icon: '🔴' },
            { label: 'Ready', value: stats.ready, color: 'text-green-400', border: 'border-green-500/20', icon: '✅' },
            { label: 'Quotes', value: stats.quotes, color: 'text-blue-400', border: 'border-blue-500/20', icon: '📄' },
            { label: 'Clients', value: stats.clients, color: 'text-purple-400', border: 'border-purple-500/20', icon: '👥' },
          ].map(s => (
            <div key={s.label} className={`bg-[#1a1f2e] border ${s.border} rounded-2xl p-4 flex flex-col gap-1`}>
              <span className="text-lg">{s.icon}</span>
              <p className={`text-2xl font-bold ${s.color}`}>{loading ? '—' : s.value}</p>
              <p className="text-gray-500 text-xs">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Daily Work */}
        <div className="bg-[#1a1f2e] border border-gray-700/50 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-semibold text-lg">Daily Work</h2>
            <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
              {['All', ...WORKERS].map(w => (
                <button key={w} onClick={() => setSelectedWorker(w)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    selectedWorker === w
                      ? 'bg-yellow-500 text-black'
                      : 'text-gray-400 hover:text-white'
                  }`}>
                  {w}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-gray-500 text-sm text-center py-8">Loading...</div>
          ) : displayJobs.length === 0 ? (
            <div className="text-gray-600 text-sm text-center py-8">No jobs found</div>
          ) : (
            <div className="grid gap-2">
              {displayJobs.map((job: any) => (
                <div key={job.id} className="flex items-center justify-between bg-gray-800/50 rounded-xl px-4 py-3 hover:bg-gray-800 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-yellow-400/70 font-mono text-xs flex-shrink-0">{job.job_number}</span>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{job.title || job.client_name}</p>
                      <p className="text-gray-500 text-xs truncate">{job.client_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {job.assigned_to && (
                      <span className="text-xs text-gray-400 hidden sm:block">{job.assigned_to}</span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase ${STATUS_COLORS[job.status] || STATUS_COLORS.pending}`}>
                      {job.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '+ New Job Card', href: '/job-cards', color: 'bg-yellow-500 hover:bg-yellow-400 text-black' },
            { label: '+ New Quote', href: '/quotes', color: 'bg-gray-700 hover:bg-gray-600 text-white' },
            { label: '+ New Retail Job', href: '/retail', color: 'bg-gray-700 hover:bg-gray-600 text-white' },
          ].map(l => (
            <a key={l.href} href={l.href}
              className={`${l.color} font-semibold px-4 py-3 rounded-xl transition-colors text-center text-sm`}>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
