// POST /api/leads/[id]/zillow
// Pull Zillow property intel via HasData's Zillow Property API and persist
// to `property_intel`. Returns Zestimate, rent estimate, recent comps, etc.
//
// Required env: HASDATA_API_KEY
//
// HasData endpoint:
//   GET https://api.hasdata.com/scrape/zillow/property?url=<zillow-listing-url>
//   Header: x-api-key: <key>
//
// Two cases for resolving the Zillow URL:
//   (a) We've already pulled this property before → reuse property_intel.zillow_url
//   (b) First-time lookup → build Zillow's address-search URL pattern
//         https://www.zillow.com/homes/<slug>_rb/
//       Zillow auto-redirects that to the canonical /homedetails/<slug>/<zpid>_zpid/,
//       and HasData follows the redirect transparently.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { recordApiCall } from '@/lib/api-health'

const HASDATA_BASE = 'https://api.hasdata.com/scrape/zillow/property'

interface HasDataResponse {
  requestMetadata?: { id?: string; status?: string }
  property?: {
    id?: number
    url?: string
    image?: string
    status?: string
    yearBuilt?: number
    homeType?: string
    beds?: number
    baths?: number
    area?: { livingArea?: number; lotSize?: number }
    price?: number
    zestimate?: {
      zestimate?: number
      rentZestimate?: number
      zestimateLowPercent?: number
      zestimateHighPercent?: number
      rentZestimateURL?: string
    }
    address?: {
      street?: string; city?: string; state?: string; zipcode?: string;
      county?: string; parentRegion?: string
    }
    geo?: { latitude?: number; longitude?: number }
    description?: string
    parcelData?: { parcelId?: string; parcelNumber?: string }
    listingSubTypes?: {
      forSaleByAgent?: boolean; forSaleByOwner?: boolean;
      foreclosure?: boolean; bankOwned?: boolean;
      pending?: boolean; comingSoon?: boolean;
      forAuction?: boolean; zillowOwned?: boolean;
    }
    foreclosureJudicialType?: string
    resoData?: {
      taxAnnualAmount?: number
      taxAssessedValue?: number
      pricePerSquareFoot?: number
      [k: string]: unknown
    }
    taxHistory?: Array<{
      time: number; taxPaid: number; value: number;
      taxIncreaseRate?: number; valueIncreaseRate?: number
    }>
    schools?: unknown
    staticMapUrls?: string[]
    photos?: string[]
  }
  credits_remaining?: number
}

async function callHasData(zillowUrl: string): Promise<HasDataResponse> {
  const apiKey = process.env.HASDATA_API_KEY
  if (!apiKey) throw new Error('HASDATA_API_KEY not configured')

  // GET https://api.hasdata.com/scrape/zillow/property?url=<encoded zillow url>
  const url = `${HASDATA_BASE}?url=${encodeURIComponent(zillowUrl)}`

  const startedAt = Date.now()
  const resp = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  })
  const durationMs = Date.now() - startedAt
  const body = await resp.text()

  if (!resp.ok) {
    await recordApiCall('hasdata_zillow', resp.status, durationMs, body.slice(0, 500))
    throw new Error(`HasData ${resp.status}: ${body.slice(0, 300)}`)
  }
  let json: HasDataResponse
  try { json = JSON.parse(body) } catch { json = {} }
  // HasData exposes credits in a header; fall back to body field
  const credits =
    Number(resp.headers.get('x-credits-remaining')) ||
    json?.credits_remaining ||
    null
  await recordApiCall('hasdata_zillow', 200, durationMs, null, credits)
  return json
}

// Build Zillow's "address search" URL — Zillow redirects this to the canonical
// /homedetails/<slug>/<zpid>_zpid/ page. HasData follows the redirect.
//   "100 Selwyn Rd", "Newton", "MA", "02468"
// → "https://www.zillow.com/homes/100-Selwyn-Rd,-Newton,-MA-02468_rb/"
function buildZillowSearchUrl(parts: {
  street: string; city: string; state: string; zip?: string
}): string {
  const slug = [parts.street, parts.city, [parts.state, parts.zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .map(s => s.trim().replace(/\s+/g, '-'))
    .join(',-')   // Zillow uses ",-" between address parts
  return `https://www.zillow.com/homes/${encodeURIComponent(slug)}_rb/`
}

function mapToIntel(propertyId: string, json: HasDataResponse) {
  const p = json.property ?? {}
  const reso = p.resoData ?? {}
  const ls = p.listingSubTypes ?? {}
  // Latest tax-history entry is index 0 — also captured in resoData
  const latestTax = p.taxHistory?.[0]
  // Pick a reasonable static map (zoom 15 @ 384x288 — second-largest)
  const staticMap = p.staticMapUrls?.[3] ?? p.staticMapUrls?.[0] ?? null

  return {
    property_id: propertyId,
    // Core valuation
    zestimate: p.zestimate?.zestimate ?? null,
    rent_estimate: p.zestimate?.rentZestimate ?? null,
    zestimate_low_pct: p.zestimate?.zestimateLowPercent ?? null,
    zestimate_high_pct: p.zestimate?.zestimateHighPercent ?? null,
    rent_zestimate_url: p.zestimate?.rentZestimateURL ?? null,
    // Tax
    annual_tax: (reso.taxAnnualAmount as number) ?? latestTax?.taxPaid ?? null,
    tax_assessed_value: (reso.taxAssessedValue as number) ?? latestTax?.value ?? null,
    price_per_sqft: (reso.pricePerSquareFoot as number) ?? null,
    // Identity / links
    zpid: p.id ?? null,
    zillow_url: p.url ?? null,
    street_view_url: p.image ?? p.photos?.[0] ?? null,
    static_map_url: staticMap,
    parcel_id_zillow: p.parcelData?.parcelId ?? p.parcelData?.parcelNumber ?? null,
    // Location
    latitude: p.geo?.latitude ?? null,
    longitude: p.geo?.longitude ?? null,
    // Property facts
    year_built: p.yearBuilt ?? null,
    home_type: p.homeType ?? null,
    bedrooms: p.beds ?? null,
    bathrooms: p.baths ?? null,
    living_area_sqft: p.area?.livingArea ?? null,
    lot_size_sqft: p.area?.lotSize ?? null,
    description: p.description ?? null,
    // Listing/distress flags — these are the GOLD: Zillow already saying foreclosed
    listing_status: p.status ?? null,
    is_foreclosure_listed: ls.foreclosure ?? false,
    is_bank_owned: ls.bankOwned ?? false,
    is_pending: ls.pending ?? false,
    is_for_sale: (ls.forSaleByAgent ?? false) || (ls.forSaleByOwner ?? false),
    foreclosure_judicial: p.foreclosureJudicialType ?? null,
    // Heavier data — kept for the deal-sheet
    tax_history: p.taxHistory ?? null,
    schools: p.schools ?? null,
    listing_sub_types: p.listingSubTypes ?? null,
    reso_data: p.resoData ?? null,
    raw: json,
    source: 'hasdata_zillow',
    refreshed_at: new Date().toISOString(),
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params
  const sb = createServerSupabaseClient()
  const force = new URL(req.url).searchParams.get('force') === '1'

  const { data: lead } = await sb
    .from('leads')
    .select('id, property_id, property:properties(id, full_address, site_address, city, owner_state, zip)')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  const property: any = Array.isArray((lead as any).property)
    ? (lead as any).property[0]
    : (lead as any).property

  // 7-day cache (skipped with ?force=1)
  const { data: existing } = await sb
    .from('property_intel')
    .select('*')
    .eq('property_id', property.id)
    .maybeSingle()
  if (!force && existing?.refreshed_at) {
    const ageDays = (Date.now() - new Date(existing.refreshed_at).getTime()) / (1000 * 60 * 60 * 24)
    if (ageDays < 7) {
      return NextResponse.json({ intel: existing, cached: true })
    }
  }

  // Resolve the Zillow URL: prefer cached canonical /homedetails/ URL from a
  // previous call (saves a redirect), else build the search URL from address.
  const zillowUrl =
    existing?.zillow_url ??
    buildZillowSearchUrl({
      street: property.site_address ?? property.full_address ?? '',
      city: property.city ?? '',
      state: property.owner_state ?? 'MA',
      zip: property.zip ?? undefined,
    })

  let json: HasDataResponse
  try {
    json = await callHasData(zillowUrl)
  } catch (err: any) {
    return NextResponse.json({ error: err.message, zillowUrl }, { status: 502 })
  }

  // If HasData returned a metadata-only response with no property block, surface it
  if (!json.property) {
    return NextResponse.json(
      { error: 'HasData returned no property data', metadata: json.requestMetadata },
      { status: 502 }
    )
  }

  const intelRow = mapToIntel(property.id, json)
  const { data: intel, error: upsertErr } = await sb
    .from('property_intel')
    .upsert(intelRow, { onConflict: 'property_id' })
    .select()
    .single()
  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ intel, cached: false })
}
