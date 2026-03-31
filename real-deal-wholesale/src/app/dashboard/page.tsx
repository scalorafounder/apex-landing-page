'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Job = {
  id: string
  zip_code: string
  county: string
  state: string
  requested_count: number
  status: string
  lead_count: number
  credits_used: number
  tracerfy_download: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
}

type Profile = {
  credits: number
  plan: string
  email: string
}

const STATUS_LABELS: Record<string, string> = {
  queued:   'Queued',
  scraping: 'Scraping Records',
  tracing:  'Skip Tracing',
  complete: 'Complete',
  failed:   'Failed',
}

const STATUS_DOTS: Record<string, string> = {
  queued:   'bg-gray-500',
  scraping: 'bg-blue-400 animate-pulse',
  tracing:  'bg-purple-400 animate-pulse',
  complete: 'bg-green-400',
  failed:   'bg-red-400',
}

function BrandLogo() {
  return (
    <div className="font-display leading-none">
      <div className="text-2xl font-black">
        <span className="text-brand-500">REAL</span>
        <span className="text-white">DEAL</span>
      </div>
      <div className="text-[10px] tracking-[0.3em] text-steel font-body font-normal mt-0.5">
        — WHOLESALE BY APEX —
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [zip, setZip] = useState('')
  const [count, setCount] = useState(50)
  const [formError, setFormError] = useState('')

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [profileRes, jobsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('jobs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20)
    ])

    if (profileRes.data) setProfile(profileRes.data)
    if (jobsRes.data) setJobs(jobsRes.data)
    setLoading(false)
  }, [supabase, router])

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [loadData])

  const submitJob = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (!zip || zip.length !== 5) { setFormError('Enter a valid 5-digit zip code'); return }
    if (!profile) return
    if (profile.credits < count) { setFormError(`Not enough credits. You have ${profile.credits} credits.`); return }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: job, error } = await supabase.from('jobs').insert({
      user_id: user.id,
      zip_code: zip,
      requested_count: count,
      status: 'queued',
      credits_used: count,
    }).select().single()

    if (error) { setFormError(error.message); setSubmitting(false); return }

    await supabase.from('profiles').update({ credits: profile.credits - count }).eq('id', user.id)

    await fetch('/api/jobs/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, zip, count }),
    })

    setZip('')
    setCount(50)
    setSubmitting(false)
    loadData()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center">
        <div className="text-center">
          <div className="font-display font-black text-2xl mb-2">
            <span className="text-brand-500">REAL</span><span className="text-white">DEAL</span>
          </div>
          <div className="text-gray-500 text-sm font-body">Loading your dashboard...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-900">

      {/* Header */}
      <header className="border-b border-dark-600 px-6 py-4 flex items-center justify-between bg-dark-800/50 backdrop-blur-sm">
        <BrandLogo />
        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="text-xs text-gray-500 font-body uppercase tracking-wider">Credits</div>
            <div className="font-display font-black text-2xl text-brand-500">{profile?.credits ?? 0}</div>
          </div>
          <button
            onClick={() => window.location.href = '/api/billing/portal'}
            className="text-xs text-gray-400 hover:text-white transition-colors border border-dark-500 hover:border-brand-500/50 px-3 py-1.5 rounded font-body"
          >
            Upgrade
          </button>
          <button
            onClick={signOut}
            className="text-xs text-gray-600 hover:text-gray-400 transition-colors font-body"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* New Job Form */}
        <div className="bg-dark-800 border border-dark-600 rounded-2xl p-6 mb-8">
          <h2 className="font-display font-black text-3xl tracking-tight mb-1">
            PULL <span className="text-brand-500">LEADS</span>
          </h2>
          <p className="text-gray-500 text-sm mb-6 font-body">
            Fresh pre-foreclosure leads from county public records. Delivered in 24 hours.
          </p>

          <form onSubmit={submitJob} className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider font-body">Zip Code</label>
                <input
                  type="text"
                  value={zip}
                  onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="e.g. 85001"
                  maxLength={5}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 transition-colors font-display font-bold text-2xl tracking-widest"
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider font-body">
                  Lead Count <span className="text-brand-500 normal-case">({count} credits)</span>
                </label>
                <select
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value))}
                  className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-brand-500 transition-colors font-body"
                >
                  <option value={25}>25 leads</option>
                  <option value={50}>50 leads</option>
                  <option value={100}>100 leads</option>
                  <option value={200}>200 leads</option>
                  <option value={500}>500 leads</option>
                </select>
              </div>
              <div className="md:col-span-1 flex items-end">
                <button
                  type="submit"
                  disabled={submitting || !zip}
                  className="w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-lg font-semibold transition-colors font-body"
                >
                  {submitting ? 'Submitting...' : 'Pull Leads →'}
                </button>
              </div>
            </div>

            {formError && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm font-body">
                {formError}
              </div>
            )}
          </form>

          {profile && profile.credits < 25 && (
            <div className="mt-4 bg-brand-500/10 border border-brand-500/30 rounded-lg px-4 py-3 text-sm flex items-center justify-between font-body">
              <span className="text-brand-400">Running low on credits.</span>
              <button
                onClick={() => window.location.href = '/api/billing/portal'}
                className="text-brand-500 hover:text-brand-400 font-semibold"
              >
                Upgrade for more →
              </button>
            </div>
          )}
        </div>

        {/* Jobs List */}
        <div>
          <h3 className="font-display font-bold text-xl tracking-wider mb-4 text-gray-400 uppercase">
            Your Jobs
          </h3>

          {jobs.length === 0 ? (
            <div className="bg-dark-800 border border-dark-600 rounded-2xl p-12 text-center">
              <div className="font-display font-black text-4xl text-dark-500 mb-3">NO JOBS YET</div>
              <p className="text-gray-600 text-sm font-body">Submit your first lead request above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <div
                  key={job.id}
                  className="bg-dark-800 border border-dark-600 rounded-xl px-6 py-4 flex items-center justify-between gap-4 hover:border-dark-500 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOTS[job.status]}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="font-display font-black text-2xl text-white tracking-widest">{job.zip_code}</span>
                        {job.county && (
                          <span className="text-xs text-gray-500 truncate font-body">{job.county}, {job.state}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded font-body status-${job.status}`}>
                          {STATUS_LABELS[job.status] || job.status}
                        </span>
                        <span className="text-xs text-gray-600 font-body">
                          {job.requested_count} requested
                          {job.lead_count > 0 && ` · ${job.lead_count} found`}
                        </span>
                        <span className="text-xs text-gray-700 font-body">
                          {new Date(job.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {job.status === 'complete' && job.tracerfy_download ? (
                      <a
                        href={job.tracerfy_download}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-green-900/30 hover:bg-green-900/50 border border-green-500/30 text-green-400 text-xs px-4 py-2 rounded-lg transition-colors font-semibold font-body"
                      >
                        Download CSV
                      </a>
                    ) : job.status === 'failed' ? (
                      <span className="text-xs text-red-500 font-body">{job.error_message || 'Failed'}</span>
                    ) : (
                      <div className="text-xs text-gray-600 font-body">Processing...</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
