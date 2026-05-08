import { statusLabel } from '@/lib/format'
import type { LeadStatus } from '@/lib/types'

const styles: Record<string, string> = {
  new:         'bg-amber-100 text-amber-800',
  queued:      'bg-cream-300 text-ink-700',
  contacted:   'bg-blue-100 text-blue-800',
  in_progress: 'bg-flame-500/15 text-flame-600',
  deal:        'bg-moss-500/15 text-moss-500',
  dead:        'bg-ink-200 text-ink-500',
}

export function StatusBadge({ status }: { status: LeadStatus | string }) {
  const cls = styles[status] ?? styles.queued
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {statusLabel(status)}
    </span>
  )
}
