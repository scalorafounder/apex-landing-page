import { fmtDate, fmtMoney, signalTypeLabel, sourceLabel } from '@/lib/format'
import type { Signal } from '@/lib/types'

// Distinct color per signal type — left accent bar + header badge
const SIGNAL_STYLE: Record<string, { bar: string; badge: string }> = {
  tax_taking:     { bar: 'bg-ember-500',  badge: 'bg-ember-500/10 text-ember-600' },
  lis_pendens:    { bar: 'bg-blue-600',   badge: 'bg-blue-600/10 text-blue-700' },
  mechanics_lien: { bar: 'bg-amber-500',  badge: 'bg-amber-500/10 text-amber-700' },
  code_violation: { bar: 'bg-purple-600', badge: 'bg-purple-600/10 text-purple-700' },
  divorce:        { bar: 'bg-pink-500',   badge: 'bg-pink-500/10 text-pink-700' },
  eviction:       { bar: 'bg-moss-500',   badge: 'bg-moss-500/10 text-moss-600' },
}

// Registry key → MassLandRecords base URL (matches scanner cfg.url exactly)
const REGISTRY_BASE: Record<string, string> = {
  suffolk_registry:           'http://www.masslandrecords.com/Suffolk',
  middlesex_south_registry:   'http://www.masslandrecords.com/MiddlesexSouth',
  middlesex_north_registry:   'http://www.masslandrecords.com/MiddlesexNorth',
  norfolk_registry:           'http://www.masslandrecords.com/Norfolk',
  essex_south_registry:       'http://www.masslandrecords.com/EssexSouth',
  essex_north_registry:       'http://www.masslandrecords.com/EssexNorth',
  plymouth_registry:          'http://www.masslandrecords.com/Plymouth',
}

/**
 * Build the document URL. Uses source_url from DB when it looks like a real document link.
 * MassLandRecords detail pages require an active session — falls back to a book/page search URL.
 * Boston 311 and court sources have stable direct URLs.
 */
function buildDocumentUrl(signal: Signal): string | null {
  const { source, source_url, document_id, parsed_data } = signal

  if (source === 'boston_violations_api') {
    const caseNo = parsed_data?.case_no
    return caseNo ? `https://311.boston.gov/reports/${caseNo}` : source_url ?? null
  }

  const base = REGISTRY_BASE[source]
  if (base && document_id) {
    const colonIdx = document_id.indexOf(':')
    const bookPage = colonIdx !== -1 ? document_id.substring(colonIdx + 1) : document_id
    if (bookPage.includes('/')) {
      const [book, page] = bookPage.split('/')
      // Use doc number (stored as source_url with ?id= by newer scanner runs) if available;
      // otherwise link to the registry's book/page search which doesn't require a session.
      if (source_url && source_url.includes('id=')) return source_url
      return `${base}/SearchResults.aspx?SearchType=BookPage&book=${book}&page=${page}`
    }
  }

  return source_url ?? null
}

export function SignalCard({ signal }: { signal: Signal }) {
  const style = SIGNAL_STYLE[signal.signal_type] ?? { bar: 'bg-ink-300', badge: 'bg-ink-100 text-ink-600' }
  const parsed = signal.parsed_data ?? {}
  const docUrl = buildDocumentUrl(signal)

  // Amount: `consideration` for registry docs (tax owed / lien amount), skip $0
  const amount: number | null =
    (parsed.consideration && parsed.consideration > 0 ? parsed.consideration : null) ??
    (parsed.amount && parsed.amount > 0 ? parsed.amount : null) ??
    null

  return (
    <article className="bg-white rounded-xl shadow-soft overflow-hidden transition-shadow hover:shadow-md">
      <div className="flex">
        <div className={`w-1 shrink-0 ${style.bar}`} aria-hidden />
        <div className="flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${style.badge}`}>
                {signalTypeLabel(signal.signal_type)}
              </span>
              <span className="text-xs text-ink-400">{sourceLabel(signal.source)}</span>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-semibold text-ink-900 tabular-nums">{fmtDate(signal.filing_date)}</div>
              <div className="text-[10px] uppercase tracking-wide text-ink-400 mt-0.5">Filed</div>
            </div>
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            {signal.document_id && (
              <>
                <dt className="text-ink-400">Document</dt>
                <dd className="text-ink-700 font-mono text-[11px]">{signal.document_id.split(':')[1] ?? signal.document_id}</dd>
              </>
            )}
            {parsed.case_number && (
              <>
                <dt className="text-ink-400">Case</dt>
                <dd className="text-ink-700 font-mono">{parsed.case_number}</dd>
              </>
            )}
            {parsed.case_no && !parsed.case_number && (
              <>
                <dt className="text-ink-400">Case</dt>
                <dd className="text-ink-700 font-mono">{parsed.case_no}</dd>
              </>
            )}
            {amount !== null && (
              <>
                <dt className="text-ink-400">Amount</dt>
                <dd className="text-ink-900 font-semibold">{fmtMoney(amount)}</dd>
              </>
            )}
            {parsed.grantor && (
              <>
                <dt className="text-ink-400">Grantor</dt>
                <dd className="text-ink-700 truncate">{parsed.grantor}</dd>
              </>
            )}
            {parsed.grantors && Array.isArray(parsed.grantors) && parsed.grantors.length > 0 && !parsed.grantor && (
              <>
                <dt className="text-ink-400">Grantor</dt>
                <dd className="text-ink-700 truncate">{parsed.grantors.filter((g: string) => g !== parsed.grantees?.[0]).join(', ')}</dd>
              </>
            )}
            {parsed.grantee && (
              <>
                <dt className="text-ink-400">Grantee</dt>
                <dd className="text-ink-700 truncate">{parsed.grantee}</dd>
              </>
            )}
            {parsed.description && (
              <>
                <dt className="text-ink-400">Violation</dt>
                <dd className="text-ink-700 col-span-1">{parsed.description}</dd>
              </>
            )}
          </dl>

          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-amber-700 hover:text-amber-800 transition-colors"
            >
              View source document →
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
