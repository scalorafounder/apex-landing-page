import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const { jobId, zip, count } = await req.json()

  if (!jobId || !zip || !count) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  // Update job to scraping
  await supabase.from('jobs').update({ status: 'scraping' }).eq('id', jobId)

  // Fire and forget — run the scraper async
  runScraperJob(jobId, zip, count, supabase)

  return NextResponse.json({ ok: true })
}

async function runScraperJob(jobId: string, zip: string, count: number, supabase: any) {
  const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:3001'

  try {
    // Update to scraping
    await supabase.from('jobs').update({ status: 'scraping' }).eq('id', jobId)

    // Call scraper for raw leads
    const scrapeRes = await fetch(`${SCRAPER_URL}/leads?zip=${zip}&count=${count}`, {
      signal: AbortSignal.timeout(120000) // 2 min timeout
    })

    if (!scrapeRes.ok) {
      const err = await scrapeRes.json()
      throw new Error(err.error || 'Scraper failed')
    }

    const scrapeData = await scrapeRes.json()
    const county = scrapeData.county?.county_name || ''
    const state = scrapeData.county?.state_abbr || ''

    // Update with county info and move to tracing
    await supabase.from('jobs').update({
      status: 'tracing',
      county,
      state,
      lead_count: scrapeData.lead_count,
    }).eq('id', jobId)

    // Call enrich endpoint for skip tracing
    const enrichRes = await fetch(`${SCRAPER_URL}/leads/enrich?zip=${zip}&count=${count}`, {
      signal: AbortSignal.timeout(300000) // 5 min timeout for Tracerfy
    })

    if (!enrichRes.ok) {
      const err = await enrichRes.json()
      throw new Error(err.error || 'Skip tracing failed')
    }

    const enrichData = await enrichRes.json()

    // Mark complete
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
