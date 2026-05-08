'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface NavItem {
  href: string
  label: string
  badge?: string | number
  enabled: boolean
  reason?: string
}

const items: NavItem[] = [
  { href: '/inbox',      label: 'Inbox',      enabled: true },
  { href: '/pipeline',   label: 'Pipeline',   enabled: true },
  { href: '/portfolios', label: 'Portfolios', enabled: true },
  { href: '/coverage',   label: 'Coverage',   enabled: true },
  { href: '/signals',    label: 'Signals',    enabled: true },
  { href: '/settings',   label: 'Settings',   enabled: true },
]

export function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const sb = createClient()
    await sb.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-56 shrink-0 h-screen sticky top-0 bg-cream-100 border-r border-cream-300 flex flex-col">
      <div className="px-5 pt-5 pb-4">
        <Link href="/inbox" className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-500 text-ink-900 font-display font-semibold text-sm">
            A
          </span>
          <span className="font-display font-semibold text-base tracking-tight text-ink-900">APEX</span>
        </Link>
      </div>

      <nav className="px-2 flex-1 overflow-y-auto">
        {items.map(item => {
          const active = pathname === item.href || (item.href !== '/inbox' && pathname.startsWith(item.href))
          if (!item.enabled) {
            return (
              <div
                key={item.href}
                title={`Not wired yet — ${item.reason}`}
                className="flex items-center justify-between px-3 py-1.5 mb-0.5 rounded-md text-sm text-ink-300 cursor-not-allowed"
              >
                <span>{item.label}</span>
                <span className="text-[10px] uppercase tracking-wider text-ink-300">soon</span>
              </div>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3 py-1.5 mb-0.5 rounded-md text-sm transition-colors duration-150 ease-apple ${
                active
                  ? 'bg-white text-ink-900 font-medium shadow-soft'
                  : 'text-ink-700 hover:bg-white/70'
              }`}
            >
              <span>{item.label}</span>
              {item.badge != null && (
                <span className="text-xs text-ink-400 tabular-nums">{item.badge}</span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-cream-300">
        {userEmail && (
          <div className="text-xs text-ink-500 truncate mb-2" title={userEmail}>
            {userEmail}
          </div>
        )}
        <button
          onClick={signOut}
          className="text-xs text-ink-400 hover:text-ink-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
