'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

export default function LoginPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const isSignup = params.get('signup') === 'true'

  const [mode, setMode] = useState<'login' | 'signup'>(isSignup ? 'signup' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('Check your email to confirm your account, then sign in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <Link href="/" className="block text-center mb-10">
          <div className="font-display leading-none inline-block">
            <div className="text-3xl font-black">
              <span className="text-brand-500">REAL</span>
              <span className="text-white">DEAL</span>
            </div>
            <div className="text-[10px] tracking-[0.3em] text-steel font-body font-normal mt-0.5">
              — WHOLESALE BY APEX —
            </div>
          </div>
        </Link>

        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-8">

          {/* Toggle */}
          <div className="flex bg-dark-700 rounded-lg p-1 mb-6">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all font-body ${
                  mode === m
                    ? 'bg-brand-500 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider font-body">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors text-sm font-body"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider font-body">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors text-sm font-body"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm font-body">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm font-body">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors mt-2 font-body"
            >
              {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {mode === 'signup' && (
            <p className="text-xs text-gray-600 text-center mt-4 font-body">
              You get 10 free credits on signup — no card needed.
            </p>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-6 font-body">
          <Link href="/" className="hover:text-gray-500 transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
