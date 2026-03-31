'use client'

import { useState } from 'react'
import Link from 'next/link'

function BrandLogo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { main: 'text-xl',  sub: 'text-[9px] tracking-[0.28em]' },
    md: { main: 'text-2xl', sub: 'text-[10px] tracking-[0.3em]' },
    lg: { main: 'text-4xl', sub: 'text-xs tracking-[0.3em]' },
  }
  const s = sizes[size]
  return (
    <div className="font-display leading-none">
      <div className={`${s.main} font-black`}>
        <span className="text-brand-500">REAL</span>
        <span className="text-white">DEAL</span>
      </div>
      <div className={`${s.sub} text-steel font-body font-normal mt-0.5`}>
        — WHOLESALE BY APEX —
      </div>
    </div>
  )
}

export default function HomePage() {
  const [zip, setZip] = useState('')

  return (
    <div className="grain min-h-screen bg-dark-900 overflow-hidden">

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-dark-600/60 backdrop-blur-sm bg-dark-900/85">
        <BrandLogo size="md" />
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-400 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="/login?signup=true"
            className="text-sm bg-brand-500 hover:bg-brand-400 text-white px-4 py-2 rounded transition-colors font-semibold"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-36 pb-20 px-6 max-w-6xl mx-auto">
        <div className="text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-dark-700 border border-dark-600 rounded-full px-4 py-1.5 mb-10">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm text-gray-300 font-body">Fresh leads pulled daily from county records</span>
          </div>

          {/* Headline */}
          <h1 className="font-display font-black leading-tight tracking-tight mb-6">
            <span className="block text-6xl md:text-8xl text-white">PRE-FORECLOSURE</span>
            <span className="block text-6xl md:text-8xl text-brand-500">LEADS</span>
            <span className="block text-6xl md:text-8xl text-white">THAT HIT.</span>
          </h1>

          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed font-body">
            Enter a zip code. Get 200–500 verified pre-foreclosure leads with owner contact info delivered to your inbox in 24 hours. No stale databases. No recycled lists.
          </p>

          {/* ZIP capture */}
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-5">
            <input
              type="text"
              placeholder="Enter a zip code..."
              value={zip}
              onChange={e => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
              maxLength={5}
              className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors text-center font-display font-bold text-xl tracking-widest"
            />
            <Link
              href={`/login?signup=true${zip ? `&zip=${zip}` : ''}`}
              className="bg-brand-500 hover:bg-brand-400 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
            >
              Pull Leads →
            </Link>
          </div>
          <p className="text-xs text-gray-600 font-body">No credit card required to get started</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 mt-20 border-t border-dark-600 pt-12">
          {[
            { num: '200–500', label: 'Leads per zip code' },
            { num: '24 hrs',  label: 'Delivery time' },
            { num: 'Day-of',  label: 'Filing freshness' },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="font-display font-black text-3xl md:text-5xl text-brand-500 mb-2">{s.num}</div>
              <div className="text-gray-500 text-sm font-body">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 bg-dark-800/60 border-y border-dark-600/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display font-black text-4xl md:text-5xl text-center mb-4 tracking-tight">
            HOW IT <span className="text-brand-500">WORKS</span>
          </h2>
          <p className="text-center text-steel text-sm font-body mb-14">Three steps from zip code to close-ready leads.</p>

          <div className="grid md:grid-cols-3 gap-10">
            {[
              {
                step: '01',
                title: 'Enter Your Zip',
                desc: 'Type in any US zip code. We resolve it to the exact county automatically.',
              },
              {
                step: '02',
                title: 'We Pull & Enrich',
                desc: 'Our system scrapes county public records for fresh NOD and Lis Pendens filings, then skip traces every lead for owner contact info.',
              },
              {
                step: '03',
                title: 'Leads Delivered',
                desc: 'Within 24 hours your enriched lead list lands in your dashboard — download CSV or push straight to GHL.',
              },
            ].map((item, i) => (
              <div key={i} className="relative pl-1">
                <div className="font-display font-black text-6xl text-dark-600 mb-3 leading-none">{item.step}</div>
                <div className="w-8 h-0.5 bg-brand-500 mb-3" />
                <h3 className="font-display font-bold text-xl text-white mb-2 tracking-wide">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed font-body">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="font-display font-black text-4xl md:text-5xl text-center mb-3 tracking-tight">
            ONE PLAN. <span className="text-brand-500">NO NONSENSE.</span>
          </h2>
          <p className="text-gray-500 text-center mb-12 font-body">Everything you need to run your wholesale operation.</p>

          <div className="bg-dark-800 border border-brand-500/40 rounded-2xl p-8 glow-orange relative">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-500 text-white text-xs font-bold px-4 py-1 rounded-full tracking-wider">
              MOST POPULAR
            </div>

            <div className="flex items-end gap-2 mb-6">
              <span className="font-display font-black text-6xl text-white">$100</span>
              <span className="text-gray-500 mb-2 font-body">/month</span>
            </div>

            <ul className="space-y-3 mb-8">
              {[
                '500 verified leads per month',
                'Fresh county record scraping',
                'Full skip trace — phone, email, mailing address',
                'DNC scrubbed automatically',
                'CSV download + GHL push',
                'Any US zip code',
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-300 text-sm font-body">
                  <span className="text-brand-500 font-bold text-base">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/login?signup=true"
              className="block w-full bg-brand-500 hover:bg-brand-400 text-white text-center py-3.5 rounded-lg font-semibold transition-colors"
            >
              Start Free Trial →
            </Link>
            <p className="text-center text-xs text-gray-600 mt-3 font-body">10 free leads to try it out. No card needed.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-600 py-10 px-6 text-center">
        <div className="flex justify-center mb-4">
          <BrandLogo size="lg" />
        </div>
        <p className="text-gray-600 text-xs font-body">© 2026 APEX. Built for serious wholesalers.</p>
      </footer>

    </div>
  )
}
