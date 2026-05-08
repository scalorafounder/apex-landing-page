import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Called by the scanner after a run that produced new leads.
// Body: { leads: Array<{ address, city, zip, signal_type, filing_date, lead_id }>, scanner: string }
export async function POST(req: Request) {
  const secret = req.headers.get('x-apex-secret')
  if (secret !== process.env.SCRAPER_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const leads: Array<{ address: string; city: string; zip: string; signal_type: string; filing_date: string; lead_id: string }> = body.leads ?? []
  const scanner: string = body.scanner ?? 'scanner'

  if (leads.length === 0) return NextResponse.json({ sent: 0 })

  const sb = createServerSupabaseClient()
  const { data: settings } = await sb
    .from('notification_settings')
    .select('*')
    .eq('enabled', true)

  const recipients = settings ?? []
  if (recipients.length === 0) return NextResponse.json({ sent: 0, note: 'no recipients configured' })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const subject = `APEX: ${leads.length} new lead${leads.length > 1 ? 's' : ''} from ${scanner}`
  const body_text = leads.map(l =>
    `• ${l.address}, ${l.city} ${l.zip} — ${l.signal_type.replace(/_/g, ' ')} filed ${l.filing_date}\n  ${appUrl}/leads/${l.lead_id}`
  ).join('\n\n')

  let sent = 0
  const errors: string[] = []

  for (const r of recipients) {
    try {
      if (r.type === 'email') {
        await sendEmail(r.destination, subject, body_text)
        sent++
      } else if (r.type === 'sms') {
        await sendSms(r.destination, `${subject}\n\n${body_text}`)
        sent++
      }
    } catch (err: any) {
      errors.push(`${r.destination}: ${err.message}`)
    }
  }

  return NextResponse.json({ sent, errors: errors.length ? errors : undefined })
}

async function sendEmail(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [to],
      subject,
      text,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error: ${err}`)
  }
}

async function sendSms(to: string, message: string) {
  const sid  = process.env.TWILIO_ACCOUNT_SID
  const auth = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !auth || !from) throw new Error('Twilio env vars not set')

  const body = new URLSearchParams({ To: to, From: from, Body: message.slice(0, 1600) })
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Twilio error: ${err}`)
  }
}
