// ============================================================
// LA SIGNS & GRAPHICS CC — SYSTEM TYPES
// ============================================================

export type UserRole = 'admin' | 'staff'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url?: string
  created_at: string
  updated_at: string
}

// ─── CLIENTS ────────────────────────────────────────────────

export interface Client {
  id: string
  name: string
  company?: string
  address?: string
  vat_number?: string
  notes?: string
  is_retail?: boolean
  created_by?: string
  created_at: string
  updated_at: string
  phones?: ClientPhone[]
  emails?: ClientEmail[]
}

export interface ClientPhone {
  id: string
  client_id: string
  phone: string
  label?: string
  is_primary: boolean
}

export interface ClientEmail {
  id: string
  client_id: string
  email: string
  label?: string
  is_primary: boolean
}

// ─── QUOTES ─────────────────────────────────────────────────

export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'in_production' | 'completed' | 'cancelled'

export interface Quote {
  id: string
  quote_number: string
  client_id?: string
  client_name?: string
  client_email?: string
  client_phone?: string
  client_address?: string
  status: QuoteStatus
  vat_rate: number
  subtotal: number
  vat_amount: number
  total: number
  notes?: string
  valid_until?: string
  is_locked: boolean
  is_retail: boolean
  linked_job_card_id?: string
  created_by?: string
  created_at: string
  updated_at: string
  items?: QuoteItem[]
  client?: Client
}

export interface QuoteItem {
  id: string
  quote_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  size?: string
  sort_order: number
}

// ─── JOB CARDS ──────────────────────────────────────────────

export type JobCardStatus = 'pending' | 'designing' | 'printing' | 'installation' | 'completed' | 'delivered'
export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type Worker = 'Nicole' | 'Geraldo' | 'Bets-Mari'

export interface JobCard {
  id: string
  job_number: string
  title: string
  description?: string
  notes?: string
  client_id?: string
  client_name?: string
  status: JobCardStatus
  priority: Priority
  assigned_worker?: Worker
  due_date?: string
  linked_quote_id?: string
  store?: string
  branch?: string
  is_retail: boolean
  sales_rep?: string
  date_completed?: string
  subtotal: number
  vat_amount: number
  total: number
  vat_rate: number
  created_by?: string
  created_at: string
  updated_at: string
  items?: JobCardItem[]
  client?: Client
  linked_quote?: Quote
  comments?: Comment[]
}

export interface JobCardItem {
  id: string
  job_card_id: string
  description: string
  quantity: number
  unit_price: number
  total: number
  size?: string
  sort_order: number
}

// ─── COMMENTS ───────────────────────────────────────────────

export interface Comment {
  id: string
  job_card_id?: string
  quote_id?: string
  author_id: string
  content: string
  created_at: string
  updated_at: string
  author?: Profile
}

// ─── MESSAGING ──────────────────────────────────────────────

export type ChatType = 'direct' | 'group' | 'job'

export interface Chat {
  id: string
  name?: string
  type: ChatType
  job_card_id?: string
  created_by: string
  created_at: string
  updated_at: string
  members?: ChatMember[]
  last_message?: ChatMessage
  unread_count?: number
}

export interface ChatMember {
  id: string
  chat_id: string
  profile_id: string
  joined_at: string
  last_read_at?: string
  profile?: Profile
}

export interface ChatMessage {
  id: string
  chat_id: string
  sender_id: string
  content: string
  message_type: 'text' | 'image' | 'file' | 'system'
  file_url?: string
  file_name?: string
  is_deleted: boolean
  created_at: string
  updated_at: string
  sender?: Profile
}

// ─── UPLOADS ────────────────────────────────────────────────

export interface Upload {
  id: string
  job_card_id?: string
  quote_id?: string
  file_name: string
  file_url: string
  file_type: string
  file_size: number
  uploaded_by: string
  created_at: string
}

// ─── ACTIVITY LOGS ──────────────────────────────────────────

export interface ActivityLog {
  id: string
  entity_type: 'client' | 'quote' | 'job_card' | 'retail_job' | 'chat'
  entity_id: string
  action: string
  details?: Record<string, unknown>
  performed_by?: string
  created_at: string
  profile?: Profile
}

// ─── APP SETTINGS ───────────────────────────────────────────

export interface AppSettings {
  id: string
  key: string
  value: string
  updated_at: string
}

// ─── RETAIL ─────────────────────────────────────────────────

export type RetailStore = 'Shoprite' | 'Checkers' | 'Usave'

export interface RetailBranch {
  id: string
  store: RetailStore
  name: string
  is_liquor: boolean
}

// ─── IMPORT ─────────────────────────────────────────────────

export interface ImportContact {
  name: string
  phones: string[]
  emails: string[]
  company?: string
  address?: string
}

// ─── DAILY UPDATES ──────────────────────────────────────────

export interface DailyUpdate {
  id: string
  worker: Worker
  job_card_id?: string
  message: string
  created_by: string
  created_at: string
  profile?: Profile
  job_card?: JobCard
}
