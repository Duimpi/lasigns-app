'use client'

import { useAuthStore } from '@/stores/authStore'
import { getGreeting } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  showGreeting?: boolean
  actions?: React.ReactNode
}

export function PageHeader({ title, subtitle, showGreeting = false, actions }: PageHeaderProps) {
  const { profile } = useAuthStore()

  return (
    <div className="flex items-start justify-between px-6 pt-6 pb-4">
      <div>
        {showGreeting && profile && (
          <p className="text-text-muted text-sm mb-0.5">
            {getGreeting(profile.full_name.split(' ')[0])}
          </p>
        )}
        <h1 className="font-display text-3xl text-text-primary tracking-wide">{title}</h1>
        {subtitle && <p className="text-text-secondary text-sm mt-1">{subtitle}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 mt-1">
          {actions}
        </div>
      )}
    </div>
  )
}
