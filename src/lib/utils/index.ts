import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return `N$ ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd MMM yyyy')
  } catch {
    return String(date)
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'dd MMM yyyy, HH:mm')
  } catch {
    return String(date)
  }
}

export function formatTimeAgo(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return String(date)
  }
}

export function getGreeting(name: string): string {
  const hour = new Date().getHours()
  let greeting = 'Good morning'
  if (hour >= 12 && hour < 17) greeting = 'Good afternoon'
  else if (hour >= 17) greeting = 'Good evening'
  return `${greeting}, ${name}`
}

/**
 * Get first name from full name
 */
export function getFirstName(fullName: string): string {
  return fullName.trim().split(' ')[0]
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), delay)
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    draft: 'text-text-secondary bg-status-draft/20 border-status-draft/30',
    sent: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    approved: 'text-green-400 bg-green-500/10 border-green-500/20',
    in_production: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    completed: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    cancelled: 'text-red-400 bg-red-500/10 border-red-500/20',
    pending: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    designing: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    printing: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    installation: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    delivered: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  }
  return map[status] || 'text-text-secondary bg-bg-elevated border-border'
}

export function priorityColor(priority: string): string {
  const map: Record<string, string> = {
    low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    normal: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    high: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    urgent: 'text-red-400 bg-red-500/10 border-red-500/20',
  }
  return map[priority] || 'text-text-secondary bg-bg-elevated border-border'
}

export function formatStatus(status: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    sent: 'Sent',
    approved: 'Approved',
    in_production: 'In Production',
    completed: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Pending',
    designing: 'Designing',
    printing: 'Printing',
    installation: 'Installation',
    delivered: 'Delivered',
  }
  return map[status] || status
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
