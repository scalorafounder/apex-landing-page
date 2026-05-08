interface Props {
  title: string
  hint: string
  source?: string
}

/**
 * Honest empty state for enrichment data we don't have yet.
 * Never hard-codes fake values.
 */
export function EmptyEnrichment({ title, hint, source }: Props) {
  return (
    <div className="rounded-xl border border-dashed border-cream-400 bg-cream-100/50 px-4 py-5 text-center">
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-ink-400 mb-1.5">
        <span className="w-1 h-1 rounded-full bg-ink-300" />
        Not yet enriched
      </div>
      <h4 className="text-sm font-medium text-ink-700">{title}</h4>
      <p className="mt-1 text-xs text-ink-500 max-w-xs mx-auto leading-relaxed">{hint}</p>
      {source && (
        <p className="mt-2 text-[10px] uppercase tracking-wide text-ink-400">via {source}</p>
      )}
    </div>
  )
}
