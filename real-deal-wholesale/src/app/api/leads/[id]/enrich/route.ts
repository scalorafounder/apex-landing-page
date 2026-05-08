// POST /api/leads/[id]/enrich
// Skip-trace the property's owner via Tracerfy (or PropStream) and persist
// the result to the `contacts` table. Returns phones/emails/aliases.
//
// Required env: TRACERFY_API_KEY  (or PROPSTREAM_API_KEY as fallback)
//
// The handler is provider-agnostic — point TRACERFY_BASE_URL at any
// skip-trace API that returns { phones: string[], emails: string[], ... }.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { recordApiCall } from '@/lib/api-health'

interface TracerfyResult {
  phones: Array<{ number: string; type?: string; confidence?: number }>
  emails: Array<{ address: string; confidence?: number }>
  alternateAddresses?: Array<{ street: string; city: string; state: string; zip?: string }>
  raw?: unknown
}

async function callTracerfy(input: {
  ownerName: string
  street: string
  city: string
  state: string
  zip?: string
}): Promise<TracerfyResult> {
  const jwt = process.env.TRACERFY_API_KEY
  if (!jwt) {
    throw new Error('TRACERFY_API_KEY not configured')
  }
  const baseUrl = process.env.TRACERFY_BASE_URL ?? 'https://api.tracerfy.com/v1'

  const startedAt = Date.now()
  const resp = await fetch(`${baseUrl}/skip-trace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      name: input.ownerName,
      address: input.street,
      city: input.city,
      state: input.state,
      zip: input.zip,
    }),
  })
  const durationMs = Date.now() - startedAt
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    await recordApiCall('tracerfy', resp.status, durationMs, txt.slice(0, 500))
    throw new Error(`Tracerfy ${resp.status}: ${txt.slice(0, 300)}`)
  }
  const json = await resp.json()
  await recordApiCall('tracerfy', 200, durationMs, null, json?.credits_remaining ?? null)
  // Normalize provider response shape — adjust if real Tracerfy response differs
  return {
    phones: (json.phones ?? []).map((p: any) => ({
      number: p.number ?? p.phone,
      type: p.type ?? p.line_type,
      confidence: p.confidence,
    })),
    emails: (json.emails ?? []).map((e: any) => ({
      address: e.address ?? e.email,
      confidence: e.confidence,
    })),
    alternateAddresses: json.alternate_addresses ?? json.addresses ?? [],
    raw: json,
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const sb = createServerSupabaseClient()

  // 1. Look up the lead + its property
  const { data: lead, error: leadErr } = await sb
    .from('leads')
    .select(`
      id, property_id,
      property:properties (
        id, owner_name, site_address, full_address,
        city, owner_state, zip, owner_zip
      )
    `)
    .eq('id', leadId)
    .maybeSingle()

  if (leadErr || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }
  const property: any = Array.isArray((lead as any).property)
    ? (lead as any).property[0]
    : (lead as any).property
  if (!property?.owner_name) {
    return NextResponse.json({ error: 'Property has no owner_name' }, { status: 400 })
  }

  // 2. Skip rerun if we have a fresh trace (<7 days old)
  const { data: existing } = await sb
    .from('contacts')
    .select('*')
    .eq('property_id', property.id)
    .maybeSingle()
  if (existing?.traced_at) {
    const ageMs = Date.now() - new Date(existing.traced_at).getTime()
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays < 7) {
      return NextResponse.json({
        contact: existing,
        cached: true,
        note: `Skip-trace cached (${ageDays.toFixed(1)}d old). Force refresh by passing ?force=1.`,
      })
    }
  }

  // 3. Call Tracerfy
  let result: TracerfyResult
  try {
    result = await callTracerfy({
      ownerName: property.owner_name,
      street: property.site_address ?? property.full_address ?? '',
      city: property.city ?? '',
      state: property.owner_state ?? 'MA',
      zip: property.zip ?? property.owner_zip ?? undefined,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Tracerfy call failed' }, { status: 502 })
  }

  // 4. Upsert into contacts
  const phonePrimary = result.phones[0]?.number ?? null
  const phoneSecondary = result.phones[1]?.number ?? null
  const email = result.emails[0]?.address ?? null

  const { data: contact, error: upsertErr } = await sb
    .from('contacts')
    .upsert(
      {
        property_id: property.id,
        owner_name: property.owner_name,
        phone_primary: phonePrimary,
        phone_secondary: phoneSecondary,
        email,
        alternate_addresses: result.alternateAddresses ?? [],
        traced_at: new Date().toISOString(),
        tracer_source: 'tracerfy',
      },
      { onConflict: 'property_id' }
    )
    .select()
    .single()

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    contact,
    raw: result.raw,
    cached: false,
  })
}
