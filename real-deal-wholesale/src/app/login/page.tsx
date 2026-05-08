'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/inbox'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setLoading(true)
    const sb = createClient()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (error) {
      setErr(error.message)
      setLoading(false)
      return
    }
    router.push(next)
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-cream">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-amber-500 text-ink-900 font-display font-semibold text-xl shadow-soft">
            A
          </div>
          <h1 className="mt-6 text-2xl font-display font-semibold tracking-tight text-ink-900">APEX</h1>
          <p className="mt-1 text-sm text-ink-500">Internal lead system</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-soft p-6 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-ink-500 uppercase tracking-wide">Email</span>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-cream-100 border border-cream-400 text-ink-900 placeholder-ink-300 text-sm focus:outline-none focus:border-amber-500"
              placeholder="you@apex.team"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-500 uppercase tracking-wide">Password</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-cream-100 border border-cream-400 text-ink-900 placeholder-ink-300 text-sm focus:outline-none focus:border-amber-500"
              placeholder="••••••••"
            />
          </label>
          {err && (
            <div className="text-sm text-ember-500 bg-ember-500/10 px-3 py-2 rounded-lg">{err}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-ink-900 font-medium text-sm transition-colors duration-200 ease-apple disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
