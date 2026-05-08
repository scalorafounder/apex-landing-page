'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  leadId: string
  alreadyTraced: boolean
}

export function SkipTraceButton({ leadId, alreadyTraced }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const router = useRouter()

  async function run() {
    setState('loading')
    setErrorMsg(null)
    try {
      const [traceRes, zillowRes] = await Promise.allSettled([
        fetch(`/api/leads/${leadId}/enrich`, { method: 'POST' }),
        fetch(`/api/leads/${leadId}/zillow`, { method: 'POST' }),
      ])
      const traceOk = traceRes.status === 'fulfilled' && traceRes.value.ok
      const zillowOk = zillowRes.status === 'fulfilled' && zillowRes.value.ok
      if (traceOk || zillowOk) {
        setState('done')
        router.refresh()
      } else {
        const msg = traceRes.status === 'fulfilled'
          ? await traceRes.value.json().then((j: any) => j.error).catch(() => 'failed')
          : 'network error'
        setErrorMsg(msg)
        setState('error')
      }
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Unknown error')
      setState('error')
    }
  }

  const label =
    state === 'loading' ? 'Tracing…' :
    state === 'done'    ? 'Enriched' :
    state === 'error'   ? 'Retry trace' :
    alreadyTraced       ? 'Re-trace lead' :
                          'Skip trace lead'

  const cls =
    state === 'done'  ? 'bg-moss-500 text-white cursor-default' :
    state === 'error' ? 'bg-ember-500/10 text-ember-500 border border-ember-500/30 hover:bg-ember-500/20' :
                        'bg-amber-500 text-ink-900 hover:bg-amber-400 active:scale-95'

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={state === 'loading' || state === 'done' ? undefined : run}
        disabled={state === 'loading' || state === 'done'}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 select-none ${cls} ${state === 'loading' ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {state === 'loading' && (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0" />
        )}
        {state === 'done' && (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {label}
      </button>
      {errorMsg && (
        <p className="text-[10px] text-ember-500 max-w-[200px] text-right">{errorMsg}</p>
      )}
    </div>
  )
}
