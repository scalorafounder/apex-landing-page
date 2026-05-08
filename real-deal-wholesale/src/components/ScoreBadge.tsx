interface Props {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

function tier(score: number) {
  if (score >= 200) return { label: 'On fire', cls: 'bg-ember-500 text-white' }
  if (score >= 100) return { label: 'Hot',      cls: 'bg-flame-500 text-white' }
  if (score >= 50)  return { label: 'Warm',     cls: 'bg-amber-500 text-ink-900' }
  return                 { label: 'Cold',     cls: 'bg-ink-200 text-ink-700' }
}

export function ScoreBadge({ score, size = 'md' }: Props) {
  const { cls } = tier(score)
  const sizeCls = size === 'lg'
    ? 'px-3 py-1.5 text-base font-semibold'
    : size === 'sm'
    ? 'px-1.5 py-0.5 text-xs font-medium'
    : 'px-2 py-1 text-sm font-medium'
  return (
    <span className={`inline-flex items-center rounded-md tabular-nums ${sizeCls} ${cls}`}>
      {score}
    </span>
  )
}

export function scoreTier(score: number) {
  return tier(score).label
}
