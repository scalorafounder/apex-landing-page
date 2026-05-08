export const dynamic = 'force-dynamic'

export default function PipelinePage() {
  return (
    <div className="px-8 py-10 max-w-[900px] mx-auto">
      <h1 className="text-2xl font-display font-semibold text-ink-900 mb-2">Pipeline</h1>
      <p className="text-sm text-ink-500 mb-8">Track leads through your acquisition workflow — from contact made to closed deal.</p>
      <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
        <div className="text-3xl mb-3">🏗️</div>
        <div className="text-base font-semibold text-ink-700 mb-1">Coming soon</div>
        <div className="text-sm text-ink-400">Kanban pipeline with stages: New → Contacted → Offer Sent → Under Contract → Closed</div>
      </div>
    </div>
  )
}
