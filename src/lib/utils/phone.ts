// ============================================================
// PHONE NORMALIZATION UTILITIES
// Handles Namibian phone number formats:
// +264 81 447 6486 → 0814476486 (and reverse)
// ============================================================

/**
 * Normalize a phone number to digits-only starting with 0
 * Handles: +264, 264, spaces, dashes, parentheses
 */
export function normalizePhone(phone: string): string {
  if (!phone) return ''
  
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '')
  
  // Handle Namibian country code +264 / 264
  if (digits.startsWith('264')) {
    digits = '0' + digits.slice(3)
  }
  
  return digits
}

/**
 * Check if two phone numbers match after normalization
 */
export function phonesMatch(a: string, b: string): boolean {
  return normalizePhone(a) === normalizePhone(b)
}

/**
 * Check if a phone number contains a search query after normalization
 */
export function phoneMatchesQuery(phone: string, query: string): boolean {
  const normalizedPhone = normalizePhone(phone)
  const normalizedQuery = normalizePhone(query)
  
  if (!normalizedQuery) return false
  
  // Check if the normalized phone contains the normalized query
  return normalizedPhone.includes(normalizedQuery)
}

/**
 * Format a phone for display (Namibian style)
 */
export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone)
  
  if (normalized.startsWith('0') && normalized.length === 10) {
    // 081 234 5678 format
    return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`
  }
  
  return phone // Return original if can't format
}

/**
 * Search clients by phone — compares normalized versions
 */
export function clientMatchesPhoneSearch(phones: string[], query: string): boolean {
  return phones.some(p => phoneMatchesQuery(p, query))
}

/**
 * General client search: name, email, phone, company
 */
export function clientMatchesSearch(client: {
  name: string
  company?: string | null
  phones: string[]
  emails: string[]
}, query: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true

  if (client.name.toLowerCase().includes(q)) return true
  if (client.company?.toLowerCase().includes(q)) return true
  if (client.emails.some(e => e.toLowerCase().includes(q))) return true
  if (clientMatchesPhoneSearch(client.phones, query)) return true

  return false
}
