'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LeadStatus } from '@/lib/types'
import { statusLabel } from '@/lib/format'

const STATUSES: LeadStatus[] = ['new', 'contacted', 'in_progress', 'deal', 'dead']

export function LeadEditor({
  leadId,
  initialStatus,
  initialNotes,
}: {
  leadId: string
  initialStatus: LeadStatus
  initialNotes: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<LeadStatus>(initialStatus)
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function patch(body: Record<string, any>) {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(j.error ?? 'Save failed')
      return false
    }
    setSavedAt(new Date().toLocaleTimeString())
    startTransition(() => router.refresh())
    return true
  }

  async function changeStatus(next: LeadStatus) {
    setStatus(next)
    setSavingStatus(true)
    const ok = await patch({ status: next })
    setSavingStatus(false)
    if (!ok) setStatus(initialStatus)
  }

  async function saveNotes() {
    setSavingNotes(true)
    await patch({ notes })
    setSavingNotes(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-[10px] uppercase tracking-wider font-medium text-ink-400 mb-1.5 block">Status</label>
        <select
          value={status}
          onChange={e => changeStatus(e.target.value as LeadStatus)}
          disabled={savingStatus}
          className="w-full px-3 py-2 rounded-lg bg-cream-100 border border-cream-400 text-sm text-ink-900 focus:outline-none focus:border-amber-500 disabled:opacity-60"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-[10px] uppercase tracking-wider font-medium text-ink-400 mb-1.5 block">Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={5}
          placeholder="Call notes, next steps, what owner said…"
          className="w-full px-3 py-2 rounded-lg bg-cream-100 border border-cream-400 text-sm text-ink-900 placeholder-ink-300 resize-none focus:outline-none focus:border-amber-500"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-ink-400">
            {savedAt ? `Saved ${savedAt}` : ' '}
          </span>
          <button
            onClick={saveNotes}
            disabled={savingNotes || notes === (initialNotes ?? '')}
            className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-ink-900 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingNotes ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      </div>
    </div>
  )
}
