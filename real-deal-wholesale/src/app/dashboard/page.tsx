'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

type CountyInfo = {
  county_name: string
  state_name: string
  state_abbr: string
  fips: string | null
  city: string
}

type Job = {
  id: string
  zip_code: string
  county: string
  state: string
  requested_count: number
  status: string
  lead_count: number
  credits_used: number
  lead_types: string[] | null
  property_type: string | null
  contact_req: string | null
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

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#06111C',
  bgDeep:  '#040e16',
  card:    '#0c1e2d',
  card2:   '#0d2035',
  border:  '#152435',
  borderM: '#1e3448',
  borderL: '#2a4460',
  navy:    '#0A2F4F',
  gold:    '#EBAF4E',
  goldL:   '#f5cc7f',
  white:   '#F0F4F8',
  text:    '#c5d3de',
  muted:   '#6a8090',
  dim:     '#3a5060',
  green:   '#3ecf8e',
  red:     '#e05252',
  blue:    '#93c5fd',
  purple:  '#c4b5fd',
}

const font      = 'Lato,sans-serif'
const titleFont = 'Montserrat,sans-serif'

// ─── Lead type definitions ────────────────────────────────────────────────────
const LEAD_TYPES = [
  {
    id: 'nod',
    icon: '📋',
    label: 'Notice of Default',
    short: 'NOD',
    tagColor: C.gold,
    desc: 'First legal notice — homeowner has missed 3+ payments. Most time to negotiate. These sellers haven\'t hit the wall yet.',
    badge: 'EARLY STAGE',
    badgeColor: C.green,
  },
  {
    id: 'lis_pendens',
    icon: '⚖️',
    label: 'Lis Pendens',
    short: 'LP',
    tagColor: C.blue,
    desc: 'Foreclosure lawsuit filed by the lender. Seller is motivated and the clock is ticking. High-conversion stage.',
    badge: 'MID STAGE',
    badgeColor: C.blue,
  },
  {
    id: 'nts',
    icon: '🔨',
    label: 'Notice of Trustee Sale',
    short: 'NTS',
    tagColor: C.red,
    desc: 'Auction date is set. Extreme urgency — seller needs out NOW. Shortest window, highest motivation.',
    badge: 'URGENT',
    badgeColor: C.red,
  },
]

const PROPERTY_TYPES = [
  { id: 'sfr',        label: 'SFR',          desc: 'Single Family' },
  { id: 'multi',      label: 'Multi-Family',  desc: '2–4 units' },
  { id: 'commercial', label: 'Commercial',    desc: 'Any class' },
  { id: 'all',        label: 'All Types',     desc: 'No filter' },
]

const CONTACT_REQS = [
  { id: 'both',  label: 'Phone + Email', desc: 'Both required' },
  { id: 'phone', label: 'Phone Only',    desc: 'Mobile/landline' },
  { id: 'any',   label: 'Either',        desc: 'Maximum leads' },
]

const COUNT_OPTIONS = [25, 50, 100, 200, 500]

const STATUS_LABELS: Record<string, string> = {
  queued:   'Queued',
  scraping: 'Scraping Records',
  tracing:  'Skip Tracing',
  complete: 'Complete',
  failed:   'Failed',
}

// ─── AI message builder ───────────────────────────────────────────────────────
function buildAiMessage(county: CountyInfo, leadTypes: string[], count: number, propertyType: string, contactReq: string, ghlPush: boolean): string {
  const typeLabels: Record<string, string> = {
    nod: 'Notice of Default',
    lis_pendens: 'Lis Pendens',
    nts: 'Notice of Trustee Sale',
  }

  let typePhrase: string
  if (leadTypes.length === 3) {
    typePhrase = 'pre-foreclosure leads across all three filing stages'
  } else if (leadTypes.length === 2) {
    typePhrase = `${leadTypes.map(t => typeLabels[t]).join(' and ')} leads across two filing stages`
  } else {
    const t = leadTypes[0]
    if (t === 'nod')         typePhrase = 'earliest-stage Notice of Default leads — the most time to negotiate'
    else if (t === 'nts')    typePhrase = 'urgent, auction-pending Notice of Trustee Sale leads'
    else                     typePhrase = 'Lis Pendens leads with active foreclosure lawsuits'
  }

  const propNote = propertyType === 'all' ? '' : ` (${PROPERTY_TYPES.find(p => p.id === propertyType)?.label ?? ''} only)`
  const contactNote = contactReq === 'both' ? 'phone and email' : contactReq === 'phone' ? 'phone numbers' : 'contact info'
  const ghlNote = ghlPush ? ' and pushed to your GoHighLevel account' : ''

  return `On it. I'm pulling up to ${count} ${typePhrase} from ${county.county_name}, ${county.state_abbr}${propNote} right now.\n\nEvery lead will be skip-traced for ${contactNote}, DNC-scrubbed${ghlNote}, and ready for you to work.\n\nCome back in about 2 hours — your list will be waiting in the panel on the left. I'll update the status as it moves through the pipeline.`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60)   return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function leadTypeChips(types: string[] | null) {
  if (!types?.length) return null
  return types.map(t => {
    const def = LEAD_TYPES.find(l => l.id === t)
    return def ? { short: def.short, color: def.tagColor } : null
  }).filter(Boolean) as { short: string; color: string }[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function BrandLogo() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <svg viewBox="0 0 36 36" fill="none" width={26} height={26}>
        <path d="M18 4L4 16h4v14h8v-8h4v8h8V16h4L18 4z" fill={C.navy} stroke={C.gold} strokeWidth="1.2"/>
        <rect x="14" y="20" width="8" height="10" fill={C.gold} opacity=".3"/>
      </svg>
      <div>
        <div style={{ fontFamily:titleFont, fontSize:15, fontWeight:800, color:C.white, letterSpacing:'.02em', lineHeight:1 }}>
          REAL DEAL <span style={{ color:C.gold }}>WHOLESALE</span>
        </div>
        <div style={{ fontFamily:font, fontSize:8, fontWeight:600, color:C.muted, letterSpacing:'.18em', textTransform:'uppercase', marginTop:2 }}>
          BY APEX
        </div>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:5, padding:'16px 0' }}>
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router   = useRouter()
  const supabase = createClient()

  // Auth + data
  const [profile, setProfile] = useState<Profile | null>(null)
  const [jobs,    setJobs]    = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  // Wizard state
  const [step,         setStep]         = useState<WizardStep>(1)
  const [zip,          setZip]          = useState('')
  const [county,       setCounty]       = useState<CountyInfo | null>(null)
  const [countyLoading, setCountyLoading] = useState(false)
  const [countyError,  setCountyError]  = useState('')
  const [leadTypes,    setLeadTypes]    = useState<string[]>(['nod', 'lis_pendens', 'nts'])
  const [count,        setCount]        = useState(50)
  const [propertyType, setPropertyType] = useState('sfr')
  const [contactReq,   setContactReq]   = useState('any')
  const [ghlPush,      setGhlPush]      = useState(false)

  // Submission + AI
  const [submitting,   setSubmitting]   = useState(false)
  const [aiTyping,     setAiTyping]     = useState(false)
  const [aiMessage,    setAiMessage]    = useState('')
  const [displayedMsg, setDisplayedMsg] = useState('')
  const [countdown,    setCountdown]    = useState(0)
  const msgRef = useRef('')

  // Sidebar
  const [activeJobId, setActiveJobId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [profileRes, jobsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('jobs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
    ])
    if (profileRes.data) setProfile(profileRes.data)
    if (jobsRes.data)    setJobs(jobsRes.data)
    setLoading(false)
  }, [supabase, router])

  useEffect(() => {
    loadData()
    const iv = setInterval(loadData, 15000)
    return () => clearInterval(iv)
  }, [loadData])

  // Typewriter effect
  useEffect(() => {
    if (!aiMessage) return
    setDisplayedMsg('')
    msgRef.current = ''
    let i = 0
    const iv = setInterval(() => {
      if (i >= aiMessage.length) { clearInterval(iv); return }
      msgRef.current += aiMessage[i]
      setDisplayedMsg(msgRef.current)
      i++
    }, 18)
    return () => clearInterval(iv)
  }, [aiMessage])

  // Countdown to reset
  useEffect(() => {
    if (countdown <= 0) return
    if (countdown === 0) { resetWizard(); return }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const resetWizard = () => {
    setStep(1)
    setZip('')
    setCounty(null)
    setCountyError('')
    setLeadTypes(['nod', 'lis_pendens', 'nts'])
    setCount(50)
    setPropertyType('sfr')
    setContactReq('any')
    setGhlPush(false)
    setAiTyping(false)
    setAiMessage('')
    setDisplayedMsg('')
    setCountdown(0)
  }

  const resolveCounty = async (zipCode: string) => {
    setCountyLoading(true)
    setCountyError('')
    try {
      const res  = await fetch(`/api/county?zip=${zipCode}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setCounty(data)
      setStep(2)
    } catch (err: any) {
      setCountyError(err.message || 'Could not resolve county. Check the zip and try again.')
    } finally {
      setCountyLoading(false)
    }
  }

  const toggleLeadType = (id: string) => {
    setLeadTypes(prev =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter(t => t !== id) : prev) : [...prev, id]
    )
  }

  const submitJob = async () => {
    if (!profile || !county) return
    if (profile.credits < count) return

    setSubmitting(true)
    setStep(6)
    setAiTyping(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: job, error } = await supabase.from('jobs').insert({
      user_id:       user.id,
      zip_code:      zip,
      county:        county.county_name,
      state:         county.state_abbr,
      requested_count: count,
      status:        'queued',
      credits_used:  count,
      lead_types:    leadTypes,
      property_type: propertyType,
      contact_req:   contactReq,
      ghl_push:      ghlPush,
    }).select().single()

    if (error) {
      setAiTyping(false)
      setSubmitting(false)
      return
    }

    await supabase.from('profiles').update({ credits: profile.credits - count }).eq('id', user.id)

    await fetch('/api/jobs/trigger', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: job.id, zip, count, leadTypes, propertyType, contactReq, ghlPush }),
    })

    setActiveJobId(job.id)
    loadData()

    // Show AI typing dots for 1.8s then display message
    setTimeout(() => {
      setAiTyping(false)
      const msg = buildAiMessage(county, leadTypes, count, propertyType, contactReq, ghlPush)
      setAiMessage(msg)
      setSubmitting(false)
      // Start countdown after message finishes typing (~msg.length * 18ms + 2s buffer)
      setTimeout(() => setCountdown(5), msg.length * 18 + 2000)
    }, 1800)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const remainingCredits = profile ? profile.credits - count : 0
  const canAfford        = profile ? profile.credits >= count : false

  // Split jobs: active vs completed
  const activeJobs    = jobs.filter(j => !['complete','failed'].includes(j.status))
  const completedJobs = jobs.filter(j => ['complete','failed'].includes(j.status))

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontFamily:titleFont, fontSize:22, fontWeight:900, color:C.white, marginBottom:8 }}>
            REAL DEAL <span style={{ color:C.gold }}>WHOLESALE</span>
          </div>
          <div style={{ display:'flex', gap:5, justifyContent:'center', marginTop:16 }}>
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      </div>
    )
  }

  // ─── Wizard panel content ────────────────────────────────────────────────────
  const progressPct = ((step - 1) / 5) * 100

  const renderStep = () => {
    switch (step) {

      // ── Step 1: ZIP ──────────────────────────────────────────────────────────
      case 1: return (
        <div key="step1" className="step-in" style={{ maxWidth:480, margin:'0 auto' }}>
          <div style={{ fontSize:12, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Step 1 of 5</div>
          <h2 style={{ fontFamily:titleFont, fontSize:32, fontWeight:900, color:C.white, letterSpacing:'-.02em', marginBottom:8 }}>What market are you<br/>targeting?</h2>
          <p style={{ fontSize:14, color:C.muted, fontFamily:font, fontWeight:300, marginBottom:36, lineHeight:1.6 }}>Enter the zip code for the area you want to pull pre-foreclosure leads from.</p>

          <input
            autoFocus
            type="text"
            value={zip}
            onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))}
            onKeyDown={e => { if (e.key === 'Enter' && zip.length === 5) resolveCounty(zip) }}
            placeholder="e.g. 30060"
            maxLength={5}
            style={{ width:'100%', background:C.card, border:`2px solid ${C.borderM}`, borderRadius:4, padding:'20px 24px', color:C.white, fontSize:36, fontFamily:titleFont, fontWeight:900, letterSpacing:'.25em', textAlign:'center', outline:'none', transition:'border-color .2s', marginBottom:16 }}
            onFocus={e => { e.target.style.borderColor = C.gold }}
            onBlur={e  => { e.target.style.borderColor = C.borderM }}
          />

          {countyError && (
            <div style={{ background:'rgba(224,82,82,.08)', border:'1px solid rgba(224,82,82,.2)', borderRadius:4, padding:'10px 14px', color:C.red, fontSize:13, fontFamily:font, marginBottom:16 }}>
              {countyError}
            </div>
          )}

          <button
            onClick={() => resolveCounty(zip)}
            disabled={zip.length !== 5 || countyLoading}
            className="shimmer-btn"
            style={{ width:'100%', padding:'16px 0', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase' }}
          >
            {countyLoading ? 'Looking up county…' : 'Continue →'}
          </button>
        </div>
      )

      // ── Step 2: County Confirm ───────────────────────────────────────────────
      case 2: return (
        <div key="step2" className="step-in" style={{ maxWidth:480, margin:'0 auto' }}>
          <div style={{ fontSize:12, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Step 2 of 5</div>
          <h2 style={{ fontFamily:titleFont, fontSize:32, fontWeight:900, color:C.white, letterSpacing:'-.02em', marginBottom:8 }}>Is this the right<br/>market?</h2>
          <p style={{ fontSize:14, color:C.muted, fontFamily:font, fontWeight:300, marginBottom:32, lineHeight:1.6 }}>I found the following location for zip code <span style={{ color:C.white, fontWeight:700 }}>{zip}</span>.</p>

          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:4, padding:'28px 28px', marginBottom:28, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.gold}80,transparent)` }}/>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ fontSize:40 }}>📍</div>
              <div>
                <div style={{ fontFamily:titleFont, fontSize:24, fontWeight:900, color:C.white, letterSpacing:'-.01em' }}>{county?.county_name}</div>
                <div style={{ fontSize:14, color:C.muted, fontFamily:font, marginTop:4 }}>{county?.city} · {county?.state_name} · {county?.state_abbr}</div>
                {county?.fips && <div style={{ fontSize:11, color:C.dim, fontFamily:titleFont, marginTop:4, letterSpacing:'.06em' }}>FIPS {county.fips}</div>}
              </div>
            </div>
          </div>

          <div style={{ display:'flex', gap:12 }}>
            <button
              onClick={() => setStep(3)}
              className="shimmer-btn"
              style={{ flex:1, padding:'15px 0', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase' }}
            >
              Yes, that's right →
            </button>
            <button
              onClick={() => { setStep(1); setCounty(null); setCountyError('') }}
              style={{ padding:'15px 24px', borderRadius:4, border:`1px solid ${C.borderM}`, background:'transparent', color:C.muted, fontSize:12, fontFamily:titleFont, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', cursor:'pointer', transition:'all .2s' }}
              onMouseOver={e => { (e.target as HTMLElement).style.borderColor = `${C.gold}50`; (e.target as HTMLElement).style.color = C.white }}
              onMouseOut={e  => { (e.target as HTMLElement).style.borderColor = C.borderM; (e.target as HTMLElement).style.color = C.muted }}
            >
              Change zip
            </button>
          </div>
        </div>
      )

      // ── Step 3: Lead Types ───────────────────────────────────────────────────
      case 3: return (
        <div key="step3" className="step-in" style={{ maxWidth:560, margin:'0 auto' }}>
          <div style={{ fontSize:12, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Step 3 of 5</div>
          <h2 style={{ fontFamily:titleFont, fontSize:32, fontWeight:900, color:C.white, letterSpacing:'-.02em', marginBottom:8 }}>What types of leads<br/>do you want?</h2>
          <p style={{ fontSize:14, color:C.muted, fontFamily:font, fontWeight:300, marginBottom:28, lineHeight:1.6 }}>Select one or more pre-foreclosure filing types. Each represents a different stage of urgency.</p>

          <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:28 }}>
            {LEAD_TYPES.map(lt => {
              const selected = leadTypes.includes(lt.id)
              return (
                <div
                  key={lt.id}
                  className={`lead-type-card${selected ? ' selected' : ''}`}
                  onClick={() => toggleLeadType(lt.id)}
                  style={{ background:C.card, border:`1px solid ${selected ? C.gold : C.border}`, borderRadius:4, padding:'20px 22px', position:'relative', overflow:'hidden', display:'flex', alignItems:'flex-start', gap:18 }}
                >
                  {selected && <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.gold}80,transparent)` }}/>}
                  <div style={{ fontSize:28, lineHeight:1, flexShrink:0, marginTop:2 }}>{lt.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                      <span style={{ fontFamily:titleFont, fontSize:15, fontWeight:800, color:C.white }}>{lt.label}</span>
                      <span style={{ fontSize:10, fontWeight:800, letterSpacing:'.08em', padding:'2px 8px', borderRadius:3, background:`${lt.badgeColor}18`, color:lt.badgeColor, fontFamily:titleFont }}>{lt.badge}</span>
                    </div>
                    <p style={{ fontSize:13, color:C.muted, fontFamily:font, fontWeight:300, lineHeight:1.6, margin:0 }}>{lt.desc}</p>
                  </div>
                  <div style={{ width:20, height:20, borderRadius:4, border:`2px solid ${selected ? C.gold : C.borderM}`, background:selected ? C.gold : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s', marginTop:2 }}>
                    {selected && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4l3 3 6-6" stroke={C.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => setStep(2)} style={{ padding:'15px 24px', borderRadius:4, border:`1px solid ${C.borderM}`, background:'transparent', color:C.muted, fontSize:12, fontFamily:titleFont, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', cursor:'pointer' }}>← Back</button>
            <button
              onClick={() => setStep(4)}
              disabled={leadTypes.length === 0}
              className="shimmer-btn"
              style={{ flex:1, padding:'15px 0', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase' }}
            >
              Continue — {leadTypes.length} type{leadTypes.length !== 1 ? 's' : ''} selected →
            </button>
          </div>
        </div>
      )

      // ── Step 4: Count + Cost ─────────────────────────────────────────────────
      case 4: return (
        <div key="step4" className="step-in" style={{ maxWidth:480, margin:'0 auto' }}>
          <div style={{ fontSize:12, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Step 4 of 5</div>
          <h2 style={{ fontFamily:titleFont, fontSize:32, fontWeight:900, color:C.white, letterSpacing:'-.02em', marginBottom:8 }}>How many leads<br/>do you want?</h2>
          <p style={{ fontSize:14, color:C.muted, fontFamily:font, fontWeight:300, marginBottom:32, lineHeight:1.6 }}>Each lead costs 1 credit. You have <span style={{ color:C.gold, fontWeight:700 }}>{profile?.credits ?? 0} credits</span> available.</p>

          <div style={{ display:'flex', gap:10, marginBottom:28, flexWrap:'wrap' }}>
            {COUNT_OPTIONS.map(n => (
              <button
                key={n}
                className={`count-pill${count === n ? ' active' : ''}`}
                onClick={() => setCount(n)}
                style={{ flex:'1 1 80px', padding:'16px 12px', borderRadius:4, border:`1px solid ${count === n ? C.gold : C.borderM}`, background:count === n ? C.gold : 'transparent', color:count === n ? C.bg : C.muted, fontSize:16, fontFamily:titleFont, fontWeight:800, textAlign:'center' }}
              >
                {n}
              </button>
            ))}
          </div>

          <div style={{ background:C.card, border:`1px solid ${canAfford ? C.borderM : C.red}`, borderRadius:4, padding:'20px 22px', marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:13, color:C.muted, fontFamily:font }}>Credits used</span>
              <span style={{ fontFamily:titleFont, fontSize:18, fontWeight:900, color:C.gold }}>{count}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:8, borderTop:`1px solid ${C.border}` }}>
              <span style={{ fontSize:13, color:C.muted, fontFamily:font }}>Remaining after pull</span>
              <span style={{ fontFamily:titleFont, fontSize:16, fontWeight:800, color: remainingCredits < 0 ? C.red : remainingCredits < 25 ? '#f5cc7f' : C.green }}>
                {remainingCredits < 0 ? 'Insufficient' : remainingCredits}
              </span>
            </div>
          </div>

          {!canAfford && (
            <div style={{ background:'rgba(224,82,82,.08)', border:'1px solid rgba(224,82,82,.2)', borderRadius:4, padding:'12px 14px', color:C.red, fontSize:13, fontFamily:font, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>Not enough credits.</span>
              <button onClick={() => window.location.href='/api/billing/portal'} style={{ background:'none', border:'none', color:C.red, fontFamily:titleFont, fontWeight:700, fontSize:12, cursor:'pointer', letterSpacing:'.04em' }}>Upgrade →</button>
            </div>
          )}

          {canAfford && remainingCredits < 25 && remainingCredits >= 0 && (
            <div style={{ background:`${C.gold}0a`, border:`1px solid ${C.gold}25`, borderRadius:4, padding:'10px 14px', color:'#f5cc7f', fontSize:12, fontFamily:font, marginBottom:16 }}>
              ⚠ You'll be running low after this pull.
            </div>
          )}

          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => setStep(3)} style={{ padding:'15px 24px', borderRadius:4, border:`1px solid ${C.borderM}`, background:'transparent', color:C.muted, fontSize:12, fontFamily:titleFont, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', cursor:'pointer' }}>← Back</button>
            <button
              onClick={() => setStep(5)}
              disabled={!canAfford}
              className="shimmer-btn"
              style={{ flex:1, padding:'15px 0', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase' }}
            >
              Continue →
            </button>
          </div>
        </div>
      )

      // ── Step 5: Refinements ──────────────────────────────────────────────────
      case 5: return (
        <div key="step5" className="step-in" style={{ maxWidth:520, margin:'0 auto' }}>
          <div style={{ fontSize:12, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Step 5 of 5</div>
          <h2 style={{ fontFamily:titleFont, fontSize:32, fontWeight:900, color:C.white, letterSpacing:'-.02em', marginBottom:8 }}>Refine your pull.</h2>
          <p style={{ fontSize:14, color:C.muted, fontFamily:font, fontWeight:300, marginBottom:32, lineHeight:1.6 }}>Tighten your list or leave the defaults for maximum volume.</p>

          {/* Property type */}
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Property Type</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {PROPERTY_TYPES.map(p => (
                <button
                  key={p.id}
                  className={`option-pill${propertyType === p.id ? ' active' : ''}`}
                  onClick={() => setPropertyType(p.id)}
                  style={{ padding:'10px 18px', borderRadius:4, border:`1px solid ${propertyType === p.id ? C.gold : C.borderM}`, background:propertyType === p.id ? `${C.gold}10` : 'transparent', color:propertyType === p.id ? C.gold : C.muted, fontSize:13, fontFamily:titleFont, fontWeight:700, textAlign:'center' }}
                >
                  {p.label}
                  <div style={{ fontSize:10, fontWeight:400, fontFamily:font, marginTop:2, color:'inherit', opacity:.7 }}>{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Contact requirements */}
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:11, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Contact Requirements</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {CONTACT_REQS.map(c => (
                <button
                  key={c.id}
                  className={`option-pill${contactReq === c.id ? ' active' : ''}`}
                  onClick={() => setContactReq(c.id)}
                  style={{ padding:'10px 18px', borderRadius:4, border:`1px solid ${contactReq === c.id ? C.gold : C.borderM}`, background:contactReq === c.id ? `${C.gold}10` : 'transparent', color:contactReq === c.id ? C.gold : C.muted, fontSize:13, fontFamily:titleFont, fontWeight:700, textAlign:'center' }}
                >
                  {c.label}
                  <div style={{ fontSize:10, fontWeight:400, fontFamily:font, marginTop:2, color:'inherit', opacity:.7 }}>{c.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* GHL Push */}
          <div style={{ marginBottom:32 }}>
            <div style={{ fontSize:11, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>GoHighLevel</div>
            <div
              onClick={() => setGhlPush(g => !g)}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:C.card, border:`1px solid ${ghlPush ? C.gold : C.border}`, borderRadius:4, padding:'16px 20px', cursor:'pointer', transition:'all .2s' }}
            >
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.white, fontFamily:titleFont }}>Push leads to GoHighLevel</div>
                <div style={{ fontSize:12, color:C.muted, fontFamily:font, marginTop:3 }}>Automatically send completed leads to your GHL account</div>
              </div>
              <div style={{ width:44, height:24, borderRadius:12, background:ghlPush ? C.gold : C.borderM, position:'relative', transition:'background .2s', flexShrink:0, marginLeft:16 }}>
                <div style={{ position:'absolute', top:3, left:ghlPush ? 23 : 3, width:18, height:18, borderRadius:'50%', background:ghlPush ? C.bg : C.muted, transition:'left .2s' }}/>
              </div>
            </div>
          </div>

          {/* Summary preview */}
          <div style={{ background:C.bgDeep, border:`1px solid ${C.border}`, borderRadius:4, padding:'16px 18px', marginBottom:24 }}>
            <div style={{ fontSize:11, color:C.dim, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:12 }}>Pull Summary</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px' }}>
              {[
                { label:'Market',       value:`${zip} · ${county?.county_name}, ${county?.state_abbr}` },
                { label:'Lead Types',   value:leadTypes.map(t => LEAD_TYPES.find(l=>l.id===t)?.short).join(', ') },
                { label:'Count',        value:`${count} leads · ${count} credits` },
                { label:'Property',     value:PROPERTY_TYPES.find(p=>p.id===propertyType)?.label ?? '' },
                { label:'Contacts',     value:CONTACT_REQS.find(c=>c.id===contactReq)?.label ?? '' },
                { label:'GHL Push',     value:ghlPush ? 'Yes' : 'No' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize:10, color:C.dim, fontFamily:titleFont, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase' }}>{label}</div>
                  <div style={{ fontSize:13, color:C.text, fontFamily:font, marginTop:2 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => setStep(4)} style={{ padding:'15px 24px', borderRadius:4, border:`1px solid ${C.borderM}`, background:'transparent', color:C.muted, fontSize:12, fontFamily:titleFont, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', cursor:'pointer' }}>← Back</button>
            <button
              onClick={submitJob}
              disabled={submitting}
              className="shimmer-btn"
              style={{ flex:1, padding:'15px 0', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase' }}
            >
              🚀 Launch Pull →
            </button>
          </div>
        </div>
      )

      // ── Step 6: AI Response ──────────────────────────────────────────────────
      case 6: return (
        <div key="step6" className="step-in" style={{ maxWidth:520, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:24 }}>
            <div style={{ width:36, height:36, borderRadius:4, background:`${C.gold}18`, border:`1px solid ${C.gold}35`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🤖</div>
            <div>
              <div style={{ fontFamily:titleFont, fontSize:13, fontWeight:800, color:C.gold, letterSpacing:'.04em' }}>APEX AI</div>
              <div style={{ fontSize:11, color:C.dim, fontFamily:font }}>Lead Intelligence System</div>
            </div>
          </div>

          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:4, padding:'28px 28px', position:'relative', overflow:'hidden', minHeight:160 }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.gold}80,${C.navy},transparent)` }}/>
            {aiTyping ? (
              <TypingDots/>
            ) : (
              <p style={{ fontSize:15, color:C.text, fontFamily:font, fontWeight:300, lineHeight:1.85, whiteSpace:'pre-line', margin:0 }}>
                {displayedMsg}
                {displayedMsg.length < aiMessage.length && <span style={{ opacity:.5 }}>▋</span>}
              </p>
            )}
          </div>

          {countdown > 0 && (
            <div style={{ marginTop:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <p className="countdown-text" style={{ fontSize:12, color:C.dim, fontFamily:font }}>
                Starting new pull in {countdown}…
              </p>
              <button
                onClick={resetWizard}
                className="shimmer-btn"
                style={{ padding:'10px 20px', borderRadius:4, fontSize:12, letterSpacing:'.08em', textTransform:'uppercase' }}
              >
                New Pull Now →
              </button>
            </div>
          )}
        </div>
      )

      default: return null
    }
  }

  // ─── Sidebar job card ────────────────────────────────────────────────────────
  const JobCard = ({ job }: { job: Job }) => {
    const chips   = leadTypeChips(job.lead_types)
    const isActive = !['complete','failed'].includes(job.status)
    const dotColors: Record<string, string> = {
      queued:   '#6a8090',
      scraping: C.blue,
      tracing:  C.purple,
      complete: C.green,
      failed:   C.red,
    }
    const dotColor = dotColors[job.status] || C.muted

    return (
      <div
        className="sidebar-job"
        style={{ background: activeJobId === job.id ? C.card2 : C.card, border:`1px solid ${activeJobId === job.id ? `${C.gold}30` : C.border}`, borderRadius:4, padding:'14px 16px', marginBottom:8 }}
        onClick={() => setActiveJobId(job.id)}
      >
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:dotColor, flexShrink:0, ...(isActive ? { animation:'pulseDot 1.5s ease-in-out infinite' } : {}) }}/>
            <span style={{ fontFamily:titleFont, fontSize:16, fontWeight:900, color:C.white, letterSpacing:'.1em' }}>{job.zip_code}</span>
          </div>
          <span style={{ fontSize:10, color:C.dim, fontFamily:font, marginTop:2, whiteSpace:'nowrap' }}>{timeAgo(job.created_at)}</span>
        </div>

        {job.county && (
          <div style={{ fontSize:12, color:C.muted, fontFamily:font, marginBottom:8, paddingLeft:16 }}>{job.county}, {job.state}</div>
        )}

        {chips && chips.length > 0 && (
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8, paddingLeft:16 }}>
            {chips.map(chip => (
              <span key={chip.short} style={{ fontSize:10, fontWeight:800, padding:'2px 6px', borderRadius:3, background:`${chip.color}18`, color:chip.color, fontFamily:titleFont, letterSpacing:'.04em' }}>
                {chip.short}
              </span>
            ))}
          </div>
        )}

        <div style={{ paddingLeft:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span className={`status-${job.status}`} style={{ fontSize:10, padding:'3px 8px', borderRadius:3, fontFamily:titleFont, fontWeight:700, letterSpacing:'.04em' }}>
              {STATUS_LABELS[job.status] || job.status}
            </span>
            {job.lead_count > 0 && (
              <span style={{ fontSize:11, color:C.muted, fontFamily:font }}>{job.lead_count} found</span>
            )}
          </div>

          {job.status === 'complete' && job.tracerfy_download && (
            <a
              href={job.tracerfy_download}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:10, padding:'8px 0', borderRadius:3, background:`${C.green}12`, border:`1px solid ${C.green}30`, color:C.green, fontSize:11, fontWeight:700, fontFamily:titleFont, letterSpacing:'.06em', textDecoration:'none', textTransform:'uppercase', transition:'all .2s' }}
            >
              ↓ Download CSV
            </a>
          )}

          {job.status === 'failed' && (
            <div style={{ marginTop:8, fontSize:11, color:C.red, fontFamily:font }}>{job.error_message || 'Pipeline failed'}</div>
          )}

          {job.status === 'scraping' && (
            <div style={{ marginTop:8, fontSize:11, color:C.blue, fontFamily:font }}>Pulling from county records…</div>
          )}
          {job.status === 'tracing' && (
            <div style={{ marginTop:8, fontSize:11, color:C.purple, fontFamily:font }}>Skip tracing {job.lead_count > 0 ? `${job.lead_count} leads` : ''}…</div>
          )}
        </div>
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', background:C.bg, color:C.text, fontFamily:font, overflow:'hidden' }}>

      {/* Gold top bar */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,transparent,${C.gold},transparent)`, opacity:.6, zIndex:1001, pointerEvents:'none' }}/>

      {/* Header */}
      <header style={{ flexShrink:0, borderBottom:`1px solid ${C.border}`, padding:'12px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(6,17,28,.97)', backdropFilter:'blur(20px)', marginTop:3, zIndex:100 }}>
        <BrandLogo/>
        <div style={{ display:'flex', alignItems:'center', gap:20 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' }}>Credits</div>
            <div style={{ fontFamily:titleFont, fontSize:20, fontWeight:900, color:C.gold, lineHeight:1 }}>{profile?.credits ?? 0}</div>
          </div>
          <button
            onClick={() => window.location.href='/api/billing/portal'}
            style={{ padding:'7px 16px', borderRadius:4, border:`1px solid ${C.borderM}`, background:'transparent', color:C.text, fontSize:11, fontWeight:700, fontFamily:titleFont, letterSpacing:'.06em', textTransform:'uppercase', cursor:'pointer', transition:'all .2s' }}
            onMouseOver={e => { (e.target as HTMLElement).style.borderColor=`${C.gold}60`; (e.target as HTMLElement).style.color=C.white }}
            onMouseOut={e  => { (e.target as HTMLElement).style.borderColor=C.borderM; (e.target as HTMLElement).style.color=C.text }}
          >
            Upgrade
          </button>
          <button onClick={signOut} style={{ background:'none', border:'none', color:C.muted, fontSize:12, fontFamily:font, cursor:'pointer' }}
            onMouseOver={e => { (e.target as HTMLElement).style.color=C.text }}
            onMouseOut={e  => { (e.target as HTMLElement).style.color=C.muted }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Body: sidebar + wizard */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── Left Sidebar ── */}
        <aside style={{ width:300, flexShrink:0, borderRight:`1px solid ${C.border}`, display:'flex', flexDirection:'column', background:C.bgDeep, overflow:'hidden' }}>
          <div style={{ padding:'16px 16px 12px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
            <div style={{ fontSize:11, color:C.muted, fontFamily:titleFont, fontWeight:700, letterSpacing:'.12em', textTransform:'uppercase' }}>Your Pulls</div>
          </div>

          <div style={{ flex:1, overflowY:'auto', padding:'12px 12px 0' }}>
            {activeJobs.length > 0 && (
              <>
                <div style={{ fontSize:10, color:C.dim, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:8, paddingLeft:4 }}>Active</div>
                {activeJobs.map(j => <JobCard key={j.id} job={j}/>)}
              </>
            )}
            {completedJobs.length > 0 && (
              <>
                <div style={{ fontSize:10, color:C.dim, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:8, marginTop:activeJobs.length > 0 ? 12 : 0, paddingLeft:4 }}>Completed</div>
                {completedJobs.map(j => <JobCard key={j.id} job={j}/>)}
              </>
            )}
            {jobs.length === 0 && (
              <div style={{ textAlign:'center', padding:'48px 16px' }}>
                <div style={{ fontSize:28, marginBottom:10 }}>📭</div>
                <div style={{ fontSize:13, color:C.dim, fontFamily:font }}>No pulls yet.<br/>Start your first one →</div>
              </div>
            )}
          </div>

          <div style={{ padding:'12px', borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
            <button
              onClick={resetWizard}
              style={{ width:'100%', padding:'12px 0', borderRadius:4, border:`1px solid ${C.gold}40`, background:`${C.gold}08`, color:C.gold, fontSize:12, fontWeight:800, fontFamily:titleFont, letterSpacing:'.08em', textTransform:'uppercase', cursor:'pointer', transition:'all .2s' }}
              onMouseOver={e => { (e.target as HTMLElement).style.background=`${C.gold}15`; (e.target as HTMLElement).style.borderColor=`${C.gold}70` }}
              onMouseOut={e  => { (e.target as HTMLElement).style.background=`${C.gold}08`; (e.target as HTMLElement).style.borderColor=`${C.gold}40` }}
            >
              + New Pull
            </button>
          </div>
        </aside>

        {/* ── Right Wizard Panel ── */}
        <main style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column' }}>
          {/* Progress bar */}
          <div style={{ flexShrink:0, padding:'0 40px' }}>
            <div className="wizard-progress-track" style={{ marginTop:0 }}>
              <div className="wizard-progress-fill" style={{ width: step === 6 ? '100%' : `${progressPct}%` }}/>
            </div>
          </div>

          {/* Step content */}
          <div style={{ flex:1, padding:'48px 40px', display:'flex', alignItems:'flex-start', justifyContent:'center' }}>
            <div style={{ width:'100%' }}>
              {renderStep()}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
