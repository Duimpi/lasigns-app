import jsPDF from 'jspdf'
import type { JobCard } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { LOGO_BASE64 } from './logo-base64'

// ============================================================
// JOB CARD PDF — Matches LA Signs sample exactly
// A5 portrait, 2 copies side-by-side on A4 landscape
// NO PRICES shown (job card only, not invoice)
// ============================================================

type JobCardPrintOptions = {
  pageNumber?: number
  totalPages?: number
  itemStart?: number
  itemEnd?: number
  totalItems?: number
}

const JOB_CARD_ROWS_PER_PAGE = 18

function chunkJobItems<T>(items: T[] = [], size = JOB_CARD_ROWS_PER_PAGE): T[][] {
  if (items.length === 0) return [[]]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function withItemChunk<T extends { items?: any[] }>(job: T, items: any[]): T {
  return { ...job, items }
}

function drawSingleJobCard(doc: jsPDF, job: JobCard, xOffset: number, options: JobCardPrintOptions = {}) {
  const W = 148   // A5 width mm
  const H = 210   // A5 height mm
  const m = 5     // margin
  const iW = W - m * 2  // inner width
  let y = m

  // ── OUTER BORDER ─────────────────────────────────────────
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.6)
  doc.rect(xOffset + m, m, iW, H - m * 2)

  // ── LOGO (top left) ───────────────────────────────────────
  try {
    doc.setFillColor(255, 255, 255)
    doc.rect(xOffset + m + 1, y + 1, 40, 22, 'F')
    doc.addImage(LOGO_BASE64, 'PNG', xOffset + m + 1, y + 1, 40, 22)
  } catch {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('LA Signs', xOffset + m + 2, y + 12)
  }

  // ── TOP RIGHT INFO BOX ────────────────────────────────────
  const infoX = xOffset + m + 65
  const infoW = iW - 65
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)

  const infoRows = [
    { label: 'DUE DATE:', value: formatDate(job.due_date) || '' },
    { label: 'Date Received:', value: formatDate(job.created_at) },
    { label: 'Quote No:', value: job.job_number || job.linked_quote?.quote_number || '' },
    { label: 'Invoice No:', value: '' },
    { label: 'PO No:', value: '' },
  ]

  // Yellow highlight box for Quote No row
  let infoY = y + 2
  for (let i = 0; i < infoRows.length; i++) {
    const row = infoRows[i]
    const rowH = 4.5
    if (i === 2) {
      // Yellow highlight for Quote No
      doc.setFillColor(255, 255, 0)
      doc.rect(infoX, infoY, infoW, rowH, 'F')
    }
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.2)
    doc.rect(infoX, infoY, infoW, rowH)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    doc.text(row.label, infoX + 1, infoY + 3)
    doc.setFont('helvetica', 'normal')
    if (row.value) doc.text(row.value, infoX + 22, infoY + 3)

    infoY += rowH
  }

  y += 24

  // ── ASSIGNED WORKER ──────────────────────────────────────
  const workerName = job.assigned_worker || job.sales_rep || ''
  doc.setFillColor(255, 255, 255)
  doc.rect(xOffset + m, y, iW, 5, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text('Worker:', xOffset + m + 1, y + 3.5)
  doc.setFont('helvetica', 'normal')
  doc.text(workerName || '-', xOffset + m + 15, y + 3.5)

  if ((options.totalPages || 1) > 1) {
    const itemRange = options.totalItems
      ? `Items ${options.itemStart || 0}-${options.itemEnd || 0} of ${options.totalItems}`
      : ''
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.text(`Page ${options.pageNumber || 1} of ${options.totalPages || 1}`, xOffset + m + iW - 1, y + 3.5, { align: 'right' })
    if (itemRange) {
      doc.setFont('helvetica', 'normal')
      doc.text(itemRange, xOffset + m + iW - 1, y + 7.5, { align: 'right' })
    }
  }

  y += 6

  // ── DIVIDER ───────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(xOffset + m, y, xOffset + m + iW, y)
  y += 1

  // ── COMPANY + CLIENT ROW ──────────────────────────────────
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Company:', xOffset + m + 1, y + 4)
  doc.setFont('helvetica', 'normal')
  const companyVal = job.client?.company || ''
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.text(companyVal, xOffset + m + 17, y + 4)

  // Dotted underline for company value
  doc.setDrawColor(100, 100, 100)
  doc.setLineWidth(0.2)
  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.line(xOffset + m + 17, y + 5, xOffset + m + 75, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('Client:', xOffset + m + 78, y + 4)
  doc.setFontSize(7.5)
  const clientVal = job.client_name || ''
  doc.text(clientVal, xOffset + m + 90, y + 4)
  doc.line(xOffset + m + 90, y + 5, xOffset + m + iW, y + 5)
  doc.setLineDashPattern([], 0)

  y += 8

  // ── TEL + EMAIL ROW ───────────────────────────────────────
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Tel/Cell:', xOffset + m + 1, y + 4)
  doc.setFont('helvetica', 'normal')
  // Get primary phone from client
  const phone = job.client?.phones?.[0]?.phone || ''
  doc.setFontSize(7)
  doc.text(phone, xOffset + m + 14, y + 4)

  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.line(xOffset + m + 14, y + 5, xOffset + m + 65, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('Email:', xOffset + m + 67, y + 4)
  const email = job.client?.emails?.[0]?.email || ''
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text(email, xOffset + m + 78, y + 4)
  doc.line(xOffset + m + 78, y + 5, xOffset + m + iW, y + 5)
  doc.setLineDashPattern([], 0)

  y += 8

  // ── TABLE HEADER ──────────────────────────────────────────
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  const COL = {
    qty: { x: xOffset + m, w: 10 },
    size: { x: xOffset + m + 10, w: 22 },
    material: { x: xOffset + m + 32, w: iW - 32 },
  }

  doc.setFillColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')

  // Column headers
  doc.text('Qty', COL.qty.x + 1, y + 5)
  doc.text('Size', COL.size.x + 1, y + 5)
  doc.text('Material', COL.material.x + 1, y + 5)

  // Vertical lines for columns
  doc.setLineWidth(0.3)
  doc.line(COL.size.x, y, COL.size.x, y + 8)
  doc.line(COL.material.x, y, COL.material.x, y + 8)

  y += 8
  doc.setLineWidth(0.4)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  // ── TABLE ROWS ────────────────────────────────────────────
  const items = job.items || []
  const ROW_H = 7
  const MAX_ROWS = JOB_CARD_ROWS_PER_PAGE

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  for (let i = 0; i < MAX_ROWS; i++) {
    const item = items[i]
    const rowY = y

    // Vertical column separators
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.2)
    doc.line(COL.size.x, rowY, COL.size.x, rowY + ROW_H)
    doc.line(COL.material.x, rowY, COL.material.x, rowY + ROW_H)

    if (item) {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(String(item.quantity), COL.qty.x + 1, rowY + 5)
      doc.setFont('helvetica', 'normal')
      doc.text(item.size || '', COL.size.x + 1, rowY + 5)

      // Description — allow 2 lines
      const descLines = doc.splitTextToSize(item.description, COL.material.w - 3)
      doc.setFontSize(7.5)
      if (descLines.length > 1) {
        doc.text(descLines[0], COL.material.x + 1, rowY + 3.5)
        doc.text(descLines[1], COL.material.x + 1, rowY + 7)
      } else {
        doc.text(descLines[0] || '', COL.material.x + 1, rowY + 5)
      }
    }

    // Horizontal row line
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.15)
    doc.line(xOffset + m, rowY + ROW_H, xOffset + m + iW, rowY + ROW_H)

    y += ROW_H
  }

  // ── BOTTOM SECTION ────────────────────────────────────────
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  // Comments + Totals box
  const bottomY = y
  const bottomH = 30
  const totalsX = xOffset + m + iW - 42
  const totalsW = 42

  // Comments label
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('Comments:', xOffset + m + 1, bottomY + 5)

  // Comment lines (dotted)
  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.2)
  for (let i = 0; i < 3; i++) {
    const ly = bottomY + 10 + i * 6
    doc.line(xOffset + m + 1, ly, totalsX - 2, ly)
  }
  doc.setLineDashPattern([], 0)

  // Vertical separator before totals
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(totalsX, bottomY, totalsX, bottomY + bottomH)

  // Totals rows — NO PRICES on job card
  const totalRows = [
    { label: 'N$ (excl)', value: '' },
    { label: '15% Vat', value: '' },
    { label: 'N$ (Incl)', value: '' },
  ]
  const tRowH = bottomH / 3
  for (let i = 0; i < totalRows.length; i++) {
    const ty = bottomY + i * tRowH
    if (i > 0) {
      doc.line(totalsX, ty, xOffset + m + iW, ty)
    }
    doc.setFontSize(6.5)
    doc.setFont('helvetica', 'bold')
    doc.text(totalRows[i].label, totalsX + 1, ty + tRowH / 2 + 1.5)
    // Value column
    doc.line(totalsX + 22, bottomY, totalsX + 22, bottomY + bottomH)
  }

  y = bottomY + bottomH

  // ── BOTTOM BORDER ─────────────────────────────────────────
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  // ── SALES REP + DATE COMPLETED ────────────────────────────
  y += 1
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('Sales Representative:', xOffset + m + 1, y + 4)

  const repName = job.sales_rep || ''
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text(repName, xOffset + m + 34, y + 4)

  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.setDrawColor(100, 100, 100)
  doc.setLineWidth(0.2)
  doc.line(xOffset + m + 34, y + 5, xOffset + m + 80, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text('Date Completed:', xOffset + m + 82, y + 4)
  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.line(xOffset + m + 108, y + 5, xOffset + m + iW, y + 5)
  doc.setLineDashPattern([], 0)

  // ── DOTTED CUT LINE between copies ───────────────────────
  if (xOffset === 0) {
    doc.setDrawColor(150, 150, 150)
    doc.setLineDashPattern([1, 2], 0)
    doc.setLineWidth(0.3)
    doc.line(W, 2, W, H - 2)
    doc.setLineDashPattern([], 0)
  }
}

/**
 * Generate A4 landscape with 2 A5 job card copies side by side
 * NO PRICES shown — job card only
 */
export function generateJobCardPDF(job: JobCard, _showPrices = false): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const itemChunks = chunkJobItems(job.items || [])
  itemChunks.forEach((items, idx) => {
    if (idx > 0) doc.addPage('a4', 'landscape')
    const itemStart = (idx * JOB_CARD_ROWS_PER_PAGE) + 1
    const itemEnd = Math.min((idx + 1) * JOB_CARD_ROWS_PER_PAGE, (job.items || []).length)
    const pageJob = withItemChunk(job, items)
    const options = {
      pageNumber: idx + 1,
      totalPages: itemChunks.length,
      itemStart,
      itemEnd,
      totalItems: (job.items || []).length,
    }
    drawSingleJobCard(doc, pageJob, 0, options)
    drawSingleJobCard(doc, pageJob, 148.5, options)
  })

  return doc
}

/**
 * Generate A4 landscape with TWO DIFFERENT jobs side by side
 */
export function generateTwoJobCardsPDF(job1: JobCard, job2: JobCard): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const job1Chunks = chunkJobItems(job1.items || [])
  const job2Chunks = chunkJobItems(job2.items || [])
  const pageCount = Math.max(job1Chunks.length, job2Chunks.length)

  for (let idx = 0; idx < pageCount; idx++) {
    if (idx > 0) doc.addPage('a4', 'landscape')

    const job1Items = job1Chunks[idx] || []
    const job2Items = job2Chunks[idx] || []
    drawSingleJobCard(doc, withItemChunk(job1, job1Items), 0, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: job1Items.length ? (idx * JOB_CARD_ROWS_PER_PAGE) + 1 : 0,
      itemEnd: Math.min((idx + 1) * JOB_CARD_ROWS_PER_PAGE, (job1.items || []).length),
      totalItems: (job1.items || []).length,
    })
    drawSingleJobCard(doc, withItemChunk(job2, job2Items), 148.5, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: job2Items.length ? (idx * JOB_CARD_ROWS_PER_PAGE) + 1 : 0,
      itemEnd: Math.min((idx + 1) * JOB_CARD_ROWS_PER_PAGE, (job2.items || []).length),
      totalItems: (job2.items || []).length,
    })
  }

  return doc
}

type QuoteJobCardPrintInput = {
  quote_number: string
  client_name?: string | null
  client_email?: string | null
  client_address?: string | null
  status?: string
  vat_rate?: number
  subtotal?: number
  vat_amount?: number
  total?: number
  notes?: string | null
  valid_until?: string | null
  assigned_worker?: string | null
  items?: { description: string; quantity: number; unit_price?: number; total?: number; line_total?: number; size?: string | null }[]
  created_at?: string
}

function quoteToJobCard(quote: QuoteJobCardPrintInput): JobCard {
  const createdAt = quote.created_at || new Date().toISOString()
  return {
    id: '',
    job_number: quote.quote_number,
    title: quote.quote_number,
    description: quote.notes || undefined,
    notes: quote.notes || undefined,
    client_id: undefined,
    client_name: quote.client_name || '',
    status: 'pending',
    priority: 'normal',
    assigned_worker: quote.assigned_worker || undefined,
    due_date: quote.valid_until || undefined,
    is_retail: false,
    sales_rep: '',
    subtotal: quote.subtotal || 0,
    vat_amount: quote.vat_amount || 0,
    total: quote.total || 0,
    vat_rate: quote.vat_rate || 15,
    created_at: createdAt,
    updated_at: createdAt,
    client: {
      id: '',
      name: quote.client_name || '',
      company: '',
      address: quote.client_address || '',
      created_at: createdAt,
      updated_at: createdAt,
      phones: [],
      emails: quote.client_email ? [{
        id: '',
        client_id: '',
        email: quote.client_email,
        label: 'Primary',
        is_primary: true,
      }] : [],
    },
    items: (quote.items || []).map((item, idx) => ({
      id: '',
      job_card_id: '',
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price || 0,
      line_total: item.line_total || item.total || 0,
      size: item.size || undefined,
      sort_order: idx,
    })),
  } as JobCard
}

/**
 * Generate quote as the same A4 landscape / 2-up A5 layout used by Job Cards.
 * If no second quote is supplied, the first quote is duplicated on the right.
 */
export function generateQuoteJobCardPDF(quote: QuoteJobCardPrintInput, secondQuote: QuoteJobCardPrintInput = quote): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const leftJob = quoteToJobCard(quote)
  const rightJob = quoteToJobCard(secondQuote)
  const leftChunks = chunkJobItems(leftJob.items || [])
  const rightChunks = chunkJobItems(rightJob.items || [])
  const pageCount = Math.max(leftChunks.length, rightChunks.length)

  for (let idx = 0; idx < pageCount; idx++) {
    if (idx > 0) doc.addPage('a4', 'landscape')
    const leftItems = leftChunks[idx] || []
    const rightItems = rightChunks[idx] || []
    drawSingleJobCard(doc, withItemChunk(leftJob, leftItems), 0, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: leftItems.length ? (idx * JOB_CARD_ROWS_PER_PAGE) + 1 : 0,
      itemEnd: Math.min((idx + 1) * JOB_CARD_ROWS_PER_PAGE, (leftJob.items || []).length),
      totalItems: (leftJob.items || []).length,
    })
    drawSingleJobCard(doc, withItemChunk(rightJob, rightItems), 148.5, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: rightItems.length ? (idx * JOB_CARD_ROWS_PER_PAGE) + 1 : 0,
      itemEnd: Math.min((idx + 1) * JOB_CARD_ROWS_PER_PAGE, (rightJob.items || []).length),
      totalItems: (rightJob.items || []).length,
    })
  }

  return doc
}

/**
 * Generate Quote PDF (portrait A4, with prices)
 */
export function generateQuotePDF(quote: {
  quote_number: string
  client_name?: string
  client_email?: string
  client_address?: string
  status: string
  vat_rate: number
  subtotal: number
  vat_amount: number
  total: number
  notes?: string
  valid_until?: string
  items?: { description: string; quantity: number; unit_price: number; total: number; size?: string }[]
  created_at: string
}): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const m = 15
  const iW = pageW - m * 2
  let y = m

  // ── HEADER ────────────────────────────────────────────────
  // Logo - white background to mask PNG black background
  try {
    doc.setFillColor(255, 255, 255)
    doc.rect(m, y, 45, 25, 'F')
    doc.addImage(LOGO_BASE64, 'PNG', m, y, 45, 25)
  } catch {
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('LA Signs', m, y + 14)
  }

  // Company info right side
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  doc.text('LA Signs & Graphics CC', pageW - m, y + 4, { align: 'right' })
  doc.text('Signs & Graphics, Trophies & Engraving', pageW - m, y + 9, { align: 'right' })
  doc.text('Windhoek, Namibia', pageW - m, y + 14, { align: 'right' })

  y += 32

  // ── QUOTE TITLE BAR ───────────────────────────────────────
  doc.setFillColor(240, 240, 240)
  doc.rect(m, y, iW, 10, 'F')
  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.rect(m, y, iW, 10)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(0)
  doc.text('QUOTATION', pageW / 2, y + 7, { align: 'center' })

  y += 14

  // ── CLIENT + QUOTE INFO ───────────────────────────────────
  // Left: Bill to
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Bill To:', m, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(quote.client_name || '—', m, y); y += 5
  if (quote.client_email) { doc.text(quote.client_email, m, y); y += 5 }
  if (quote.client_address) { doc.text(quote.client_address, m, y); y += 5 }

  // Right: Quote details
  const rightX = pageW - m - 65
  let ry = y - (quote.client_email ? 10 : 5) - (quote.client_address ? 5 : 0) - 5
  doc.setFontSize(8)
  const details = [
    ['Quote No:', quote.quote_number],
    ['Date:', formatDate(quote.created_at)],
    ['Valid Until:', formatDate(quote.valid_until) || '—'],
    ['Status:', quote.status.replace('_', ' ').toUpperCase()],
  ]
  for (const [label, val] of details) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, rightX, ry)
    doc.setFont('helvetica', 'normal')
    doc.text(val, rightX + 22, ry)
    ry += 5
  }

  y += 6

  // ── ITEMS TABLE ───────────────────────────────────────────
  const tY = y
  doc.setFillColor(30, 30, 30)
  doc.rect(m, tY, iW, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)

  const C = {
    qty: m,
    size: m + 12,
    desc: m + 34,
    unit: m + iW - 38,
    total: m + iW - 18,
  }

  doc.text('Qty', C.qty + 1, tY + 5.5)
  doc.text('Size', C.size + 1, tY + 5.5)
  doc.text('Description', C.desc + 1, tY + 5.5)
  doc.text('Unit Price', C.unit, tY + 5.5)
  doc.text('Total', C.total, tY + 5.5)

  y = tY + 8
  doc.setTextColor(0, 0, 0)
  const rowH = 8

  for (let i = 0; i < (quote.items || []).length; i++) {
    const item = quote.items![i]
    if (i % 2 === 1) {
      doc.setFillColor(247, 247, 247)
      doc.rect(m, y, iW, rowH, 'F')
    }
    doc.setDrawColor(220, 220, 220)
    doc.setLineWidth(0.1)
    doc.line(m, y + rowH, m + iW, y + rowH)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.text(String(item.quantity), C.qty + 1, y + 5.5)
    doc.text(item.size || '', C.size + 1, y + 5.5)
    const d = doc.splitTextToSize(item.description, C.unit - C.desc - 4)[0] || ''
    doc.text(d, C.desc + 1, y + 5.5)
    doc.setFont('helvetica', 'normal')
    doc.text(formatCurrency(item.unit_price), C.unit, y + 5.5)
    doc.text(formatCurrency(item.total), C.total, y + 5.5)
    y += rowH
  }

  y += 4
  doc.setDrawColor(0)
  doc.setLineWidth(0.4)
  doc.line(m, y, m + iW, y)
  y += 4

  // Totals
  const tX = m + iW - 75
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.text('N$ (excl):', tX, y); doc.text(formatCurrency(quote.subtotal), m + iW, y, { align: 'right' }); y += 6
  doc.text(`15% VAT:`, tX, y); doc.text(formatCurrency(quote.vat_amount), m + iW, y, { align: 'right' }); y += 2
  doc.setLineWidth(0.5); doc.line(tX, y, m + iW, y); y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('N$ (Incl):', tX, y); doc.text(formatCurrency(quote.total), m + iW, y, { align: 'right' })

  // Notes
  if (quote.notes) {
    y += 12
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text('Notes:', m, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    const nl = doc.splitTextToSize(quote.notes, iW)
    doc.text(nl, m, y)
  }

  // Footer
  doc.setFillColor(20, 20, 20)
  doc.rect(0, 282, pageW, 15, 'F')
  doc.setTextColor(200, 200, 200)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.text('LA Signs & Graphics CC — Signs, Graphics, Trophies & Engraving — Windhoek, Namibia', pageW / 2, 291, { align: 'center' })

  return doc
}
