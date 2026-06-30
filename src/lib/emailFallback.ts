const FINANCE_EMAIL = 'finance@lasigns.com.na'

interface FinanceDraftOptions {
  doc: { save: (filename: string) => void }
  fileName: string
  subject: string
  clientName?: string
  type: 'quote' | 'retail' | 'jobcard'
}

function bodyFor(type: FinanceDraftOptions['type'], clientName?: string) {
  const name = clientName || 'Client'
  if (type === 'quote') {
    return `Hi Finance,\n\nPlease see the downloaded quote PDF for ${name}.\n\nAttach the PDF file before sending.\n\nThank you.`
  }
  if (type === 'retail') {
    return `Hi Finance,\n\nPlease see the downloaded retail job PDF for ${name}.\n\nAttach the PDF file before sending.\n\nThank you.`
  }
  return `Hi Finance,\n\nPlease see the downloaded job card PDF for ${name}.\n\nAttach the PDF file before sending.\n\nThank you.`
}

export function openFinanceEmailDraft({ doc, fileName, subject, clientName, type }: FinanceDraftOptions) {
  doc.save(fileName)

  const body = bodyFor(type, clientName)
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(FINANCE_EMAIL)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const mailtoUrl = `mailto:${FINANCE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  const draftWindow = window.open(gmailUrl, '_blank', 'noopener,noreferrer')

  if (!draftWindow) {
    window.location.href = mailtoUrl
  }
}
