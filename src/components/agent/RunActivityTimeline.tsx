import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Clock, Loader2, Sparkles, XCircle } from 'lucide-react'
import type { AgentRun, AgentRunStep } from '../../lib/api'
import { formatRunStepActivity } from '../../lib/agent/activity'

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}

export function RunActivityTimeline({
  run,
  steps,
}: {
  run: AgentRun | null
  steps: AgentRunStep[]
}) {
  const isTerminal =
    run?.status === 'completed' || run?.status === 'failed' || run?.status === 'cancelled'
  const [expanded, setExpanded] = useState(true)

  if (!run && steps.length === 0) return null

  const status = run?.status ?? 'running'
  const formattedSteps = steps.map(formatRunStepActivity)
  const latestStep = formattedSteps[formattedSteps.length - 1]

  const headerBadge = (() => {
    switch (status) {
      case 'queued':
        return {
          text: 'Queued · waiting for worker',
          cls: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
          icon: <Clock className="h-3.5 w-3.5 animate-pulse text-amber-300" />,
        }
      case 'running':
        return {
          text: latestStep ? latestStep.label : 'Investigating…',
          cls: 'border-blue-400/30 bg-blue-400/10 text-blue-300',
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />,
        }
      case 'completed':
        return {
          text: `Investigation completed · ${formattedSteps.length} step${formattedSteps.length === 1 ? '' : 's'}`,
          cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
          icon: <Check className="h-3.5 w-3.5 text-emerald-400" />,
        }
      case 'failed':
        return {
          text: 'Investigation failed',
          cls: 'border-red-500/30 bg-red-500/10 text-red-300',
          icon: <XCircle className="h-3.5 w-3.5 text-red-400" />,
        }
      case 'cancelled':
        return {
          text: 'Investigation cancelled',
          cls: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-400',
          icon: <AlertTriangle className="h-3.5 w-3.5 text-zinc-400" />,
        }
      default:
        return {
          text: String(status),
          cls: 'border-line bg-white/5 text-zinc-300',
          icon: <Sparkles className="h-3.5 w-3.5 text-accent" />,
        }
    }
  })()

  return (
    <div className="fade-up rounded-xl border border-line bg-card/80">
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-xs transition hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 items-center gap-2">
          {headerBadge.icon}
          <span className="truncate font-medium text-zinc-200">{headerBadge.text}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${headerBadge.cls}`}>
            {status}
          </span>
          <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line px-3.5 py-3">
          {status === 'queued' && formattedSteps.length === 0 && (
            <p className="text-xs text-zinc-400">
              Your investigation request is queued and will begin executing as soon as the worker claims it.
            </p>
          )}

          {status === 'running' && formattedSteps.length === 0 && (
            <p className="text-xs text-zinc-400">
              Starting investigation and loading project context…
            </p>
          )}

          {formattedSteps.length > 0 && (
            <ol className="space-y-0">
              {formattedSteps.map((s, idx) => {
                const isLast = idx === formattedSteps.length - 1
                const isFailed = s.status === 'failed' || s.stepType === 'tool_failed' || s.stepType === 'run_failed'
                const isInProgress = s.status === 'in_progress' && !isTerminal
                return (
                  <li key={`${s.id}-${s.stepNumber}`} className="relative flex gap-3 pb-3.5 last:pb-0">
                    {!isLast && (
                      <span className="absolute left-[9px] top-5 h-full w-px bg-zinc-800" aria-hidden />
                    )}
                    <span
                      className={`relative z-10 mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ring-1 ${
                        isFailed
                          ? 'bg-red-500/15 text-red-400 ring-red-500/40'
                          : isInProgress
                            ? 'bg-blue-500/15 text-blue-300 ring-blue-400/50'
                            : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/40'
                      }`}
                    >
                      {isFailed ? (
                        <AlertTriangle className="h-3 w-3" />
                      ) : isInProgress ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <p
                          className={`text-xs font-medium ${
                            isFailed ? 'text-red-300' : isInProgress ? 'text-blue-200' : 'text-zinc-200'
                          }`}
                        >
                          {s.label}
                        </p>
                        {s.createdAt && (
                          <time className="font-mono text-[10px] text-zinc-500">
                            {formatTime(s.createdAt)}
                          </time>
                        )}
                      </div>
                      {s.detail && (
                        <p className="mt-0.5 break-words text-[11px] text-zinc-500">{s.detail}</p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {status === 'failed' && run?.error_message && (
            <div
              role="alert"
              className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
            >
              {run.error_message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

