import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fmtDate, signalTypeLabel, sourceLabel } from '@/lib/format'

export const dynamic = 'force-dynamic'

const SIGNAL_CHIP: Record<string, string> = {
  tax_taking:     'bg-ember-500/10 text-ember-600',
  lis_pendens:    'bg-blue-600/10 text-blue-700',
  mechanics_lien: 'bg-amber-500/10 text-amber-700',
  code_violation: 'bg-purple-600/10 text-purple-700',
  divorce:        'bg-pink-500/10 text-pink-700',
  eviction:       'bg-moss-500/10 text-moss-600',
}

export default async function SignalsPage() {
  const sb = createServerSupabaseClient()

  const { data } = await sb
    .from('signals')
    .select(`
      id, signal_type, source, filing_date, document_id, created_at,
      property:properties(id, site_address, city, zip),
      lead:leads(id)
    `)
    .order('filing_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500)

  const signals = (data ?? []).map((r: any) => ({
    ...r,
    property: Array.isArray(r.property) ? r.property[0] : r.property,
    lead: Array.isArray(r.lead) ? r.lead[0] : r.lead,
  }))

  return (
    <div className="px-8 py-6 max-w-[1100px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-display font-semibold text-ink-900">Signals</h1>
        <p className="text-sm text-ink-500 mt-1">{signals.length} most recent distress filings</p>
      </div>

      <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200">
              <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-medium text-ink-400">Type</th>
              <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-medium text-ink-400">Property</th>
              <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-medium text-ink-400">Source</th>
              <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-medium text-ink-400">Filed</th>
              <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider font-medium text-ink-400">Document</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100">
            {signals.map((s: any) => {
              const leadId = s.lead?.id
              const docId = s.document_id?.split(':')[1] ?? s.document_id ?? '—'
              return (
                <tr key={s.id} className="hover:bg-cream-50 transition-colors">
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${SIGNAL_CHIP[s.signal_type] ?? 'bg-ink-100 text-ink-600'}`}>
                      {signalTypeLabel(s.signal_type)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {leadId ? (
                      <Link href={`/leads/${leadId}`} className="text-ink-900 hover:text-amber-700 font-medium transition-colors">
                        {s.property?.site_address ?? '—'}
                      </Link>
                    ) : (
                      <span className="text-ink-700">{s.property?.site_address ?? '—'}</span>
                    )}
                    {s.property?.city && (
                      <div className="text-xs text-ink-400">{s.property.city}, MA {s.property.zip}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-500 text-xs">{sourceLabel(s.source)}</td>
                  <td className="px-5 py-3 text-ink-700 tabular-nums text-xs">{fmtDate(s.filing_date)}</td>
                  <td className="px-5 py-3 font-mono text-[11px] text-ink-500">{docId}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {signals.length === 0 && (
          <div className="px-5 py-14 text-center text-sm text-ink-400">No signals yet.</div>
        )}
      </div>
    </div>
  )
}
