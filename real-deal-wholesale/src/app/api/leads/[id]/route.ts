import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const ALLOWED_STATUSES = ['new', 'queued', 'contacted', 'in_progress', 'deal', 'dead']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = createServerSupabaseClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, any> = { updated_at: new Date().toISOString() }

  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    patch.status = body.status
  }
  if (typeof body.notes === 'string') {
    patch.notes = body.notes.slice(0, 5000)
  }
  if (typeof body.assigned_to === 'string' || body.assigned_to === null) {
    patch.assigned_to = body.assigned_to
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { error } = await sb.from('leads').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
