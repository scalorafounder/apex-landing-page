export type LeadStatus = 'new' | 'queued' | 'contacted' | 'in_progress' | 'deal' | 'dead'

export type SignalType =
  | 'tax_taking'
  | 'lis_pendens'
  | 'mechanics_lien'
  | 'code_violation'
  | 'divorce'
  | 'eviction'
  | string

export interface Property {
  id: string
  loc_id: string | null
  site_address: string | null
  full_address: string | null
  city: string | null
  zip: string | null
  county: string | null
  owner_name: string | null
  owner_mailing: string | null
  owner_city: string | null
  owner_state: string | null
  owner_zip: string | null
  assessed_total: number | null
  assessed_land: number | null
  assessed_building: number | null
  use_code: string | null
  use_type: string | null
  lot_sqft: number | null
  building_sqft: number | null
  units: number | null
  year_built: number | null
  last_sale_price: number | null
  last_sale_date: string | null
}

export interface Signal {
  id: string
  property_id: string
  signal_type: SignalType
  source: string
  source_url: string | null
  document_id: string | null
  filing_date: string | null      // PRIMARY date — when filed at registry/court
  detected_at: string             // when our scraper found it (scanner-status only)
  raw_text: string | null
  parsed_data: any
  match_confidence: number | null
}

export interface Lead {
  id: string
  property_id: string
  signal_count: number
  signal_types: string[]
  first_signal_at: string | null
  last_signal_at: string | null
  score: number
  status: LeadStatus
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LeadWithProperty extends Lead {
  property: Property
}

export interface Contact {
  id: string
  property_id: string
  owner_name: string | null
  phone_primary: string | null
  phone_secondary: string | null
  email: string | null
  alternate_addresses: any
  traced_at: string | null
  tracer_source: string | null
}

export interface PropertyIntel {
  id: string
  property_id: string
  // Valuation
  zestimate: number | null
  rent_estimate: number | null
  zestimate_low_pct: number | null
  zestimate_high_pct: number | null
  rent_zestimate_url: string | null
  // Tax
  annual_tax: number | null
  tax_assessed_value: number | null
  price_per_sqft: number | null
  // Identity
  zpid: number | null
  zillow_url: string | null
  street_view_url: string | null
  static_map_url: string | null
  parcel_id_zillow: string | null
  // Location
  latitude: number | null
  longitude: number | null
  // Facts
  year_built: number | null
  home_type: string | null
  bedrooms: number | null
  bathrooms: number | null
  living_area_sqft: number | null
  lot_size_sqft: number | null
  description: string | null
  // Listing/distress flags from Zillow
  listing_status: string | null   // OFF_MARKET | FOR_SALE | …
  is_foreclosure_listed: boolean
  is_bank_owned: boolean
  is_pending: boolean
  is_for_sale: boolean
  foreclosure_judicial: string | null  // 'Judicial' | 'Non-Judicial'
  // Detail blobs
  tax_history: any
  schools: any
  listing_sub_types: any
  reso_data: any
  comps: any
  last_sale_price: number | null
  last_sale_date: string | null
  zoning_detail: string | null
  permits: any
  source: string | null
  raw: any
  refreshed_at: string | null
}

export interface EntityRecord {
  id: string
  entity_name: string
  sos_id: string | null
  jurisdiction: string | null
  status: string | null
  filing_date: string | null
  mailing_address: string | null
  business_address: string | null
  contact_person: string | null
  registered_agent: string | null
  registered_agent_address: string | null
  managers: any
  officers: any
  fetched_at: string | null
}

export interface ScanRun {
  id: string
  source: string
  started_at: string
  completed_at: string | null
  status: 'running' | 'success' | 'failed' | string
  documents_processed: number
  signals_created: number
  error_message: string | null
}
