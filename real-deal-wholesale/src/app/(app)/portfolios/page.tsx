export const dynamic = 'force-dynamic'

export default function PortfoliosPage() {
  return (
    <div className="px-8 py-10 max-w-[900px] mx-auto">
      <h1 className="text-2xl font-display font-semibold text-ink-900 mb-2">Portfolios</h1>
      <p className="text-sm text-ink-500 mb-8">View owners who hold multiple distressed properties — high-leverage outreach targets.</p>
      <div className="bg-white rounded-2xl shadow-soft p-10 text-center">
        <div className="text-3xl mb-3">🏘️</div>
        <div className="text-base font-semibold text-ink-700 mb-1">Coming soon</div>
        <div className="text-sm text-ink-400">Owners with 2+ properties in your target ZIPs, sorted by total distress signals and portfolio value</div>
      </div>
    </div>
  )
}
