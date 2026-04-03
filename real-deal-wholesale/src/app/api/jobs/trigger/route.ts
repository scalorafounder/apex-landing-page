import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const maxDuration = 300

type LogEntry = { t: number; msg: string }

async function pushLog(supabase: any, jobId: string, current: LogEntry[], msg: string): Promise<LogEntry[]> {
  const next = [...current, { t: Date.now(), msg }]
  await supabase.from('jobs').update({ progress_log: next }).eq('id', jobId)
  return next
}

export async function POST(req: NextRequest) {
  const { jobId, zip, count, leadTypes, propertyType, contactReq, ghlPush } = await req.json()

  if (!jobId || !zip || !count) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  await supabase.from('jobs').update({
    status:       'scraping',
    progress_log: [{ t: Date.now(), msg: `Looking up zip code ${zip}...` }],
  }).eq('id', jobId)

  waitUntil(runScraperJob(
    jobId, zip, count,
    leadTypes    ?? ['nod', 'lis_pendens', 'nts'],
    propertyType ?? 'all',
    contactReq   ?? 'any',
    ghlPush      ?? false,
    supabase
  ))

  return NextResponse.json({ ok: true })
}

async function runScraperJob(
  jobId:        string,
  zip:          string,
  count:        number,
  leadTypes:    string[],
  propertyType: string,
  contactReq:   string,
  ghlPush:      boolean,
  supabase:     any,
) {
  const SCRAPER_URL = process.env.SCRAPER_URL || 'https://cralluxs-mac-mini.taileb7047.ts.net'

  let log: LogEntry[] = [{ t: Date.now(), msg: `Looking up zip code ${zip}...` }]

  try {
    // ── Log: connecting ──
    log = await pushLog(supabase, jobId, log, 'Connecting to county records portal...')

    const params = new URLSearchParams({
      zip,
      count:         String(count),
      lead_types:    leadTypes.join(','),
      property_type: propertyType,
      contact_req:   contactReq,
    })

    log = await pushLog(supabase, jobId, log, 'Scraping pre-foreclosure filings...')

    // Estimate ~90s for scraping to finish; flip status to 'tracing' mid-run
    const midTimer = setTimeout(async () => {
      await supabase.from('jobs').update({ status: 'tracing' }).eq('id', jobId)
      await pushLog(supabase, jobId, log, 'Records collected — running skip trace...')
    }, 90_000)

    // ── Single call: scrape + skip-trace (no double-scrape) ──
    const enrichRes = await fetch(`${SCRAPER_URL}/leads/enrich?${params}`, {
      signal: AbortSignal.timeout(290_000),
    })

    clearTimeout(midTimer)

    if (!enrichRes.ok) {
      const err = await enrichRes.json().catch(() => ({}))
      throw new Error((err as any).error || `Scraper HTTP ${enrichRes.status}`)
    }

    const enrichData: any = await enrichRes.json()
    const county    = enrichData.county?.county_name || ''
    const state     = enrichData.county?.state_abbr  || ''
    const leadCount = enrichData.lead_count || 0

    log = await pushLog(supabase, jobId, log, `Found ${leadCount} lead${leadCount !== 1 ? 's' : ''} — skip tracing contacts...`)
    await supabase.from('jobs').update({ status: 'tracing', county, state, lead_count: leadCount }).eq('id', jobId)

    if (!enrichData.tracerfy_download) {
      throw new Error('Skip trace completed but no download URL returned')
    }

    log = await pushLog(supabase, jobId, log, `✓ ${leadCount} leads skip-traced and ready`)

    await supabase.from('jobs').update({
      status:            'complete',
      lead_count:        leadCount,
      county,
      state,
      tracerfy_download: enrichData.tracerfy_download,
      completed_at:      new Date().toISOString(),
      progress_log:      log,
    }).eq('id', jobId)

  } catch (err: any) {
    console.error('Job failed:', jobId, err.message)
    await pushLog(supabase, jobId, log, `Error: ${err.message}`)
    await supabase.from('jobs').update({
      status:        'failed',
      error_message: err.message,
    }).eq('id', jobId)
  }
}
