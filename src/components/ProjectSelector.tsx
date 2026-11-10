import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, FolderGit2, Loader2, Plus, RefreshCw } from 'lucide-react'
import { useProject } from '../hooks/useProject'
import { CreateProjectModal } from './CreateProjectModal'
import type { Project } from '../lib/api'

export function ProjectSelector() {
  const {
    activeProject,
    activeProjectUuid,
    activeProjectId,
    activeProjectName,
    projects,
    loading,
    error,
    selectProject,
    refreshProjects,
  } = useProject()

  const [open, setOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [createdBanner, setCreatedBanner] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) =>
      ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const handleCreated = async (created: Project) => {
    await refreshProjects(created.id)
    selectProject(created.id)
    setCreatedBanner(created.project_id)
    setTimeout(() => setCreatedBanner(null), 3500)
  }

  const label = loading && projects.length === 0
    ? 'Loading…'
    : activeProject
      ? activeProjectName && activeProjectName !== activeProjectId
        ? activeProjectName
        : activeProjectId
      : error
        ? 'Projects unavailable'
        : 'No project selected'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Select active project"
        aria-expanded={open}
        className="flex max-w-[180px] items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5 text-left text-xs transition hover:border-zinc-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:max-w-[240px] sm:px-3"
      >
        {loading && projects.length === 0 ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
        ) : error && projects.length === 0 ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
        ) : (
          <FolderGit2 className={`h-3.5 w-3.5 shrink-0 ${activeProject ? 'text-accent' : 'text-zinc-500'}`} />
        )}
        <span className={`min-w-0 flex-1 truncate font-mono ${activeProject ? 'font-medium text-white' : 'font-sans text-zinc-400'}`}>
          {label}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {createdBanner && !open && (
        <div
          role="status"
          className="fade-up absolute right-0 top-11 z-50 whitespace-nowrap rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 shadow-lg"
        >
          Project <span className="font-mono font-medium">{createdBanner}</span> selected
        </div>
      )}

      {open && (
        <div className="fade-up absolute right-0 top-11 z-50 w-72 rounded-xl border border-line bg-card p-2 shadow-2xl shadow-black/60 sm:left-0 sm:right-auto sm:w-80">
          <div className="flex items-center justify-between px-2.5 py-1.5">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Projects {projects.length > 0 ? `(${projects.length})` : ''}
            </span>
            <button
              type="button"
              onClick={() => refreshProjects()}
              disabled={loading}
              title="Refresh projects"
              aria-label="Refresh projects"
              className="rounded p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {error && (
            <div role="alert" className="mx-1.5 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
              <p className="font-medium">Couldn't load projects</p>
              <p className="mt-0.5 text-[11px] text-red-300/80">{error}</p>
              <button
                type="button"
                onClick={() => refreshProjects()}
                disabled={loading}
                className="mt-2 rounded border border-red-500/40 px-2.5 py-1 text-[11px] hover:bg-red-500/10 disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          )}

          {loading && projects.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-6 text-xs text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading projects…
            </div>
          ) : !error && projects.length === 0 ? (
            <div className="my-1 rounded-lg border border-dashed border-line px-3 py-5 text-center">
              <p className="text-xs font-medium text-zinc-200">No projects yet</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                Create a project to receive telemetry and scope investigations.
              </p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  setModalOpen(true)
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200"
              >
                <Plus className="h-3.5 w-3.5" /> New Project
              </button>
            </div>
          ) : (
            <ul className="max-h-60 space-y-0.5 overflow-y-auto py-1" role="listbox" aria-label="Available projects">
              {projects.map((p) => {
                const selected = p.id === activeProjectUuid
                const hasDistinctName = p.name && p.name !== p.project_id
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        selectProject(p.id)
                        setOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                        selected ? 'bg-accent/10 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono font-medium" title={p.project_id}>
                          {p.project_id}
                        </p>
                        {hasDistinctName && (
                          <p className="truncate text-[11px] text-zinc-500" title={p.name}>
                            {p.name}
                          </p>
                        )}
                      </div>
                      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="my-1.5 h-px bg-line" />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setModalOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-accent transition hover:bg-accent/10"
          >
            <Plus className="h-3.5 w-3.5" /> New Project
          </button>
        </div>
      )}

      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  )
}

