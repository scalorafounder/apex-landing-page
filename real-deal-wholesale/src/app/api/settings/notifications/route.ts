import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  try {
    const { type, destination, label } = await req.json()
    if (!type || !destination) return NextResponse.json({ error: 'type and destination required' }, { status: 400 })
    if (!['email', 'sms'].includes(type)) return NextResponse.json({ error: 'type must be email or sms' }, { status: 400 })

    const sb = createServerSupabaseClient()
    const { data, error } = await sb
      .from('notification_settings')
      .insert({ type, destination, label: label || null })
      .select()
      .single()
    if (error) throw error

    // Fire-and-forget welcome message — don't block the response
    sendWelcome(type, destination).catch(() => {})

    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function sendWelcome(type: 'email' | 'sms', destination: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (type === 'email') {
    const key = process.env.RESEND_API_KEY
    if (!key) return
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [destination],
        subject: 'You\'re now receiving APEX lead alerts',
        text: `You've been added as an active recipient on APEX.\n\nYou'll receive an email here each time new distressed property leads are scraped — including the address, signal type, and a direct link to the lead.\n\nView your leads: ${appUrl}/inbox\n\nTo stop receiving alerts, log in and remove this email from Settings.`,
      }),
    })
  } else {
    const sid  = process.env.TWILIO_ACCOUNT_SID
    const auth = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_FROM_NUMBER
    if (!sid || !auth || !from) return
    const body = new URLSearchParams({
      To: destination,
      From: from,
      Body: `You've been added to APEX lead alerts. You'll get a text whenever new distressed property leads are scraped. Reply STOP to unsubscribe.`,
    })
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })
  }
}
