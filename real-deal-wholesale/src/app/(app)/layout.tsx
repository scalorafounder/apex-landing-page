import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { Sidebar } from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = createServerSupabaseClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar userEmail={session.user.email ?? undefined} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
