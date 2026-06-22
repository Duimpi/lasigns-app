import type { Profile } from '@/types'

export const SUPER_ADMIN_EMAILS = [
  'lasigns.d@gmail.com',
  'baganiholdings@gmail.com',
]

export function isSuperAdmin(profile: Profile | null | undefined) {
  return profile?.role === 'super_admin' || SUPER_ADMIN_EMAILS.includes((profile?.email || '').toLowerCase())
}
