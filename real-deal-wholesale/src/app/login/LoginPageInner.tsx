'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

const C = {
  bg:      '#06111C',
  bgDeep:  '#040e16',
  card:    '#0c1e2d',
  border:  '#152435',
  borderM: '#1e3448',
  navy:    '#0A2F4F',
  gold:    '#EBAF4E',
  white:   '#F0F4F8',
  text:    '#c5d3de',
  muted:   '#6a8090',
  dim:     '#3a5060',
  green:   '#3ecf8e',
  red:     '#e05252',
}

export default function LoginPageInner() {
  const router  = useRouter()
  const params  = useSearchParams()
  const isSignup = params.get('signup') === 'true'

  const [mode,     setMode]     = useState<'login' | 'signup'>(isSignup ? 'signup' : 'login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')

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

  const font      = 'Lato,sans-serif'
  const titleFont = 'Montserrat,sans-serif'

  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', fontFamily:font }}>

      {/* Gold top accent bar */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,transparent,${C.gold},transparent)`, opacity:.6, zIndex:100, pointerEvents:'none' }}/>

      <div style={{ width:'100%', maxWidth:420 }}>

        {/* Logo */}
        <Link href="/" style={{ display:'block', textAlign:'center', marginBottom:40, textDecoration:'none' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
            <svg viewBox="0 0 36 36" fill="none" width={32} height={32}>
              <path d="M18 4L4 16h4v14h8v-8h4v8h8V16h4L18 4z" fill={C.navy} stroke={C.gold} strokeWidth="1.2"/>
              <rect x="14" y="20" width="8" height="10" fill={C.gold} opacity=".3"/>
            </svg>
            <div>
              <div style={{ fontFamily:titleFont, fontSize:20, fontWeight:800, color:C.white, letterSpacing:'.02em', lineHeight:1 }}>
                REAL DEAL <span style={{ color:C.gold }}>WHOLESALE</span>
              </div>
              <div style={{ fontFamily:font, fontSize:9, fontWeight:600, color:C.muted, letterSpacing:'.18em', textTransform:'uppercase', marginTop:2 }}>
                BY APEX
              </div>
            </div>
          </div>
        </Link>

        {/* Card */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:4, padding:'36px 32px', position:'relative', overflow:'hidden' }}>
          {/* top gold bar */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.gold}80,${C.navy},transparent)` }}/>

          {/* Tab toggle */}
          <div style={{ display:'flex', background:C.bg, borderRadius:4, border:`1px solid ${C.border}`, padding:3, marginBottom:28 }}>
            {(['login','signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex:1, padding:'10px 0', borderRadius:3,
                  border: mode === m ? `1px solid ${C.gold}50` : '1px solid transparent',
                  background: mode === m ? C.navy : 'transparent',
                  color: mode === m ? C.white : C.muted,
                  fontSize:12, fontWeight:800, fontFamily:titleFont, cursor:'pointer',
                  letterSpacing:'.08em', textTransform:'uppercase', transition:'all .2s',
                }}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div>
              <label style={{ display:'block', fontSize:11, color:C.muted, marginBottom:8, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{ width:'100%', background:'#06111C', border:`1px solid ${C.borderM}`, borderRadius:4, padding:'13px 16px', color:C.white, fontSize:14, fontFamily:font, outline:'none', transition:'border-color .2s' }}
                onFocus={e => { e.target.style.borderColor = C.gold }}
                onBlur={e  => { e.target.style.borderColor = C.borderM }}
              />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, color:C.muted, marginBottom:8, fontFamily:titleFont, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="••••••••"
                style={{ width:'100%', background:'#06111C', border:`1px solid ${C.borderM}`, borderRadius:4, padding:'13px 16px', color:C.white, fontSize:14, fontFamily:font, outline:'none', transition:'border-color .2s' }}
                onFocus={e => { e.target.style.borderColor = C.gold }}
                onBlur={e  => { e.target.style.borderColor = C.borderM }}
              />
            </div>

            {error && (
              <div style={{ background:'rgba(224,82,82,.08)', border:'1px solid rgba(224,82,82,.2)', borderRadius:4, padding:'12px 14px', color:C.red, fontSize:13, fontFamily:font }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ background:`rgba(62,207,142,.08)`, border:`1px solid rgba(62,207,142,.2)`, borderRadius:4, padding:'12px 14px', color:C.green, fontSize:13, fontFamily:font }}>
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="shimmer-btn"
              style={{ width:'100%', padding:'15px 0', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase', marginTop:4 }}
            >
              {loading ? 'Loading…' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
            </button>
          </form>

          {mode === 'signup' && (
            <p style={{ textAlign:'center', fontSize:12, color:C.dim, marginTop:16, fontFamily:font }}>
              You get 10 free credits on signup — no card needed.
            </p>
          )}
        </div>

        <p style={{ textAlign:'center', marginTop:24, fontSize:12, color:C.dim, fontFamily:font }}>
          <Link href="/" style={{ color:C.muted, textDecoration:'none', transition:'color .2s' }}
            onMouseOver={(e: any) => { e.target.style.color = C.gold }}
            onMouseOut={(e: any)  => { e.target.style.color = C.muted }}
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
