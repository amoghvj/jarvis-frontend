import { useState } from 'react'
import { Check, ChevronDown, Sparkles } from 'lucide-react'
import type { TimelineStep } from '../../lib/agent/types'

export function InvestigationTimeline({ steps }: { steps: TimelineStep[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-line bg-bg/60">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-xs text-zinc-400 transition hover:text-zinc-200"
      >
        <span className="font-medium uppercase tracking-wide">Investigation timeline · {steps.length} steps</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-3">
          <ol>
            {steps.map((s, i) => {
              const last = i === steps.length - 1
              return (
                <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
                  {!last && <span className="absolute left-[9px] top-5 h-full w-px bg-zinc-700" aria-hidden />}
                  <span
                    className={`relative z-10 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ${
                      s.highlight ? 'bg-amber-400/15 text-amber-300 ring-amber-400/50' : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/40'
                    }`}
                  >
                    {s.highlight ? <Sparkles className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <p className={`text-xs font-medium ${s.highlight ? 'text-amber-200' : 'text-zinc-200'}`}>{s.title}</p>
                      <time className="font-mono text-[11px] text-zinc-500">{s.time}</time>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">{s.detail}</p>
                  </div>
                </li>
              )
            })}
          </ol>
          <p className="mt-3 border-t border-line pt-2 text-[11px] text-zinc-600">Illustrative mock timestamps and events.</p>
        </div>
      )}
    </div>
  )
}

