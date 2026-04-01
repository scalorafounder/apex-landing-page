'use client'

import { useState } from 'react'
import Link from 'next/link'

// ─── Color tokens (exact match to brand system) ───────────────────────────────
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
}

// ─── Shared components ────────────────────────────────────────────────────────
function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 22, md: 28, lg: 36 }[size]
  const fs = { sm: 14, md: 17, lg: 22 }[size]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg viewBox="0 0 36 36" fill="none" width={sz} height={sz}>
        <path d="M18 4L4 16h4v14h8v-8h4v8h8V16h4L18 4z" fill={C.navy} stroke={C.gold} strokeWidth="1.2"/>
        <rect x="14" y="20" width="8" height="10" fill={C.gold} opacity=".3"/>
      </svg>
      <div>
        <div style={{ fontFamily:'Montserrat,sans-serif', fontSize: fs, fontWeight: 800, color: C.white, letterSpacing: '.02em', lineHeight: 1 }}>
          REAL DEAL <span style={{ color: C.gold }}>WHOLESALE</span>
        </div>
        <div style={{ fontFamily:'Lato,sans-serif', fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: '.18em', textTransform: 'uppercase', marginTop: 2 }}>
          BY APEX
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 16px', borderRadius: 4,
      border: `1px solid ${C.gold}35`,
      background: `${C.gold}0d`,
      fontSize: 11, fontWeight: 700, color: C.gold,
      letterSpacing: '.1em', textTransform: 'uppercase' as const,
      marginBottom: 16, fontFamily: 'Montserrat,sans-serif',
    }}>{children}</div>
  )
}

function GoldLine() {
  return <div style={{ width: 48, height: 3, background: `linear-gradient(90deg,${C.gold},${C.goldL})`, borderRadius: 2, margin: '20px auto 0' }} />
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="11" fill={C.gold} opacity=".18"/>
      <path d="M8 12l3 3 5-5" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const [zip, setZip] = useState('')

  const TICKER_ITEMS = [
    'Real County Records','Skip Traced Leads','Phone + Email + Address',
    'DNC Scrubbed','Pre-Foreclosure Filings','24-Hour Delivery',
    'Georgia Coverage','Tracerfy Enrichment','CSV Download',
    'GHL Push','Day-Of Filing Freshness',
  ]

  const font = 'Lato,sans-serif'
  const titleFont = 'Montserrat,sans-serif'

  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: '100vh', color: C.text }}>

      {/* ─── Gold top accent bar ─── */}
      <div style={{ position:'fixed', top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,transparent,${C.gold},transparent)`, opacity:.6, zIndex:1001, pointerEvents:'none' }}/>

      {/* ─── Nav ─── */}
      <nav style={{ position:'fixed', top:3, left:0, right:0, zIndex:1000, padding:'14px 40px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'rgba(6,17,28,.93)', backdropFilter:'blur(20px)', borderBottom:`1px solid ${C.border}` }}>
        <BrandLogo />
        <div style={{ display:'flex', alignItems:'center', gap:32 }}>
          <Link href="/login" className="nav-link">Sign In</Link>
          <Link
            href="/login?signup=true"
            className="shimmer-btn"
            style={{ padding:'11px 24px', borderRadius:4, fontSize:12, letterSpacing:'.08em', textTransform:'uppercase' }}
          >
            Get Started →
          </Link>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center', padding:'140px 24px 80px', position:'relative', overflow:'hidden' }}>
        {/* grid overlay */}
        <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(${C.border} 1px,transparent 1px),linear-gradient(90deg,${C.border} 1px,transparent 1px)`, backgroundSize:'72px 72px', opacity:.35, pointerEvents:'none' }}/>
        {/* radial gradient */}
        <div style={{ position:'absolute', inset:0, backgroundImage:`radial-gradient(ellipse at 50% 30%,${C.navy}90 0%,transparent 65%)`, pointerEvents:'none' }}/>

        <div style={{ position:'relative', zIndex:1, maxWidth:860 }}>
          {/* Badge */}
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'7px 20px', borderRadius:3, border:`1px solid ${C.gold}30`, background:`${C.gold}0d`, fontSize:11, fontWeight:700, color:C.gold, marginBottom:32, fontFamily:titleFont, letterSpacing:'.1em', textTransform:'uppercase' }}>
            <span className="sparkle" style={{ width:6, height:6, borderRadius:'50%', background:C.green, display:'inline-block', flexShrink:0 }}/>
            Fresh pre-foreclosure leads pulled daily from county records
          </div>

          {/* Headline */}
          <h1 style={{ fontFamily:titleFont, fontSize:'clamp(40px,6.5vw,74px)', fontWeight:900, lineHeight:1.05, color:C.white, marginBottom:28, letterSpacing:'-0.02em' }}>
            Pre-Foreclosure<br/>Leads That<br/><span style={{ color:C.gold }}>Hit.</span>
          </h1>

          <p style={{ fontSize:'clamp(16px,2vw,19px)', color:C.muted, maxWidth:600, margin:'0 auto 44px', lineHeight:1.75, fontFamily:font, fontWeight:300 }}>
            Enter a zip code. Get 200–500 verified pre-foreclosure leads with owner phone, email, and mailing address — delivered in 24 hours. No stale databases. No recycled lists.
          </p>

          {/* ZIP capture */}
          <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:16 }}>
            <input
              type="text"
              placeholder="Enter zip code..."
              value={zip}
              onChange={e => setZip(e.target.value.replace(/\D/g,'').slice(0,5))}
              maxLength={5}
              style={{ background:C.card, border:`1px solid ${C.borderM}`, borderRadius:4, padding:'16px 24px', color:C.white, fontSize:22, fontFamily:titleFont, fontWeight:800, letterSpacing:'.2em', textAlign:'center', outline:'none', width:210, transition:'border-color .2s' }}
              onFocus={e  => { e.target.style.borderColor = C.gold }}
              onBlur={e   => { e.target.style.borderColor = C.borderM }}
            />
            <Link
              href={`/login?signup=true${zip ? `&zip=${zip}` : ''}`}
              className="shimmer-btn"
              style={{ padding:'16px 36px', borderRadius:4, fontSize:14, letterSpacing:'.08em', textTransform:'uppercase', display:'inline-flex', alignItems:'center' }}
            >
              Pull Leads →
            </Link>
          </div>
          <p style={{ fontSize:12, color:C.dim, letterSpacing:'.04em', fontFamily:font }}>No credit card required · 10 free leads on signup</p>
        </div>
      </section>

      {/* ─── Ticker ─── */}
      <div style={{ borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}`, background:C.card, padding:'14px 0', overflow:'hidden' }}>
        <div className="ticker-track">
          {[...Array(2)].map((_, rep) => (
            <div key={rep} style={{ display:'flex', alignItems:'center', gap:40, paddingRight:40 }}>
              {TICKER_ITEMS.map((t, i) => (
                <div key={`${rep}-${i}`} style={{ display:'flex', alignItems:'center', gap:10, whiteSpace:'nowrap' }}>
                  <div className="sparkle" style={{ width:5, height:5, borderRadius:'50%', background:C.gold, flexShrink:0 }}/>
                  <span style={{ fontSize:12, fontWeight:600, color:C.muted, fontFamily:titleFont, letterSpacing:'.06em', textTransform:'uppercase' }}>{t}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Stats ─── */}
      <div style={{ padding:'48px 24px', background:C.bg }}>
        <div style={{ maxWidth:960, margin:'0 auto', display:'flex', justifyContent:'center', gap:16, flexWrap:'wrap' }}>
          {[
            { n:'200–500', l:'Leads per zip code',       icon:'📍', c:C.gold  },
            { n:'24 hrs',  l:'Delivery time',             icon:'⚡', c:C.green },
            { n:'$100',    l:'Per month, 500 credits',    icon:'💰', c:C.gold  },
            { n:'Day-of',  l:'Filing freshness',          icon:'📋', c:C.gold  },
          ].map(({ n, l, icon, c }) => (
            <div key={l} style={{ flex:'1 1 160px', textAlign:'center', padding:'28px 16px', background:C.card, borderRadius:4, border:`1px solid ${C.border}` }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{icon}</div>
              <div style={{ fontFamily:titleFont, fontSize: n.length > 5 ? 20 : 30, fontWeight:900, color:c }}>{n}</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:6, fontFamily:font, letterSpacing:'.04em', textTransform:'uppercase' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── How it Works ─── */}
      <section style={{ padding:'100px 24px', background:C.bgDeep }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:64 }}>
            <SectionLabel>Simple 3-Step Process</SectionLabel>
            <h2 style={{ fontFamily:titleFont, fontSize:'clamp(28px,4vw,46px)', fontWeight:800, color:C.white, lineHeight:1.1, marginBottom:8, letterSpacing:'-0.01em' }}>
              From Zip Code to<br/>Close-Ready Leads.
            </h2>
            <GoldLine/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:24 }}>
            {[
              { step:'01', title:'Enter Your Zip',     desc:'Type in any US zip code. We resolve it to the exact county automatically using census data.' },
              { step:'02', title:'We Pull & Enrich',   desc:'Our scraper pulls fresh NOD and Lis Pendens filings from county public records, then skip traces every lead for phone, email, and mailing address.' },
              { step:'03', title:'Leads Delivered',    desc:'Within 24 hours your enriched, DNC-scrubbed lead list is ready in your dashboard. Download CSV or push directly to GHL.' },
            ].map((item, i) => (
              <div key={i} className="feature-card" style={{ padding:'36px 32px', background:C.card, borderRadius:4, position:'relative', overflow:'hidden' }}>
                {/* top color bar */}
                <div style={{ position:'absolute', top:0, left:0, width:'100%', height:3, background:`linear-gradient(90deg,${C.gold}80,transparent)` }}/>
                <div style={{ fontFamily:titleFont, fontSize:56, fontWeight:900, color:C.border, lineHeight:1, marginBottom:12 }}>{item.step}</div>
                <div style={{ width:32, height:3, background:C.gold, borderRadius:2, marginBottom:16 }}/>
                <h3 style={{ fontFamily:titleFont, fontSize:18, fontWeight:800, color:C.white, marginBottom:12, letterSpacing:'-.01em' }}>{item.title}</h3>
                <p style={{ fontSize:14, color:C.muted, lineHeight:1.75, fontFamily:font, fontWeight:300 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section style={{ padding:'100px 24px', background:C.bg }}>
        <div style={{ maxWidth:560, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:48 }}>
            <SectionLabel>Pricing</SectionLabel>
            <h2 style={{ fontFamily:titleFont, fontSize:'clamp(28px,4vw,46px)', fontWeight:800, color:C.white, lineHeight:1.1, letterSpacing:'-0.01em' }}>
              One Plan.<br/>No Nonsense.
            </h2>
            <GoldLine/>
          </div>
          <div className="glow-card" style={{ background:C.card, border:`1px solid ${C.gold}35`, borderRadius:4, padding:'40px 36px', position:'relative' }}>
            <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', background:C.gold, color:C.bg, fontSize:11, fontWeight:800, padding:'5px 16px', borderRadius:3, letterSpacing:'.1em', fontFamily:titleFont, whiteSpace:'nowrap' }}>
              MOST POPULAR
            </div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:8, marginBottom:8 }}>
              <span style={{ fontFamily:titleFont, fontSize:64, fontWeight:900, color:C.white, lineHeight:1 }}>$100</span>
              <span style={{ color:C.muted, fontFamily:font, marginBottom:8 }}>/month</span>
            </div>
            <p style={{ fontSize:13, color:C.muted, marginBottom:28, fontFamily:font }}>500 credits · 1 credit = 1 enriched, skip-traced lead</p>
            <ul style={{ listStyle:'none', marginBottom:32 }}>
              {[
                '500 verified leads per month',
                'Fresh county record scraping',
                'Full skip trace — phone, email, address',
                'DNC scrubbed automatically',
                'CSV download + GHL push',
                'Any US zip code',
              ].map((f, i) => (
                <li key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:`1px solid ${C.border}`, fontSize:14, color:C.text, fontFamily:font }}>
                  <CheckIcon/>{f}
                </li>
              ))}
            </ul>
            <Link
              href="/login?signup=true"
              className="shimmer-btn"
              style={{ display:'block', width:'100%', textAlign:'center', padding:'16px', borderRadius:4, fontSize:13, letterSpacing:'.08em', textTransform:'uppercase' }}
            >
              Start Free Trial →
            </Link>
            <p style={{ textAlign:'center', fontSize:12, color:C.dim, marginTop:12, fontFamily:font }}>10 free leads to try it out · No card needed</p>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer style={{ borderTop:`1px solid ${C.border}`, padding:'40px 24px', textAlign:'center', background:C.bgDeep }}>
        <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
          <BrandLogo size="md"/>
        </div>
        <p style={{ color:C.dim, fontSize:12, fontFamily:font }}>© 2026 APEX. Built for serious wholesalers.</p>
      </footer>

    </div>
  )
}
