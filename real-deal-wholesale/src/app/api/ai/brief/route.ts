import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 45

// Routes through the apex-scraper → OpenClaw Commander (haiku-4-5 + soul files)
export async function POST(req: NextRequest) {
  try {
    const { county, state, leadTypes, count, propertyType, contactReq } = await req.json()

    if (!county || !state || !leadTypes || !count) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const SCRAPER_URL = process.env.SCRAPER_URL || 'https://cralluxs-mac-mini.taileb7047.ts.net'

    const res = await fetch(`${SCRAPER_URL}/ai/brief`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ county, state, leadTypes, count, propertyType, contactReq }),
      signal:  AbortSignal.timeout(40000),
    })

    if (!res.ok) throw new Error('Scraper /ai/brief returned ' + res.status)

    const data = await res.json()
    return NextResponse.json({ message: data.message })

  } catch (err: any) {
    console.error('AI brief error:', err?.message)
    return NextResponse.json({
      message: `On it. I'm pulling your leads right now and every contact will be skip-traced before delivery. Come back in about 2 hours — your list will be in the sidebar.`,
    })
  }
}
