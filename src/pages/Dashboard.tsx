import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Clock,
  FolderGit2,
  Inbox,
  Loader2,
  RefreshCw,
  Siren,
  type LucideIcon,
} from 'lucide-react'
import { GitHubStatusCard } from '../components/GitHubStatusCard'
import { useAuth } from '../hooks/useAuth'
import { useProject } from '../hooks/useProject'
import {
  listIncidents,
  UnauthorizedError,
  type Incident,
  type IncidentList,
} from '../lib/api'

const PAGE_LIMIT = 25

const SEV_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 text-red-400 ring-red-500/30',
  ERROR: 'bg-orange-500/10 text-orange-400 ring-orange-500/30',
  WARNING: 'bg-yellow-500/10 text-yellow-300 ring-yellow-500/30',
  INFO: 'bg-sky-500/10 text-sky-300 ring-sky-500/30',
  DEBUG: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30',
}
const DEFAULT_SEV_STYLE = 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/30'

const STATUS_DOT: Record<string, string> = {
  open: 'bg-red-400',
  acknowledged: 'bg-yellow-400',
  resolved: 'bg-emerald-400',
}
const DEFAULT_STATUS_DOT = 'bg-zinc-500'

function severityClass(severity: string | null): string {
  if (!severity) return DEFAULT_SEV_STYLE
  return SEV_STYLE[severity.trim().toUpperCase()] ?? DEFAULT_SEV_STYLE
}

function severityLabel(severity: string | null): string {
  if (!severity || !severity.trim()) return 'UNSPECIFIED'
  return severity.trim().toUpperCase()
}

function statusDotClass(status: string): string {
  return STATUS_DOT[status.trim().toLowerCase()] ?? DEFAULT_STATUS_DOT
}

function formatRelativeTime(iso: string | null): { label: string; title: string } {
  if (!iso) return { label: '—', title: '' }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { label: '—', title: iso }
  const full = date.toLocaleString()
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000)
  if (diffSec < 5) return { label: 'just now', title: full }
  if (diffSec < 60) return { label: `${diffSec}s ago`, title: full }
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return { label: `${diffMin} min ago`, title: full }
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) {
    const remMin = diffMin % 60
    return { label: remMin > 0 ? `${diffHr} h ${remMin} min ago` : `${diffHr} h ago`, title: full }
  }
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays < 7) return { label: `${diffDays} d ago`, title: full }
  return { label: date.toLocaleDateString(), title: full }
}

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`rounded-xl border border-line bg-card p-5 ${className}`}>{children}</section>
)

interface ScopedIncidentState {
  projectUuid: string
  data: IncidentList
}

interface KpiStat {
  label: string
  value: string
  delta: string
  icon: LucideIcon
}

export function Dashboard({ username, onOpenIntegrations }: { username: string; onOpenIntegrations: () => void }) {
  const { expireSession } = useAuth()
  const {
    activeProjectUuid,
    activeProjectId,
    activeProjectName,
    activeProject,
    projects,
    loading: projectLoading,
    error: projectError,
  } = useProject()

  const [scoped, setScoped] = useState<ScopedIncidentState | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const reqSeqRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const loadIncidents = useCallback(
    async (targetProjectUuid: string) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const seq = ++reqSeqRef.current

      setLoading(true)
      setError(null)

      try {
        const res = await listIncidents(targetProjectUuid, {
          limit: PAGE_LIMIT,
          offset: 0,
          signal: controller.signal,
        })
        if (controller.signal.aborted || seq !== reqSeqRef.current) return
        // Enforce project isolation at the client boundary as well: only keep rows for targetProjectUuid.
        const projectIncidents = (res.incidents ?? []).filter((inc) => inc.project_id === targetProjectUuid)
        setScoped({
          projectUuid: targetProjectUuid,
          data: { ...res, incidents: projectIncidents },
        })
        setError(null)
      } catch (e) {
        if (controller.signal.aborted || seq !== reqSeqRef.current) return
        if ((e as Error)?.name === 'AbortError') return
        if (e instanceof UnauthorizedError) {
          expireSession()
          return
        }
        setError((e as Error).message || 'Failed to load incidents')
      } finally {
        if (!controller.signal.aborted && seq === reqSeqRef.current) {
          setLoading(false)
        }
      }
    },
    [expireSession],
  )

  useEffect(() => {
    if (!activeProjectUuid) {
      abortRef.current?.abort()
      abortRef.current = null
      reqSeqRef.current += 1
      setScoped(null)
      setError(null)
      setLoading(false)
      return
    }
    void loadIncidents(activeProjectUuid)
    return () => {
      abortRef.current?.abort()
    }
  }, [activeProjectUuid, loadIncidents])

  // Render-time guard: never read incident data unless it belongs to the currently active project UUID.
  const currentData: IncidentList | null =
    activeProjectUuid && scoped?.projectUuid === activeProjectUuid ? scoped.data : null
  const incidents: Incident[] = currentData?.incidents ?? []
  const hasMore = Boolean(currentData?.has_more)

  const totalLoaded = incidents.length
  const openCount = incidents.filter((i) => i.status === 'open').length
  const ackCount = incidents.filter((i) => i.status === 'acknowledged').length
  const criticalCount = incidents.filter((i) => (i.severity ?? '').toUpperCase() === 'CRITICAL').length

  const projectDisplay = activeProject
    ? activeProjectName && activeProjectName !== activeProjectId
      ? `${activeProjectName} (${activeProjectId})`
      : activeProjectId
    : null

  const inactiveReason = !activeProjectUuid
    ? projectLoading
      ? 'Loading project context…'
      : projectError
        ? 'Project context unavailable'
        : 'Select or create a project to view incidents'
    : loading && !currentData
      ? 'Loading project incidents…'
      : error && !currentData
        ? 'Incident data unavailable'
        : ''

  const stats: KpiStat[] = [
    {
      label: 'Total incidents',
      value: currentData ? (hasMore ? `${totalLoaded}+` : String(totalLoaded)) : '—',
      delta: currentData
        ? hasMore
          ? `Showing first ${totalLoaded} loaded (pagination incomplete)`
          : `${totalLoaded} recorded in ${activeProjectId ?? 'active project'}`
        : inactiveReason,
      icon: Siren,
    },
    {
      label: 'Open incidents',
      value: currentData ? String(openCount) : '—',
      delta: currentData
        ? hasMore
          ? `${openCount} open in loaded page (${totalLoaded} fetched)`
          : ackCount > 0
            ? `${openCount} open · ${ackCount} acknowledged`
            : `${openCount} open of ${totalLoaded} loaded`
        : inactiveReason,
      icon: Activity,
    },
    {
      label: 'Critical incidents',
      value: currentData ? String(criticalCount) : '—',
      delta: currentData
        ? hasMore
          ? `${criticalCount} CRITICAL in loaded page (${totalLoaded} fetched)`
          : criticalCount > 0
            ? `${criticalCount} with CRITICAL severity`
            : 'No CRITICAL incidents in project'
        : inactiveReason,
      icon: AlertOctagon,
    },
    {
      label: 'Monitored projects',
      value: projectLoading && projects.length === 0 ? '—' : String(projects.length),
      delta: activeProject
        ? `Active: ${activeProject.project_id}`
        : projectLoading
          ? 'Loading projects…'
          : projectError
            ? 'Could not load projects'
            : projects.length === 0
              ? 'No projects created yet'
              : `${projects.length} project${projects.length === 1 ? '' : 's'} in your account`,
      icon: FolderGit2,
    },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Welcome back, {username}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {projectDisplay ? (
              <>
                Showing live incident intelligence for project{' '}
                <span className="font-mono text-zinc-300">{projectDisplay}</span>.
              </>
            ) : (
              "Here is what's happening across your systems."
            )}
          </p>
        </div>
        {activeProjectUuid && (
          <button
            type="button"
            onClick={() => void loadIncidents(activeProjectUuid)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 hover:bg-white/5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-accent' : 'text-zinc-400'}`} />
            {loading ? 'Refreshing…' : 'Refresh incidents'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="fade-up transition hover:border-zinc-600">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="text-sm">{s.label}</span>
                <Icon className="h-4 w-4" />
              </div>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-3xl font-semibold text-white">{s.value}</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">{s.delta}</p>
            </Card>
          )
        })}
      </div>

      <GitHubStatusCard onOpen={onOpenIntegrations} />

      <Card className="mt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-white">Incidents detected · last 4 hours (15-min buckets)</h2>
          <span className="text-xs text-zinc-500">Historical analytics not connected</span>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-4 py-7 text-center">
          <BarChart3 className="h-5 w-5 text-zinc-500" />
          <p className="mt-2 text-xs font-medium text-zinc-300">Historical trend analytics are not connected yet</p>
          <p className="mt-1 max-w-md text-xs text-zinc-500">
            The backend currently exposes the active project&apos;s incident list without time-series bucket aggregation.
          </p>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-white">Recent incidents</h2>
              {currentData && hasMore && (
                <p className="mt-0.5 text-xs text-zinc-500">
                  Showing first {incidents.length} incidents (most recently active first). More incidents exist for this project.
                </p>
              )}
            </div>
            {activeProjectUuid && (
              <button
                type="button"
                onClick={() => void loadIncidents(activeProjectUuid)}
                disabled={loading}
                aria-label="Refresh recent incidents"
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-600 hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-accent' : ''}`} />
                Refresh
              </button>
            )}
          </div>

          {!activeProjectUuid ? (
            projectLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-10 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading active project…
              </div>
            ) : projectError ? (
              <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Couldn&apos;t load your projects</p>
                    <p className="mt-1 text-xs text-red-300/80">{projectError}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
                <FolderGit2 className="mx-auto h-6 w-6 text-zinc-500" />
                <p className="mt-2 text-sm font-medium text-zinc-200">No active project selected</p>
                <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
                  Select an existing project or create a new one using the project selector in the header to view its incidents.
                </p>
              </div>
            )
          ) : loading && !currentData ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-10 text-sm text-zinc-500" aria-busy="true">
              <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading incidents for{' '}
              <span className="font-mono text-zinc-300">{activeProjectId ?? 'project'}</span>…
            </div>
          ) : error && !currentData ? (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Couldn&apos;t load incidents</p>
                  <p className="mt-1 text-xs text-red-300/80">{error}</p>
                  <button
                    type="button"
                    onClick={() => void loadIncidents(activeProjectUuid)}
                    disabled={loading}
                    className="mt-3 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium hover:bg-red-500/10 disabled:opacity-50"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </div>
          ) : incidents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center">
              <Inbox className="mx-auto h-6 w-6 text-zinc-500" />
              <p className="mt-2 text-sm font-medium text-zinc-200">
                No incidents recorded for <span className="font-mono">{activeProjectId ?? 'this project'}</span>
              </p>
              <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
                Qualifying abnormal <span className="font-mono">ERROR</span> and <span className="font-mono">CRITICAL</span> events ingested via{' '}
                <span className="font-mono">POST /v1/events</span> will automatically group into incidents here.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  Refresh failed: {error}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="pb-3 font-medium">Incident</th>
                      <th className="pb-3 font-medium">Severity</th>
                      <th className="pb-3 font-medium">Service</th>
                      <th className="pb-3 font-medium">Environment</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 text-right font-medium">Events</th>
                      <th className="pb-3 text-right font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {incidents.map((n) => {
                      const timestamp = formatRelativeTime(n.last_seen_at ?? n.created_at)
                      return (
                        <tr key={n.id} className="transition hover:bg-white/[0.03]">
                          <td className="py-3 pr-3">
                            <p className="text-zinc-200">{n.title}</p>
                            <p className="font-mono text-xs text-zinc-600">{n.id}</p>
                          </td>
                          <td className="py-3 pr-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${severityClass(n.severity)}`}>
                              {severityLabel(n.severity)}
                            </span>
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs text-zinc-400">
                            {n.service_id || '—'}
                          </td>
                          <td className="py-3 pr-3 font-mono text-xs text-zinc-500">
                            {n.environment || '—'}
                          </td>
                          <td className="py-3 pr-3">
                            <span className="inline-flex items-center gap-2 capitalize text-zinc-300">
                              <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(n.status)}`} />
                              {n.status}
                            </span>
                          </td>
                          <td className="py-3 pr-3 text-right font-mono text-xs text-zinc-300">
                            {n.event_count.toLocaleString()}
                          </td>
                          <td className="py-3 text-right text-xs text-zinc-500" title={timestamp.title}>
                            {timestamp.label}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-medium text-white">System activity</h2>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-4 py-10 text-center">
            <Clock className="h-5 w-5 text-zinc-500" />
            <p className="mt-2 text-xs font-medium text-zinc-300">Activity feed is not connected yet</p>
            <p className="mt-1 text-xs text-zinc-500">
              Project-wide lifecycle transitions, severity escalations, and repository discovery events are not yet exposed by a feed endpoint.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
