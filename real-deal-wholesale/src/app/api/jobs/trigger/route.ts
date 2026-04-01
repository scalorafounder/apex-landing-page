import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createAdminSupabaseClient } from '@/lib/supabase-server'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const { jobId, zip, count, leadTypes, propertyType, contactReq, ghlPush } = await req.json()

  if (!jobId || !zip || !count) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 })
  }

  const supabase = createAdminSupabaseClient()

  await supabase.from('jobs').update({ status: 'scraping' }).eq('id', jobId)

  waitUntil(runScraperJob(jobId, zip, count, leadTypes ?? ['nod','lis_pendens','nts'], propertyType ?? 'all', contactReq ?? 'any', ghlPush ?? false, supabase))

  return NextResponse.json({ ok: true })
}

async function runScraperJob(
  jobId: string,
  zip: string,
  count: number,
  leadTypes: string[],
  propertyType: string,
  contactReq: string,
  ghlPush: boolean,
  supabase: any
) {
  const SCRAPER_URL = process.env.SCRAPER_URL || 'http://localhost:3001'

  try {
    // Build query string with new params (scraper will use what it understands)
    const params = new URLSearchParams({
      zip,
      count: String(count),
      lead_types: leadTypes.join(','),
      property_type: propertyType,
      contact_req: contactReq,
    })

    const scrapeRes = await fetch(`${SCRAPER_URL}/leads?${params}`, {
      signal: AbortSignal.timeout(120000),
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

    const enrichParams = new URLSearchParams({
      zip,
      count: String(count),
      lead_types: leadTypes.join(','),
      property_type: propertyType,
      contact_req: contactReq,
    })

    const enrichRes = await fetch(`${SCRAPER_URL}/leads/enrich?${enrichParams}`, {
      signal: AbortSignal.timeout(300000),
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
