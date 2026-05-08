// Health-tracking helper for every external API the app depends on.
// Wrap every call to Tracerfy / HasData / Google Maps / 2Captcha / etc. with
// `recordApiCall(...)` after the fetch completes. The coverage page reads
// from `api_health` to render live status.
//
// Also fires an email alert (debounced — at most one per 6 hours per API)
// when an API starts failing or runs out of credits, IF RESEND_API_KEY is set.

import { createServerSupabaseClient } from './supabase-server'

export type ApiHealthStatus =
  | 'ok'
  | 'error'
  | 'unauthorized'
  | 'rate_limited'
  | 'no_credits'
  | 'never_called'

const ALERT_DEBOUNCE_HOURS = 6

function classify(statusCode: number, errorBody?: string | null): ApiHealthStatus {
  if (statusCode >= 200 && statusCode < 300) return 'ok'
  if (statusCode === 401 || statusCode === 403) return 'unauthorized'
  if (statusCode === 429) return 'rate_limited'
  if (statusCode === 402) return 'no_credits'
  if (errorBody && /credit|quota|limit|exhausted/i.test(errorBody)) return 'no_credits'
  return 'error'
}

/**
 * Record one API call. Call this after every external HTTP request.
 *
 * @param apiName one of: 'tracerfy' | 'hasdata_zillow' | 'google_maps' | 'twocaptcha' | 'resend'
 * @param statusCode HTTP status from the upstream call
 * @param responseTimeMs measured client-side
 * @param errorBody optional snippet of the response body when statusCode != 2xx
 * @param creditsRemaining if the API exposes a credit counter, pass it (else null)
 */
export async function recordApiCall(
  apiName: string,
  statusCode: number,
  responseTimeMs: number,
  errorBody?: string | null,
  creditsRemaining?: number | null
): Promise<void> {
  const status = classify(statusCode, errorBody)
  const sb = createServerSupabaseClient()

  // Reset daily counters if it's a new day
  const { data: existing } = await sb
    .from('api_health')
    .select('total_calls_today, total_failures_today, reset_date, alert_sent_at, last_status')
    .eq('api_name', apiName)
    .maybeSingle()

  const today = new Date().toISOString().slice(0, 10)
  let calls = (existing?.total_calls_today ?? 0) + 1
  let failures = (existing?.total_failures_today ?? 0) + (status === 'ok' ? 0 : 1)
  if (existing && existing.reset_date !== today) {
    calls = 1
    failures = status === 'ok' ? 0 : 1
  }

  await sb.from('api_health').upsert(
    {
      api_name: apiName,
      last_status_code: statusCode,
      last_status: status,
      last_response_time_ms: responseTimeMs,
      last_error_message: status === 'ok' ? null : errorBody?.slice(0, 1000) ?? null,
      last_called_at: new Date().toISOString(),
      credits_remaining: creditsRemaining ?? null,
      total_calls_today: calls,
      total_failures_today: failures,
      reset_date: today,
    },
    { onConflict: 'api_name' }
  )

  // Fire an alert if status flipped to a problem AND we haven't alerted recently.
  if (status !== 'ok' && status !== 'never_called') {
    const lastAlert = existing?.alert_sent_at ? new Date(existing.alert_sent_at) : null
    const hoursSinceAlert = lastAlert
      ? (Date.now() - lastAlert.getTime()) / (1000 * 60 * 60)
      : Infinity
    if (hoursSinceAlert >= ALERT_DEBOUNCE_HOURS) {
      const sent = await sendApiAlertEmail(apiName, status, statusCode, errorBody ?? '')
      if (sent) {
        await sb
          .from('api_health')
          .update({ alert_sent_at: new Date().toISOString() })
          .eq('api_name', apiName)
      }
    }
  }
}

/**
 * Send an email alert via Resend. No-op (returns false) if RESEND_API_KEY isn't set.
 * The user can drop a Resend key into .env.local later to enable.
 */
async function sendApiAlertEmail(
  apiName: string,
  status: ApiHealthStatus,
  statusCode: number,
  errorBody: string
): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  const to = process.env.ALERT_EMAIL_TO
  if (!resendKey || !to) {
    // Log to the server console so it's not silent
    console.warn(`[api-health] would email alert: ${apiName} → ${status} (${statusCode}). Set RESEND_API_KEY to enable.`)
    return false
  }

  const subject = status === 'no_credits'
    ? `🟡 ${apiName} out of credits`
    : status === 'unauthorized'
    ? `🔴 ${apiName} auth failed (key may be expired)`
    : status === 'rate_limited'
    ? `🟡 ${apiName} rate-limited`
    : `🔴 ${apiName} failing (HTTP ${statusCode})`

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'apex-alerts@stscale.dev',
        to,
        subject,
        text: [
          `API: ${apiName}`,
          `Status: ${status}`,
          `HTTP code: ${statusCode}`,
          `Time: ${new Date().toISOString()}`,
          '',
          `Response body (truncated):`,
          errorBody.slice(0, 1500),
          '',
          `Coverage page: https://your-app.vercel.app/coverage`,
        ].join('\n'),
      }),
    })
    return resp.ok
  } catch (err) {
    console.error('[api-health] resend send failed:', err)
    return false
  }
}

/**
 * Server-side Google Maps health ping via Geocode API.
 * Called from the coverage page so the embed iframe (browser-side) doesn't
 * count as "never called" — the Maps Embed key is different from the Geocode key.
 */
export async function pingGoogleMapsHealth(): Promise<void> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent('100 Selwyn Rd Newton MA')}&key=${key}`
  const start = Date.now()
  try {
    const resp = await fetch(url)
    const dur = Date.now() - start
    const json = await resp.json().catch(() => ({}))
    let effectiveStatus = resp.status
    let errorMessage: string | null = null
    if (json?.status && json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
      effectiveStatus = json.status === 'OVER_QUERY_LIMIT' ? 429 : json.status === 'REQUEST_DENIED' ? 403 : 500
      errorMessage = json.error_message ?? json.status
    }
    await recordApiCall('google_maps', effectiveStatus, dur, errorMessage)
  } catch (err: any) {
    await recordApiCall('google_maps', 500, 0, String(err))
  }
}

/** Read all api_health rows for the coverage tab. */
export async function getApiHealth(): Promise<
  Array<{
    api_name: string
    last_status: ApiHealthStatus
    last_status_code: number | null
    last_response_time_ms: number | null
    last_error_message: string | null
    last_called_at: string | null
    credits_remaining: number | null
    total_calls_today: number
    total_failures_today: number
  }>
> {
  const sb = createServerSupabaseClient()
  const { data } = await sb
    .from('api_health')
    .select('*')
    .order('api_name')
  return (data ?? []) as any
}
