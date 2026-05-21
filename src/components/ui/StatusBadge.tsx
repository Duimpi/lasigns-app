import { cn, statusColor, priorityColor, formatStatus } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  type?: 'status' | 'priority'
  className?: string
}

export function StatusBadge({ status, type = 'status', className }: StatusBadgeProps) {
  const colorClass = type === 'priority' ? priorityColor(status) : statusColor(status)
  const label = type === 'priority' 
    ? status.charAt(0).toUpperCase() + status.slice(1)
    : formatStatus(status)

  return (
    <span className={cn('badge', colorClass, className)}>
      {label}
    </span>
  )
}
