'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Search, X, FileText, Briefcase, Users, ShoppingBag } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface SearchResult {
  id: string
  type: 'client' | 'quote' | 'job' | 'retail'
  title: string
  subtitle: string
  href: string
  value?: number
}

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(true)
        setTimeout(() => inputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape') { setIsOpen(false); setQuery('') }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 250)
  }, [query])

  async function search(q: string) {
    setIsSearching(true)
    try {
      const [{ data: clients }, { data: quotes }, { data: jobs }] = await Promise.all([
        supabase.from('clients').select('id, name, company').ilike('name', `%${q}%`).limit(4),
        supabase.from('quotes').select('id, quote_number, client_name, total, status').or(`quote_number.ilike.%${q}%,client_name.ilike.%${q}%`).limit(4),
        supabase.from('job_cards').select('id, job_number, title, client_name, total, status').or(`job_number.ilike.%${q}%,title.ilike.%${q}%,client_name.ilike.%${q}%`).limit(4),
      ])

      const r: SearchResult[] = [
        ...((clients || []).map(c => ({
          id: c.id, type: 'client' as const,
          title: c.name, subtitle: c.company || 'Client',
          href: `/clients?open=${c.id}`,
        }))),
        ...((quotes || []).map(q => ({
          id: q.id, type: 'quote' as const,
          title: q.client_name || 'Unknown', subtitle: q.quote_number,
          href: `/quotes?find=${encodeURIComponent(q.quote_number || q.client_name || '')}`, value: q.total,
        }))),
        ...((jobs || []).map(j => ({
          id: j.id, type: (j.job_number?.startsWith('WI-') ? 'retail' : 'job') as any,
          title: j.title, subtitle: `${j.job_number} · ${j.client_name || 'No client'}`,
          href: `/job-cards?open=${j.id}`, value: j.total,
        }))),
      ]
      setResults(r)
    } finally { setIsSearching(false) }
  }

  function select(result: SearchResult) {
    router.push(result.href)
    setIsOpen(false)
    setQuery('')
    setResults([])
  }

  const typeIcon = { client: Users, quote: FileText, job: Briefcase, retail: ShoppingBag }
  const typeLabel = { client: 'Client', quote: 'Quote', job: 'Job Card', retail: 'Retail' }
  const typeColor = { client: 'text-blue-400', quote: 'text-purple-400', job: 'text-accent', retail: 'text-amber-400' }

  if (!isOpen) {
    return (
      <button onClick={() => { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="flex items-center gap-2 px-3 py-2 bg-bg-elevated border border-border rounded-lg text-text-muted hover:border-border-strong transition-colors text-sm w-48">
        <Search className="w-3.5 h-3.5" />
        <span>Search...</span>
        <kbd className="ml-auto text-[10px] bg-bg-surface px-1.5 py-0.5 rounded border border-border">⌘K</kbd>
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" onClick={() => { setIsOpen(false); setQuery('') }}>
      <div className="bg-bg-surface border border-border rounded-2xl shadow-modal w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-text-primary outline-none text-sm placeholder:text-text-muted"
            placeholder="Search clients, jobs, quotes..." />
          {isSearching && <span className="spinner w-4 h-4 shrink-0" />}
          <button onClick={() => { setIsOpen(false); setQuery('') }} className="btn-icon w-6 h-6 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-2">
            {results.map(r => {
              const Icon = typeIcon[r.type]
              return (
                <div key={r.id} onClick={() => select(r)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-hover cursor-pointer transition-colors">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${typeColor[r.type]} bg-current/10 shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${typeColor[r.type]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{r.title}</p>
                    <p className="text-xs text-text-muted truncate">{r.subtitle}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {r.value ? <span className="text-sm font-semibold text-text-primary">{formatCurrency(r.value)}</span> : null}
                    <span className={`text-[10px] font-semibold uppercase ${typeColor[r.type]}`}>{typeLabel[r.type]}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {query && results.length === 0 && !isSearching && (
          <div className="py-8 text-center text-sm text-text-muted">No results for "{query}"</div>
        )}

        {!query && (
          <div className="px-4 py-3 text-xs text-text-muted">
            Search across clients, job cards, and quotes
          </div>
        )}
      </div>
    </div>
  )
}
