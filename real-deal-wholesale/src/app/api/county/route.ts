import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get('zip')

  if (!zip || zip.length !== 5) {
    return NextResponse.json({ error: 'Invalid zip code' }, { status: 400 })
  }

  try {
    // Step 1: zip → lat/lng via zippopotam.us
    const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(8000),
    })

    if (!zipRes.ok) {
      return NextResponse.json({ error: 'Zip code not found' }, { status: 404 })
    }

    const zipData = await zipRes.json()
    const place   = zipData.places?.[0]

    if (!place) {
      return NextResponse.json({ error: 'No location data for this zip' }, { status: 404 })
    }

    const lat        = parseFloat(place.latitude)
    const lon        = parseFloat(place.longitude)
    const city       = place['place name'] || ''
    const state_abbr = place['state abbreviation'] || ''
    const state_name = place['state'] || ''

    // Step 2: lat/lng → county via FCC Census API
    const fccRes = await fetch(
      `https://geo.fcc.gov/api/census/block/find?latitude=${lat}&longitude=${lon}&format=json`,
      { signal: AbortSignal.timeout(8000) }
    )

    if (!fccRes.ok) {
      // Return partial data if FCC fails
      return NextResponse.json({
        county_name: city,
        state_name,
        state_abbr,
        fips: null,
        city,
        lat,
        lon,
      })
    }

    const fccData   = await fccRes.json()
    const county_name = fccData.County?.name || city
    const fips      = fccData.County?.FIPS || null

    return NextResponse.json({
      county_name,
      state_name,
      state_abbr,
      fips,
      city,
      lat,
      lon,
    })

  } catch (err: any) {
    return NextResponse.json({ error: 'County lookup failed: ' + err.message }, { status: 500 })
  }
}
