import Papa from 'papaparse'
import { normalizePhone } from './phone'
import type { ImportContact } from '@/types'

// ============================================================
// CONTACT IMPORT SYSTEM
// Supports: JSON, CSV, TXT
// Handles: 1300+ contacts, duplicates, malformed data
// ============================================================

function cleanString(s: unknown): string {
  if (!s) return ''
  return String(s).trim().replace(/\s+/g, ' ')
}

function cleanPhone(p: unknown): string {
  if (!p) return ''
  const s = String(p).trim()
  // Remove obvious junk
  if (s.length < 5) return ''
  return s
}

function cleanEmail(e: unknown): string {
  if (!e) return ''
  const s = String(e).trim().toLowerCase()
  // Basic email validation
  if (!s.includes('@') || !s.includes('.')) return ''
  return s
}

function extractPhones(raw: unknown): string[] {
  if (!raw) return []
  
  if (Array.isArray(raw)) {
    return raw.map(cleanPhone).filter(Boolean)
  }
  
  const s = String(raw)
  // Try splitting by common delimiters
  const parts = s.split(/[,;|\/\n]+/)
  return parts.map(cleanPhone).filter(Boolean)
}

function extractEmails(raw: unknown): string[] {
  if (!raw) return []
  
  if (Array.isArray(raw)) {
    return raw.map(cleanEmail).filter(Boolean)
  }
  
  const s = String(raw)
  const parts = s.split(/[,;|\/\n]+/)
  return parts.map(cleanEmail).filter(Boolean)
}

// Parse JSON import
function parseJSON(content: string): ImportContact[] {
  try {
    const data = JSON.parse(content)
    const arr = Array.isArray(data) ? data : [data]
    
    return arr
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        name: cleanString(item.name || item.Name || item.full_name || item.fullName),
        phones: extractPhones(item.phones || item.phone || item.Phone || item.mobile || item.Mobile || item.cell),
        emails: extractEmails(item.emails || item.email || item.Email),
        company: cleanString(item.company || item.Company || item.organization || item.org),
        address: cleanString(item.address || item.Address),
      }))
      .filter(c => c.name)
  } catch {
    throw new Error('Invalid JSON format')
  }
}

// Parse CSV import
function parseCSV(content: string): ImportContact[] {
  const result = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (result.errors.length && !result.data.length) {
    throw new Error('CSV parse error: ' + result.errors[0]?.message)
  }

  return (result.data as Record<string, string>[])
    .map(row => ({
      name: cleanString(
        row.name || row.full_name || row.contact_name || row.client_name ||
        [row.first_name, row.last_name].filter(Boolean).join(' ')
      ),
      phones: extractPhones(
        row.phones || row.phone || row.mobile || row.cell ||
        row.phone_number || row.telephone
      ),
      emails: extractEmails(
        row.emails || row.email || row.email_address
      ),
      company: cleanString(row.company || row.organization || row.business),
      address: cleanString(row.address || row.location),
    }))
    .filter(c => c.name)
}

// Parse TXT (newline-separated, or tab-separated)
function parseTXT(content: string): ImportContact[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  const contacts: ImportContact[] = []
  
  // Check if it's tab-separated
  if (lines[0]?.includes('\t')) {
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase())
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t')
      const row: Record<string, string> = {}
      headers.forEach((h, j) => { row[h] = cols[j] || '' })
      
      const name = cleanString(row.name || row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim())
      if (!name) continue
      
      contacts.push({
        name,
        phones: extractPhones(row.phone || row.mobile || row.phones),
        emails: extractEmails(row.email || row.emails),
        company: cleanString(row.company || row.organization),
        address: cleanString(row.address),
      })
    }
    return contacts
  }
  
  // Plain line-by-line: try to parse as JSON objects per line
  for (const line of lines) {
    if (line.startsWith('{')) {
      try {
        const obj = JSON.parse(line)
        contacts.push({
          name: cleanString(obj.name),
          phones: extractPhones(obj.phones || obj.phone),
          emails: extractEmails(obj.emails || obj.email),
          company: cleanString(obj.company),
          address: cleanString(obj.address),
        })
      } catch {
        // Just treat as a name
        contacts.push({ name: line, phones: [], emails: [] })
      }
    } else {
      contacts.push({ name: line, phones: [], emails: [] })
    }
  }
  
  return contacts.filter(c => c.name)
}

export function parseImportFile(content: string, fileType: 'json' | 'csv' | 'txt'): ImportContact[] {
  switch (fileType) {
    case 'json': return parseJSON(content)
    case 'csv': return parseCSV(content)
    case 'txt': return parseTXT(content)
    default: throw new Error(`Unsupported file type: ${fileType}`)
  }
}

/**
 * Detect duplicates within the import batch and against existing contacts
 */
export function detectDuplicates(
  incoming: ImportContact[],
  existing: { name: string; phones: string[]; emails: string[] }[]
): {
  contact: ImportContact
  isDuplicate: boolean
  duplicateReason?: string
}[] {
  const seen = new Map<string, boolean>()
  
  return incoming.map(contact => {
    const normalizedName = contact.name.toLowerCase().trim()
    
    // Check against existing
    for (const ex of existing) {
      // Name match
      if (ex.name.toLowerCase().trim() === normalizedName) {
        return { contact, isDuplicate: true, duplicateReason: 'Name matches existing contact' }
      }
      
      // Phone match
      const incomingNormPhones = contact.phones.map(normalizePhone)
      const existingNormPhones = ex.phones.map(normalizePhone)
      const phoneMatch = incomingNormPhones.some(p => existingNormPhones.includes(p) && p)
      if (phoneMatch) {
        return { contact, isDuplicate: true, duplicateReason: 'Phone number matches existing contact' }
      }
      
      // Email match
      const emailMatch = contact.emails.some(e => ex.emails.includes(e) && e)
      if (emailMatch) {
        return { contact, isDuplicate: true, duplicateReason: 'Email matches existing contact' }
      }
    }
    
    // Check within batch
    if (seen.has(normalizedName)) {
      return { contact, isDuplicate: true, duplicateReason: 'Duplicate in import batch' }
    }
    
    seen.set(normalizedName, true)
    return { contact, isDuplicate: false }
  })
}
