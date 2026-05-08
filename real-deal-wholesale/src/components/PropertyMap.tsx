import { EmptyEnrichment } from './EmptyEnrichment'

interface Props {
  address: string
  city: string | null
  zip: string | null
  lat?: number | null
  lng?: number | null
}

export function PropertyMap({ address, city, zip, lat, lng }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <EmptyEnrichment
        title="Map not connected"
        hint="Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to .env.local (Maps Embed API enabled)."
        source="Google Maps"
      />
    )
  }

  const fullAddress = [address, city, 'MA', zip].filter(Boolean).join(', ')

  // Street View requires lat/lng coordinates — the Embed API rejects address strings for that mode.
  // Coordinates come from Zillow enrichment or server-side geocoding in the lead detail page.
  // If neither is available, fall back to satellite place view.
  const src = lat && lng
    ? `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${lat},${lng}&fov=90`
    : `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(fullAddress)}&zoom=19&maptype=satellite`

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden shadow-soft bg-cream-200">
      <iframe
        src={src}
        title={lat && lng ? `Street view of ${fullAddress}` : `Map of ${fullAddress}`}
        className="w-full h-full block"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  )
}
