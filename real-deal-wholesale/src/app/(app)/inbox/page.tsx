import { getInboxLeads } from '@/lib/leads'
import { InboxTable } from '@/components/InboxTable'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const leads = await getInboxLeads({ statuses: ['new'], limit: 200 })

  return (
    <div className="px-8 py-6 max-w-[1400px]">
      <header className="mb-6">
        <h1 className="text-2xl font-display font-semibold tracking-tight text-ink-900">Inbox</h1>
        <p className="text-sm text-ink-500 mt-0.5">{leads.length} leads · sorted by most recent filing</p>
      </header>

      {leads.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-soft p-12 text-center">
          <div className="text-sm text-ink-500">No new leads. Scanners run continuously — check back after the next cycle.</div>
        </div>
      ) : (
        <InboxTable leads={leads as any} />
      )}
    </div>
  )
}
