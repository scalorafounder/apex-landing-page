import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

// Allow up to 5 minutes for the full scrape + skip-trace pipeline
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { jobId, zip, count } = await req.json()

  if (!jobId || !zip || !count) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Immediately move to scraping so the UI updates
  await supabase.from('jobs').update({ status: 'scraping' }).eq('id', jobId)

  // waitUntil keeps the Vercel function alive until the job finishes
  waitUntil(runScraperJob(jobId, zip, count, supabase))

  return NextResponse.json({ ok: true })
}

async function runScraperJob(jobId: string, zip: string, count: number, supabase: any) {
  const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:3001'

  try {
    // Call scraper for raw leads
    const scrapeRes = await fetch(`${SCRAPER_URL}/leads?zip=${zip}&count=${count}`, {
      signal: AbortSignal.timeout(120000), // 2 min
    })

    if (!scrapeRes.ok) {
      const err = await scrapeRes.json()
      throw new Error(err.error || 'Scraper failed')
    }

    const scrapeData = await scrapeRes.json()
    const county = scrapeData.county?.county_name || ''
    const state  = scrapeData.county?.state_abbr  || ''

    await supabase.from('jobs').update({
      status: 'tracing',
      county,
      state,
      lead_count: scrapeData.lead_count,
    }).eq('id', jobId)

    // Skip trace + DNC scrub via enrich endpoint
    const enrichRes = await fetch(`${SCRAPER_URL}/leads/enrich?zip=${zip}&count=${count}`, {
      signal: AbortSignal.timeout(300000), // 5 min
    })

    if (!enrichRes.ok) {
      const err = await enrichRes.json()
      throw new Error(err.error || 'Skip tracing failed')
    }

    const enrichData = await enrichRes.json()

    await supabase.from('jobs').update({
      status: 'complete',
      lead_count: enrichData.lead_count,
      tracerfy_download: enrichData.tracerfy_download,
      completed_at: new Date().toISOString(),
    }).eq('id', jobId)

  } catch (err: any) {
    console.error('Job failed:', jobId, err.message)
    await supabase.from('jobs').update({
      status: 'failed',
      error_message: err.message,
    }).eq('id', jobId)
  }
}
