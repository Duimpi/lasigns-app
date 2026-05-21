'use client'

import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { MessageSquare } from 'lucide-react'
import { useMessagingStore } from '@/stores/messagingStore'

export default function MessagingPage() {
  const { setIsOpen } = useMessagingStore()

  return (
    <AppShell>
      <PageHeader
        title="MESSAGING"
        subtitle="Direct chats, group chats, and job discussions"
      />
      <div className="px-6 py-12 flex flex-col items-center gap-6">
        <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
          <MessageSquare className="w-10 h-10 text-accent" />
        </div>
        <div className="text-center">
          <p className="text-text-primary font-semibold text-lg">Chat Panel</p>
          <p className="text-text-muted text-sm mt-1 max-w-sm">
            The messaging system is available as a floating panel on all pages.
            Click the button below to open it.
          </p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="btn-primary"
        >
          <MessageSquare className="w-4 h-4" />
          Open Messages
        </button>
      </div>
    </AppShell>
  )
}
