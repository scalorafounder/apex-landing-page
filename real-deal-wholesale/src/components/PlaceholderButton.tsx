'use client'

interface Props {
  children: React.ReactNode
  reason: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Visibly distinct button used when the underlying integration is not wired yet.
 * Click shows a tooltip-style message; never silently no-ops.
 */
export function PlaceholderButton({ children, reason, className = '', size = 'md' }: Props) {
  const sizeCls = size === 'lg' ? 'px-4 py-2.5 text-sm' : size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
  return (
    <button
      type="button"
      title={`Not wired yet — ${reason}`}
      onClick={() => alert(`Not wired yet — ${reason}`)}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-dashed border-cream-400 bg-cream-100 text-ink-500 font-medium hover:border-amber-400 hover:text-ink-700 transition-colors duration-200 ease-apple ${sizeCls} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" aria-hidden />
      {children}
    </button>
  )
}
