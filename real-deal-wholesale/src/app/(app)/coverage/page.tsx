import { getRecentScanRuns, getZipCoverage, getSignalCountsBySource } from '@/lib/leads'
import { getApiHealth, pingGoogleMapsHealth } from '@/lib/api-health'
import { fmtRelative, sourceLabel, signalTypeLabel } from '@/lib/format'
import { PlaceholderButton } from '@/components/PlaceholderButton'
import type { ScanRun } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ── Scanner definitions — one entry per scanner FILE, not per source key ──
const SCANNERS = [
  {
    key: 'masslandrecords',
    label: 'MassLandRecords',
    subtitle: 'Suffolk · Middlesex South · Middlesex North',
    sourceKeys: ['suffolk_registry', 'middlesex_south_registry', 'middlesex_north_registry'],
    signalTypes: ['tax_taking', 'lis_pendens', 'mechanics_lien'],
    runCmd: 'node registries/masslandrecords.js suffolk && node registries/masslandrecords.js middlesex_south && node registries/masslandrecords.js middlesex_north',
  },
  {
    key: 'norfolk',
    label: 'Norfolk Registry',
    subtitle: 'norfolkresearch.org — Brookline, Milton, Wellesley, Needham…',
    sourceKeys: ['norfolk_registry'],
    signalTypes: ['tax_taking', 'lis_pendens', 'mechanics_lien'],
    runCmd: 'node registries/norfolk.js',
  },
  {
    key: 'essex_south',
    label: 'Essex South Registry',
    subtitle: 'salemdeeds.com — Marblehead',
    sourceKeys: ['essex_south_registry'],
    signalTypes: ['tax_taking', 'lis_pendens', 'mechanics_lien'],
    runCmd: 'node registries/essex_spa.js',
  },
  {
    key: 'plymouth',
    label: 'Plymouth Registry',
    subtitle: 'titleview.org — Hingham, Scituate, Duxbury',
    sourceKeys: ['plymouth_registry'],
    signalTypes: ['tax_taking', 'lis_pendens', 'mechanics_lien'],
    runCmd: 'node registries/titleview.js plymouth',
  },
  {
    key: 'masscourts',
    label: 'MA Courts',
    subtitle: 'masscourts.org — all 50 target ZIPs · requires 2Captcha',
    sourceKeys: ['masscourts_divorce', 'masscourts_eviction'],
    signalTypes: ['divorce', 'eviction'],
    runCmd: 'node registries/masscourts.js',
  },
  {
    key: 'boston_violations',
    label: 'Boston 311',
    subtitle: 'Analyze Boston open data API — 9 Boston ZIPs',
    sourceKeys: ['boston_violations_api'],
    signalTypes: ['code_violation'],
    runCmd: 'node registries/boston_violations.js',
  },
] as const

// ── Signal type colors (match InboxTable + SignalCard) ─────────────────────
const SIGNAL_CHIP: Record<string, string> = {
  tax_taking:     'bg-ember-500/10 text-ember-600',
  lis_pendens:    'bg-blue-600/10 text-blue-700',
  mechanics_lien: 'bg-amber-500/10 text-amber-700',
  code_violation: 'bg-purple-600/10 text-purple-700',
  divorce:        'bg-pink-500/10 text-pink-700',
  eviction:       'bg-moss-500/10 text-moss-600',
}

// ── Status helpers ─────────────────────────────────────────────────────────
function statusDot(status: string) {
  const map: Record<string, string> = {
    success: 'bg-moss-500',
    running: 'bg-amber-500 animate-pulse',
    failed:  'bg-ember-500',
    never:   'bg-ink-300',
  }
  return map[status] ?? 'bg-ink-300'
}

function statusPill(status: string) {
  const map: Record<string, string> = {
    success: 'bg-moss-500/15 text-moss-500',
    running: 'bg-amber-500/15 text-amber-700',
    failed:  'bg-ember-500/15 text-ember-500',
    never:   'bg-ink-200 text-ink-500',
  }
  return map[status] ?? 'bg-ink-200 text-ink-500'
}

function durationMs(a: string, b: string | null): string {
  if (!b) return 'running…'
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function apiHealthPill(status: string): string {
  const map: Record<string, string> = {
    ok:           'bg-moss-500/15 text-moss-500',
    error:        'bg-ember-500/15 text-ember-500',
    unauthorized: 'bg-ember-500/15 text-ember-500',
    rate_limited: 'bg-amber-500/15 text-amber-700',
    no_credits:   'bg-amber-500/15 text-amber-700',
    never_called: 'bg-ink-200 text-ink-500',
  }
  return map[status] ?? 'bg-ink-200 text-ink-500'
}

const API_LABEL: Record<string, { name: string; purpose: string }> = {
  tracerfy:       { name: 'Tracerfy',      purpose: 'Skip-trace owner phone/email' },
  hasdata_zillow: { name: 'HasData Zillow', purpose: 'Property intel + Zestimate' },
  google_maps:    { name: 'Google Maps',   purpose: 'Geocode + Street View' },
  twocaptcha:     { name: '2Captcha',      purpose: 'reCAPTCHA solver for MassCourts' },
}

// ── Per-scanner summary built from raw scan_runs ───────────────────────────
function buildScannerSummary(
  runs: ScanRun[],
  sourceKeys: readonly string[],
): {
  lastRun: ScanRun | null
  lastStatus: string
  consecutiveFailures: number
  totalSignals7d: number
  signalCounts: Record<string, number>
} {
  const relevant = runs.filter(r => sourceKeys.includes(r.source))
  if (relevant.length === 0) {
    return { lastRun: null, lastStatus: 'never', consecutiveFailures: 0, totalSignals7d: 0, signalCounts: {} }
  }
  const lastRun = relevant[0] // already sorted by started_at desc
  let consecutiveFailures = 0
  for (const r of relevant) {
    if (r.status === 'failed') consecutiveFailures++
    else break
  }
  return {
    lastRun,
    lastStatus: lastRun.status,
    consecutiveFailures,
    totalSignals7d: 0, // filled in below
    signalCounts: {},
  }
}

export default async function CoveragePage() {
  await pingGoogleMapsHealth()

  const [runs, zips, apiHealth, signalsBySource] = await Promise.all([
    getRecentScanRuns(100),
    getZipCoverage(),
    getApiHealth(),
    getSignalCountsBySource(7),
  ])

  return (
    <div className="px-8 py-6 max-w-[1400px]">
      <header className="mb-6">
        <h1 className="text-2xl font-display font-semibold tracking-tight text-ink-900">Coverage</h1>
        <p className="text-sm text-ink-500 mt-0.5">Scanner health, signal pipeline, and ZIP distribution.</p>
      </header>

      {/* ── SCANNER WIDGETS ──────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-wider font-medium text-ink-500 mb-3">Scanners</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SCANNERS.map(scanner => {
            const summary = buildScannerSummary(runs, scanner.sourceKeys)
            const signals7d = scanner.sourceKeys.reduce((n, k) => n + (signalsBySource[k] ?? 0), 0)

            return (
              <div key={scanner.key} className="bg-white rounded-2xl shadow-soft p-5 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot(summary.lastStatus)}`} />
                      <span className="text-sm font-semibold text-ink-900">{scanner.label}</span>
                    </div>
                    <div className="text-xs text-ink-400 mt-0.5 ml-4">{scanner.subtitle}</div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium shrink-0 ${statusPill(summary.lastStatus)}`}>
                    {summary.lastStatus}
                  </span>
                </div>

                {/* Signal type chips */}
                <div className="flex flex-wrap gap-1.5">
                  {scanner.signalTypes.map(t => (
                    <span key={t} className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SIGNAL_CHIP[t] ?? 'bg-ink-100 text-ink-600'}`}>
                      {signalTypeLabel(t)}
                    </span>
                  ))}
                </div>

                {/* Run stats */}
                {summary.lastRun ? (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-ink-400">Last run</dt>
                      <dd className="text-ink-700">{fmtRelative(summary.lastRun.started_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-400">Duration</dt>
                      <dd className="text-ink-700 tabular-nums">{durationMs(summary.lastRun.started_at, summary.lastRun.completed_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-400">Docs (last run)</dt>
                      <dd className="text-ink-700 tabular-nums">{summary.lastRun.documents_processed.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-400">Signals (7d)</dt>
                      <dd className={`tabular-nums font-medium ${signals7d > 0 ? 'text-moss-500' : 'text-ink-400'}`}>
                        {signals7d > 0 ? signals7d : '—'}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="text-xs text-ink-400 italic">Never run — no data yet</div>
                )}

                {/* Failure warning */}
                {summary.consecutiveFailures >= 2 && (
                  <div className="px-2.5 py-1.5 rounded-lg bg-ember-500/10 text-ember-500 text-[10px] uppercase tracking-wider font-medium">
                    ⚠ {summary.consecutiveFailures} consecutive failures
                  </div>
                )}

                {/* Last error */}
                {summary.lastRun?.error_message && (
                  <details className="text-[10px]">
                    <summary className="text-ink-400 cursor-pointer hover:text-ink-700">View last error</summary>
                    <pre className="mt-1.5 font-mono text-ember-500 bg-ember-500/5 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words max-h-32">
                      {summary.lastRun.error_message.replace(/\[\d+m/g, '')}
                    </pre>
                  </details>
                )}

                {/* Source keys */}
                <div className="pt-1 border-t border-cream-200">
                  <div className="text-[10px] text-ink-400 font-mono leading-relaxed">
                    {scanner.sourceKeys.join(' · ')}
                  </div>
                </div>

                <PlaceholderButton reason={`Run scanner from VM: cd scanner && ${scanner.runCmd}`} size="sm">
                  Run now
                </PlaceholderButton>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── RECENT RUNS TABLE ─────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider font-medium text-ink-500">Recent runs</h2>
          <span className="text-[10px] uppercase tracking-wider text-ink-400">{runs.length} shown</span>
        </div>
        <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
          <div className="grid grid-cols-12 px-5 py-2.5 border-b border-cream-400 text-[10px] uppercase tracking-wider font-medium text-ink-400">
            <div className="col-span-3">Source</div>
            <div className="col-span-2">Started</div>
            <div className="col-span-2">Duration</div>
            <div className="col-span-1 text-right">Docs</div>
            <div className="col-span-1 text-right">Signals</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-2">Error</div>
          </div>
          <ul className="divide-y divide-cream-200">
            {runs.slice(0, 50).map(r => (
              <li key={r.id} className="grid grid-cols-12 items-center px-5 py-2.5 text-xs">
                <div className="col-span-3 text-ink-700 truncate">{sourceLabel(r.source)}</div>
                <div className="col-span-2 text-ink-500">{fmtRelative(r.started_at)}</div>
                <div className="col-span-2 text-ink-500 tabular-nums">{durationMs(r.started_at, r.completed_at)}</div>
                <div className="col-span-1 text-right text-ink-700 tabular-nums">{r.documents_processed.toLocaleString()}</div>
                <div className="col-span-1 text-right text-ink-700 tabular-nums">{r.signals_created}</div>
                <div className="col-span-1">
                  <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusPill(r.status)}`}>
                    {r.status}
                  </span>
                </div>
                <div className="col-span-2 text-ink-400 truncate" title={r.error_message ?? ''}>
                  {r.error_message ? r.error_message.replace(/\[\d+m/g, '').split('\n')[0] : '—'}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── ZIP COVERAGE ──────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-xs uppercase tracking-wider font-medium text-ink-500">ZIP coverage</h2>
          <span className="text-[10px] uppercase tracking-wider text-ink-400">{zips.length} ZIPs with leads</span>
        </div>
        <div className="bg-white rounded-2xl shadow-soft p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {zips.map(z => (
              <div key={z.zip} className="flex items-baseline justify-between px-3 py-2 rounded-lg bg-cream-100">
                <span className="text-sm font-mono text-ink-700">{z.zip}</span>
                <span className="text-sm font-medium text-amber-700 tabular-nums">{z.lead_count}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EXTERNAL APIs ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs uppercase tracking-wider font-medium text-ink-500 mb-3">External APIs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {apiHealth.map(api => {
            const meta = API_LABEL[api.api_name] ?? { name: api.api_name, purpose: '' }
            return (
              <div key={api.api_name} className="bg-white rounded-2xl shadow-soft p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink-900">{meta.name}</div>
                    <div className="text-xs text-ink-500 mt-0.5">{meta.purpose}</div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium ${apiHealthPill(api.last_status)}`}>
                    {api.last_status === 'never_called' ? 'never' : api.last_status}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><dt className="text-ink-400">Last call</dt><dd className="text-ink-700">{api.last_called_at ? fmtRelative(api.last_called_at) : '—'}</dd></div>
                  <div><dt className="text-ink-400">Latency</dt><dd className="text-ink-700 tabular-nums">{api.last_response_time_ms ? `${api.last_response_time_ms}ms` : '—'}</dd></div>
                  <div><dt className="text-ink-400">Calls today</dt><dd className="text-ink-700 tabular-nums">{api.total_calls_today}</dd></div>
                  <div><dt className="text-ink-400">Failures today</dt><dd className={`tabular-nums ${api.total_failures_today > 0 ? 'text-ember-500' : 'text-ink-700'}`}>{api.total_failures_today}</dd></div>
                  {api.credits_remaining != null && (
                    <div className="col-span-2">
                      <dt className="text-ink-400">Credits remaining</dt>
                      <dd className={`tabular-nums font-medium ${api.credits_remaining < 100 ? 'text-ember-500' : 'text-ink-700'}`}>
                        {api.credits_remaining.toLocaleString()}
                        {api.credits_remaining < 100 && ' ⚠ low'}
                      </dd>
                    </div>
                  )}
                </dl>
                {api.last_error_message && (
                  <details className="mt-3">
                    <summary className="text-[10px] text-ember-500 cursor-pointer hover:text-ember-700">View last error</summary>
                    <pre className="mt-2 text-[10px] font-mono text-ember-500 bg-ember-500/5 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words max-h-40">
                      {api.last_error_message}
                    </pre>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
