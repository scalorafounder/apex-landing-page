import { createServerSupabaseClient } from './supabase-server'
import type {
  Contact, EntityRecord, Lead, LeadWithProperty, Property,
  PropertyIntel, ScanRun, Signal,
} from './types'

/**
 * Inbox: all leads joined to property, sorted by score.
 * Statuses to include can be passed; defaults to 'new'.
 */
export async function getInboxLeads(opts: { statuses?: string[]; limit?: number } = {}) {
  const sb = createServerSupabaseClient()
  const statuses = opts.statuses ?? ['new']
  const limit = opts.limit ?? 200
  // Sort by RECENCY FIRST (last_signal_at desc), score as tiebreaker.
  // Same-day filings always float to the top — that's the partner's #1 ask.
  const { data, error } = await sb
    .from('leads')
    .select(`
      id, property_id, signal_count, signal_types,
      first_signal_at, last_signal_at, score, status,
      assigned_to, notes, created_at, updated_at,
      property:properties (
        id, loc_id, site_address, full_address, city, zip, county,
        owner_name, owner_mailing, owner_city, owner_state, owner_zip,
        assessed_total, assessed_land, assessed_building,
        use_code, use_type, lot_sqft, building_sqft, units, year_built,
        last_sale_price, last_sale_date
      )
    `)
    .in('status', statuses)
    .order('last_signal_at', { ascending: false, nullsFirst: false })
    .order('score', { ascending: false })
    .limit(limit)
  if (error) throw error
  const leads = (data ?? []).map((r: any) => ({ ...r, property: Array.isArray(r.property) ? r.property[0] : r.property })) as LeadWithProperty[]

  // Pull max(filing_date) per property in one query, then merge
  const propIds = leads.map(l => l.property_id)
  const filingByProp = await getLatestFilingDateMap(propIds)
  // Final sort: filing_date primary (when available — that's the actual filing day),
  // then last_signal_at, then score
  const enriched = leads.map(l => ({ ...l, latest_filing_date: filingByProp.get(l.property_id) ?? null }))
  enriched.sort((a, b) => {
    const fa = a.latest_filing_date ?? ''
    const fb = b.latest_filing_date ?? ''
    if (fa !== fb) return fb.localeCompare(fa)
    const sa = a.last_signal_at ?? ''
    const sb2 = b.last_signal_at ?? ''
    if (sa !== sb2) return sb2.localeCompare(sa)
    return (b.score || 0) - (a.score || 0)
  })
  return enriched as Array<LeadWithProperty & { latest_filing_date: string | null }>
}

async function getLatestFilingDateMap(propertyIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (propertyIds.length === 0) return out
  const sb = createServerSupabaseClient()
  const { data } = await sb
    .from('signals')
    .select('property_id, filing_date')
    .in('property_id', propertyIds)
    .not('filing_date', 'is', null)
  if (!data) return out
  for (const row of data as Array<{ property_id: string; filing_date: string }>) {
    const prev = out.get(row.property_id)
    if (!prev || row.filing_date > prev) out.set(row.property_id, row.filing_date)
  }
  return out
}

export async function getLead(id: string): Promise<LeadWithProperty | null> {
  const sb = createServerSupabaseClient()
  const { data, error } = await sb
    .from('leads')
    .select(`
      id, property_id, signal_count, signal_types,
      first_signal_at, last_signal_at, score, status,
      assigned_to, notes, created_at, updated_at,
      property:properties (
        id, loc_id, site_address, full_address, city, zip, county,
        owner_name, owner_mailing, owner_city, owner_state, owner_zip,
        assessed_total, assessed_land, assessed_building,
        use_code, use_type, lot_sqft, building_sqft, units, year_built,
        last_sale_price, last_sale_date
      )
    `)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const flat: any = { ...data, property: Array.isArray((data as any).property) ? (data as any).property[0] : (data as any).property }
  return flat as LeadWithProperty
}

export async function getSignalsForProperty(propertyId: string): Promise<Signal[]> {
  const sb = createServerSupabaseClient()
  const { data, error } = await sb
    .from('signals')
    .select('*')
    .eq('property_id', propertyId)
    .order('filing_date', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Signal[]
}

export async function getContactForProperty(propertyId: string): Promise<Contact | null> {
  const sb = createServerSupabaseClient()
  const { data, error } = await sb
    .from('contacts')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (error) throw error
  return (data as Contact) ?? null
}

export async function getIntelForProperty(propertyId: string): Promise<PropertyIntel | null> {
  const sb = createServerSupabaseClient()
  const { data, error } = await sb
    .from('property_intel')
    .select('*')
    .eq('property_id', propertyId)
    .maybeSingle()
  if (error) throw error
  return (data as PropertyIntel) ?? null
}

export async function getEntityForOwner(ownerName: string | null): Promise<EntityRecord | null> {
  if (!ownerName) return null
  const sb = createServerSupabaseClient()
  const { data, error } = await sb
    .from('entity_records')
    .select('*')
    .ilike('entity_name', ownerName)
    .maybeSingle()
  if (error) {
    // ilike may match >1 row; fall back to first
    const { data: many } = await sb
      .from('entity_records')
      .select('*')
      .ilike('entity_name', ownerName)
      .limit(1)
    return (many?.[0] as EntityRecord) ?? null
  }
  return (data as EntityRecord) ?? null
}

/** Other properties owned by the same exact owner_name (simple version of portfolio) */
export async function getOwnerPortfolio(ownerName: string | null, excludePropertyId?: string): Promise<Property[]> {
  if (!ownerName) return []
  const sb = createServerSupabaseClient()
  let q = sb
    .from('properties')
    .select('id, site_address, city, zip, county, owner_name, assessed_total, use_type, year_built, building_sqft')
    .eq('owner_name', ownerName)
    .limit(25)
  if (excludePropertyId) q = q.neq('id', excludePropertyId)
  const { data, error } = await q
  if (error) return []
  return (data ?? []) as Property[]
}

/** Signal counts per source key for the last N days — used by coverage page scanner cards. */
export async function getSignalCountsBySource(days = 7): Promise<Record<string, number>> {
  const sb = createServerSupabaseClient()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data } = await sb
    .from('signals')
    .select('source')
    .gte('filing_date', since)
  const counts: Record<string, number> = {}
  for (const row of (data ?? []) as Array<{ source: string }>) {
    counts[row.source] = (counts[row.source] ?? 0) + 1
  }
  return counts
}

export async function getRecentScanRuns(limit = 50): Promise<ScanRun[]> {
  const sb = createServerSupabaseClient()
  const { data, error } = await sb
    .from('scan_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as ScanRun[]
}

export async function getZipCoverage(): Promise<Array<{ zip: string; lead_count: number }>> {
  const sb = createServerSupabaseClient()
  const { data, error } = await sb.rpc('zip_lead_counts').select()
  if (error || !data) {
    // Fallback: aggregate in JS
    const { data: rows } = await sb
      .from('leads')
      .select('property:properties(zip)')
      .limit(2000)
    const counts: Record<string, number> = {}
    for (const r of rows ?? []) {
      const z = (Array.isArray((r as any).property) ? (r as any).property[0]?.zip : (r as any).property?.zip) || '—'
      counts[z] = (counts[z] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([zip, lead_count]) => ({ zip, lead_count }))
      .sort((a, b) => b.lead_count - a.lead_count)
  }
  return data as Array<{ zip: string; lead_count: number }>
}
