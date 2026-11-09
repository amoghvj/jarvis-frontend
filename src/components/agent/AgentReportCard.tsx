import { CircleDot, Crosshair, Lightbulb, ListChecks, Wrench, type LucideIcon } from 'lucide-react'
import type { AgentReport, Confidence } from '../../lib/agent/types'
import { InvestigationTimeline } from './InvestigationTimeline'

function Section({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
        <Icon className="h-3.5 w-3.5" /> {label}
      </h4>
      {children}
    </section>
  )
}

const LEVEL: Record<Confidence, number> = { Low: 1, Medium: 2, High: 3 }

function ConfidenceMeter({ level }: { level: Confidence }) {
  const n = LEVEL[level]
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-5 rounded-full ${i <= n ? 'bg-amber-400' : 'bg-zinc-700'}`} />)}
      </div>
      <span className="text-xs font-medium text-amber-200">{level}</span>
    </div>
  )
}

export function AgentReportCard({ report }: { report: AgentReport }) {
  return (
    <article className="fade-up w-full space-y-4 rounded-xl border border-line bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Investigation report</h3>
        {report.mock && (
          <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
            Mock · demo result
          </span>
        )}
      </header>

      <p className="text-sm text-zinc-300">{report.summary}</p>

      <div className="rounded-lg border-l-2 border-red-500 bg-red-500/5 px-3 py-2">
        <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-400">
          <Crosshair className="h-3.5 w-3.5" /> Identified issue
        </p>
        <p className="text-sm font-medium text-white">{report.issue}</p>
      </div>

      <Section icon={Lightbulb} label="Root-cause hypothesis">
        <p className="text-sm leading-relaxed text-zinc-300">{report.hypothesis}</p>
      </Section>

      <Section icon={ListChecks} label="Supporting evidence">
        <ul className="space-y-1.5">
          {report.evidence.map((e) => (
            <li key={e} className="flex gap-2 text-sm text-zinc-300">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden />{e}
            </li>
          ))}
        </ul>
      </Section>

      <Section icon={Wrench} label="Recommended actions">
        <ol className="space-y-2">
          {report.actions.map((a, i) => (
            <li key={a} className="flex gap-2.5 text-sm text-zinc-300">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/5 font-mono text-[11px] text-zinc-400 ring-1 ring-line">{i + 1}</span>
              {a}
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Confidence</p>
          <ConfidenceMeter level={report.confidence} />
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-zinc-500">Status</p>
          <p className="flex items-center gap-1.5 text-xs text-blue-300"><CircleDot className="h-3.5 w-3.5" />{report.status}</p>
        </div>
      </div>

      <InvestigationTimeline steps={report.timeline} />
    </article>
  )
}

