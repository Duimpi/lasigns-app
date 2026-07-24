'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'
import { Check, ExternalLink, Plus, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { importedProductionRows } from './importedRows'

type WorkerSection = 'Nicole' | 'Geraldo' | 'Bets-Mari' | 'Damion' | 'Outsourcing'
type Highlight = 'none' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'blue' | 'black'
type LinkType = '' | 'quote' | 'retail' | 'job_card'

type LinkedJob = {
  id: string
  type: 'quote' | 'retail' | 'job_card'
  number: string
  client: string
  title: string
  subtitle: string
}

type ClientMatch = {
  id: string
  name: string
  company: string
  phone: string
  email: string
}

type SheetRow = {
  id: string
  worker: WorkerSection
  highlight: Highlight
  done: boolean
  status: string
  date: string
  company: string
  job: string
  comments: string
  feedback: string
  next_step: string
  due_date: string
  link_id: string
  link_type: LinkType
  link_number: string
  row_height: number | null
}

type Column = {
  key: keyof Omit<SheetRow, 'id' | 'worker' | 'highlight' | 'done' | 'link_id' | 'link_type' | 'row_height'>
  label: string
  width: string
  placeholder?: string
}

const STORAGE_KEY = 'la-signs-production-sheet-test-v4'
const WORKERS: WorkerSection[] = ['Nicole', 'Geraldo', 'Bets-Mari', 'Damion', 'Outsourcing']
const HIGHLIGHTS: { value: Highlight; label: string; swatch: string }[] = [
  { value: 'none', label: 'No highlight', swatch: 'bg-bg-surface' },
  { value: 'red', label: 'Urgent', swatch: 'bg-red-500' },
  { value: 'yellow', label: 'Waiting on Client', swatch: 'bg-yellow-400' },
  { value: 'blue', label: 'Design', swatch: 'bg-blue-500' },
  { value: 'green', label: 'Production', swatch: 'bg-emerald-400' },
  { value: 'black', label: 'Installation', swatch: 'bg-zinc-950' },
  { value: 'purple', label: 'Issue / Problem', swatch: 'bg-purple-500' },
]
const COLUMNS: Column[] = [
  { key: 'status', label: 'Status', width: 'minmax(110px, 0.7fr)', placeholder: 'INVOICED / PAID' },
  { key: 'date', label: 'Date', width: 'minmax(70px, 0.45fr)', placeholder: '21/07' },
  { key: 'company', label: 'Company / Client', width: 'minmax(150px, 0.95fr)', placeholder: 'Client name' },
  { key: 'job', label: 'Quote / Print', width: 'minmax(210px, 1.35fr)', placeholder: 'Job description' },
  { key: 'comments', label: 'Comments', width: 'minmax(210px, 1.35fr)', placeholder: 'Production notes' },
  { key: 'feedback', label: 'Feedback', width: 'minmax(180px, 1.1fr)', placeholder: 'Client feedback' },
  { key: 'next_step', label: 'Next Step', width: 'minmax(130px, 0.75fr)', placeholder: 'To quote / print / collect' },
  { key: 'due_date', label: 'Due Date', width: 'minmax(78px, 0.45fr)', placeholder: 'Due' },
  { key: 'link_number', label: 'Linked Job', width: 'minmax(105px, 0.6fr)', placeholder: 'LA-Q0123' },
]

function todayDate() {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`
}

function rowDateValue(date: string) {
  const match = date.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/)
  if (!match) return Number.POSITIVE_INFINITY

  const day = Number(match[1])
  const month = Number(match[2])
  const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : new Date().getFullYear()

  if (!day || !month || month > 12 || day > 31) return Number.POSITIVE_INFINITY
  return new Date(year, month - 1, day).getTime()
}

function sortRowsByDate(rows: SheetRow[]) {
  return [...rows].sort((a, b) => {
    const aHasText = rowHasText(a)
    const bHasText = rowHasText(b)
    if (aHasText !== bHasText) return aHasText ? -1 : 1

    const dateDifference = rowDateValue(a.date) - rowDateValue(b.date)
    if (dateDifference !== 0) return dateDifference

    return 0
  })
}
function makeRow(worker: WorkerSection, seed: Partial<SheetRow> = {}): SheetRow {
  return {
    id: crypto.randomUUID(),
    worker,
    highlight: 'none',
    done: false,
    status: '',
    date: '',
    company: '',
    job: '',
    comments: '',
    feedback: '',
    next_step: '',
    due_date: '',
    link_id: '',
    link_type: '',
    link_number: '',
    row_height: null,
    ...seed,
  }
}

function normalizeRow(row: Partial<SheetRow>): SheetRow {
  return makeRow(row.worker || 'Nicole', { ...row, highlight: row.highlight === 'orange' ? 'yellow' : row.highlight, row_height: null })
}

function starterRows() {
  const importedRows = importedProductionRows.map(row => makeRow(row.worker as WorkerSection, { ...row, highlight: row.highlight === 'orange' ? 'yellow' : row.highlight } as Partial<SheetRow>))
  return [
    ...importedRows,
    ...WORKERS.map(worker => makeRow(worker)),
  ]
}
function rowHasText(row: SheetRow) {
  return COLUMNS.some(column => String(row[column.key] || '').trim()) || Boolean(row.link_type)
}

function statusTone(status: string) {
  const value = status.toLowerCase()
  if (value.includes('paid') || value.includes('/pd') || value.includes(' pd')) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
  if (value.includes('invoice')) return 'bg-blue-500/10 text-blue-300 border-blue-500/25'
  if (value.includes('email') || value.includes('quote')) return 'bg-amber-500/10 text-amber-300 border-amber-500/25'
  if (value.includes('collect')) return 'bg-purple-500/10 text-purple-300 border-purple-500/25'
  return 'bg-bg-elevated text-text-secondary border-border'
}

function highlightTone(highlight: Highlight) {
  switch (highlight) {
    case 'green':
      return 'bg-emerald-400 text-black placeholder:text-black/55'
    case 'yellow':
    case 'orange':
      return 'bg-yellow-400 text-black placeholder:text-black/55'
    case 'red':
      return 'bg-red-600 text-white placeholder:text-white/60 font-semibold'
    case 'purple':
      return 'bg-purple-600 text-white placeholder:text-white/65 font-semibold'
    case 'blue':
      return 'bg-blue-500 text-white placeholder:text-white/60'
    case 'black':
      return 'bg-black text-white placeholder:text-white/55'
    default:
      return ''
  }
}

function estimateRowHeight(row: SheetRow) {
  const charsPerLine: Partial<Record<Column['key'], number>> = {
    status: 15,
    date: 10,
    company: 22,
    job: 31,
    comments: 31,
    feedback: 27,
    next_step: 19,
    due_date: 10,
    link_number: 14,
  }

  const maxLines = COLUMNS.reduce((largest, column) => {
    const value = String(row[column.key] || '').trim()
    if (!value) return largest

    const wrappedLines = value.split('\n').reduce((sum, line) => {
      const capacity = charsPerLine[column.key] || 24
      const softWrapLines = Math.max(1, Math.ceil(line.length / capacity))
      const longWordLines = line
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .reduce((max, word) => Math.max(max, Math.ceil(word.length / capacity)), 1)

      return sum + Math.max(softWrapLines, longWordLines)
    }, 0)

    return Math.max(largest, wrappedLines)
  }, 1)

  return Math.max(54, Math.min(420, maxLines * 18 + 22))
}
function getLinkHref(row: SheetRow) {
  const open = row.link_id ? `?open=${encodeURIComponent(row.link_id)}` : ''
  const find = row.link_number.trim() ? `?find=${encodeURIComponent(row.link_number.trim())}` : ''
  const query = open || find
  if (row.link_type === 'quote') return `/quotes${query}`
  if (row.link_type === 'retail') return `/retail${query}`
  if (row.link_type === 'job_card') return `/job-cards${query}`
  return ''
}

export default function ProductionSheetPage() {
  const [rows, setRows] = useState<SheetRow[]>([])
  const [search, setSearch] = useState('')
  const [hideEmpty, setHideEmpty] = useState(false)
  const [saveState, setSaveState] = useState('Saved locally')
  const [linkedJobs, setLinkedJobs] = useState<LinkedJob[]>([])
  const [clients, setClients] = useState<ClientMatch[]>([])
  const [activeLinkRow, setActiveLinkRow] = useState<string | null>(null)
  const [activeClientRow, setActiveClientRow] = useState<string | null>(null)
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)
  const [linkDropdownPosition, setLinkDropdownPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const [clientDropdownPosition, setClientDropdownPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const resizingRow = useRef<{ rowId: string; startY: number; startHeight: number } | null>(null)
  const saveTimer = useRef<number | null>(null)
  const historyRef = useRef<SheetRow[][]>([])
  const gridTemplate = `112px ${COLUMNS.map(column => column.width).join(' ')}`

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          setRows(parsed.map(normalizeRow))
          return
        }
      } catch {}
    }
    setRows(starterRows())
  }, [])

  useEffect(() => {
    loadLinkedJobs()
    loadClients()
  }, [])

  useEffect(() => {
    if (!linkedJobs.length) return
    setRows(current => current.map(row => {
      if (!row.link_type || row.link_id || !row.link_number.trim()) return row
      const linkNumber = row.link_number.trim().toLowerCase()
      const match = linkedJobs.find(job =>
        job.type === row.link_type && job.number.toLowerCase() === linkNumber
      )
      return match ? { ...row, link_id: match.id } : row
    }))
  }, [linkedJobs])

  useEffect(() => {
    function handleUndo(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.key.toLowerCase() !== 'z') return
      event.preventDefault()
      undoLastChange()
    }

    window.addEventListener('keydown', handleUndo)
    return () => window.removeEventListener('keydown', handleUndo)
  }, [])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const current = resizingRow.current
      if (!current) return
      const nextHeight = Math.max(42, Math.min(260, current.startHeight + event.clientY - current.startY))
      setRows(rows => rows.map(row => row.id === current.rowId ? { ...row, row_height: nextHeight } : row))
    }

    function handleMouseUp() {
      resizingRow.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])
  useEffect(() => {
    if (!rows.length) return
    setSaveState('Saving...')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
      setSaveState('Saved locally')
    }, 350)
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter(row => {
      if (hideEmpty && !rowHasText(row)) return false
      if (!query) return true
      return [row.worker, row.link_type, ...COLUMNS.map(column => row[column.key])]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [rows, search, hideEmpty])

  function cloneRows(source: SheetRow[]) {
    return source.map(row => ({ ...row }))
  }

  function pushRowsHistory(snapshot: SheetRow[]) {
    historyRef.current = [...historyRef.current.slice(-49), cloneRows(snapshot)]
  }

  function ensureWorkerBlanks(source: SheetRow[]) {
    const usedRows = source.filter(row => rowHasText(row))
    return [
      ...usedRows,
      ...WORKERS.map(worker => makeRow(worker)),
    ]
  }

  function setRowsWithUndo(updater: (current: SheetRow[]) => SheetRow[]) {
    setRows(current => {
      const next = updater(current)
      if (next === current) return current
      pushRowsHistory(current)
      return ensureWorkerBlanks(next)
    })
  }

  function undoLastChange() {
    setRows(current => {
      const previous = historyRef.current.pop()
      if (!previous) {
        toast('Nothing to undo')
        return current
      }
      toast.success('Undone')
      return previous
    })
  }

  async function loadLinkedJobs() {
    try {
      const [quotesResult, jobsResult] = await Promise.all([
        supabase
          .from('quotes')
          .select('id, quote_number, client_name, status, created_at')
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('job_cards')
          .select('id, job_number, title, client_name, store, branch, status, is_retail, created_at')
          .order('created_at', { ascending: false })
          .limit(2000),
      ])

      if (quotesResult.error) throw quotesResult.error
      if (jobsResult.error) throw jobsResult.error

      const quoteLinks: LinkedJob[] = (quotesResult.data || [])
        .filter((quote: any) => quote.quote_number)
        .map((quote: any) => ({
          id: quote.id,
          type: 'quote',
          number: quote.quote_number || '',
          client: quote.client_name || '',
          title: quote.client_name || quote.quote_number || 'Quote',
          subtitle: [quote.quote_number, quote.status].filter(Boolean).join(' - '),
        }))

      const jobLinks: LinkedJob[] = (jobsResult.data || [])
        .filter((job: any) => job.job_number)
        .map((job: any) => ({
          id: job.id,
          type: job.is_retail ? 'retail' : 'job_card',
          number: job.job_number || '',
          client: job.client_name || '',
          title: job.title || job.client_name || job.job_number || (job.is_retail ? 'Retail job' : 'Job card'),
          subtitle: [job.job_number, job.store, job.branch, job.status].filter(Boolean).join(' - '),
        }))

      const links = [...quoteLinks, ...jobLinks]
      setLinkedJobs(links)
      console.info(`Production sheet linked jobs loaded: ${links.length}`)
    } catch (error: any) {
      console.error('Production sheet linked jobs failed', error)
      toast.error(`Could not load linked jobs: ${error?.message || 'Unknown error'}`)
      setLinkedJobs([])
    }
  }

  async function loadClients() {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          id,
          name,
          company,
          phones:client_phones(phone, is_primary),
          emails:client_emails(email, is_primary)
        `)
        .order('name', { ascending: true })
        .limit(2000)

      if (error) throw error

      setClients((data || []).map((client: any) => {
        const phones = Array.isArray(client.phones) ? client.phones : []
        const emails = Array.isArray(client.emails) ? client.emails : []
        const primaryPhone = phones.find((phone: any) => phone.is_primary) || phones[0]
        const primaryEmail = emails.find((email: any) => email.is_primary) || emails[0]
        return {
          id: client.id,
          name: client.name || '',
          company: client.company || '',
          phone: primaryPhone?.phone || '',
          email: primaryEmail?.email || '',
        }
      }))
    } catch (error: any) {
      console.error('Production sheet clients failed', error)
      toast.error(`Could not load clients: ${error?.message || 'Unknown error'}`)
      setClients([])
    }
  }

  function getLinkedJobMatches(row: SheetRow) {
    const query = row.link_number.trim().toLowerCase()
    if (query.length < 2) return []
    const localMatches = linkedJobs
      .filter(job => [job.number, job.client, job.title, job.subtitle].join(' ').toLowerCase().includes(query))
      .slice(0, 8)
    return localMatches
  }

  function getClientMatches(row: SheetRow) {
    const query = row.company.trim().toLowerCase()
    if (query.length < 2) return []
    return clients
      .filter(client => [client.name, client.company, client.phone, client.email].join(' ').toLowerCase().includes(query))
      .slice(0, 8)
  }

  function positionLinkDropdown(target: HTMLTextAreaElement) {
    const rect = target.getBoundingClientRect()
    setLinkDropdownPosition({
      left: rect.left,
      top: rect.bottom + 4,
      width: Math.max(260, rect.width),
    })
  }

  function positionClientDropdown(target: HTMLTextAreaElement) {
    const rect = target.getBoundingClientRect()
    setClientDropdownPosition({
      left: rect.left,
      top: rect.bottom + 4,
      width: Math.max(280, rect.width),
    })
  }

  function selectClientForRow(rowId: string, client: ClientMatch) {
    const label = client.company || client.name
    setRowsWithUndo(current => current.map(row => row.id === rowId ? { ...row, company: label } : row))
    setActiveClientRow(null)
    setClientDropdownPosition(null)
    toast.success(`Client added: ${label}`)
  }

  function linkRowToJob(rowId: string, job: LinkedJob) {
    setRowsWithUndo(current => current.map(row => {
      if (row.id !== rowId) return row
      return {
        ...row,
        link_id: job.id,
        link_type: job.type,
        link_number: job.number,
        company: row.company || job.client,
        job: row.job || job.title,
      }
    }))
    setActiveLinkRow(null)
    setLinkDropdownPosition(null)
    toast.success(`Linked ${job.number}`)
  }

  function updateRow(rowId: string, key: Column['key'], value: string) {
    setRowsWithUndo(current => {
      const next = current.map(row => {
        if (row.id !== rowId) return row
        const updated = { ...row, [key]: value }
        if (key === 'link_number' && !value.trim()) {
          updated.link_id = ''
          updated.link_type = ''
        }
        return updated
      })
      const edited = next.find(row => row.id === rowId)
      if (edited && rowHasText(edited)) {
        const workerRows = next.filter(row => row.worker === edited.worker)
        const lastForWorker = workerRows[workerRows.length - 1]
        if (lastForWorker?.id === rowId) next.push(makeRow(edited.worker))
      }
      return next
    })
  }

  function updateHighlight(rowId: string, highlight: Highlight) {
    setRowsWithUndo(current => current.map(row => row.id === rowId ? { ...row, highlight } : row))
  }

  function applyToolbarHighlight(highlight: Highlight) {
    if (!selectedRowId) {
      toast('Click a row first')
      return
    }
    updateHighlight(selectedRowId, highlight)
  }

  function toggleDone(rowId: string) {
    setRowsWithUndo(current => current.map(row => row.id === rowId ? { ...row, done: !row.done } : row))
  }



  function startRowResize(event: React.MouseEvent<HTMLButtonElement>, row: SheetRow) {
    event.preventDefault()
    pushRowsHistory(rows)
    resizingRow.current = {
      rowId: row.id,
      startY: event.clientY,
      startHeight: row.row_height || estimateRowHeight(row),
    }
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }
  function addRow(worker: WorkerSection) {
    const row = makeRow(worker, { date: todayDate() })
    setRowsWithUndo(current => [...current, row])
    setSelectedRowId(row.id)
  }

  function deleteRow(rowId: string) {
    setRowsWithUndo(current => current.filter(row => row.id !== rowId))
    setSelectedRowId(current => current === rowId ? null : current)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, rowId: string, columnIndex: number) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const visible = filteredRows
    const rowIndex = visible.findIndex(row => row.id === rowId)
    const nextRow = visible[rowIndex + 1]
    if (!nextRow) return
    const selector = `[data-cell="${nextRow.id}-${columnIndex}"]`
    window.setTimeout(() => (document.querySelector(selector) as HTMLInputElement | null)?.focus(), 0)
  }

  const activeLinkedRow = rows.find(row => row.id === activeLinkRow) || null
  const activeLinkedMatches = activeLinkedRow ? getLinkedJobMatches(activeLinkedRow) : []
  const activeClientMatchRow = rows.find(row => row.id === activeClientRow) || null
  const activeClientMatches = activeClientMatchRow ? getClientMatches(activeClientMatchRow) : []

  return (
    <AppShell>
      <div className="px-6 pb-6 pt-44 space-y-4">
        <div className="fixed left-56 right-0 top-0 z-[60] border-b border-border bg-bg/95 px-6 py-2 backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl tracking-wider text-text-primary">PRODUCTION SHEET</h1>
              <p className="text-xs text-text-muted">Spreadsheet-style workflow</p>
            </div>
            <span className="rounded border border-border bg-bg-surface px-2 py-1 text-xs text-text-muted">{saveState}</span>
          </div>
          <div className="card flex flex-wrap items-center gap-2 border-accent/40 bg-bg-surface/95 px-3 py-2 text-xs text-text-secondary shadow-elevated">
            <span className="mr-1 font-semibold text-text-primary">Row colour</span>
            {HIGHLIGHTS.map(highlight => (
              <button
                key={highlight.value}
                type="button"
                onClick={() => applyToolbarHighlight(highlight.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded border border-border bg-bg-surface px-2 py-1 hover:border-accent hover:text-white',
                  selectedRowId && rows.find(row => row.id === selectedRowId)?.highlight === highlight.value && 'border-accent text-white'
                )}
                title={highlight.label}
              >
                <span className={cn('h-3 w-3 rounded-full border border-white/20', highlight.swatch)} />
                <span>{highlight.label}</span>
              </button>
            ))}
            <span className="ml-auto text-text-muted">{selectedRowId ? 'Selected row ready' : 'Click a row first'}</span>
          </div>
          <div className="mt-2 card p-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="input pl-9"
                placeholder="Search worker, client, status, comments..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={hideEmpty}
                onChange={event => setHideEmpty(event.target.checked)}
                className="accent-accent"
              />
              Hide empty rows
            </label>
            <button
              type="button"
              onClick={() => {
                window.localStorage.removeItem(STORAGE_KEY)
                pushRowsHistory(rows)
                setRows(starterRows())
                toast.success('Test sheet reset')
              }}
              className="btn-secondary btn-sm"
            >
              Reset Test Data
            </button>
          </div>
        </div>
        <div className="space-y-5">
          {WORKERS.map(worker => {
            const workerRows = sortRowsByDate(filteredRows.filter(row => row.worker === worker))
            return (
              <section key={worker} className="card overflow-visible">
                <div className="sticky top-[170px] z-40 flex items-center justify-between border-b border-border bg-bg-elevated px-4 py-3 shadow-elevated">
                  <div>
                    <h2 className="font-display text-xl tracking-wide text-text-primary">{worker}</h2>
                    <p className="text-xs text-text-muted">{workerRows.filter(rowHasText).length} active sheet rows</p>
                  </div>
                  <button type="button" onClick={() => addRow(worker)} className="btn-secondary btn-sm">
                    <Plus className="w-3.5 h-3.5" />
                    Add Row
                  </button>
                </div>

                <div className="overflow-x-auto overscroll-x-contain">
                  <div className="min-w-[1360px] xl:min-w-0">
                    <div
                      className="sticky top-[230px] z-30 grid border-b border-black bg-bg text-[10px] font-semibold uppercase tracking-wider text-white"
                      style={{ gridTemplateColumns: gridTemplate }}
                    >
                      <div className="border-l border-r border-b border-black px-1 py-1.5 text-center">Actions</div>
                      {COLUMNS.map(column => (
                        <div key={column.key} className="border-r border-b border-black px-1 py-1.5">{column.label}</div>
                      ))}
                    </div>

                    {workerRows.map((row, rowIndex) => (
                      <div
                        key={row.id}
                        onClick={() => setSelectedRowId(row.id)}
                        className={cn(
                          'grid hover:bg-bg-elevated/40',
                          selectedRowId === row.id && 'ring-1 ring-inset ring-accent',
                          row.done && 'opacity-60'
                        )}
                        style={{ gridTemplateColumns: gridTemplate, height: row.row_height || estimateRowHeight(row) }}
                      >
                        <div className="flex items-center justify-center gap-1.5 border-l border-r border-b border-black/80 px-1 text-xs text-text-muted">
                          <span className="w-4 shrink-0 text-center">{rowIndex + 1}</span>
                          {row.link_type && (
                            <button
                              type="button"
                              onClick={() => { window.location.href = getLinkHref(row) }}
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-accent hover:border-accent hover:bg-accent-muted"
                              title="Open linked job"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleDone(row.id)}
                            className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border hover:border-accent hover:text-accent', row.done && 'border-emerald-500 bg-emerald-500/15 text-emerald-300')}
                            title={row.done ? 'Mark active' : 'Mark finished'}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRow(row.id)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-red-400 hover:border-red-400"
                            title="Delete row"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={event => startRowResize(event, row)}
                            className="flex h-5 w-4 shrink-0 cursor-row-resize items-center justify-center rounded border border-border text-text-muted hover:border-accent hover:text-accent"
                            title="Drag row taller or shorter"
                          >
                            <span className="leading-none">=</span>
                          </button>
                        </div>

                        {COLUMNS.map((column, columnIndex) => {
                          return (
                            <div key={column.key} className="relative border-r border-b border-black/80">
                              <textarea
                                data-cell={`${row.id}-${columnIndex}`}
                                value={row[column.key]}
                                onChange={event => {
                                  updateRow(row.id, column.key, event.target.value)
                                  if (column.key === 'company') {
                                    if (event.target.value.trim()) positionClientDropdown(event.currentTarget)
                                    else setClientDropdownPosition(null)
                                  }
                                  if (column.key === 'link_number') {
                                    if (event.target.value.trim()) positionLinkDropdown(event.currentTarget)
                                    else {
                                      setLinkDropdownPosition(null)
                                    }
                                  }
                                }}
                                onFocus={event => {
                                  setSelectedRowId(row.id)
                                  if (column.key === 'company') {
                                    setActiveClientRow(row.id)
                                    positionClientDropdown(event.currentTarget)
                                  }
                                  if (column.key === 'link_number') {
                                    setActiveLinkRow(row.id)
                                    positionLinkDropdown(event.currentTarget)
                                  }
                                }}
                                onBlur={() => {
                                  if (column.key === 'company') {
                                    window.setTimeout(() => {
                                      setActiveClientRow(current => current === row.id ? null : current)
                                      setClientDropdownPosition(null)
                                    }, 180)
                                  }
                                  if (column.key === 'link_number') {
                                    window.setTimeout(() => {
                                      setActiveLinkRow(current => current === row.id ? null : current)
                                      setLinkDropdownPosition(null)
                                    }, 180)
                                  }
                                }}
                                onKeyDown={event => handleKeyDown(event, row.id, columnIndex)}
                                className={cn(
                                  'h-full min-h-0 w-full resize-none overflow-hidden bg-transparent px-1.5 py-1.5 text-xs leading-[17px] text-text-primary outline-none focus:bg-accent-muted focus:ring-1 focus:ring-accent',
                                  column.key === 'link_number' && row.link_type && 'pr-9 font-mono text-accent',
                                  row.highlight !== 'none' && highlightTone(row.highlight),
                                  row.highlight === 'none' && column.key === 'status' && row.status && statusTone(row.status),
                                  row.done && 'line-through decoration-2'
                                )}
                                placeholder={row.highlight !== 'none' ? '' : column.key === 'link_number' ? 'Search quote or retail job...' : column.placeholder}
                              />
                              {column.key === 'link_number' && row.link_type && (
                                <button
                                  type="button"
                                  onMouseDown={event => event.preventDefault()}
                                  onClick={() => { window.location.href = getLinkHref(row) }}
                                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-accent hover:bg-accent-muted"
                                  title="Open linked job"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )
                        })}

                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>
      {linkDropdownPosition && activeLinkedRow && activeLinkedMatches.length > 0 && (
        <div
          className="fixed z-[9999] max-h-72 overflow-y-auto rounded-md border border-border bg-bg-elevated shadow-elevated"
          style={{ left: linkDropdownPosition.left, top: linkDropdownPosition.top, width: linkDropdownPosition.width }}
        >
          {activeLinkedMatches.map(match => (
            <button
              key={`${match.type}-${match.id}`}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => linkRowToJob(activeLinkedRow.id, match)}
              className="block w-full border-b border-border/70 px-3 py-2 text-left last:border-b-0 hover:bg-accent-muted"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs font-semibold text-accent">{match.number}</span>
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-text-muted">{match.type}</span>
              </div>
              <p className="mt-1 truncate text-sm font-medium text-text-primary">{match.title}</p>
              <p className="truncate text-xs text-text-muted">{match.client || match.subtitle}</p>
            </button>
          ))}
        </div>
      )}
      {clientDropdownPosition && activeClientMatchRow && activeClientMatches.length > 0 && (
        <div
          className="fixed z-[9999] max-h-72 overflow-y-auto rounded-md border border-border bg-bg-elevated shadow-elevated"
          style={{ left: clientDropdownPosition.left, top: clientDropdownPosition.top, width: clientDropdownPosition.width }}
        >
          {activeClientMatches.map(match => (
            <button
              key={match.id}
              type="button"
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectClientForRow(activeClientMatchRow.id, match)}
              className="block w-full border-b border-border/70 px-3 py-2 text-left last:border-b-0 hover:bg-accent-muted"
            >
              <div className="font-medium text-text-primary">{match.company || match.name}</div>
              {match.company && match.name && match.company !== match.name && (
                <p className="truncate text-xs text-text-muted">{match.name}</p>
              )}
              <p className="truncate text-xs text-text-muted">{[match.phone, match.email].filter(Boolean).join(' - ')}</p>
            </button>
          ))}
        </div>
      )}
    </AppShell>
  )
}
