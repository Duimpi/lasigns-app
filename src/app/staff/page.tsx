'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { formatDate } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { UserCog, Shield, User, Edit2 } from 'lucide-react'
import type { Profile } from '@/types'

const editSchema = z.object({
  full_name: z.string().min(1, 'Name is required'),
  role: z.enum(['admin', 'staff']),
})

type EditFormData = z.infer<typeof editSchema>

export default function StaffPage() {
  const { profile } = useAuthStore()
  const router = useRouter()
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  })

  useEffect(() => {
    if (profile?.role !== 'admin') {
      router.push('/dashboard')
      return
    }
    loadProfiles()
  }, [profile])

  async function loadProfiles() {
    setIsLoading(true)
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles((data as Profile[]) || [])
    setIsLoading(false)
  }

  function openEdit(p: Profile) {
    setEditingProfile(p)
    reset({ full_name: p.full_name, role: p.role })
  }

  async function onSubmit(data: EditFormData) {
    if (!editingProfile) return
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: data.full_name, role: data.role })
        .eq('id', editingProfile.id)
      if (error) throw error
      toast.success('Profile updated')
      setEditingProfile(null)
      loadProfiles()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setIsSaving(false)
    }
  }

  const admins = profiles.filter(p => p.role === 'admin')
  const staff = profiles.filter(p => p.role === 'staff')

  return (
    <AppShell>
      <PageHeader title="STAFF" subtitle="Manage team members and permissions" />

      <div className="px-6 pb-6 space-y-6">
        {/* Admins */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Admins ({admins.length})</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {admins.map(p => <ProfileCard key={p.id} profile={p} onEdit={openEdit} />)}
          </div>
        </div>

        {/* Staff */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-text-secondary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-secondary">Staff ({staff.length})</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {staff.map(p => <ProfileCard key={p.id} profile={p} onEdit={openEdit} />)}
          </div>
        </div>

        {/* Permissions table */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-text-primary">Permission Matrix</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-text-muted">Action</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-accent">Admin</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-text-muted">Staff</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { action: 'View all clients, quotes, jobs', admin: true, staff: true },
                  { action: 'Create clients, quotes, jobs', admin: true, staff: true },
                  { action: 'Edit clients, quotes, jobs', admin: true, staff: true },
                  { action: 'Delete clients', admin: true, staff: false },
                  { action: 'Delete quotes', admin: true, staff: false },
                  { action: 'Delete job cards', admin: true, staff: false },
                  { action: 'Lock / unlock quotes', admin: true, staff: false },
                  { action: 'Manage staff profiles', admin: true, staff: false },
                  { action: 'View app settings', admin: true, staff: false },
                  { action: 'Send messages', admin: true, staff: true },
                  { action: 'Post daily updates', admin: true, staff: true },
                ].map(row => (
                  <tr key={row.action} className="border-b border-border/50">
                    <td className="px-4 py-3 text-text-secondary">{row.action}</td>
                    <td className="px-4 py-3 text-center">{row.admin ? '✓' : '✗'}</td>
                    <td className="px-4 py-3 text-center text-text-muted">{row.staff ? '✓' : '✗'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!editingProfile}
        onClose={() => setEditingProfile(null)}
        title={`Edit — ${editingProfile?.full_name}`}
        size="sm"
        preventOutsideClose={false}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input {...register('full_name')} className="input" />
            {errors.full_name && <p className="form-error">{errors.full_name.message}</p>}
          </div>
          <div>
            <label className="label">Role</label>
            <select {...register('role')} className="input">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setEditingProfile(null)} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isSaving} className="btn-primary flex-1">
              {isSaving ? <span className="spinner w-4 h-4" /> : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

function ProfileCard({ profile, onEdit }: { profile: Profile; onEdit: (p: Profile) => void }) {
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center text-accent text-lg font-bold shrink-0">
        {profile.full_name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-text-primary">{profile.full_name}</p>
        <p className="text-sm text-text-muted truncate">{profile.email}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold capitalize ${
            profile.role === 'admin'
              ? 'text-accent border-accent/30 bg-accent/10'
              : 'text-text-secondary border-border bg-bg-elevated'
          }`}>
            {profile.role}
          </span>
          <span className="text-xs text-text-muted">{formatDate(profile.created_at)}</span>
        </div>
      </div>
      <button onClick={() => onEdit(profile)} className="btn-icon">
        <Edit2 className="w-4 h-4" />
      </button>
    </div>
  )
}
