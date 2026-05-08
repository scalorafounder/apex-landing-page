import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = createServerSupabaseClient()
  const { error } = await sb.from('notification_settings').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { enabled } = await req.json()
  const sb = createServerSupabaseClient()
  const { error } = await sb.from('notification_settings').update({ enabled }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
