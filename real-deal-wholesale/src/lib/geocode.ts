/**
 * Server-side address geocoding via Google Maps Geocode API.
 * Used to get lat/lng for the Street View embed when property_intel hasn't
 * been enriched yet (Zillow enrichment also provides coordinates).
 *
 * Requires GOOGLE_MAPS_API_KEY (server-only env var, NOT the NEXT_PUBLIC embed key).
 */

export async function geocodeAddress(
  street: string | null,
  city: string | null,
  zip: string | null,
): Promise<{ lat: number; lng: number } | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return null

  const parts = [street, city, 'MA', zip].filter(Boolean)
  if (parts.length < 2) return null

  const address = parts.join(', ')
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`

  try {
    const resp = await fetch(url, { cache: 'no-store' })
    if (!resp.ok) return null
    const json = await resp.json()
    if (json.status !== 'OK' || !json.results?.[0]) return null
    const loc = json.results[0].geometry?.location
    if (!loc?.lat || !loc?.lng) return null
    return { lat: loc.lat, lng: loc.lng }
  } catch {
    return null
  }
}
