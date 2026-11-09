import { Activity, AlertOctagon, FolderGit2, Siren, type LucideIcon } from 'lucide-react'
import { demoActivity, demoIncidents, demoStats, demoTrend, type IncidentStatus, type Severity } from '../lib/demoData'

// Temporarily disabled: set to true to show the demo-data notice again.
const SHOW_DEMO_BADGE = false

const ICONS: LucideIcon[] = [Siren, Activity, AlertOctagon, FolderGit2]

const SEV: Record<Severity, string> = {
  critical: 'bg-red-500/10 text-red-400 ring-red-500/30',
  high: 'bg-orange-500/10 text-orange-400 ring-orange-500/30',
  medium: 'bg-yellow-500/10 text-yellow-300 ring-yellow-500/30',
  low: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30',
}
const STATUS: Record<IncidentStatus, string> = {
  open: 'bg-red-400',
  investigating: 'bg-accent animate-pulse',
  resolved: 'bg-emerald-400',
}
const TONE: Record<string, string> = { red: 'bg-red-400', cyan: 'bg-accent', green: 'bg-emerald-400', zinc: 'bg-zinc-500' }

function Spark({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data)
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 24}`).join(' ')
  return (
    <svg viewBox="0 0 100 30" className="h-8 w-24" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`rounded-xl border border-line bg-card p-5 ${className}`}>{children}</section>
)

export function Dashboard({ username }: { username: string }) {
  const max = Math.max(...demoTrend)
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Welcome back, {username}</h1>
          <p className="mt-1 text-sm text-zinc-500">Here is what's happening across your systems.</p>
        </div>
        {SHOW_DEMO_BADGE && (
          <span className="rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs text-yellow-300">
            Demo data — not live backend incidents
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {demoStats.map((s, i) => {
          const Icon = ICONS[i]
          return (
            <Card key={s.label} className="fade-up transition hover:border-zinc-600">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-sm">{s.label}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-3xl font-semibold text-white">{s.value}</span>
                <Spark data={s.spark} />
              </div>
              <p className="mt-2 text-xs text-zinc-500">{s.delta}</p>
            </Card>
          )
        })}
      </div>

      <Card className="mt-4">
        <h2 className="mb-4 text-sm font-medium text-white">Incidents detected · last 4 hours (15-min buckets)</h2>
        <div className="flex h-32 items-end gap-2">
          {demoTrend.map((v, i) => (
            <div key={i} className="flex-1 rounded-t bg-accent/30 transition hover:bg-accent/70" style={{ height: `${(v / max) * 100}%` }} title={`${v} incidents`} />
          ))}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-medium text-white">Recent incidents</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr><th className="pb-3 font-medium">Incident</th><th className="pb-3 font-medium">Severity</th><th className="pb-3 font-medium">Service</th><th className="pb-3 font-medium">Status</th><th className="pb-3 text-right font-medium">Detected</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {demoIncidents.map((n) => (
                  <tr key={n.id} className="transition hover:bg-white/[0.03]">
                    <td className="py-3 pr-3"><p className="text-zinc-200">{n.title}</p><p className="font-mono text-xs text-zinc-600">{n.id}</p></td>
                    <td className="py-3 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs capitalize ring-1 ${SEV[n.severity]}`}>{n.severity}</span></td>
                    <td className="py-3 pr-3 font-mono text-xs text-zinc-400">{n.service}</td>
                    <td className="py-3 pr-3"><span className="inline-flex items-center gap-2 capitalize text-zinc-300"><span className={`h-1.5 w-1.5 rounded-full ${STATUS[n.status]}`} />{n.status}</span></td>
                    <td className="py-3 text-right text-xs text-zinc-500">{n.detected}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-medium text-white">System activity</h2>
          <ul className="space-y-4">
            {demoActivity.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[a.tone]}`} />
                <div><p className="text-sm text-zinc-300">{a.text}</p><p className="text-xs text-zinc-600">{a.time}</p></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}

