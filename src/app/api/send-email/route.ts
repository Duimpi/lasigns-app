import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const emailFrom = process.env.RESEND_FROM_EMAIL || 'LA Signs <finance@lasigns.com.na>'
const emailTo = process.env.RESEND_TO_EMAIL || 'finance@lasigns.com.na'

export async function POST(req: NextRequest) {
  try {
    const { pdfBase64, fileName, subject, clientName, type } = await req.json()

    const body = type === 'quote'
      ? `A new quotation has been created for ${clientName}. Please find the quote attached.`
      : type === 'retail'
      ? `A retail job has been created for ${clientName}. Please find the job card attached.`
      : `A job card has been created for ${clientName}. Please find the job card attached.`

    const { data, error } = await resend.emails.send({
      from: emailFrom,
      to: [emailTo],
      subject: subject,
      text: body,
      attachments: [
        {
          filename: fileName,
          content: pdfBase64,
        },
      ],
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
