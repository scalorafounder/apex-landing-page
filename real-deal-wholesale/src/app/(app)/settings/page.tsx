import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NotificationSettings } from './NotificationSettings'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const sb = createServerSupabaseClient()
  const { data } = await sb
    .from('notification_settings')
    .select('*')
    .order('created_at', { ascending: true })

  return (
    <div className="px-8 py-6 max-w-[700px] mx-auto">
      <h1 className="text-2xl font-display font-semibold text-ink-900 mb-1">Settings</h1>
      <p className="text-sm text-ink-500 mb-8">Configure who gets notified when new leads are scraped.</p>

      <NotificationSettings initial={data ?? []} />
    </div>
  )
}
