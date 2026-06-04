'use client';

import { AppShell } from '@/components/layout/AppShell';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DashboardPage() {
  const [stats, setStats] = useState({ jobs: 0, quotes: 0, clients: 0, ready: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [jobs, quotes, clients, ready] = await Promise.all([
        supabase.from('job_cards').select('id', { count: 'exact', head: true }),
        supabase.from('quotes').select('id', { count: 'exact', head: true }),
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('job_cards').select('id', { count: 'exact', head: true }).eq('status', 'ready'),
      ]);
      setStats({
        jobs: jobs.count || 0,
        quotes: quotes.count || 0,
        clients: clients.count || 0,
        ready: ready.count || 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white">{greeting} 👋</h1>
          <p className="text-gray-400 mt-1">Here is what is happening at LA Signs today.</p>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Jobs', value: stats.jobs, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
            { label: 'Ready to Collect', value: stats.ready, color: 'text-green-400', bg: 'bg-green-500/10' },
            { label: 'Quotes', value: stats.quotes, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'Clients', value: stats.clients, color: 'text-purple-400', bg: 'bg-purple-500/10' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} border border-gray-700 rounded-2xl p-5`}>
              <p className="text-gray-400 text-sm">{s.label}</p>
              <p className={`text-4xl font-bold mt-1 ${s.color}`}>{loading ? '...' : s.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6">
          <h2 className="text-white font-semibold mb-4">Quick Links</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '+ New Job Card', href: '/job-cards' },
              { label: '+ New Quote', href: '/quotes' },
              { label: '+ New Retail Job', href: '/retail' },
            ].map(l => (
              <a key={l.href} href={l.href}
                className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-4 py-3 rounded-xl transition-colors text-center">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
