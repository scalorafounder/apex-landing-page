export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US').format(n)
}

/** Filing date or other date string → "May 1, 2026" */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  // Date-only strings (YYYY-MM-DD) must be parsed as local midnight, not UTC midnight.
  // new Date("2026-05-05") = UTC midnight → renders as May 4 in EDT (UTC-4).
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** "2 days ago", "just now" — for scrape timestamps, NOT signal filing dates */
export function fmtRelative(d: string | null | undefined): string {
  if (!d) return '—'
  const dt = new Date(d).getTime()
  if (isNaN(dt)) return '—'
  const diff = Date.now() - dt
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const dd = Math.floor(h / 24)
  if (dd < 30) return `${dd}d ago`
  const mo = Math.floor(dd / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

export function fmtAddress(addr: string | null | undefined): string {
  if (!addr) return '—'
  return addr.replace(/\b\w/g, c => c.toUpperCase())
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return '—'
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

export function signalTypeLabel(t: string): string {
  const map: Record<string, string> = {
    tax_taking: 'Tax Taking',
    lis_pendens: 'Lis Pendens',
    mechanics_lien: "Mechanic's Lien",
    code_violation: 'Code Violation',
    divorce: 'Divorce',
    eviction: 'Eviction',
  }
  return map[t] ?? titleCase(t.replace(/_/g, ' '))
}

export function sourceLabel(s: string): string {
  const map: Record<string, string> = {
    suffolk_registry: 'Suffolk Registry',
    middlesex_south_registry: 'Middlesex South Registry',
    middlesex_north_registry: 'Middlesex North Registry',
    norfolk_registry: 'Norfolk Registry',
    boston_violations_api: 'Boston 311 / Violations',
    masscourts_divorce: 'MA Courts (Divorce)',
    masscourts_eviction: 'MA Courts (Eviction)',
  }
  return map[s] ?? titleCase(s.replace(/_/g, ' '))
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    new: 'New',
    queued: 'Queued',
    contacted: 'Contacted',
    in_progress: 'In Progress',
    deal: 'Deal',
    dead: 'Dead',
  }
  return map[s] ?? titleCase(s)
}

/** True if owner_name looks like an LLC/Trust/Corp (entity, not individual) */
export function isEntityOwner(name: string | null | undefined): boolean {
  if (!name) return false
  return /\b(LLC|L\.L\.C|INC|CORP|TRUST|LP|LLP|CO\b|COMPANY|HOLDINGS|PARTNERS|REALTY)\b/i.test(name)
}
