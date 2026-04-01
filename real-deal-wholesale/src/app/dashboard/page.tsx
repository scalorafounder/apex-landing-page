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

const C = {
  bg:      '#06111C',
  bgDeep:  '#040e16',
  card:    '#0c1e2d',
  border:  '#152435',
  borderM: '#1e3448',
  navy:    '#0A2F4F',
  gold:    '#EBAF4E',
  goldL:   '#f5cc7f',
  white:   '#F0F4F8',
  text:    '#c5d3de',
  muted:   '#6a8090',
  dim:     '#3a5060',
  green:   '#3ecf8e',
  red:     '#e05252',
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
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <svg viewBox="0 0 36 36" fill="none" width={26} height={26}>
        <path d="M18 4L4 16h4v14h8v-8h4v8h8V16h4L18 4z" fill={C.navy} stroke={C.gold} strokeWidth="1.2"/>
        <rect x="14" y="20" width="8" height="10" fill={C.gold} opacity=".3"/>
      </svg>
      <div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontSize:16, fontWeight:800, color:C.white, letterSpacing:'.02em', lineHeight:1 }}>
          REAL DEAL <span style={{ color:C.gold }}>WHOLESALE</span>
        </div>
        <div style={{ fontFamily:'Lato,sans-serif', fontSize:8, fontWeight:600, color:C.muted, letterSpacing:'.18em', textTransform:'uppercase', marginTop:2 }}>
          BY APEX
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router  = useRouter()
  const supabase = createClient()

  const [profile,    setProfile]    = useState<Profile | null>(null)
  const [jobs,       setJobs]       = useState<Job[]>([])
  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [zip,        setZip]        = useState('')
  const [count,      setCount]      = useState(50)
  const [formError,  setFormError]  = useState('')

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [profileRes, jobsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('jobs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(20),
    ])
    if (profileRes.data) setProfile(profileRes.data)
    if (jobsRes.data)    setJobs(jobsRes.data)
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
      user_id: user.id, zip_code: zip, requested_count: count, status: 'queued', credits_used: count,
    }).select().single()

    if (error) { setFormError(error.message); setSubmitting(false); return }

    await supabase.from('profiles').update({ credits: profile.credits - count }).eq('id', user.id)
    await fetch('/api/jobs/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, zip, count }),
    })

    setZip(''); setCount(50); setSubmitting(false); loadData()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const font      = 'Lato,sans-serif'
  const titleFont = 'Montserrat,sans-serif'

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:titleFont, fontSize:22, fontWeight:900, color:C.white, marginBottom:8 }}>
            REAL DEAL <span style={{ color:C.gold }}>WHOLESALE</span>
          </div>
          <div style={{ fontSize:13, color:C.muted, fontFamily:font }}>Loading your dashboard…</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:font }}>

      {/* Gold top bar */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,transparent,${C.gold},transparent)`, opacity:.6, zIndex:1001, pointerEvents:'none' }}/>

      {/* Header */}
      <header style={{ position:'sticky', top:3, zIndex:100, borderBottom:`1px solid ${C.border}`, padding:'14px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(6,17,28,.95)', backdropFilter:'blur(20px)' }}>
        <BrandLogo/>
        <div style={{ display:'flex', alignItems:'center', gap:24 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>Credits</div>
            <div style={{ fontFamily:titleFont, fontSize:22, fontWeight:900, color:C.gold, lineHeight:1 }}>{profile?.credits ?? 0}</div>
          </div>
          <button
            onClick={() => window.location.href = '/api/billing/portal'}
            style={{ padding:'8px 18px', borderRadius:4, border:`1px solid ${C.borderM}`, background:'transparent', color:C.text, fontSize:12, fontWeight:700, fontFamily:titleFont, letterSpacing:'.06em', textTransform:'uppercase', cursor:'pointer', transition:'all .2s' }}
            onMouseOver={e => { (e.target as HTMLElement).style.borderColor = `${C.gold}60`; (e.target as HTMLElement).style.color = C.white }}
            onMouseOut={e  => { (e.target as HTMLElement).style.borderColor = C.borderM;    (e.target as HTMLElement).style.color = C.text  }}
          >
            Upgrade
          </button>
          <button onClick={signOut} style={{ background:'none', border:'none', color:C.muted, fontSize:12, fontFamily:font, cursor:'pointer', letterSpacing:'.02em', transition:'color .2s' }}
            onMouseOver={e => { (e.target as HTMLElement).style.color = C.text }}
            onMouseOut={e  => { (e.target as HTMLElement).style.color = C.muted }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div style={{ maxWidth:900, margin:'0 auto', padding:'40px 24px' }}>

        {/* ─── Pull Leads Form ─── */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:4, padding:'36px 32px', marginBottom:32, position:'relative', overflow:'hidden' }}>
          {/* top gold bar */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.gold}80,${C.navy},transparent)` }}/>

          <h2 style={{ fontFamily:titleFont, fontSize:28, fontWeight:900, color:C.white, marginBottom:4, letterSpacing:'-.01em' }}>
            PULL <span style={{ color:C.gold }}>LEADS</span>
          </h2>
          <p style={{ fontSize:14, color:C.muted, marginBottom:28, fontFamily:font, fontWeight:300 }}>
            Fresh pre-foreclosure leads from county public records. Delivered in 24 hours.
          </p>

          <form onSubmit={submitJob}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:16 }}>
              {/* Zip */}
              <div>
                <label style={{ display:'block', fontSize:11, color:C.muted, marginBottom:8, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>Zip Code</label>
                <input
                  type="text"
                  value={zip}
                  onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))}
                  placeholder="e.g. 85001"
                  maxLength={5}
                  style={{ width:'100%', background:'#06111C', border:`1px solid ${C.borderM}`, borderRadius:4, padding:'14px 16px', color:C.white, fontSize:24, fontFamily:titleFont, fontWeight:800, letterSpacing:'.2em', outline:'none', transition:'border-color .2s' }}
                  onFocus={e => { e.target.style.borderColor = C.gold }}
                  onBlur={e  => { e.target.style.borderColor = C.borderM }}
                />
              </div>
              {/* Count */}
              <div>
                <label style={{ display:'block', fontSize:11, color:C.muted, marginBottom:8, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>
                  Lead Count <span style={{ color:C.gold, textTransform:'none' }}>({count} credits)</span>
                </label>
                <select
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value))}
                  style={{ width:'100%', background:'#06111C', border:`1px solid ${C.borderM}`, borderRadius:4, padding:'14px 16px', color:C.white, fontSize:15, fontFamily:font, outline:'none', cursor:'pointer', transition:'border-color .2s', height:58 }}
                  onFocus={e => { e.target.style.borderColor = C.gold }}
                  onBlur={e  => { e.target.style.borderColor = C.borderM }}
                >
                  <option value={25}>25 leads</option>
                  <option value={50}>50 leads</option>
                  <option value={100}>100 leads</option>
                  <option value={200}>200 leads</option>
                  <option value={500}>500 leads</option>
                </select>
              </div>
              {/* Submit */}
              <div style={{ display:'flex', alignItems:'flex-end' }}>
                <button
                  type="submit"
                  disabled={submitting || !zip}
                  className="shimmer-btn"
                  style={{ width:'100%', padding:'14px 0', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase', height:58 }}
                >
                  {submitting ? 'Submitting…' : 'Pull Leads →'}
                </button>
              </div>
            </div>

            {formError && (
              <div style={{ background:'rgba(224,82,82,.08)', border:'1px solid rgba(224,82,82,.2)', borderRadius:4, padding:'12px 16px', color:C.red, fontSize:13, fontFamily:font }}>
                {formError}
              </div>
            )}
          </form>

          {profile && profile.credits < 25 && (
            <div style={{ marginTop:16, background:`${C.gold}0a`, border:`1px solid ${C.gold}25`, borderRadius:4, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:13, fontFamily:font }}>
              <span style={{ color:C.gold }}>Running low on credits.</span>
              <button onClick={() => window.location.href = '/api/billing/portal'} style={{ background:'none', border:'none', color:C.gold, fontWeight:700, cursor:'pointer', fontFamily:titleFont, fontSize:13, letterSpacing:'.04em' }}>
                Upgrade for more →
              </button>
            </div>
          )}
        </div>

        {/* ─── Jobs List ─── */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <h3 style={{ fontFamily:titleFont, fontSize:13, fontWeight:800, color:C.muted, letterSpacing:'.12em', textTransform:'uppercase' }}>Your Jobs</h3>
          </div>

          {jobs.length === 0 ? (
            <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:4, padding:'64px 24px', textAlign:'center' }}>
              <div style={{ fontFamily:titleFont, fontSize:32, fontWeight:900, color:C.border, marginBottom:12 }}>NO JOBS YET</div>
              <p style={{ fontSize:14, color:C.muted, fontFamily:font }}>Submit your first lead request above.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {jobs.map(job => (
                <div
                  key={job.id}
                  className="job-row"
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:4, padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16 }}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:14, minWidth:0 }}>
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${STATUS_DOTS[job.status]}`}/>
                    <div style={{ minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <span style={{ fontFamily:titleFont, fontSize:22, fontWeight:900, color:C.white, letterSpacing:'.12em' }}>{job.zip_code}</span>
                        {job.county && (
                          <span style={{ fontSize:12, color:C.muted, fontFamily:font, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{job.county}, {job.state}</span>
                        )}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4 }}>
                        <span className={`status-${job.status}`} style={{ fontSize:11, padding:'3px 8px', borderRadius:3, fontFamily:titleFont, fontWeight:700, letterSpacing:'.04em' }}>
                          {STATUS_LABELS[job.status] || job.status}
                        </span>
                        <span style={{ fontSize:12, color:C.muted, fontFamily:font }}>
                          {job.requested_count} requested{job.lead_count > 0 && ` · ${job.lead_count} found`}
                        </span>
                        <span style={{ fontSize:12, color:C.dim, fontFamily:font }}>
                          {new Date(job.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ flexShrink:0 }}>
                    {job.status === 'complete' && job.tracerfy_download ? (
                      <a
                        href={job.tracerfy_download}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display:'inline-block', padding:'8px 18px', borderRadius:3, background:`${C.green}12`, border:`1px solid ${C.green}30`, color:C.green, fontSize:12, fontWeight:700, fontFamily:titleFont, letterSpacing:'.06em', textDecoration:'none', transition:'all .2s' }}
                      >
                        Download CSV
                      </a>
                    ) : job.status === 'failed' ? (
                      <span style={{ fontSize:12, color:C.red, fontFamily:font }}>{job.error_message || 'Failed'}</span>
                    ) : (
                      <div style={{ fontSize:12, color:C.dim, fontFamily:font }}>Processing…</div>
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
