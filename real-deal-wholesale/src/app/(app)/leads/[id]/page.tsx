import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  getLead, getSignalsForProperty, getContactForProperty,
  getIntelForProperty, getEntityForOwner,
} from '@/lib/leads'
import {
  fmtDate, fmtMoney, fmtNumber, fmtRelative, isEntityOwner, titleCase,
} from '@/lib/format'
import { SignalCard } from '@/components/SignalCard'
import { PropertyMap } from '@/components/PropertyMap'
import { SkipTraceButton } from '@/components/SkipTraceButton'
import { PlaceholderButton } from '@/components/PlaceholderButton'
import { geocodeAddress } from '@/lib/geocode'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  const lead = await getLead(params.id)
  if (!lead) notFound()
  const p = lead.property

  const [signals, contact, intel, entity] = await Promise.all([
    getSignalsForProperty(p.id),
    getContactForProperty(p.id),
    getIntelForProperty(p.id),
    isEntityOwner(p.owner_name) ? getEntityForOwner(p.owner_name) : Promise.resolve(null),
  ])

  const hasComps = !!(intel?.zestimate || intel?.rent_estimate)
  const hasContact = !!(contact?.phone_primary || contact?.phone_secondary || contact?.email)

  // Resolve lat/lng for Street View: prefer Zillow-enriched coords, fall back to geocode
  let mapLat: number | null = intel?.latitude ?? null
  let mapLng: number | null = intel?.longitude ?? null
  if (!mapLat || !mapLng) {
    const coords = await geocodeAddress(p.site_address, p.city, p.zip)
    mapLat = coords?.lat ?? null
    mapLng = coords?.lng ?? null
  }

  return (
    <div className="px-8 py-6 max-w-[1100px] mx-auto">

      {/* Breadcrumb */}
      <div className="mb-5">
        <Link href="/inbox" className="text-xs text-ink-500 hover:text-ink-900 transition-colors inline-flex items-center gap-1">
          <span aria-hidden>←</span> Inbox
        </Link>
      </div>

      {/* Header */}
      <header className="mb-7 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {isEntityOwner(p.owner_name) && (
              <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                Entity owner
              </span>
            )}
          </div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-ink-900 leading-tight">
            {titleCase(p.site_address)}
          </h1>
          <p className="text-sm text-ink-500 mt-1.5">
            {titleCase(p.city)}, MA {p.zip}
            {p.county && <> · {titleCase(p.county)} County</>}
            {p.use_type && <> · {titleCase(p.use_type.replace(/_/g, ' '))}</>}
          </p>
        </div>

        <div className="shrink-0 mt-1">
          <SkipTraceButton leadId={lead.id} alreadyTraced={!!contact?.traced_at} />
        </div>
      </header>

      {/* HERO: Street View + Owner side-by-side */}
      <section className="mb-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 h-[340px]">
          <PropertyMap
            address={p.site_address ?? ''}
            city={p.city}
            zip={p.zip}
            lat={mapLat}
            lng={mapLng}
          />
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-soft p-6 h-full flex flex-col gap-5">
            {/* Owner */}
            <div>
              <h2 className="text-[10px] uppercase tracking-wider font-medium text-ink-400 mb-2">Owner</h2>
              <div className="text-base font-semibold text-ink-900 leading-tight">
                {titleCase(p.owner_name)}
              </div>
              {p.owner_mailing && (
                <div className="text-sm text-ink-500 mt-1.5 leading-relaxed">
                  {titleCase(p.owner_mailing)}<br />
                  {titleCase(p.owner_city)}, {p.owner_state} {p.owner_zip}
                </div>
              )}
            </div>

            {/* Contact — only rendered when skip-traced */}
            {hasContact && (
              <>
                <div className="border-t border-cream-300" />
                <div>
                  <h3 className="text-[10px] uppercase tracking-wider font-medium text-ink-400 mb-3">Contact</h3>
                  <div className="space-y-3">
                    {contact!.phone_primary && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-ink-400">Primary</div>
                        <a href={`tel:${contact!.phone_primary}`} className="text-base font-medium text-ink-900 hover:text-amber-700 transition-colors tabular-nums">
                          {contact!.phone_primary}
                        </a>
                      </div>
                    )}
                    {contact!.phone_secondary && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-ink-400">Secondary</div>
                        <a href={`tel:${contact!.phone_secondary}`} className="text-sm text-ink-700 hover:text-amber-700 transition-colors tabular-nums">
                          {contact!.phone_secondary}
                        </a>
                      </div>
                    )}
                    {contact!.email && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-ink-400">Email</div>
                        <a href={`mailto:${contact!.email}`} className="text-sm text-ink-700 hover:text-amber-700 transition-colors break-all">
                          {contact!.email}
                        </a>
                      </div>
                    )}
                    {contact!.traced_at && (
                      <div className="text-[10px] text-ink-400 pt-1">
                        Traced {fmtRelative(contact!.traced_at)} via {contact!.tracer_source ?? 'tracer'}
                      </div>
                    )}
                    <PlaceholderButton reason="Twilio click-to-call not wired" size="md" className="w-full justify-center">
                      Call now
                    </PlaceholderButton>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* PROPERTY FACTS */}
      <section className="mb-8">
        <h2 className="text-sm font-display font-semibold text-ink-900 mb-3">Property</h2>
        <div className="bg-white rounded-2xl shadow-soft p-6">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
            <Fact label="Assessed value" value={fmtMoney(p.assessed_total)} emphasis />
            <Fact label="Last sale price" value={fmtMoney(p.last_sale_price)} />
            <Fact label="Last sale date" value={fmtDate(p.last_sale_date)} />
            <Fact label="Year built" value={p.year_built ?? '—'} />
            <Fact label="Building sq ft" value={fmtNumber(p.building_sqft)} />
            <Fact label="Lot sq ft" value={fmtNumber(p.lot_sqft)} />
            <Fact label="Units" value={p.units ?? '—'} />
            <Fact label="Use type" value={p.use_type ? titleCase(p.use_type.replace(/_/g, ' ')) : '—'} />
            <Fact label="Land value" value={fmtMoney(p.assessed_land)} />
            <Fact label="Building value" value={fmtMoney(p.assessed_building)} />
            <Fact label="Use code" value={p.use_code ?? '—'} mono />
            <Fact label="Parcel ID" value={p.loc_id ?? '—'} mono />
          </dl>
        </div>
      </section>

      {/* DISTRESS SIGNALS */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-display font-semibold text-ink-900">
            Distress signals <span className="text-ink-400 font-normal">· {signals.length}</span>
          </h2>
          <p className="text-[10px] uppercase tracking-wider text-ink-400">By filing date</p>
        </div>
        {signals.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-soft p-6 text-sm text-ink-500 text-center">No signals on file.</div>
        ) : (
          <div className="space-y-2">
            {signals.map(s => <SignalCard key={s.id} signal={s} />)}
          </div>
        )}
      </section>

      {/* COMPS & VALUATION — only when enriched */}
      {hasComps && (
        <section className="mb-8">
          <h2 className="text-sm font-display font-semibold text-ink-900 mb-3">Comps & valuation</h2>
          <div className="bg-white rounded-2xl shadow-soft p-6">
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">
              <Fact label="Zestimate" value={fmtMoney(intel!.zestimate)} emphasis />
              {intel!.rent_estimate && (
                <Fact label="Rent estimate" value={`${fmtMoney(intel!.rent_estimate)}/mo`} />
              )}
              {intel!.annual_tax && (
                <Fact label="Annual tax" value={fmtMoney(intel!.annual_tax)} />
              )}
              {intel!.price_per_sqft && (
                <Fact label="Price/sqft" value={`$${intel!.price_per_sqft}`} />
              )}
              {intel!.bedrooms && (
                <Fact label="Beds" value={intel!.bedrooms} />
              )}
              {intel!.bathrooms && (
                <Fact label="Baths" value={intel!.bathrooms} />
              )}
              {intel!.living_area_sqft && (
                <Fact label="Living area" value={fmtNumber(intel!.living_area_sqft)} />
              )}
              {intel!.year_built && !p.year_built && (
                <Fact label="Year built" value={intel!.year_built} />
              )}
            </dl>
            {(intel!.is_foreclosure_listed || intel!.is_bank_owned) && (
              <div className="mt-4 flex gap-2">
                {intel!.is_foreclosure_listed && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-ember-500/10 text-ember-600 text-xs font-medium">
                    Listed foreclosure
                  </span>
                )}
                {intel!.is_bank_owned && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-ember-500/10 text-ember-600 text-xs font-medium">
                    Bank owned
                  </span>
                )}
              </div>
            )}
            {intel!.zillow_url && (
              <a
                href={intel!.zillow_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-4 text-xs font-medium text-amber-700 hover:text-amber-800 transition-colors"
              >
                View on Zillow →
              </a>
            )}
            <div className="mt-3 text-[10px] text-ink-400">
              Refreshed {fmtRelative(intel!.refreshed_at)} · Zillow via HasData
            </div>
          </div>
        </section>
      )}

      {/* ENTITY RECORD — only for LLC/Trust owners */}
      {isEntityOwner(p.owner_name) && entity && (
        <section className="mb-8">
          <h2 className="text-sm font-display font-semibold text-ink-900 mb-3">Entity record</h2>
          <div className="bg-white rounded-2xl shadow-soft p-6">
            <div className="flex items-baseline justify-between mb-4">
              <div className="text-base font-semibold text-ink-900">{entity.entity_name}</div>
              {entity.status && <span className="text-xs text-ink-500">{entity.status}</span>}
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
              {entity.filing_date && <Fact label="Filed" value={fmtDate(entity.filing_date)} />}
              {entity.jurisdiction && <Fact label="Jurisdiction" value={entity.jurisdiction} />}
              {entity.sos_id && <Fact label="SOS ID" value={entity.sos_id} mono />}
              {entity.registered_agent && <Fact label="Reg. agent" value={entity.registered_agent} />}
              {entity.registered_agent_address && (
                <div className="md:col-span-2">
                  <Fact label="Agent address" value={entity.registered_agent_address} />
                </div>
              )}
              {entity.mailing_address && (
                <div className="md:col-span-2">
                  <Fact label="Mailing address" value={entity.mailing_address} />
                </div>
              )}
              {entity.contact_person && <Fact label="Contact" value={entity.contact_person} />}
            </dl>
            <div className="border-t border-cream-300 mt-5 pt-3 text-[10px] text-ink-400">
              MA Secretary of State · fetched {fmtRelative(entity.fetched_at)}
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="mt-10 pt-6 border-t border-cream-300">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-ink-400">
          <span><span className="uppercase tracking-wider mr-1.5">Lead created</span><span className="text-ink-500">{fmtRelative(lead.created_at)}</span></span>
          <span aria-hidden className="text-ink-300">·</span>
          <span><span className="uppercase tracking-wider mr-1.5">Updated</span><span className="text-ink-500">{fmtRelative(lead.updated_at)}</span></span>
          <span aria-hidden className="text-ink-300">·</span>
          <span><span className="uppercase tracking-wider mr-1.5">Lead</span><span className="text-ink-500 font-mono">{lead.id}</span></span>
          <span aria-hidden className="text-ink-300">·</span>
          <span><span className="uppercase tracking-wider mr-1.5">Property</span><span className="text-ink-500 font-mono">{p.id}</span></span>
        </div>
      </footer>
    </div>
  )
}

function Fact({
  label, value, emphasis, mono,
}: { label: string; value: ReactNode; emphasis?: boolean; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider font-medium text-ink-400">{label}</dt>
      <dd className={`mt-1 ${
        emphasis ? 'text-lg font-display font-semibold text-ink-900' : 'text-sm text-ink-700'
      } ${mono ? 'font-mono text-xs break-all' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
