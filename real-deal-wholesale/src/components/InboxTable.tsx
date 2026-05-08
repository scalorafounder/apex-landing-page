'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { fmtDate, fmtMoney, signalTypeLabel, titleCase, isEntityOwner } from '@/lib/format'
import type { LeadWithProperty } from '@/lib/types'

type SortKey = 'recency' | 'signals' | 'value'

interface Row extends LeadWithProperty {
  latest_filing_date: string | null
}

const SIGNAL_CHIP: Record<string, string> = {
  tax_taking:     'bg-ember-500 text-white',
  lis_pendens:    'bg-blue-600 text-white',
  mechanics_lien: 'bg-amber-500 text-ink-900',
  code_violation: 'bg-purple-600 text-white',
  divorce:        'bg-pink-500 text-white',
  eviction:       'bg-moss-500 text-white',
}

const SIGNAL_DOT: Record<string, string> = {
  tax_taking:     'bg-ember-500',
  lis_pendens:    'bg-blue-600',
  mechanics_lien: 'bg-amber-500',
  code_violation: 'bg-purple-600',
  divorce:        'bg-pink-500',
  eviction:       'bg-moss-500',
}

const FILTER_OPTS = [
  { key: 'all',           label: 'All' },
  { key: 'tax_taking',    label: 'Tax Taking' },
  { key: 'lis_pendens',   label: 'Lis Pendens' },
  { key: 'mechanics_lien', label: 'Mech. Lien' },
  { key: 'code_violation', label: 'Code Viol.' },
  { key: 'divorce',       label: 'Divorce' },
  { key: 'eviction',      label: 'Eviction' },
]

const SORT_OPTS: Array<{ key: SortKey; label: string }> = [
  { key: 'recency',  label: 'Most recent' },
  { key: 'signals',  label: 'Most signals' },
  { key: 'value',    label: 'Highest value' },
]

// A lead is "new" if its latest filing is within the past 48h
function isNew(dateStr: string | null): boolean {
  if (!dateStr) return false
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? (() => { const [y, m, dy] = dateStr.split('-').map(Number); return new Date(y, m - 1, dy) })()
    : new Date(dateStr)
  return Date.now() - d.getTime() < 1000 * 60 * 60 * 48
}

export function InboxTable({ leads }: { leads: Row[] }) {
  const [filter, setFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('recency')

  const displayed = useMemo(() => {
    let rows = filter === 'all'
      ? [...leads]
      : leads.filter(r => r.signal_types?.includes(filter))

    rows.sort((a, b) => {
      if (sortKey === 'signals') return (b.signal_count ?? 0) - (a.signal_count ?? 0)
      if (sortKey === 'value')   return (b.property?.assessed_total ?? -1) - (a.property?.assessed_total ?? -1)
      // recency: filing_date first, then last_signal_at
      const fa = a.latest_filing_date ?? a.last_signal_at ?? ''
      const fb = b.latest_filing_date ?? b.last_signal_at ?? ''
      return fb.localeCompare(fa)
    })
    return rows
  }, [leads, filter, sortKey])

  return (
    <div>
      {/* Filter + Sort bar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_OPTS.map(f => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 select-none ${
                  active
                    ? 'bg-ink-900 text-white shadow-sm scale-[1.02]'
                    : 'bg-white text-ink-500 shadow-soft hover:text-ink-900 hover:shadow-sm hover:scale-[1.01]'
                }`}
              >
                {f.key !== 'all' && (
                  <span className={`w-1.5 h-1.5 rounded-full ${SIGNAL_DOT[f.key] ?? 'bg-ink-300'}`} />
                )}
                {f.label}
              </button>
            )
          })}
        </div>

        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="text-xs text-ink-700 bg-white border border-cream-300 rounded-lg px-3 py-1.5 shadow-soft focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer"
        >
          {SORT_OPTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Email-style lead list */}
      <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
        {displayed.length === 0 ? (
          <div className="px-5 py-14 text-center text-sm text-ink-400">
            No leads match this filter.
          </div>
        ) : (
          <ul className="divide-y divide-cream-200">
            {displayed.map(lead => {
              const p = lead.property
              const primaryType = lead.signal_types?.[0] ?? ''
              const fresh = isNew(lead.latest_filing_date)

              return (
                <li key={lead.id}>
                  <Link
                    href={`/leads/${lead.id}`}
                    className="group flex items-center gap-4 px-5 py-4 hover:bg-cream-100 transition-colors duration-100"
                  >
                    {/* Signal type chip */}
                    <div className="shrink-0 w-[86px] flex flex-col items-center gap-1.5">
                      <span className={`inline-flex items-center justify-center w-full rounded-lg px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide leading-none text-center ${SIGNAL_CHIP[primaryType] ?? 'bg-ink-200 text-ink-700'}`}>
                        {signalTypeLabel(primaryType)}
                      </span>
                      {(lead.signal_types?.length ?? 0) > 1 && (
                        <span className="text-[9px] text-ink-400">+{(lead.signal_types?.length ?? 1) - 1} more</span>
                      )}
                    </div>

                    {/* Address + owner */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="text-sm font-semibold text-ink-900 truncate group-hover:text-amber-700 transition-colors duration-100">
                          {titleCase(p.site_address)}
                        </span>
                        {isEntityOwner(p.owner_name) && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wider font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            Entity
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500 mt-0.5 truncate">
                        {titleCase(p.city)}, MA {p.zip}
                        {p.owner_name ? <> · {titleCase(p.owner_name)}</> : null}
                      </div>
                    </div>

                    {/* Right: date + signal count + value */}
                    <div className="shrink-0 text-right space-y-0.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {fresh && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                            New
                          </span>
                        )}
                        <span className="text-sm font-semibold text-ink-900 tabular-nums">
                          {fmtDate(lead.latest_filing_date)}
                        </span>
                      </div>
                      <div className="text-xs text-ink-400 tabular-nums">
                        {lead.signal_count}× signals
                      </div>
                      {p.assessed_total ? (
                        <div className="text-xs text-ink-500 tabular-nums">{fmtMoney(p.assessed_total)}</div>
                      ) : null}
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
