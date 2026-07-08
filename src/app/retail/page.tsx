'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TableSkeleton } from '@/components/ui/Loading'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatDate, formatCurrency, debounce } from '@/lib/utils'
import { generateJobCardPDF } from '@/lib/pdf/generator'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { PriceAutocomplete } from '@/components/ui/PriceAutocomplete'
import { ensureClientRecord } from '@/lib/clients/ensureClientRecord'
import {
  Plus, Download, Mail, Printer, Trash2, X, ShoppingBag, CheckCircle2
} from 'lucide-react'
import type { JobCardStatus, Priority, Worker, Client, RetailBranch, RetailStore } from '@/types'

const STATUSES: JobCardStatus[] = ['pending', 'designing', 'printing', 'installation', 'completed', 'delivered']
const ACTIVE_STATUSES: JobCardStatus[] = ['pending', 'designing', 'printing', 'installation']
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent']
const WORKERS: Worker[] = ['Nicole', 'Geraldo', 'Bets-Mari']
const STORES: RetailStore[] = ['Shoprite', 'Checkers', 'Usave']
const SHOPRITE_CHICRITE_BRANCHES = [
  'Shoprite Grootfontein ChicRite',
  'Shoprite Goreangab ChicRite',
  'Shoprite Independence ChicRite',
  'Shoprite Lafrenz ChicRite',
  'Shoprite Katima Mulilo ChicRite',
  'Shoprite Rundu ChicRite',
  'Shoprite Liquor Ohangwena (Liquor)',
  'Shoprite Liquor Goreangab (Liquor)',
]
const EXTRA_BRANCHES: Record<RetailStore, string[]> = {
  Shoprite: ['Shoprite', 'Shoprite ChicRite', ...SHOPRITE_CHICRITE_BRANCHES],
  Checkers: ['Checkers'],
  Usave: ['Usave'],
}
const RETAIL_CONTACT_TAGS = ['RETAIL_COMPANY', 'RETAIL_PHONE', 'RETAIL_EMAIL', 'RETAIL_ALL_STORES']
const ITEM_NOTE_RE = /\s*\[LA_ITEM_NOTE:([^\]]*)\]/i

function makeTag(key: string, value?: string | null) {
  const clean = String(value || '').trim()
  return clean ? `[LA_${key}:${encodeURIComponent(clean)}]` : ''
}

function tagValue(notes: string | null | undefined, key: string) {
  const match = String(notes || '').match(new RegExp('\\[LA_' + key + ':([^\\]]*)\\]', 'i'))
  if (!match?.[1]) return ''
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

function stripRetailTags(notes?: string | null) {
  let clean = String(notes || '')
  RETAIL_CONTACT_TAGS.forEach(tag => {
    clean = clean.replace(new RegExp('\\[LA_' + tag + ':[^\\]]*\\]', 'gi'), '')
  })
  return clean.trim()
}

function getItemNote(description?: string | null) {
  const match = String(description || '').match(ITEM_NOTE_RE)
  if (!match?.[1]) return ''
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

function stripItemNote(description?: string | null) {
  return String(description || '').replace(ITEM_NOTE_RE, '').trim()
}

function withItemNote(description?: string | null, note?: string | null) {
  return [stripItemNote(description), makeTag('ITEM_NOTE', note)].filter(Boolean).join(' ')
}

function retailCompanyName(store?: string | null, branch?: string | null) {
  const cleanStore = String(store || '').trim()
  const cleanBranch = String(branch || '').trim()
  if (!cleanBranch) return cleanStore
  if (!cleanStore) return cleanBranch
  return cleanBranch.toLowerCase().startsWith(cleanStore.toLowerCase()) ? cleanBranch : `${cleanStore} ${cleanBranch}`
}

const lineItemSchema = z.object({
  description: z.string().default(''),
  note: z.string().optional().default(''),
  quantity: z.coerce.number().default(1),
  unit_price: z.coerce.number().default(0),
  width: z.string().optional().default(''),
  height: z.string().optional().default(''),
  priceType: z.enum(['psm', 'fixed', 'manual']).default('manual'),
})

const retailSchema = z.object({
  store: z.enum(['Shoprite', 'Checkers', 'Usave']),
  branch: z.string().default(''),
  job_number: z.string().optional(),
  client_id: z.string().optional().default(''),
  client_name: z.string().optional().default(''),
  client_phone: z.string().optional().default(''),
  client_email: z.string().optional().default(''),
  retail_company: z.string().optional().default(''),
  show_all_stores: z.boolean().optional().default(false),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  notes: z.string().optional().default(''),
  status: z.enum(['pending', 'designing', 'printing', 'installation', 'completed', 'delivered']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  assigned_worker: z.string().optional().default(''),
  due_date: z.string().optional().default(''),
  sales_rep: z.string().optional().default(''),
  date_completed: z.string().optional().default(''),
  vat_rate: z.coerce.number().default(15),
  discount: z.coerce.number().default(0),
  items: z.array(lineItemSchema),
})

type RetailFormData = z.infer<typeof retailSchema>

interface RetailJob {
  id: string
  job_number: string
  title: string
  store?: string
  branch?: string
  client_name?: string
  client?: Client
  status: JobCardStatus
  priority: Priority
  assigned_worker?: Worker
  due_date?: string
  subtotal: number
  vat_amount: number
  total: number
  vat_rate: number
  description?: string
  notes?: string
  sales_rep?: string
  date_completed?: string
  client_id?: string
  is_retail: boolean
  created_at: string
  updated_at: string
  items: {
    id: string
    description: string
    note?: string
    quantity: number
    unit_price: number
    total: number
    size?: string
    sort_order: number
  }[]
}

function normalizeJobStatus(status: string): JobCardStatus {
  const map: Record<string, JobCardStatus> = {
    Pending: 'pending',
    Designing: 'designing',
    Printing: 'printing',
    Installation: 'installation',
    Completed: 'completed',
    Delivered: 'delivered',
    pending: 'pending',
    designing: 'designing',
    printing: 'printing',
    installation: 'installation',
    completed: 'completed',
    delivered: 'delivered',
  }
  return map[status] || 'pending'
}

function normalizePriority(priority: string): Priority {
  const map: Record<string, Priority> = {
    Low: 'low',
    Medium: 'normal',
    Normal: 'normal',
    High: 'high',
    Urgent: 'urgent',
    low: 'low',
    medium: 'normal',
    normal: 'normal',
    high: 'high',
    urgent: 'urgent',
  }
  return map[priority] || 'normal'
}

function RetailPageInner() {
  const { profile } = useAuthStore()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [jobs, setJobs] = useState<RetailJob[]>([])
  const [filtered, setFiltered] = useState<RetailJob[]>([])
  const [branches, setBranches] = useState<RetailBranch[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [storeFilter, setStoreFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<RetailJob | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RetailJob | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'details' | 'items'>('details')
  const [emailedRetailIds, setEmailedRetailIds] = useState<Set<string>>(new Set())

  const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<RetailFormData>({
    resolver: zodResolver(retailSchema),
    defaultValues: {
      store: 'Shoprite', branch: '', job_number: '', client_name: '',
      client_phone: '', client_email: '', retail_company: '', show_all_stores: false,
      title: '', description: '', notes: '', status: 'pending', priority: 'normal',
      assigned_worker: '', due_date: '', sales_rep: '', date_completed: '',
      vat_rate: 15, discount: 0, items: [{ description: '', note: '', quantity: 1, unit_price: 0, width: '', height: '', priceType: 'manual' as const }],
    },
  })

  const { fields: itemFields, append: addItem, remove: removeItem } = useFieldArray({ control, name: 'items' })
  const watchItems = watch('items')
  const watchVatRate = watch('vat_rate')
  const watchDiscount = watch('discount')
  const watchStore = watch('store')

  const subtotal = watchItems?.reduce((sum, item) => {
    const w = parseFloat(item.width || '0') / 1000
    const h = parseFloat(item.height || '0') / 1000
    const lineTotal = item.priceType === 'psm' && w && h
      ? (Number(item.quantity) || 0) * w * h * (Number(item.unit_price) || 0)
      : (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
    return sum + lineTotal
  }, 0) || 0
  const discountAmount = subtotal * ((watchDiscount || 0) / 100)
  const discountedSubtotal = subtotal - discountAmount
  const vatAmount = discountedSubtotal * (watchVatRate / 100)
  const total = discountedSubtotal + vatAmount

  const availableBranches = branches.filter(b => b.store === watchStore)

  useEffect(() => { loadJobs(); loadBranches(); loadClients() }, [])

  useEffect(() => {
    const openId = searchParams.get('open')
    const isNew = searchParams.get('new')
    if (isNew) openCreate()
    else if (openId && jobs.length > 0) {
      const j = jobs.find(j => j.id === openId)
      if (j) openEdit(j)
    }
  }, [searchParams, jobs.length])

  useEffect(() => {
    const channel = supabase
      .channel('retail-jobs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_cards' }, loadJobs)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const applyFilter = useCallback(
    debounce((list: RetailJob[], q: string, store: string, status: string) => {
      let result = list.filter(j => j.is_retail === true && !['completed', 'delivered'].includes(j.status))
      if (store !== 'all') result = result.filter(j => j.store === store)
      if (status !== 'all') result = result.filter(j => j.status === status)
      if (q.trim()) {
        const ql = q.toLowerCase()
        result = result.filter(j =>
          j.title.toLowerCase().includes(ql) ||
          j.job_number.toLowerCase().includes(ql) ||
          (j.client_name || '').toLowerCase().includes(ql) ||
          (j.branch || '').toLowerCase().includes(ql)
        )
      }
      setFiltered(result)
    }, 120), []
  )

  useEffect(() => { applyFilter(jobs, search, storeFilter, statusFilter) }, [jobs, search, storeFilter, statusFilter])

  async function loadJobs() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('job_cards')
        .select(`*, items:job_card_items(*), client:clients(id, name, company, emails:client_emails(*), phones:client_phones(*))`)
        .eq('is_retail', true)
        .not('status', 'in', '(completed,delivered)')
        .order('created_at', { ascending: false })
      if (error) throw error
      setJobs(((data as RetailJob[]) || []).map(job => ({
        ...job,
        items: (job.items || []).map(item => ({
          ...item,
          description: stripItemNote(item.description),
          note: getItemNote(item.description),
        })),
      })))
    } catch { toast.error('Failed to load retail jobs') }
    finally { setIsLoading(false) }
  }

  async function loadBranches() {
    const { data } = await supabase.from('retail_branches').select('*').order('store').order('name')
    const dbBranches = (data as RetailBranch[]) || []
    const withChicRiteBranches = (list: RetailBranch[]) => {
      const existing = new Set(list.map(branch => `${branch.store}:${branch.name}`))
      const missing = Object.entries(EXTRA_BRANCHES).flatMap(([store, names]) =>
        names
          .filter(name => !existing.has(`${store}:${name}`))
          .map(name => ({ id: `${store.toLowerCase()}-${name}`, store: store as RetailStore, name, is_liquor: false }))
      )
      return [...list, ...missing].sort((a, b) => a.store.localeCompare(b.store) || a.name.localeCompare(b.name))
    }
    if (dbBranches.length > 0) {
      setBranches(withChicRiteBranches(dbBranches))
    } else {
      const fallback: RetailBranch[] = [
        ...Object.entries(EXTRA_BRANCHES).flatMap(([store, names]) =>
          names.map(name => ({ id: `${store.toLowerCase()}-${name}`, store: store as RetailStore, name, is_liquor: false }))
        ),
        ...[
          'Ausspannplatz', 'Brakwater', 'Gobabis', 'Grootfontein', 'Katutura',
          'Keetmanshoop', 'Khomasdal', 'Lüderitz', 'Mariental', 'Okahao',
          'Okahandja', 'Okakarara', 'Ongwediva', 'Opuwo', 'Oshakati',
          'Otjiwarongo', 'Outapi', 'Outjo', 'Rehoboth', 'Rundu',
          'Swakopmund', 'Tsumeb', 'Walvis Bay', 'Windhoek CBD', 'Windhoek North',
          'Windhoek South', 'Witvlei', 'Nkurenkuru', 'Katima Mulilo', 'Divundu',
        ].map(name => ({ id: name, store: 'Shoprite', name, is_liquor: false })),
        ...[
          'Ausspannplatz Liquor', 'Khomasdal Liquor', 'Ongwediva Liquor',
          'Oshakati Liquor', 'Rundu Liquor', 'Swakopmund Liquor',
          'Walvis Bay Liquor', 'Windhoek CBD Liquor', 'Windhoek North Liquor',
          'Otjiwarongo Liquor', 'Tsumeb Liquor', 'Okahandja Liquor',
          'Keetmanshoop Liquor', 'Grootfontein Liquor', 'Rehoboth Liquor',
          'Mariental Liquor', 'Katima Mulilo Liquor', 'Gobabis Liquor', 'Outapi Liquor',
        ].map(name => ({ id: name, store: 'Shoprite', name, is_liquor: true })),
        ...[
          'Grove Mall', 'Maerua Mall', 'Wernhil Park', 'Kleine Kuppe',
          'Windhoek Central', 'Oshakati', 'Swakopmund', 'Walvis Bay',
        ].map(name => ({ id: 'c-'+name, store: 'Checkers', name, is_liquor: false })),
        ...[
          'Grove Mall Liquor', 'Maerua Mall Liquor', 'Wernhil Park Liquor',
          'Kleine Kuppe Liquor', 'Windhoek Central Liquor', 'Oshakati Liquor',
          'Swakopmund Liquor', 'Walvis Bay Liquor',
        ].map(name => ({ id: 'cl-'+name, store: 'Checkers', name, is_liquor: true })),
        ...[
          'Babylon', 'Cimbebasia', 'Dolam', 'Freedom Square', 'Goreangab',
          'Hakahana', 'Havana', 'Katutura Central', 'Khomasdal', 'Kuisebmund',
          'Mondesa', 'Moses Garoeb', 'Okuryangava', 'Rocky Crest', 'Samora Machel',
          'Shandumbala', 'Soweto', 'Tobias Hainyeko', 'Tutungeni', 'Wanaheda',
          'Windhoek North', 'Windhoek Rural', 'Otjomuise', 'Okahandja Park', 'Ongwediva',
          'Walvis Bay',
        ].map(name => ({ id: 'u-'+name, store: 'Usave', name, is_liquor: false })),
        ...['Babylon Liquor', 'Katutura Liquor'].map(name => ({ id: 'ul-'+name, store: 'Usave', name, is_liquor: true })),
      ]
      setBranches(fallback as any)
    }
  }

  async function loadClients() {
    const { data } = await supabase
      .from('clients')
      .select('id, name, company, emails:client_emails(*), phones:client_phones(*)')
      .order('name')
    setClients((data as Client[]) || [])
  }

  async function getNextRetailNumber(): Promise<string> {
    const { data } = await supabase.rpc('get_next_retail_job_number')
    return data as string
  }

  async function openCreate() {
    setEditingJob(null)
    setActiveTab('details')
    let nextNum = `450-${new Date().getFullYear()}`
    try { nextNum = await getNextRetailNumber() } catch {}
    reset({
      store: 'Shoprite', branch: '', job_number: nextNum, client_name: '',
      client_phone: '', client_email: '', retail_company: '', show_all_stores: false,
      title: '', description: '', notes: '', status: 'Pending', priority: 'Medium',
      assigned_worker: '', due_date: '', sales_rep: '', date_completed: '',
      vat_rate: 15, discount: 0, items: [{ description: '', note: '', quantity: 1, unit_price: 0, width: '', height: '', priceType: 'manual' as const }],
    })
    setIsFormOpen(true)
  }

  function openEdit(job: RetailJob) {
    setEditingJob(job)
    setActiveTab('details')
    reset({
      store: (job.store as RetailStore) || 'Shoprite',
      branch: job.branch || '',
      job_number: job.job_number,
      client_id: job.client_id,
      client_name: job.client_name || '',
      client_phone: tagValue(job.notes, 'RETAIL_PHONE') || job.client?.phones?.[0]?.phone || '',
      client_email: tagValue(job.notes, 'RETAIL_EMAIL') || job.client?.emails?.[0]?.email || '',
      retail_company: tagValue(job.notes, 'RETAIL_COMPANY') || retailCompanyName(job.store, job.branch),
      show_all_stores: tagValue(job.notes, 'RETAIL_ALL_STORES') === 'yes',
      title: job.title,
      description: job.description || '',
      notes: stripRetailTags(job.notes),
      status: normalizeJobStatus(job.status),
      priority: normalizePriority(job.priority),
      assigned_worker: job.assigned_worker || '',
      due_date: job.due_date || '',
      sales_rep: job.sales_rep || '',
      date_completed: job.date_completed || '',
      vat_rate: job.vat_rate,
      discount: (job as any).discount || 0,
      items: job.items.length > 0
        ? job.items.sort((a, b) => a.sort_order - b.sort_order).map(i => ({
            description: stripItemNote(i.description),
            note: i.note || getItemNote(i.description),
            quantity: i.quantity,
            unit_price: i.unit_price,
            width: i.size?.split('x')[0] || '',
            height: i.size?.split('x')[1] || '',
          }))
        : [{ description: '', note: '', quantity: 1, unit_price: 0, width: '', height: '', priceType: 'manual' as const }],
    })
    setIsFormOpen(true)
  }

  async function onSubmit(data: RetailFormData) {
    setIsSaving(true)
    try {
      const sub = data.items.reduce((s, i) => {
        const iw = parseFloat(i.width || '0') / 1000
        const ih = parseFloat(i.height || '0') / 1000
        return s + (i.priceType === 'psm' && iw && ih ? i.quantity * iw * ih * i.unit_price : i.quantity * i.unit_price)
      }, 0)
      const discAmt = sub * ((data.discount || 0) / 100)
      const discountedSub = sub - discAmt
      const vat = discountedSub * (data.vat_rate / 100)
      const normalizedStatus = normalizeJobStatus(data.status)
      const completionDate = normalizedStatus === 'completed' ? new Date().toISOString() : null
      const client = await ensureClientRecord({
        clientId: data.client_id,
        name: data.client_name,
        email: data.client_email,
        phone: data.client_phone,
        createdBy: profile?.id,
      })
      const retailNotes = [
        stripRetailTags(data.notes),
        makeTag('RETAIL_COMPANY', data.show_all_stores ? 'Shoprite/Checkers/USave' : (data.retail_company || retailCompanyName(data.store, data.branch))),
        makeTag('RETAIL_PHONE', data.client_phone),
        makeTag('RETAIL_EMAIL', data.client_email),
        makeTag('RETAIL_ALL_STORES', data.show_all_stores ? 'yes' : ''),
      ].filter(Boolean).join('\n')

      const payload = {
        title: data.title,
        description: data.description || null,
        notes: retailNotes || null,
        client_id: client?.id || null,
        client_name: client?.name || data.client_name || null,
        store: data.store,
        branch: data.branch,
        status: normalizedStatus,
        priority: normalizePriority(data.priority),
        assigned_worker: data.assigned_worker || null,
        due_date: data.due_date || null,
        is_retail: true,
        sales_rep: null,
        date_completed: data.date_completed || (completionDate ? completionDate.slice(0, 10) : null),
        vat_rate: data.vat_rate,
        subtotal: discountedSub,
        vat_amount: vat,
        total: discountedSub + vat,
        created_by: profile?.id || null,
      }

      let jobId: string

      if (editingJob) {
        const { error } = await supabase.from('job_cards').update(payload).eq('id', editingJob.id).eq('is_retail', true)
        if (error) throw error
        jobId = editingJob.id
        await supabase.from('job_card_items').delete().eq('job_card_id', jobId)
      } else {
        const jobNumber = data.job_number?.trim() || await getNextRetailNumber()
        const { data: created, error } = await supabase.from('job_cards').insert({ ...payload, job_number: jobNumber }).select().single()
        if (error) throw error
        jobId = created.id
      }

      if (data.items.length > 0) {
        await supabase.from('job_card_items').insert(
          data.items.map((item, idx) => ({
            job_card_id: jobId,
            description: withItemNote(item.description, item.note),
            quantity: item.quantity,
            unit_price: item.unit_price,
            total: (() => {
              const iw = parseFloat(item.width || '0') / 1000
              const ih = parseFloat(item.height || '0') / 1000
              return item.priceType === 'psm' && iw && ih
                ? item.quantity * iw * ih * item.unit_price
                : item.quantity * item.unit_price
            })(),
            size: item.width && item.height ? `${item.width}x${item.height}` : null,
            sort_order: idx,
          }))
        )
      }

      const { error: activityError } = await supabase.from('activity_logs').insert({
        entity_type: 'retail_job',
        entity_id: jobId,
        action: editingJob ? 'updated' : 'created',
        metadata: { store: data.store, branch: data.branch },
        user_id: profile?.id,
      })
      if (activityError) console.warn('Activity log failed:', activityError)

      toast.success(editingJob ? 'Retail job updated' : 'Retail job created')
      setIsFormOpen(false)
      loadJobs()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save retail job')
    } finally { setIsSaving(false) }
  }

  async function handleComplete(job: RetailJob) {
    if (!confirm(`Mark ${job.job_number} as complete?`)) return
    const completedAt = new Date().toISOString()
    const { error } = await supabase.from('job_cards').update({
      status: 'completed',
      date_completed: completedAt.slice(0, 10),
    }).eq('id', job.id).eq('is_retail', true)
    if (error) { toast.error(`Complete failed: ${error.message}`); return }
    toast.success('Retail job completed')
    loadJobs()
  }
  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await supabase.from('job_cards').delete().eq('id', deleteTarget.id).eq('is_retail', true)
      toast.success('Retail job deleted')
      setDeleteTarget(null)
      loadJobs()
    } catch (err: any) { toast.error(`Delete failed: ${err?.message || err}`) }
    finally { setIsDeleting(false) }
  }

  function retailJobForPrint(job: RetailJob) {
    const retailCompany = tagValue(job.notes, 'RETAIL_COMPANY') || retailCompanyName(job.store, job.branch)
    return {
      ...job,
      notes: stripRetailTags(job.notes),
      client: {
        ...(job.client || {}),
        company: retailCompany,
        phones: [{ id: 'retail-phone', client_id: job.client_id || '', phone: tagValue(job.notes, 'RETAIL_PHONE') || job.client?.phones?.[0]?.phone || '', is_primary: true }],
        emails: [{ id: 'retail-email', client_id: job.client_id || '', email: tagValue(job.notes, 'RETAIL_EMAIL') || job.client?.emails?.[0]?.email || '', is_primary: true }],
      },
      items: (job.items || []).map(item => ({
        ...item,
        description: stripItemNote(item.description),
        note: item.note || getItemNote(item.description),
      })),
    }
  }

  function downloadAdminPDF(job: RetailJob) {
    const doc = generateJobCardPDF(retailJobForPrint(job) as any, true)
    doc.save(`${job.job_number}-admin.pdf`)
    toast.success('Admin PDF downloaded (with prices)')
  }

  function printJob(job: RetailJob) {
    const doc = generateJobCardPDF(retailJobForPrint(job) as any, true)
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    win?.print()
  }

  async function emailWorkerPDF(job: RetailJob) {
    const doc = generateJobCardPDF(retailJobForPrint(job) as any, true)
    const pdfBase64 = doc.output('datauristring').split(',')[1]
    const toastId = toast.loading('Sending email...')
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64,
          fileName: `${job.job_number}-retail.pdf`,
          subject: `Retail Job ${job.job_number} — ${job.store} ${job.branch || ''} — ${job.client_name || job.title}`,
          clientName: job.client_name || job.title,
          type: 'retail',
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast.dismiss(toastId)
      setEmailedRetailIds(prev => new Set(prev).add(job.id))
      toast.success('Email sent to finance@lasigns.com.na ✅')
    } catch (err: any) {
      toast.dismiss(toastId)
      toast.error(`Email failed: ${err.message}`)
    }
  }

  const filteredClients = clients.filter(c =>
    clientSearch ? c.name.toLowerCase().includes(clientSearch.toLowerCase()) : true
  ).slice(0, 8)

  const storeColors: Record<string, string> = {
    Shoprite: 'text-red-400',
    Checkers: 'text-blue-400',
    Usave: 'text-amber-400',
  }

  return (
    <AppShell>
      <PageHeader
        title="RETAIL"
        subtitle={`${filtered.length} retail jobs · Shoprite · Checkers · Usave`}
        actions={
          <button onClick={() => openCreate()} className="btn-primary btn-sm">
            <Plus className="w-4 h-4" /> New Retail Job
          </button>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        <div className="flex gap-1">
          {['all', ...STORES].map(s => (
            <button key={s} onClick={() => setStoreFilter(s)}
              className={`px-4 py-2 rounded text-sm font-semibold transition-colors ${
                storeFilter === s ? 'bg-accent text-text-inverse'
                  : `bg-bg-elevated border border-border ${s !== 'all' ? storeColors[s] : 'text-text-secondary'} hover:text-text-primary`
              }`}>
              {s === 'all' ? 'All Stores' : s}
            </button>
          ))}
          <div className="ml-2 flex gap-1">
            {['all', ...ACTIVE_STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wide transition-colors ${
                  statusFilter === s ? 'bg-accent/80 text-text-inverse' : 'bg-bg-elevated text-text-secondary hover:text-text-primary border border-border'
                }`}>
                {s === 'all' ? 'All' : s}
              </button>
            ))}
          </div>
        </div>

        <SearchInput value={search} onChange={setSearch} placeholder="Search retail jobs..." className="max-w-xs" />

        <div className="card overflow-hidden">
          {isLoading ? <TableSkeleton rows={8} cols={7} /> : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <ShoppingBag className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-text-muted">No retail jobs found</p>
              <button onClick={openCreate} className="btn-primary btn-sm mt-4">Create retail job</button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job #</th><th>Store / Branch</th><th>Title</th>
                  <th>Worker</th><th>Status</th><th>Due</th><th>Total</th><th className="w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(job => (
                  <tr key={job.id} onClick={() => openEdit(job)}>
                    <td><span className="font-mono text-accent font-semibold text-sm">{job.job_number}</span></td>
                    <td>
                      <div>
                        <span className={`font-semibold text-sm ${storeColors[job.store || ''] || 'text-text-primary'}`}>{job.store}</span>
                        {job.branch && <p className="text-xs text-text-muted">{job.branch}</p>}
                      </div>
                    </td>
                    <td>
                      <div className="font-medium max-w-[200px] truncate">{job.title}</div>
                      {job.client_name && <p className="text-xs text-text-muted">{job.client_name}</p>}
                    </td>
                    <td className="text-text-secondary text-sm">{job.assigned_worker || '—'}</td>
                    <td><StatusBadge status={job.status} /></td>
                    <td className="text-text-muted text-sm">{job.due_date ? formatDate(job.due_date) : '—'}</td>
                    <td className="font-semibold">{formatCurrency(job.total)}</td>
                    <td>
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => downloadAdminPDF(job)} className="btn-icon" title="Admin PDF"><Download className="w-3.5 h-3.5" /></button>
                        <button
                          onClick={() => emailWorkerPDF(job)}
                          className={`btn-icon ${emailedRetailIds.has(job.id) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : ''}`}
                          title={emailedRetailIds.has(job.id) ? 'Email sent' : 'Email worker PDF'}
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => printJob(job)} className="btn-icon" title="Print"><Printer className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleComplete(job)} className="btn-icon text-emerald-400" title="Complete"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                        {profile?.role === 'admin' && (
                          <button onClick={() => setDeleteTarget(job)} className="btn-icon text-red-400/50 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingJob ? `Edit — ${editingJob.job_number}` : 'New Retail Job'}
        subtitle={editingJob ? `${editingJob.store} — ${editingJob.branch}` : undefined}
        size="xl"
        preventOutsideClose={true}
        actions={editingJob && (
          <div className="flex gap-2">
            <button onClick={() => downloadAdminPDF(editingJob)} className="btn-secondary btn-sm" title="With prices"><Download className="w-3.5 h-3.5" /> Admin PDF</button>
            <button
              onClick={() => emailWorkerPDF(editingJob)}
              className={`btn-secondary btn-sm ${emailedRetailIds.has(editingJob.id) ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : ''}`}
              title="No prices"
            >
              <Mail className="w-3.5 h-3.5" /> {emailedRetailIds.has(editingJob.id) ? 'Sent' : 'Email'}
            </button>
          </div>
        )}
      >
        <div className="flex gap-1 mb-6 border-b border-border -mt-2">
          {(['details', 'items'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}>
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {activeTab === 'details' && (
            <div className="space-y-5">
              <div>
                <label className="label">Store *</label>
                <div className="flex gap-2">
                  {STORES.map(s => (
                    <button key={s} type="button"
                      onClick={() => {
                        setValue('store', s)
                        setValue('branch', '')
                        setValue('retail_company', s)
                        setValue('show_all_stores', false)
                      }}
                      className={`flex-1 py-2.5 rounded border text-sm font-semibold transition-colors ${
                        watchStore === s ? `border-current ${storeColors[s]} bg-current/10` : 'border-border text-text-secondary hover:border-border-strong'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Branch *</label>
                <select
                  {...register('branch')}
                  className="input"
                  onChange={(e) => {
                    register('branch').onChange(e)
                    setValue('retail_company', retailCompanyName(watchStore, e.target.value))
                  }}
                >
                  <option value="">— Select Branch —</option>
                  {availableBranches.map(b => (
                    <option key={b.id} value={b.name}>{b.name}{b.is_liquor ? ' (Liquor)' : ''}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  {...register('show_all_stores')}
                  onChange={(e) => {
                    register('show_all_stores').onChange(e)
                    if (e.target.checked) setValue('retail_company', 'Shoprite/Checkers/USave')
                    else setValue('retail_company', retailCompanyName(watchStore, watch('branch')))
                  }}
                  className="accent-accent"
                />
                Show Shoprite/Checkers/USave on print
              </label>

              <div>
                <label className="label">Job Card Number</label>
                <input {...register('job_number')} className="input font-mono" placeholder="e.g. 0450-2026" />
                <p className="text-xs text-text-muted mt-1">Auto-generated if left unchanged</p>
              </div>

              <div className="relative">
                <label className="label">Find Client</label>
                <input {...register('client_name')} className="input" placeholder="Search client name..."
                  onChange={(e) => { register('client_name').onChange(e); setClientSearch(e.target.value) }}
                />
                {clientSearch && filteredClients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 bg-bg-elevated border border-border rounded-md shadow-elevated mt-1 max-h-48 overflow-y-auto">
                    {filteredClients.map(c => (
                      <div key={c.id} className="px-3 py-2.5 hover:bg-bg-hover cursor-pointer"
                        onMouseDown={() => {
                          setValue('client_id', c.id)
                          setValue('client_name', c.name)
                          setValue('client_phone', c.phones?.[0]?.phone || '')
                          setValue('client_email', c.emails?.[0]?.email || '')
                          setClientSearch('')
                        }}>
                        <p className="text-sm text-text-primary">{c.name}</p>
                        {c.company && <p className="text-xs text-text-muted">{c.company}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Company</label>
                  <input {...register('retail_company')} className="input" placeholder="e.g. USave Ondangwa" />
                </div>
                <div>
                  <label className="label">Cell Number</label>
                  <input {...register('client_phone')} className="input" placeholder="Client contact number" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input {...register('client_email')} className="input" placeholder="Client email" />
                </div>
              </div>

              <div>
                <label className="label">Title *</label>
                <input {...register('title')} className="input" placeholder="e.g. Price Tags — Promotion Week" />
                {errors.title && <p className="form-error">{errors.title.message}</p>}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="label">Status</label>
                  <select {...register('status')} className="input">
                    {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Priority</label>
                  <select {...register('priority')} className="input">
                    {PRIORITIES.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Assigned Worker</label>
                  <select {...register('assigned_worker')} className="input">
                    <option value="">— Unassigned —</option>
                    {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div><label className="label">Due Date</label><input {...register('due_date')} type="date" className="input" /></div>
              </div>

              <div><label className="label">Description</label><textarea {...register('description')} className="input min-h-[110px] resize-y overflow-y-auto" /></div>
              <div><label className="label">Notes</label><textarea {...register('notes')} className="input min-h-[110px] resize-y overflow-y-auto" /></div>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-4 items-center">
                  <label className="label mb-0">VAT Rate (%)</label>
                  <input {...register('vat_rate')} type="number" step="0.01" className="input w-24" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
                    Retail PDFs show unit prices only
                  </span>
                  <button type="button" onClick={() => addItem({ description: '', note: '', quantity: 1, unit_price: 0, width: '', height: '', priceType: 'manual' as const })}
                    className="btn-ghost btn-sm text-accent">
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted px-1">
                <div className="col-span-4">Description</div>
                <div className="col-span-1">W mm</div>
                <div className="col-span-1">H mm</div>
                <div className="col-span-1">m²</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-1"></div>
              </div>

              <div className="space-y-2">
                {itemFields.map((field, i) => {
                  const qty = Number(watchItems?.[i]?.quantity) || 0
                  const price = Number(watchItems?.[i]?.unit_price) || 0
                  const w = parseFloat(watchItems?.[i]?.width || '0') / 1000
                  const h = parseFloat(watchItems?.[i]?.height || '0') / 1000
                  const sqm = w && h ? (w * h).toFixed(4) : null
                  return (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-4 space-y-1">
                        <Controller
                          control={control}
                          name={`items.${i}.description`}
                          render={({ field: descField }) => (
                            <PriceAutocomplete
                              value={descField.value}
                              onChange={descField.onChange}
                              onSelectPrice={(selectedPrice, priceType) => {
                                setValue(`items.${i}.unit_price`, selectedPrice)
                                setValue(`items.${i}.priceType`, priceType)
                              }}
                              placeholder="Description"
                              className="input"
                            />
                          )}
                        />
                        <input {...register(`items.${i}.note`)} className="input text-xs py-1.5" placeholder="Item note" />
                      </div>
                      <div className="col-span-1">
                        <input {...register(`items.${i}.width`)} className="input" placeholder="W" />
                      </div>
                      <div className="col-span-1">
                        <input {...register(`items.${i}.height`)} className="input" placeholder="H" />
                      </div>
                      <div className="col-span-1 text-xs text-center">
                        {sqm ? <span className="text-accent font-semibold">{sqm}</span> : <span className="text-text-muted">—</span>}
                      </div>
                      <div className="col-span-2">
                        <input {...register(`items.${i}.quantity`)} type="number" step="any" min="0" className="input" />
                      </div>
                      <div className="col-span-2">
                        <input {...register(`items.${i}.unit_price`)} type="number" step="0.01" min="0" className="input" />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        {itemFields.length > 1 && (
                          <button type="button" onClick={() => removeItem(i)} className="btn-icon text-red-400/50 hover:text-red-400">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-border pt-4 space-y-1.5">
                <div className="flex justify-between text-sm text-text-secondary"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex items-center justify-between text-sm text-text-secondary">
                  <div className="flex items-center gap-2">
                    <span>Discount</span>
                    <input {...register('discount')} type="number" min="0" max="100" step="0.1"
                      className="input w-20 py-0.5 text-xs" placeholder="0" />
                    <span>%</span>
                  </div>
                  <span className="text-red-400">-{formatCurrency(discountAmount)}</span>
                </div>
                <div className="flex justify-between text-sm text-text-secondary"><span>VAT ({watchVatRate}%)</span><span>{formatCurrency(vatAmount)}</span></div>
                <div className="flex justify-between text-base font-bold text-text-primary border-t border-border pt-1.5"><span>TOTAL</span><span>{formatCurrency(total)}</span></div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={() => setIsFormOpen(false)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSaving} className="btn-primary flex-1">
              {isSaving ? <><span className="spinner w-4 h-4" /> Saving...</> : editingJob ? 'Update Retail Job' : 'Create Retail Job'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Retail Job"
        message={`Delete retail job "${deleteTarget?.job_number}"? This cannot be undone.`}
        confirmLabel="Delete" danger={true} isLoading={isDeleting}
      />
    </AppShell>
  )
}

export default function RetailPage() {
  return (
    <Suspense fallback={null}>
      <RetailPageInner />
    </Suspense>
  )
}
