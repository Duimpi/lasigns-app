import { supabase } from '@/lib/supabase/client'

type EnsureClientInput = {
  clientId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  createdBy?: string | null
}

type ExistingContact = {
  id: string
  name: string
  address?: string | null
}

export function normalizeClientPhone(phone?: string | null) {
  let value = String(phone || '').trim()
  if (!value) return ''
  value = value.replace(/[^\d+]/g, '')
  value = value.replace(/^\++/, '+')
  if (value.startsWith('+264264')) return '+264' + value.slice(7)
  if (value.startsWith('264264')) return '+264' + value.slice(6)
  if (value.startsWith('264') && !value.startsWith('+264')) return '+' + value
  return value
}

function normalizeKey(value?: string | null) {
  return String(value || '').trim().toLowerCase()
}

export async function ensureClientRecord(input: EnsureClientInput): Promise<ExistingContact | null> {
  const name = String(input.name || '').trim()
  if (!name) return null

  const email = String(input.email || '').trim()
  const phone = normalizeClientPhone(input.phone)
  const address = String(input.address || '').trim()

  let client: ExistingContact | null = null

  if (input.clientId) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, address')
      .eq('id', input.clientId)
      .maybeSingle()
    if (error) throw error
    client = data as ExistingContact | null
  }

  if (!client) {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, address')
      .ilike('name', name)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    client = data as ExistingContact | null
  }

  if (!client) {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        name,
        address: address || null,
        created_by: input.createdBy || null,
      })
      .select('id, name, address')
      .single()
    if (error) throw error
    client = data as ExistingContact
  } else if (address && !client.address) {
    const { error } = await supabase
      .from('clients')
      .update({ address })
      .eq('id', client.id)
    if (error) throw error
    client = { ...client, address }
  }

  if (email) {
    const { data: existingEmails, error } = await supabase
      .from('client_emails')
      .select('email')
      .eq('client_id', client.id)
    if (error) throw error

    const hasEmail = (existingEmails || []).some((row: { email: string }) => normalizeKey(row.email) === normalizeKey(email))
    if (!hasEmail) {
      const { error: insertError } = await supabase.from('client_emails').insert({
        client_id: client.id,
        email,
        label: 'Primary',
        is_primary: (existingEmails || []).length === 0,
      })
      if (insertError) throw insertError
    }
  }

  if (phone) {
    const { data: existingPhones, error } = await supabase
      .from('client_phones')
      .select('phone')
      .eq('client_id', client.id)
    if (error) throw error

    const hasPhone = (existingPhones || []).some((row: { phone: string }) => normalizeClientPhone(row.phone) === phone)
    if (!hasPhone) {
      const { error: insertError } = await supabase.from('client_phones').insert({
        client_id: client.id,
        phone,
        label: 'Primary',
        is_primary: (existingPhones || []).length === 0,
      })
      if (insertError) throw insertError
    }
  }

  return client
}
