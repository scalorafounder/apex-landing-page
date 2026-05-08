// GET /api/maps/health-ping
// Pings Google Maps Geocode API as a lightweight health check.
// Called manually from the Coverage page (or scheduled) to verify the key
// is still active and within quota. Records health to api_health table.

import { NextResponse } from 'next/server'
import { recordApiCall } from '@/lib/api-health'

export async function GET() {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) {
    return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY not configured' }, { status: 500 })
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('100 Selwyn Rd Newton MA')}&key=${key}`

  const start = Date.now()
  const resp = await fetch(url)
  const dur = Date.now() - start
  const json = await resp.json().catch(() => ({}))

  // Google returns 200 OK even when key is invalid; check `status` field
  let effectiveStatus = resp.status
  let errorMessage: string | null = null
  if (json?.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    effectiveStatus = json.status === 'OVER_QUERY_LIMIT' ? 429
      : json.status === 'REQUEST_DENIED' ? 403
      : 500
    errorMessage = json.error_message ?? json.status
  }
  await recordApiCall('google_maps', effectiveStatus, dur, errorMessage)

  return NextResponse.json({
    status: effectiveStatus,
    google_status: json?.status ?? null,
    error_message: errorMessage,
    duration_ms: dur,
  })
}
