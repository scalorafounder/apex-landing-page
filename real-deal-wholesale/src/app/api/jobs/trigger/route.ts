import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const maxDuration = 800

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

    // ── Start async job on Mac Mini (returns immediately with jobId) ──
    const startRes = await fetch(`${SCRAPER_URL}/enrich/start?${params}`, {
      signal: AbortSignal.timeout(15_000),
    })
    if (!startRes.ok) {
      const err = await startRes.json().catch(() => ({}))
      throw new Error((err as any).error || `Scraper HTTP ${startRes.status}`)
    }
    const { jobId: scraperJobId } = await startRes.json()
    log = await pushLog(supabase, jobId, log, `Job started (id: ${scraperJobId}) — scraping...`)

    // ── Poll for completion (max 12 min, every 20s) ──
    let enrichData: any = null
    let county = '', state = '', leadCount = 0
    for (let attempt = 0; attempt < 36; attempt++) {
      await new Promise(r => setTimeout(r, 20_000))
      const pollRes = await fetch(`${SCRAPER_URL}/enrich/status/${scraperJobId}`, {
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null)
      if (!pollRes || !pollRes.ok) continue
      const job: any = await pollRes.json()

      // Update Supabase status to reflect scraper progress
      if (job.status === 'tracing' && job.county) {
        county = job.county.county_name || ''
        state  = job.county.state_abbr  || ''
        await supabase.from('jobs').update({ status: 'tracing', county, state }).eq('id', jobId)
        log = await pushLog(supabase, jobId, log, 'Records collected — running skip trace...')
      }
      if (job.status === 'complete' || job.status === 'failed') {
        enrichData = job
        break
      }
    }

    if (!enrichData) throw new Error('Scraper job timed out after 12 minutes')
    if (enrichData.status === 'failed') throw new Error(enrichData.error || 'Scraper job failed')

    county    = enrichData.county?.county_name || county
    state     = enrichData.county?.state_abbr  || state
    leadCount = enrichData.lead_count || 0

    log = await pushLog(supabase, jobId, log, `Found ${leadCount} lead${leadCount !== 1 ? 's' : ''} — skip tracing contacts...`)
    await supabase.from('jobs').update({ status: 'tracing', county, state, lead_count: leadCount }).eq('id', jobId)

    if (!enrichData.tracerfy_download) {
      throw new Error('Skip trace completed but no download URL returned — ' + (enrichData.message || 'no addresses found'))
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

    // Refund credits for leads not delivered (charged upfront for requested count)
    const { data: jobRow } = await supabase.from('jobs').select('credits_used, user_id').eq('id', jobId).single()
    if (jobRow && jobRow.credits_used > leadCount) {
      const refund = jobRow.credits_used - leadCount
      const { data: profile } = await supabase.from('profiles').select('credits').eq('id', jobRow.user_id).single()
      if (profile) {
        await supabase.from('profiles').update({ credits: profile.credits + refund }).eq('id', jobRow.user_id)
        console.log(`Refunded ${refund} credits to user ${jobRow.user_id} (requested ${jobRow.credits_used}, delivered ${leadCount})`)
      }
    }

  } catch (err: any) {
    console.error('Job failed:', jobId, err.message)
    await pushLog(supabase, jobId, log, `Error: ${err.message}`)
    await supabase.from('jobs').update({
      status:        'failed',
      error_message: err.message,
    }).eq('id', jobId)
  }
}
