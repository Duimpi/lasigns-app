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
  showPrices?: boolean
  descriptionLines?: string[]
  noteLines?: string[]
  commentLines?: string[]
  notesContinuation?: boolean
}

const JOB_CARD_ROWS_PER_PAGE = 18
const JOB_CARD_ROW_H = 6.2
const JOB_CARD_NOTE_LINE_H = 2.45
const JOB_CARD_NOTE_TOP_SPACE = 10
const JOB_CARD_PRICED_BOTTOM_H = 32
const JOB_CARD_UNPRICED_BOTTOM_H = 21
const QUOTE_MIN_ROW_H = 6.2
const QUOTE_DESC_FONT_SIZE = 7.2
const QUOTE_DESC_LINE_H = 3.1
const QUOTE_NOTE_LINE_H = 2.8
const QUOTE_NOTE_TOP_SPACE = 10
const QUOTE_BOTTOM_H = 21
const QUOTE_TABLE_START_Y = 64
const QUOTE_TABLE_AVAILABLE_H = 210 - 5 - QUOTE_BOTTOM_H - QUOTE_TABLE_START_Y
const QUOTE_CONTENT_BUDGET = QUOTE_TABLE_AVAILABLE_H + QUOTE_BOTTOM_H

function chunkJobItems<T>(items: T[] = [], size = JOB_CARD_ROWS_PER_PAGE): T[][] {
  if (items.length === 0) return [[]]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

function withItemChunk<T extends { items?: any[] }>(job: T, items: any[]): T {
  return { ...job, items }
}

function quoteItemDescriptionLines(doc: jsPDF, item: any, width: number) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(QUOTE_DESC_FONT_SIZE)
  const rawLines = String(item?.description || '').split(/\r?\n/)
  return rawLines.flatMap(line => doc.splitTextToSize(line || ' ', width))
}

function quoteItemRowHeight(doc: jsPDF, item: any, descWidth: number) {
  if (!item) return QUOTE_MIN_ROW_H
  const lineCount = Math.max(1, quoteItemDescriptionLines(doc, item, descWidth).length)
  return Math.max(QUOTE_MIN_ROW_H, 2.5 + lineCount * QUOTE_DESC_LINE_H)
}

function chunkQuoteItemsByHeight(doc: jsPDF, items: any[] = [], descWidth: number) {
  if (items.length === 0) return [[]]

  const chunks: any[][] = []
  let chunk: any[] = []
  let usedHeight = 0

  for (const item of items) {
    const rowHeight = quoteItemRowHeight(doc, item, descWidth)
    if (chunk.length && usedHeight + rowHeight > QUOTE_TABLE_AVAILABLE_H) {
      chunks.push(chunk)
      chunk = []
      usedHeight = 0
    }
    chunk.push(item)
    usedHeight += rowHeight
  }

  if (chunk.length) chunks.push(chunk)
  return chunks
}

type JobCardPagePlan = {
  items: any[]
  descriptionLines: string[]
  noteLines: string[]
  commentLines: string[]
  notesContinuation: boolean
  itemStart: number
  itemEnd: number
}

function wrapPreservedLines(doc: jsPDF, value: unknown, width: number, fontSize = 5.8) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(fontSize)
  return String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .flatMap(line => doc.splitTextToSize(line, width))
}

function jobCardContentBudget(showPrices: boolean) {
  return (JOB_CARD_ROWS_PER_PAGE * JOB_CARD_ROW_H) + (showPrices ? JOB_CARD_PRICED_BOTTOM_H : JOB_CARD_UNPRICED_BOTTOM_H)
}

function jobCardTextCapacity(itemCount: number, showPrices: boolean) {
  const availableBottom = jobCardContentBudget(showPrices) - (itemCount * JOB_CARD_ROW_H)
  return Math.max(0, Math.floor((availableBottom - JOB_CARD_NOTE_TOP_SPACE) / JOB_CARD_NOTE_LINE_H))
}

function buildJobCardPagePlans(doc: jsPDF, job: JobCard, showPrices: boolean): JobCardPagePlan[] {
  const itemChunks = chunkJobItems(job.items || [])
  let itemNumber = 1
  const pages: JobCardPagePlan[] = itemChunks.map(items => {
    const itemStart = items.length ? itemNumber : 0
    const itemEnd = items.length ? itemNumber + items.length - 1 : 0
    itemNumber = itemEnd + 1
    return {
      items,
      descriptionLines: [],
      noteLines: [],
      commentLines: [],
      notesContinuation: false,
      itemStart,
      itemEnd,
    }
  })

  const pricedColumnWidth = ((148 - 10 - 4) / 2) - 3
  const unpricedCommentWidth = 91
  const fulfillmentLines = fulfillmentLinesFromNotes(job.notes)
  let descriptionLines = showPrices ? wrapPreservedLines(doc, job.description, pricedColumnWidth) : []
  let noteLines = showPrices
    ? [...fulfillmentLines, ...wrapPreservedLines(doc, visibleNotes(job.notes), pricedColumnWidth)]
    : []
  let commentLines = showPrices
    ? []
    : wrapPreservedLines(doc, [fulfillmentLines.join(' | '), job.description, visibleNotes(job.notes)].filter(Boolean).join('\n'), unpricedCommentWidth)

  let pageIndex = pages.length - 1
  while (descriptionLines.length || noteLines.length || commentLines.length) {
    let page = pages[pageIndex]
    if (!page || page.descriptionLines.length || page.noteLines.length || page.commentLines.length) {
      page = {
        items: [],
        descriptionLines: [],
        noteLines: [],
        commentLines: [],
        notesContinuation: true,
        itemStart: 0,
        itemEnd: 0,
      }
      pages.push(page)
      pageIndex = pages.length - 1
    }

    const capacity = Math.max(1, jobCardTextCapacity(page.items.length, showPrices))
    page.descriptionLines = descriptionLines.slice(0, capacity)
    page.noteLines = noteLines.slice(0, capacity)
    page.commentLines = commentLines.slice(0, capacity)
    descriptionLines = descriptionLines.slice(capacity)
    noteLines = noteLines.slice(capacity)
    commentLines = commentLines.slice(capacity)

    if (descriptionLines.length || noteLines.length || commentLines.length) pageIndex += 1
  }

  return pages
}

function numberValue(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n : 0
}

function tagValue(notes: string | null | undefined, key: string) {
  const match = String(notes || '').match(new RegExp('\\[LA_' + key + ':([^\\]]*)\\]', 'i'))
  if (!match?.[1]) return ''
  try { return decodeURIComponent(match[1]) } catch { return match[1] }
}

function courierPaymentLabel(value?: string) {
  if (value === 'we_pay') return 'We pay'
  if (value === 'account') return 'Account'
  return 'Pay on Delivery'
}

function fulfillmentLinesFromNotes(notes?: string | null) {
  const text = String(notes || '')
  if (text.includes('[LA_DELIVERY_PENDING]') || text.includes('[LA_DELIVERY_DELIVERED]')) {
    const detailLines = [
      tagValue(text, 'DELIVERY_NAME') ? `Contact: ${tagValue(text, 'DELIVERY_NAME')}` : '',
      tagValue(text, 'DELIVERY_NUMBER') ? `Cell: ${tagValue(text, 'DELIVERY_NUMBER')}` : '',
      tagValue(text, 'DELIVERY_ADDRESS') ? `Address: ${tagValue(text, 'DELIVERY_ADDRESS')}` : '',
    ].filter(Boolean)
    return detailLines.length ? ['Fulfilment: Delivery', ...detailLines] : []
  }
  if (text.includes('[LA_COURIER_PENDING]') || text.includes('[LA_COURIER_COURIERED]')) {
    const payment = tagValue(text, 'COURIER_PAYMENT')
    const detailLines = [
      tagValue(text, 'COURIER_COMPANY') ? `Courier: ${tagValue(text, 'COURIER_COMPANY')}` : '',
      tagValue(text, 'COURIER_CONTACT') ? `Contact: ${tagValue(text, 'COURIER_CONTACT')}` : '',
      tagValue(text, 'COURIER_ADDRESS') ? `Address: ${tagValue(text, 'COURIER_ADDRESS')}` : '',
      payment ? `Payment: ${courierPaymentLabel(payment)}` : '',
      tagValue(text, 'COURIER_NOTES') ? `Notes: ${tagValue(text, 'COURIER_NOTES')}` : '',
    ].filter(Boolean)
    return detailLines.length ? ['Fulfilment: Courier', ...detailLines] : []
  }
  if (text.includes('[LA_INSTALL_PENDING]') || text.includes('[LA_INSTALL_DONE]')) {
    const detailLines = [
      tagValue(text, 'INSTALL_CONTACT') ? `Contact: ${tagValue(text, 'INSTALL_CONTACT')}` : '',
      tagValue(text, 'INSTALL_NUMBER') ? `Cell: ${tagValue(text, 'INSTALL_NUMBER')}` : '',
      tagValue(text, 'INSTALL_ADDRESS') ? `Address: ${tagValue(text, 'INSTALL_ADDRESS')}` : '',
      tagValue(text, 'INSTALL_DATE') ? `Preferred: ${tagValue(text, 'INSTALL_DATE')}` : '',
      tagValue(text, 'INSTALL_NOTES') ? `Notes: ${tagValue(text, 'INSTALL_NOTES')}` : '',
    ].filter(Boolean)
    return detailLines.length ? ['Fulfilment: Installation / Application', ...detailLines] : []
  }
  return []
}

function visibleNotes(notes?: string | null) {
  return String(notes || '')
    .replace(/\[LA_(COLLECTION|DELIVERY|COURIER|INSTALL)_[^\]]+\]/gi, '')
    .replace(/\[LA_(DELIVERY|COURIER|INSTALL)_[A-Z_]+:[^\]]*\]/gi, '')
    .replace(/\[LA_ORDER_NUMBER:[^\]]*\]/gi, '')
    .replace(/(Collected|Delivered|Couriered|Installed \/ Applied) on .+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function quoteLineSubtotal(quote: { items?: any[] }) {
  return (quote.items || []).reduce((sum, item) => {
    const lineTotal = numberValue(item.line_total || item.total || numberValue(item.quantity) * numberValue(item.unit_price))
    return sum + lineTotal
  }, 0)
}

function quoteDiscountInfo(quote: { subtotal?: number; discount?: number; items?: any[] }) {
  const lineSubtotal = quoteLineSubtotal(quote)
  const discountPercent = numberValue((quote as any).discount)
  const discountAmount = discountPercent > 0
    ? lineSubtotal * (discountPercent / 100)
    : Math.max(0, lineSubtotal - numberValue(quote.subtotal))
  if (discountAmount <= 0.01) return null
  const percent = discountPercent > 0
    ? discountPercent
    : lineSubtotal > 0 ? (discountAmount / lineSubtotal) * 100 : 0
  return { amount: discountAmount, percent }
}

function drawSingleJobCard(doc: jsPDF, job: JobCard, xOffset: number, options: JobCardPrintOptions = {}) {
  const W = 148   // A5 width mm
  const H = 210   // A5 height mm
  const m = 5     // margin
  const iW = W - m * 2  // inner width
  const showPrices = !!options.showPrices
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

    const isNumberRow = i === 2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(isNumberRow ? 6.8 : 6)
    doc.text(row.label, infoX + 1, infoY + 3)
    doc.setFont('helvetica', isNumberRow ? 'bold' : 'normal')
    doc.setFontSize(isNumberRow ? 7.5 : 6)
    if (row.value) doc.text(String(row.value), infoX + 22, infoY + (isNumberRow ? 3.35 : 3))

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
  doc.setFontSize(8)
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
  doc.setFontSize(8)
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
  doc.setFontSize(7.4)
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

  const unitW = showPrices ? 24 : 0
  const COL = {
    qty: { x: xOffset + m, w: 10 },
    size: { x: xOffset + m + 10, w: 22 },
    material: { x: xOffset + m + 32, w: iW - 32 - unitW },
    unit: { x: xOffset + m + iW - unitW, w: unitW },
  }

  doc.setFillColor(255, 255, 255)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')

  // Column headers
  doc.text('Qty', COL.qty.x + 1, y + 5)
  doc.text('Size', COL.size.x + 1, y + 5)
  doc.text('Material', COL.material.x + 1, y + 5)
  if (showPrices) doc.text('Unit', COL.unit.x + 1, y + 5)

  // Vertical lines for columns
  doc.setLineWidth(0.3)
  doc.line(COL.size.x, y, COL.size.x, y + 8)
  doc.line(COL.material.x, y, COL.material.x, y + 8)
  if (showPrices) doc.line(COL.unit.x, y, COL.unit.x, y + 8)

  y += 8
  doc.setLineWidth(0.4)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  // ── TABLE ROWS ────────────────────────────────────────────
  const items = job.items || []
  const colGap = 4
  const colW = (iW - colGap) / 2
  const pricedDescriptionLines = options.descriptionLines
    ?? wrapPreservedLines(doc, job.description, colW - 3)
  const pricedNoteLines = options.noteLines
    ?? [...fulfillmentLinesFromNotes(job.notes), ...wrapPreservedLines(doc, visibleNotes(job.notes), colW - 3)]
  const unpricedCommentLines = options.commentLines
    ?? wrapPreservedLines(
      doc,
      [fulfillmentLinesFromNotes(job.notes).join(' | '), job.description, visibleNotes(job.notes)]
        .filter(Boolean)
        .join('\n'),
      91,
    )
  const textLineCount = showPrices
    ? Math.max(pricedDescriptionLines.length, pricedNoteLines.length)
    : unpricedCommentLines.length
  const minimumBottomH = showPrices ? JOB_CARD_PRICED_BOTTOM_H : JOB_CARD_UNPRICED_BOTTOM_H
  const desiredBottomH = Math.max(
    minimumBottomH,
    JOB_CARD_NOTE_TOP_SPACE + (textLineCount * JOB_CARD_NOTE_LINE_H),
  )
  const contentBudget = jobCardContentBudget(showPrices)
  const rowsAllowedByText = Math.max(0, Math.floor((contentBudget - desiredBottomH) / JOB_CARD_ROW_H))
  const rowsToDraw = Math.max(items.length, Math.min(JOB_CARD_ROWS_PER_PAGE, rowsAllowedByText))
  const bottomH = contentBudget - (rowsToDraw * JOB_CARD_ROW_H)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)

  for (let i = 0; i < rowsToDraw; i++) {
    const item = items[i]
    const rowY = y

    // Vertical column separators
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.2)
    doc.line(COL.size.x, rowY, COL.size.x, rowY + JOB_CARD_ROW_H)
    doc.line(COL.material.x, rowY, COL.material.x, rowY + JOB_CARD_ROW_H)
    if (showPrices) doc.line(COL.unit.x, rowY, COL.unit.x, rowY + JOB_CARD_ROW_H)

    if (item) {
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text(String(item.quantity), COL.qty.x + 1, rowY + 4.6)
      doc.setFont('helvetica', 'normal')
      doc.text(item.size || '', COL.size.x + 1, rowY + 4.6)

      // Description allows 2 lines, or 1 line plus an item note.
      const descLines = doc.splitTextToSize(item.description, COL.material.w - 3)
      const itemNote = String((item as any).note || '').trim()
      doc.setFontSize(7.8)
      if (itemNote) {
        doc.text(descLines[0] || '', COL.material.x + 1, rowY + 2.9)
      } else if (descLines.length > 1) {
        doc.text(descLines[0], COL.material.x + 1, rowY + 3.2)
        doc.text(descLines[1], COL.material.x + 1, rowY + 5.8)
      } else {
        doc.text(descLines[0] || '', COL.material.x + 1, rowY + 4.6)
      }
      if (itemNote) {
        const noteLines = doc.splitTextToSize(itemNote, COL.material.w - 3)
        doc.setFontSize(5.8)
        doc.setTextColor(70, 70, 70)
        doc.text(noteLines[0] || '', COL.material.x + 1, rowY + 5.4)
        doc.setTextColor(0, 0, 0)
      }
      if (showPrices) {
        doc.setFontSize(7)
        doc.text(formatCurrency(numberValue(item.unit_price)), COL.unit.x + COL.unit.w - 1, rowY + 4.6, { align: 'right' })
      }
    }

    // Horizontal row line
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.15)
    doc.line(xOffset + m, rowY + JOB_CARD_ROW_H, xOffset + m + iW, rowY + JOB_CARD_ROW_H)

    y += JOB_CARD_ROW_H
  }

  // ── BOTTOM SECTION ────────────────────────────────────────
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  // Comments + Totals box
  const bottomY = y
  const totalsX = xOffset + m + iW - 42
  const totalsW = 42

  if (showPrices) {
    const leftX = xOffset + m + 1
    const rightX = xOffset + m + colW + colGap + 1
    const fulfillmentLines = fulfillmentLinesFromNotes(job.notes)

    doc.setFontSize(6.4)
    doc.setFont('helvetica', 'bold')
    doc.text(options.notesContinuation ? 'Comments continued:' : 'Comments:', leftX, bottomY + 5)
    doc.text(
      options.notesContinuation ? 'Notes continued:' : (fulfillmentLines.length ? 'Fulfilment / Notes:' : 'Notes:'),
      rightX,
      bottomY + 5,
    )
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(5.8)
    doc.setTextColor(0, 0, 0)
    if (pricedDescriptionLines.length) doc.text(pricedDescriptionLines, leftX, bottomY + 9)
    if (pricedNoteLines.length) doc.text(pricedNoteLines, rightX, bottomY + 9)
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.2)
    doc.line(xOffset + m + colW + colGap / 2, bottomY, xOffset + m + colW + colGap / 2, bottomY + bottomH)
  } else {
    // Comments label
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.text(options.notesContinuation ? 'Comments continued:' : 'Comments:', xOffset + m + 1, bottomY + 5)

    if (unpricedCommentLines.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(5.8)
      doc.setTextColor(0, 0, 0)
      doc.text(unpricedCommentLines, xOffset + m + 1, bottomY + 8.4)
    }

    // Comment lines (dotted)
    doc.setLineDashPattern([0.5, 0.5], 0)
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.2)
    for (let i = 0; i < 2; i++) {
      const ly = bottomY + 10 + i * 5
      if (!unpricedCommentLines.length) {
        doc.line(xOffset + m + 1, ly, totalsX - 2, ly)
      }
    }
    doc.setLineDashPattern([], 0)
  }

  if (!showPrices) {
    // Vertical separator before totals
    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.3)
    doc.line(totalsX, bottomY, totalsX, bottomY + bottomH)

    const totalRows = [
      { label: 'Total Exclusive', value: formatCurrency(numberValue(job.subtotal)) },
      { label: 'Total VAT', value: formatCurrency(numberValue(job.vat_amount)) },
      { label: 'Grand Total', value: formatCurrency(numberValue(job.total)) },
    ]
    const tRowH = bottomH / 3
    for (let i = 0; i < totalRows.length; i++) {
      const ty = bottomY + i * tRowH
      if (i > 0) {
        doc.line(totalsX, ty, xOffset + m + iW, ty)
      }
      doc.setFontSize(5.5)
      doc.setFont('helvetica', 'bold')
      doc.text(totalRows[i].label, totalsX + 1, ty + tRowH / 2 + 1)
      doc.setFont('helvetica', i === 2 ? 'bold' : 'normal')
      doc.text(totalRows[i].value, xOffset + m + iW - 1, ty + tRowH / 2 + 1, { align: 'right' })
      // Value column
      doc.line(totalsX + 22, bottomY, totalsX + 22, bottomY + bottomH)
    }
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

  const pagePlans = buildJobCardPagePlans(doc, job, _showPrices)
  pagePlans.forEach((plan, idx) => {
    if (idx > 0) doc.addPage('a4', 'landscape')
    const pageJob = withItemChunk(job, plan.items)
    const options = {
      pageNumber: idx + 1,
      totalPages: pagePlans.length,
      itemStart: plan.itemStart,
      itemEnd: plan.itemEnd,
      totalItems: (job.items || []).length,
      showPrices: _showPrices,
      descriptionLines: plan.descriptionLines,
      noteLines: plan.noteLines,
      commentLines: plan.commentLines,
      notesContinuation: plan.notesContinuation,
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

  const job1Plans = buildJobCardPagePlans(doc, job1, false)
  const job2Plans = buildJobCardPagePlans(doc, job2, false)
  const pageCount = Math.max(job1Plans.length, job2Plans.length)

  for (let idx = 0; idx < pageCount; idx++) {
    if (idx > 0) doc.addPage('a4', 'landscape')

    const job1Plan = job1Plans[idx]
    const job2Plan = job2Plans[idx]
    const job1Items = job1Plan?.items || []
    const job2Items = job2Plan?.items || []
    drawSingleJobCard(doc, withItemChunk(job1, job1Items), 0, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: job1Plan?.itemStart || 0,
      itemEnd: job1Plan?.itemEnd || 0,
      totalItems: (job1.items || []).length,
      descriptionLines: job1Plan?.descriptionLines || [],
      noteLines: job1Plan?.noteLines || [],
      commentLines: job1Plan?.commentLines || [],
      notesContinuation: job1Plan?.notesContinuation || false,
    })
    drawSingleJobCard(doc, withItemChunk(job2, job2Items), 148.5, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: job2Plan?.itemStart || 0,
      itemEnd: job2Plan?.itemEnd || 0,
      totalItems: (job2.items || []).length,
      descriptionLines: job2Plan?.descriptionLines || [],
      noteLines: job2Plan?.noteLines || [],
      commentLines: job2Plan?.commentLines || [],
      notesContinuation: job2Plan?.notesContinuation || false,
    })
  }

  return doc
}

type QuoteJobCardPrintInput = {
  quote_number: string
  client_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  client_address?: string | null
  status?: string
  vat_rate?: number
  subtotal?: number
  vat_amount?: number
  total?: number
  notes?: string | null
  valid_until?: string | null
  assigned_worker?: string | null
  order_number?: string | null
  fulfillment_lines?: string[]
  items?: { description: string; quantity: number; unit_price?: number; total?: number; line_total?: number; size?: string | null }[]
  created_at?: string
}

type QuotePagePlan = {
  items: any[]
  noteLines: string[]
  notesContinuation: boolean
  itemStart: number
  itemEnd: number
}

function quoteNotesLines(doc: jsPDF, quote: QuoteJobCardPrintInput, width: number) {
  return wrapPreservedLines(
    doc,
    [(quote.fulfillment_lines || []).join('\n'), quote.notes || ''].filter(Boolean).join('\n'),
    width,
    6.5,
  )
}

function quoteItemsHeight(doc: jsPDF, items: any[], descWidth: number) {
  return items.reduce((height, item) => height + quoteItemRowHeight(doc, item, descWidth), 0)
}

function quoteTextCapacity(doc: jsPDF, items: any[], descWidth: number) {
  const availableBottom = QUOTE_CONTENT_BUDGET - quoteItemsHeight(doc, items, descWidth)
  return Math.max(0, Math.floor((availableBottom - QUOTE_NOTE_TOP_SPACE) / QUOTE_NOTE_LINE_H))
}

function buildQuotePagePlans(doc: jsPDF, quote: QuoteJobCardPrintInput, descWidth: number): QuotePagePlan[] {
  const chunks = chunkQuoteItemsByHeight(doc, quote.items || [], descWidth)
  let itemNumber = 1
  const pages = chunks.map(items => {
    const itemStart = items.length ? itemNumber : 0
    const itemEnd = items.length ? itemNumber + items.length - 1 : 0
    itemNumber = itemEnd + 1
    return { items, noteLines: [], notesContinuation: false, itemStart, itemEnd }
  })

  let remaining = quoteNotesLines(doc, quote, 86)
  let pageIndex = pages.length - 1
  while (remaining.length) {
    let page = pages[pageIndex]
    const capacity = page ? quoteTextCapacity(doc, page.items, descWidth) : 0
    if (!page || capacity === 0 || page.noteLines.length) {
      page = { items: [], noteLines: [], notesContinuation: true, itemStart: 0, itemEnd: 0 }
      pages.push(page)
      pageIndex = pages.length - 1
    }

    const pageCapacity = Math.max(1, quoteTextCapacity(doc, page.items, descWidth))
    page.noteLines = remaining.slice(0, pageCapacity)
    remaining = remaining.slice(pageCapacity)
    if (remaining.length) pageIndex += 1
  }

  return pages
}

function drawSingleQuotePrintCard(doc: jsPDF, quote: QuoteJobCardPrintInput, xOffset: number, options: JobCardPrintOptions = {}) {
  const W = 148
  const H = 210
  const m = 5
  const iW = W - m * 2
  let y = m
  const isLastPage = (options.pageNumber || 1) === (options.totalPages || 1)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.6)
  doc.rect(xOffset + m, m, iW, H - m * 2)

  try {
    doc.setFillColor(255, 255, 255)
    doc.rect(xOffset + m + 1, y + 1, 40, 22, 'F')
    doc.addImage(LOGO_BASE64, 'PNG', xOffset + m + 1, y + 1, 40, 22)
  } catch {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('LA Signs', xOffset + m + 2, y + 12)
  }

  const infoX = xOffset + m + 65
  const infoW = iW - 65
  const orderNumber = quote.order_number || tagValue(quote.notes, 'ORDER_NUMBER')
  const infoRows = [
    { label: 'DATE:', value: formatDate(quote.created_at || new Date().toISOString()) },
    { label: 'Valid Until:', value: formatDate(quote.valid_until) || '' },
    { label: 'Quote No:', value: quote.quote_number || '' },
    { label: orderNumber ? 'Order No:' : 'Status:', value: orderNumber || (quote.status || 'draft').replace('_', ' ').toUpperCase() },
    { label: 'Worker:', value: quote.assigned_worker || '' },
  ]

  let infoY = y + 2
  for (let i = 0; i < infoRows.length; i++) {
    const row = infoRows[i]
    const rowH = 4.5
    if (i === 2) {
      doc.setFillColor(255, 255, 0)
      doc.rect(infoX, infoY, infoW, rowH, 'F')
    }
    doc.setDrawColor(150, 150, 150)
    doc.setLineWidth(0.2)
    doc.rect(infoX, infoY, infoW, rowH)
    const isNumberRow = i === 2
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(isNumberRow ? 6.8 : 6)
    doc.setFont('helvetica', 'bold')
    doc.text(row.label, infoX + 1, infoY + 3)
    doc.setFont('helvetica', isNumberRow ? 'bold' : 'normal')
    doc.setFontSize(isNumberRow ? 7.5 : 6)
    if (row.value) doc.text(String(row.value), infoX + 22, infoY + (isNumberRow ? 3.35 : 3))
    infoY += rowH
  }

  y += 24
  doc.setFillColor(255, 255, 255)
  doc.rect(xOffset + m, y, iW, 5, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('QUOTATION', xOffset + m + 1, y + 3.7)

  if ((options.totalPages || 1) > 1) {
    const itemRange = options.totalItems
      ? 'Items ' + (options.itemStart || 0) + '-' + (options.itemEnd || 0) + ' of ' + options.totalItems
      : ''
    doc.setFontSize(6.5)
    doc.text('Page ' + (options.pageNumber || 1) + ' of ' + (options.totalPages || 1), xOffset + m + iW - 1, y + 3.5, { align: 'right' })
    if (itemRange) {
      doc.setFont('helvetica', 'normal')
      doc.text(itemRange, xOffset + m + iW - 1, y + 7.5, { align: 'right' })
    }
  }

  y += 6
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.4)
  doc.line(xOffset + m, y, xOffset + m + iW, y)
  y += 1

  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Client:', xOffset + m + 1, y + 4)
  doc.setFontSize(7.8)
  doc.text(quote.client_name || '', xOffset + m + 14, y + 4)
  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.line(xOffset + m + 14, y + 5, xOffset + m + iW, y + 5)
  doc.setLineDashPattern([], 0)
  y += 7

  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Tel/Cell:', xOffset + m + 1, y + 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.text(quote.client_phone || '', xOffset + m + 14, y + 4)
  doc.setLineDashPattern([0.5, 0.5], 0)
  doc.line(xOffset + m + 14, y + 5, xOffset + m + 65, y + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('Email:', xOffset + m + 67, y + 4)
  doc.setFont('helvetica', 'normal')
  const emailLines = doc.splitTextToSize(quote.client_email || '', iW - 80)
  doc.text(emailLines[0] || '', xOffset + m + 78, y + 4)
  doc.line(xOffset + m + 78, y + 5, xOffset + m + iW, y + 5)
  doc.setLineDashPattern([], 0)
  y += 7

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('Address:', xOffset + m + 1, y + 4)
  doc.setFont('helvetica', 'normal')
  const addressLines = doc.splitTextToSize(quote.client_address || '', iW - 18)
  doc.text(addressLines[0] || '', xOffset + m + 17, y + 4)
  y += 6

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  const COL = {
    qty: { x: xOffset + m, w: 9 },
    size: { x: xOffset + m + 9, w: 20 },
    desc: { x: xOffset + m + 29, w: 55 },
    unit: { x: xOffset + m + 84, w: 27 },
    total: { x: xOffset + m + 111, w: iW - 111 },
  }

  doc.setFillColor(255, 255, 255)
  doc.setFontSize(6.8)
  doc.setFont('helvetica', 'bold')
  doc.text('Qty', COL.qty.x + 1, y + 5)
  doc.text('Size', COL.size.x + 1, y + 5)
  doc.text('Description', COL.desc.x + 1, y + 5)
  doc.text('Unit', COL.unit.x + 1, y + 5)
  doc.text('Total', COL.total.x + 1, y + 5)

  doc.setLineWidth(0.3)
  doc.line(COL.size.x, y, COL.size.x, y + 8)
  doc.line(COL.desc.x, y, COL.desc.x, y + 8)
  doc.line(COL.unit.x, y, COL.unit.x, y + 8)
  doc.line(COL.total.x, y, COL.total.x, y + 8)
  y += 8
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  const items = quote.items || []
  const plannedNoteLines = options.noteLines
    ?? (isLastPage ? quoteNotesLines(doc, quote, 86) : [])
  const desiredBottomH = Math.max(
    QUOTE_BOTTOM_H,
    QUOTE_NOTE_TOP_SPACE + (plannedNoteLines.length * QUOTE_NOTE_LINE_H),
  )
  const bottomH = Math.min(QUOTE_CONTENT_BUDGET, desiredBottomH)
  const bottomY = H - m - bottomH
  doc.setFont('helvetica', 'normal')

  for (const item of items) {
    const rowY = y
    const descLines = quoteItemDescriptionLines(doc, item, COL.desc.w - 2)
    const rowH = quoteItemRowHeight(doc, item, COL.desc.w - 2)

    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.2)
    doc.line(COL.size.x, rowY, COL.size.x, rowY + rowH)
    doc.line(COL.desc.x, rowY, COL.desc.x, rowY + rowH)
    doc.line(COL.unit.x, rowY, COL.unit.x, rowY + rowH)
    doc.line(COL.total.x, rowY, COL.total.x, rowY + rowH)

    const lineTotal = numberValue(item.line_total || item.total || numberValue(item.quantity) * numberValue(item.unit_price))
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(7.8)
    doc.setFont('helvetica', 'bold')
    doc.text(String(item.quantity || ''), COL.qty.x + 1, rowY + 4.6)
    doc.setFont('helvetica', 'normal')
    doc.text(item.size || '', COL.size.x + 1, rowY + 4.6)
    doc.setFontSize(QUOTE_DESC_FONT_SIZE)
    doc.text(descLines, COL.desc.x + 1, rowY + 3.2)
    doc.setFontSize(7)
    doc.text(formatCurrency(numberValue(item.unit_price)), COL.unit.x + COL.unit.w - 1, rowY + 5, { align: 'right' })
    doc.text(formatCurrency(lineTotal), COL.total.x + COL.total.w - 1, rowY + 5, { align: 'right' })

    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.15)
    doc.line(xOffset + m, rowY + rowH, xOffset + m + iW, rowY + rowH)
    y += rowH
  }

  while (y + QUOTE_MIN_ROW_H < bottomY - 0.1) {
    const rowY = y
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.2)
    doc.line(COL.size.x, rowY, COL.size.x, rowY + QUOTE_MIN_ROW_H)
    doc.line(COL.desc.x, rowY, COL.desc.x, rowY + QUOTE_MIN_ROW_H)
    doc.line(COL.unit.x, rowY, COL.unit.x, rowY + QUOTE_MIN_ROW_H)
    doc.line(COL.total.x, rowY, COL.total.x, rowY + QUOTE_MIN_ROW_H)
    doc.setLineWidth(0.15)
    doc.line(xOffset + m, rowY + QUOTE_MIN_ROW_H, xOffset + m + iW, rowY + QUOTE_MIN_ROW_H)
    y += QUOTE_MIN_ROW_H
  }

  doc.setDrawColor(180, 180, 180)
  doc.setLineWidth(0.2)
  doc.line(COL.size.x, y, COL.size.x, bottomY)
  doc.line(COL.desc.x, y, COL.desc.x, bottomY)
  doc.line(COL.unit.x, y, COL.unit.x, bottomY)
  doc.line(COL.total.x, y, COL.total.x, bottomY)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(xOffset + m, bottomY, xOffset + m + iW, bottomY)

  const totalsX = xOffset + m + iW - 48
  const totalsW = 48

  doc.setFontSize(6.8)
  doc.setFont('helvetica', 'bold')
  doc.text(options.notesContinuation ? 'Notes continued:' : 'Notes:', xOffset + m + 1, bottomY + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  if (plannedNoteLines.length) doc.text(plannedNoteLines, xOffset + m + 1, bottomY + 9)
  else if (!isLastPage) doc.text('Continued on next page', xOffset + m + 1, bottomY + 9)

  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.3)
  doc.line(totalsX, bottomY, totalsX, bottomY + bottomH)
  doc.line(totalsX + 24, bottomY, totalsX + 24, bottomY + bottomH)

  const discount = isLastPage ? quoteDiscountInfo(quote) : null
  const totalRows = isLastPage ? [
    { label: 'N$ (excl)', value: formatCurrency(numberValue(quote.subtotal)) },
    ...(discount ? [{ label: 'Discount ' + discount.percent.toFixed(discount.percent % 1 === 0 ? 0 : 1) + '%', value: '-' + formatCurrency(discount.amount) }] : []),
    { label: String(quote.vat_rate || 15) + '% VAT', value: formatCurrency(numberValue(quote.vat_amount)) },
    { label: 'N$ (Incl)', value: formatCurrency(numberValue(quote.total)) },
  ] : [
    { label: 'N$ (excl)', value: 'Continued' },
    { label: String(quote.vat_rate || 15) + '% VAT', value: '' },
    { label: 'N$ (Incl)', value: '' },
  ]
  const tRowH = bottomH / totalRows.length
  for (let i = 0; i < totalRows.length; i++) {
    const ty = bottomY + i * tRowH
    const isGrandTotal = i === totalRows.length - 1
    if (i > 0) doc.line(totalsX, ty, totalsX + totalsW, ty)
    doc.setFontSize(isGrandTotal ? 7.8 : 6.5)
    doc.setFont('helvetica', 'bold')
    doc.text(totalRows[i].label, totalsX + 1, ty + tRowH / 2 + 1.5)
    doc.setFont('helvetica', isGrandTotal ? 'bold' : 'normal')
    doc.setFontSize(isGrandTotal ? 8.2 : 6.5)
    doc.text(totalRows[i].value, totalsX + totalsW - 1, ty + tRowH / 2 + 1, { align: 'right' })
  }

  y = bottomY + bottomH
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.5)
  doc.line(xOffset + m, y, xOffset + m + iW, y)

  if (xOffset === 0) {
    doc.setDrawColor(150, 150, 150)
    doc.setLineDashPattern([1, 2], 0)
    doc.setLineWidth(0.3)
    doc.line(W, 2, W, H - 2)
    doc.setLineDashPattern([], 0)
  }
}

/**
 * Generate quote as a priced A4 landscape / 2-up A5 layout.
 * If no second quote is supplied, the first quote is duplicated on the right.
 */
export function generateQuoteJobCardPDF(quote: QuoteJobCardPrintInput, secondQuote: QuoteJobCardPrintInput = quote): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const quoteDescWidth = 55 - 2
  const leftPlans = buildQuotePagePlans(doc, quote, quoteDescWidth)
  const rightPlans = buildQuotePagePlans(doc, secondQuote, quoteDescWidth)
  const pageCount = Math.max(leftPlans.length, rightPlans.length)

  for (let idx = 0; idx < pageCount; idx++) {
    if (idx > 0) doc.addPage('a4', 'landscape')
    const leftPlan = leftPlans[idx]
    const rightPlan = rightPlans[idx]
    const leftItems = leftPlan?.items || []
    const rightItems = rightPlan?.items || []
    drawSingleQuotePrintCard(doc, withItemChunk(quote, leftItems), 0, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: leftPlan?.itemStart || 0,
      itemEnd: leftPlan?.itemEnd || 0,
      totalItems: (quote.items || []).length,
      noteLines: leftPlan?.noteLines || [],
      notesContinuation: leftPlan?.notesContinuation || false,
    })
    drawSingleQuotePrintCard(doc, withItemChunk(secondQuote, rightItems), 148.5, {
      pageNumber: idx + 1,
      totalPages: pageCount,
      itemStart: rightPlan?.itemStart || 0,
      itemEnd: rightPlan?.itemEnd || 0,
      totalItems: (secondQuote.items || []).length,
      noteLines: rightPlan?.noteLines || [],
      notesContinuation: rightPlan?.notesContinuation || false,
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
  discount?: number
  notes?: string
  valid_until?: string
  order_number?: string | null
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
  const orderNumber = quote.order_number || tagValue(quote.notes, 'ORDER_NUMBER')
  const details = [
    ['Quote No:', quote.quote_number],
    ...(orderNumber ? [['Order No:', orderNumber]] : []),
    ['Date:', formatDate(quote.created_at)],
    ['Valid Until:', formatDate(quote.valid_until) || '—'],
    ['Status:', quote.status.replace('_', ' ').toUpperCase()],
  ]
  for (const [label, val] of details) {
    const isQuoteNumber = label === 'Quote No:'
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(isQuoteNumber ? 10 : 8)
    doc.text(label, rightX, ry)
    doc.setFont('helvetica', isQuoteNumber ? 'bold' : 'normal')
    doc.setFontSize(isQuoteNumber ? 10 : 8)
    doc.text(val, rightX + 22, ry)
    ry += isQuoteNumber ? 6 : 5
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
  const discount = quoteDiscountInfo(quote)
  const lineSubtotal = quoteLineSubtotal(quote)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  if (discount) {
    doc.text('Subtotal:', tX, y); doc.text(formatCurrency(lineSubtotal), m + iW, y, { align: 'right' }); y += 6
    doc.text('Discount (' + discount.percent.toFixed(discount.percent % 1 === 0 ? 0 : 1) + '%):', tX, y); doc.text('-' + formatCurrency(discount.amount), m + iW, y, { align: 'right' }); y += 6
  }
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
