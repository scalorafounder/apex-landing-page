'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

interface NotifSetting {
  id: string
  type: 'email' | 'sms'
  destination: string
  label: string | null
  enabled: boolean
}

export function NotificationSettings({ initial }: { initial: NotifSetting[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState<'email' | 'sms'>('email')
  const [dest, setDest] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!dest.trim()) return
    setAdding(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, destination: dest.trim(), label: label.trim() || null }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to add')
      }
      setDest('')
      setLabel('')
      startTransition(() => router.refresh())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/settings/notifications/${id}`, { method: 'DELETE' })
    startTransition(() => router.refresh())
  }

  async function handleToggle(id: string, enabled: boolean) {
    await fetch(`/api/settings/notifications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
    startTransition(() => router.refresh())
  }

  const emails = initial.filter(n => n.type === 'email')
  const sms    = initial.filter(n => n.type === 'sms')

  return (
    <div className="space-y-8">
      {/* Recipients list */}
      <section>
        <h2 className="text-sm font-display font-semibold text-ink-900 mb-3">Alert recipients</h2>
        <div className="bg-white rounded-2xl shadow-soft divide-y divide-cream-200">
          {initial.length === 0 && (
            <div className="px-5 py-6 text-sm text-ink-400 text-center">No recipients yet — add one below.</div>
          )}
          {initial.map(n => (
            <div key={n.id} className="flex items-center gap-4 px-5 py-3.5">
              <span className={`shrink-0 inline-flex items-center rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold ${
                n.type === 'email' ? 'bg-blue-600/10 text-blue-700' : 'bg-moss-500/10 text-moss-600'
              }`}>
                {n.type === 'email' ? 'Email' : 'SMS'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink-900 truncate">{n.destination}</div>
                {n.label && <div className="text-xs text-ink-400">{n.label}</div>}
              </div>
              <button
                onClick={() => handleToggle(n.id, !n.enabled)}
                className={`shrink-0 text-xs px-2.5 py-1 rounded-full transition-colors ${
                  n.enabled
                    ? 'bg-moss-500/10 text-moss-700 hover:bg-red-50 hover:text-red-600'
                    : 'bg-ink-100 text-ink-400 hover:bg-moss-500/10 hover:text-moss-700'
                }`}
              >
                {n.enabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => handleDelete(n.id)}
                className="shrink-0 text-xs text-ink-300 hover:text-red-500 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Add recipient form */}
      <section>
        <h2 className="text-sm font-display font-semibold text-ink-900 mb-3">Add recipient</h2>
        <div className="bg-white rounded-2xl shadow-soft p-5">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('email')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === 'email' ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setType('sms')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  type === 'sms' ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-500 hover:bg-cream-200'
                }`}
              >
                SMS
              </button>
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1.5">
                {type === 'email' ? 'Email address' : 'Phone number (e.g. +16175551234)'}
              </label>
              <input
                type={type === 'email' ? 'email' : 'tel'}
                value={dest}
                onChange={e => setDest(e.target.value)}
                placeholder={type === 'email' ? 'you@example.com' : '+1 (617) 555-1234'}
                required
                className="w-full px-3 py-2 text-sm bg-cream-50 border border-cream-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-ink-900 placeholder-ink-300"
              />
            </div>

            <div>
              <label className="block text-xs text-ink-500 mb-1.5">Label (optional)</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="e.g. My phone, Partner alerts..."
                className="w-full px-3 py-2 text-sm bg-cream-50 border border-cream-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/50 text-ink-900 placeholder-ink-300"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={adding || !dest.trim()}
              className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-ink-900 font-semibold text-sm transition-colors disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add recipient'}
            </button>
          </form>
        </div>
      </section>

    </div>
  )
}
