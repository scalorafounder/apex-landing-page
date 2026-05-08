import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const APP_URL = () => (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')

export async function POST(req: Request) {
  try {
    const { type, destination, label } = await req.json()
    if (!destination) return NextResponse.json({ error: 'destination required' }, { status: 400 })

    const sb = createServerSupabaseClient()
    const { data, error } = await sb
      .from('notification_settings')
      .insert({ type: 'email', destination, label: label || null })
      .select()
      .single()
    if (error) throw error

    sendWelcome(destination).catch(() => {})

    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function sendWelcome(to: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const appUrl = APP_URL()
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'onboarding@resend.dev',
      to: [to],
      subject: "You're now receiving APEX lead alerts",
      text: `You've been added as an active recipient on APEX.\n\nYou'll receive an email after each scanner run listing every new distressed property lead found — address, signal type, filing date, and a direct link.\n\nView your leads: ${appUrl}/inbox\n\nTo stop receiving alerts, log in and remove this email from Settings.`,
    }),
  })
}
