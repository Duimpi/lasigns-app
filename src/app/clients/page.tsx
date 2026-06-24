'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Modal } from '@/components/ui/Modal'
import { SearchInput } from '@/components/ui/SearchInput'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TableSkeleton } from '@/components/ui/Loading'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'
import { clientMatchesSearch, formatPhoneDisplay } from '@/lib/utils/phone'
import { parseImportFile, detectDuplicates } from '@/lib/utils/import'
import { formatDate, debounce } from '@/lib/utils'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import {
  Plus, Upload, Trash2, Phone, Mail, Building2,
  MapPin, ChevronRight, X, AlertTriangle, Download
} from 'lucide-react'
import type { Client } from '@/types'

const clientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().optional(),
  address: z.string().optional(),
  vat_number: z.string().optional(),
  notes: z.string().optional(),
  phones: z.array(z.object({ phone: z.string(), label: z.string().optional(), is_primary: z.boolean() })),
  emails: z.array(z.object({ email: z.string().email('Invalid email').or(z.literal('')), label: z.string().optional(), is_primary: z.boolean() })),
})

type ClientFormData = z.infer<typeof clientSchema>

interface ClientWithContact extends Client {
  phones: { id: string; phone: string; label?: string; is_primary: boolean }[]
  emails: { id: string; email: string; label?: string; is_primary: boolean }[]
}

export default function ClientsPage() {
  const { profile } = useAuthStore()
  const [clients, setClients] = useState<ClientWithContact[]>([])
  const [filtered, setFiltered] = useState<ClientWithContact[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [historyClient, setHistoryClient] = useState<Client | null>(null)
  const [clientJobs, setClientJobs] = useState<any[]>([])
  const [clientQuotes, setClientQuotes] = useState<any[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<ClientWithContact | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ClientWithContact | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  const { register, control, handleSubmit, reset, setValue, formState: { errors } } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: '', company: '', address: '', vat_number: '', notes: '',
      phones: [{ phone: '', label: '', is_primary: true }],
      emails: [{ email: '', label: '', is_primary: true }],
    },
  })

  const { fields: phoneFields, append: addPhone, remove: removePhone, replace: replacePhones } = useFieldArray({ control, name: 'phones' })
  const { fields: emailFields, append: addEmail, remove: removeEmail, replace: replaceEmails } = useFieldArray({ control, name: 'emails' })

  useEffect(() => { loadClients() }, [])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('clients-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, () => {
        loadClients()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const filterClients = useCallback(
    debounce((list: ClientWithContact[], q: string) => {
      if (!q.trim()) {
        setFiltered(list)
        return
      }
      setFiltered(list.filter(c => clientMatchesSearch({
        name: c.name,
        company: c.company,
        phones: c.phones.map(p => p.phone),
        emails: c.emails.map(e => e.email),
      }, q)))
    }, 120),
    []
  )

  useEffect(() => {
    filterClients(clients, search)
  }, [clients, search, filterClients])

  async function loadClientHistory(client: Client) {
    setHistoryClient(client)
    setIsLoadingHistory(true)
    const [{ data: jobs }, { data: quotes }] = await Promise.all([
      supabase.from('job_cards').select('id, job_number, title, status, total, created_at')
        .eq('client_id', client.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('quotes').select('id, quote_number, status, total, created_at')
        .eq('client_id', client.id).order('created_at', { ascending: false }).limit(20),
    ])
    setClientJobs(jobs || [])
    setClientQuotes(quotes || [])
    setIsLoadingHistory(false)
  }

  async function loadClients() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          phones:client_phones(*),
          emails:client_emails(*)
        `)
        .order('name', { ascending: true })

      if (error) throw error
      setClients((data as ClientWithContact[]) || [])
    } catch (err) {
      toast.error('Failed to load clients')
    } finally {
      setIsLoading(false)
    }
  }

  function openCreate() {
    setEditingClient(null)
    const phones = [{ phone: '', label: '', is_primary: true }]
    const emails = [{ email: '', label: '', is_primary: true }]
    reset({
      name: '', company: '', address: '', vat_number: '', notes: '',
      phones,
      emails,
    })
    replacePhones(phones)
    replaceEmails(emails)
    setIsFormOpen(true)
  }

  async function openEdit(client: ClientWithContact) {
    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        phones:client_phones(*),
        emails:client_emails(*)
      `)
      .eq('id', client.id)
      .single()

    if (error) {
      toast.error('Failed to load client details')
      return
    }

    const freshClient = (data || client) as ClientWithContact
    setEditingClient(freshClient)
    const phones = freshClient.phones.length > 0
      ? freshClient.phones.map(p => ({ phone: p.phone || '', label: p.label || '', is_primary: p.is_primary }))
      : [{ phone: '', label: '', is_primary: true }]
    const emails = freshClient.emails.length > 0
      ? freshClient.emails.map(e => ({ email: e.email || '', label: e.label || '', is_primary: e.is_primary }))
      : [{ email: '', label: '', is_primary: true }]
    reset({
      name: freshClient.name,
      company: freshClient.company || '',
      address: freshClient.address || '',
      vat_number: freshClient.vat_number || '',
      notes: freshClient.notes || '',
      phones,
      emails,
    })
    replacePhones(phones)
    replaceEmails(emails)
    phones.forEach((phone, index) => {
      setValue(`phones.${index}.phone`, phone.phone)
      setValue(`phones.${index}.label`, phone.label)
      setValue(`phones.${index}.is_primary`, phone.is_primary)
    })
    emails.forEach((email, index) => {
      setValue(`emails.${index}.email`, email.email)
      setValue(`emails.${index}.label`, email.label)
      setValue(`emails.${index}.is_primary`, email.is_primary)
    })
    setIsFormOpen(true)
  }

  async function onSubmit(data: ClientFormData) {
    setIsSaving(true)
    try {
      const clientData = {
        name: data.name,
        company: data.company || null,
        address: data.address || null,
        vat_number: data.vat_number || null,
        notes: data.notes || null,
        created_by: profile?.id || null,
      }

      let clientId: string

      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id)
        if (error) throw error
        clientId = editingClient.id

        // Delete and re-insert phones/emails
        const { error: phoneDeleteError } = await supabase.from('client_phones').delete().eq('client_id', clientId)
        if (phoneDeleteError) throw phoneDeleteError
        const { error: emailDeleteError } = await supabase.from('client_emails').delete().eq('client_id', clientId)
        if (emailDeleteError) throw emailDeleteError
      } else {
        const { data: created, error } = await supabase
          .from('clients')
          .insert(clientData)
          .select()
          .single()
        if (error) throw error
        clientId = created.id
      }

      // Insert phones
      const validPhones = data.phones.filter(p => p.phone.trim())
      if (validPhones.length > 0) {
        const { error: phoneInsertError } = await supabase.from('client_phones').insert(
          validPhones.map(p => ({ client_id: clientId, phone: p.phone.trim(), label: p.label || null, is_primary: p.is_primary }))
        )
        if (phoneInsertError) throw phoneInsertError
      }

      // Insert emails
      const validEmails = data.emails.filter(e => e.email.trim())
      if (validEmails.length > 0) {
        const { error: emailInsertError } = await supabase.from('client_emails').insert(
          validEmails.map(e => ({ client_id: clientId, email: e.email.trim(), label: e.label || null, is_primary: e.is_primary }))
        )
        if (emailInsertError) throw emailInsertError
      }

      // Activity log
      const { error: activityError } = await supabase.from('activity_logs').insert({
        entity_type: 'client',
        entity_id: clientId,
        action: editingClient ? 'updated' : 'created',
        metadata: { name: data.name },
        user_id: profile?.id,
      })
      if (activityError) console.warn('Activity log failed:', activityError)

      toast.success(editingClient ? 'Client updated' : 'Client created')
      setIsFormOpen(false)
      loadClients()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save client')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('clients').delete().eq('id', deleteTarget.id)
      if (error) throw error
      toast.success('Client deleted')
      setDeleteTarget(null)
      loadClients()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete client')
    } finally {
      setIsDeleting(false)
    }
  }

  // Import handling
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()?.toLowerCase() as 'json' | 'csv' | 'txt'
    if (!['json', 'csv', 'txt'].includes(ext)) {
      toast.error('Unsupported file type. Use JSON, CSV, or TXT')
      return
    }

    const content = await file.text()
    try {
      const contacts = parseImportFile(content, ext)
      
      const existing = clients.map(c => ({
        name: c.name,
        phones: c.phones.map(p => p.phone),
        emails: c.emails.map(e => e.email),
      }))

      const checked = detectDuplicates(contacts, existing)
      const newContacts = checked.filter(c => !c.isDuplicate).map(c => c.contact)
      const dupCount = checked.filter(c => c.isDuplicate).length

      if (newContacts.length === 0) {
        toast.error(`All ${dupCount} contacts are duplicates`)
        return
      }

      // Batch insert
      let imported = 0
      for (const contact of newContacts) {
        const { data: created, error } = await supabase
          .from('clients')
          .insert({
            name: contact.name,
            company: contact.company || null,
            address: contact.address || null,
            created_by: profile?.id || null,
          })
          .select()
          .single()

        if (error || !created) continue

        if (contact.phones.length > 0) {
          await supabase.from('client_phones').insert(
            contact.phones.map((phone, i) => ({
              client_id: created.id,
              phone,
              is_primary: i === 0,
            }))
          )
        }

        if (contact.emails.length > 0) {
          await supabase.from('client_emails').insert(
            contact.emails.map((email, i) => ({
              client_id: created.id,
              email,
              is_primary: i === 0,
            }))
          )
        }

        imported++
      }

      toast.success(`Imported ${imported} contacts${dupCount > 0 ? ` (${dupCount} duplicates skipped)` : ''}`)
      setIsImportOpen(false)
      loadClients()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    }

    // Reset file input
    if (importFileRef.current) importFileRef.current.value = ''
  }

  return (
    <AppShell>
      <PageHeader
        title="CLIENTS"
        subtitle={`${filtered.length} of ${clients.length} contacts`}
        actions={
          <>
            <button onClick={() => setIsImportOpen(true)} className="btn-secondary btn-sm">
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button onClick={openCreate} className="btn-primary btn-sm">
              <Plus className="w-4 h-4" />
              Add Client
            </button>
          </>
        }
      />

      <div className="px-6 pb-6 space-y-4">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, phone, email or company..."
          className="max-w-md"
        />

        <div className="card overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-30" />
              <p className="text-text-muted">{search ? 'No clients match your search' : 'No clients yet'}</p>
              {!search && (
                <button onClick={openCreate} className="btn-primary btn-sm mt-4">
                  Add your first client
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Added</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(client => (
                  <tr key={client.id} onClick={() => openEdit(client)}>
                    <td>
                      <div className="font-medium">{client.name}</div>
                      {client.address && (
                        <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3" />
                          {client.address}
                        </div>
                      )}
                    </td>
                    <td>
                      {client.company ? (
                        <div className="flex items-center gap-1.5 text-text-secondary">
                          <Building2 className="w-3.5 h-3.5" />
                          {client.company}
                        </div>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td>
                      {client.phones.length > 0 ? (
                        <div className="space-y-0.5">
                          {client.phones.slice(0, 2).map(p => (
                            <div key={p.id} className="flex items-center gap-1.5 text-text-secondary text-sm">
                              <Phone className="w-3 h-3" />
                              {formatPhoneDisplay(p.phone)}
                            </div>
                          ))}
                          {client.phones.length > 2 && (
                            <span className="text-xs text-text-muted">+{client.phones.length - 2} more</span>
                          )}
                        </div>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td>
                      {client.emails.length > 0 ? (
                        <div className="space-y-0.5">
                          {client.emails.slice(0, 2).map(e => (
                            <div key={e.id} className="flex items-center gap-1.5 text-text-secondary text-sm">
                              <Mail className="w-3 h-3" />
                              {e.email}
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-text-muted">—</span>}
                    </td>
                    <td className="text-text-muted text-sm">{formatDate(client.created_at)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        {profile?.role === 'admin' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(client) }}
                            className="btn-icon text-red-400/50 hover:text-red-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Client Form Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingClient ? `Edit — ${editingClient.name}` : 'Add New Client'}
        size="lg"
        preventOutsideClose={true}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input {...register('name')} className="input" placeholder="John Smith" />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Company</label>
              <input {...register('company')} className="input" placeholder="ABC Corporation" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Address</label>
              <input {...register('address')} className="input" placeholder="123 Independence Ave, Windhoek" />
            </div>
            <div>
              <label className="label">VAT Number</label>
              <input {...register('vat_number')} className="input" placeholder="NAM123456789" />
            </div>
          </div>

          {/* Phones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Phone Numbers</label>
              <button
                type="button"
                onClick={() => addPhone({ phone: '', label: '', is_primary: false })}
                className="btn-ghost btn-sm text-accent"
              >
                <Plus className="w-3 h-3" /> Add Phone
              </button>
            </div>
            <div className="space-y-2">
              {phoneFields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <input
                    {...register(`phones.${i}.phone`)}
                    defaultValue={(field as any).phone || ''}
                    className="input flex-1"
                    placeholder="+264 81 000 0000"
                  />
                  <input
                    {...register(`phones.${i}.label`)}
                    defaultValue={(field as any).label || ''}
                    className="input w-28"
                    placeholder="Mobile"
                  />
                  {phoneFields.length > 1 && (
                    <button type="button" onClick={() => removePhone(i)} className="btn-icon text-red-400/50 hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Emails */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Email Addresses</label>
              <button
                type="button"
                onClick={() => addEmail({ email: '', label: '', is_primary: false })}
                className="btn-ghost btn-sm text-accent"
              >
                <Plus className="w-3 h-3" /> Add Email
              </button>
            </div>
            <div className="space-y-2">
              {emailFields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <input
                    {...register(`emails.${i}.email`)}
                    defaultValue={(field as any).email || ''}
                    type="email"
                    className="input flex-1"
                    placeholder="john@example.com"
                  />
                  <input
                    {...register(`emails.${i}.label`)}
                    defaultValue={(field as any).label || ''}
                    className="input w-28"
                    placeholder="Work"
                  />
                  {emailFields.length > 1 && (
                    <button type="button" onClick={() => removeEmail(i)} className="btn-icon text-red-400/50 hover:text-red-400">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input min-h-[80px] resize-none" placeholder="Any additional notes..." />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setIsFormOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={isSaving} className="btn-primary flex-1">
              {isSaving ? <><span className="spinner w-4 h-4" /> Saving...</> : (editingClient ? 'Update Client' : 'Create Client')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        title="Import Contacts"
        subtitle="Supports JSON, CSV, and TXT formats"
        size="md"
        preventOutsideClose={false}
      >
        <div className="space-y-4">
          <div className="bg-bg-elevated rounded-lg p-4 text-sm text-text-secondary space-y-1.5">
            <p className="font-semibold text-text-primary">Supported Formats:</p>
            <p>• <strong>JSON</strong>: Array of objects with name, phones[], emails[], company, address</p>
            <p>• <strong>CSV</strong>: Headers: name, phone, email, company, address</p>
            <p>• <strong>TXT</strong>: Tab-separated or JSON-per-line</p>
          </div>
          <div
            className="border-2 border-dashed border-border-strong rounded-lg p-8 text-center cursor-pointer hover:border-accent transition-colors"
            onClick={() => importFileRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-text-muted mx-auto mb-2" />
            <p className="text-text-secondary text-sm">Click to select file</p>
            <p className="text-text-muted text-xs mt-1">JSON, CSV, or TXT — up to 10,000 contacts</p>
            <input
              ref={importFileRef}
              type="file"
              accept=".json,.csv,.txt"
              className="hidden"
              onChange={handleImportFile}
            />
          </div>
          <p className="text-xs text-text-muted">Duplicate detection is automatic. Existing contacts will not be duplicated.</p>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Client"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This will remove all associated data.`}
        confirmLabel="Delete"
        danger={true}
        isLoading={isDeleting}
      />
    </AppShell>
  )
}

function Users({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}
