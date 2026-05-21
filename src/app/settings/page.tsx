'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Settings, Save } from 'lucide-react'

interface Setting {
  key: string
  value: string
  label: string
  description: string
  type: 'number' | 'text'
}

const SETTING_DEFS: Omit<Setting, 'value'>[] = [
  { key: 'vat_rate', label: 'Default VAT Rate (%)', description: 'Applied to all new quotes and job cards', type: 'number' },
  { key: 'quote_counter', label: 'Quote Counter (current)', description: 'Next quote will be this + 1 (LA-Q format)', type: 'number' },
  { key: 'job_counter', label: 'Job Card Counter (current)', description: 'Next job card will be this + 1 (LA-J format)', type: 'number' },
  { key: 'retail_job_counter', label: 'Retail Job Counter (current)', description: 'Next retail job will be this + 1 (XXXX-YYYY format)', type: 'number' },
]

export default function SettingsPage() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (profile?.role !== 'admin') {
      router.push('/dashboard')
      return
    }
    loadSettings()
  }, [profile])

  async function loadSettings() {
    setIsLoading(true)
    const { data } = await supabase.from('app_settings').select('key, value')
    const map: Record<string, string> = {}
    for (const s of data || []) map[s.key] = s.value
    setSettings(map)
    setIsLoading(false)
  }

  async function saveSettings() {
    setIsSaving(true)
    try {
      for (const [key, value] of Object.entries(settings)) {
        await supabase
          .from('app_settings')
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
      }
      toast.success('Settings saved')
    } catch { toast.error('Failed to save') }
    finally { setIsSaving(false) }
  }

  return (
    <AppShell>
      <PageHeader title="SETTINGS" subtitle="System configuration — Admin only" />

      <div className="px-6 pb-6 max-w-2xl">
        {isLoading ? (
          <div className="py-8 text-center text-text-muted">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <Settings className="w-4 h-4 text-accent" />
                <h2 className="font-semibold text-text-primary">System Settings</h2>
              </div>
              <div className="divide-y divide-border">
                {SETTING_DEFS.map(def => (
                  <div key={def.key} className="px-4 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{def.label}</p>
                      <p className="text-xs text-text-muted mt-0.5">{def.description}</p>
                    </div>
                    <input
                      type={def.type}
                      value={settings[def.key] || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, [def.key]: e.target.value }))}
                      className="input w-32 text-right"
                    />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={saveSettings}
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? <span className="spinner w-4 h-4" /> : <Save className="w-4 h-4" />}
              Save Settings
            </button>

            {/* Info box */}
            <div className="card p-4 border-accent/20 bg-accent-muted/30">
              <p className="text-sm font-semibold text-accent mb-1">Deployment Checklist</p>
              <ul className="text-xs text-text-secondary space-y-1.5">
                <li>✓ Set NEXT_PUBLIC_SUPABASE_URL in Vercel environment</li>
                <li>✓ Set NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel environment</li>
                <li>✓ Run the SQL migration in Supabase SQL Editor</li>
                <li>✓ Create user accounts via Supabase Authentication</li>
                <li>✓ Set user full_name and role in profiles table</li>
                <li>✓ Admins: Damion, Alida — Staff: Nicole, Geraldo, Bets-Mari, Michelle</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
