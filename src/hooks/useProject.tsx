import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { listProjects, UnauthorizedError, type Project } from '../lib/api'
import { useAuth } from './useAuth'

const STORAGE_KEY = 'jarvis_active_project_uuid'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function clearStoredProjectUuid() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage blocked or unavailable */ }
}

function readStoredProjectUuid(): string | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY)
    return val && UUID_RE.test(val) ? val : null
  } catch {
    return null
  }
}

function writeStoredProjectUuid(uuid: string | null) {
  try {
    if (uuid && UUID_RE.test(uuid)) localStorage.setItem(STORAGE_KEY, uuid)
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

export interface ProjectContextValue {
  /** Active project's internal UUID (`id`), used for backend API routes. */
  activeProjectUuid: string | null
  /** Active project's external user-facing ID (`project_id`). */
  activeProjectId: string | null
  /** Active project's display name (`name`). */
  activeProjectName: string | null
  /** Full active project object if one is selected. */
  activeProject: Project | null
  /** Available projects owned by the authenticated user. */
  projects: Project[]
  /** True while fetching the project list. */
  loading: boolean
  /** Error message if fetching projects failed. */
  error: string | null
  /** Switch the active project by internal UUID. */
  selectProject: (projectUuid: string) => void
  /** Re-fetch available projects from the backend, optionally selecting a preferred UUID. */
  refreshProjects: (preferProjectUuid?: string) => Promise<Project[]>
  /** Clear active project state and persisted UUID. */
  clearProjectContext: () => void
}

const Ctx = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user, expireSession } = useAuth()
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedUuid, setSelectedUuid] = useState<string | null>(() => readStoredProjectUuid())
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const selectedRef = useRef<string | null>(selectedUuid)

  useEffect(() => {
    selectedRef.current = selectedUuid
  }, [selectedUuid])

  const clearProjectContext = useCallback(() => {
    setProjects([])
    setSelectedUuid(null)
    selectedRef.current = null
    setError(null)
    setLoading(false)
    clearStoredProjectUuid()
  }, [])

  const selectProject = useCallback((projectUuid: string) => {
    setSelectedUuid(projectUuid)
    selectedRef.current = projectUuid
    writeStoredProjectUuid(projectUuid)
  }, [])

  const refreshProjects = useCallback(
    async (preferProjectUuid?: string): Promise<Project[]> => {
      setLoading(true)
      try {
        const res = await listProjects()
        const list = res.projects ?? []
        setProjects(list)
        setError(null)

        if (list.length === 0) {
          setSelectedUuid(null)
          selectedRef.current = null
          clearStoredProjectUuid()
          return list
        }

        const candidateUuid = preferProjectUuid ?? selectedRef.current ?? readStoredProjectUuid()
        const matched = candidateUuid ? list.find((p) => p.id === candidateUuid) : undefined
        const chosen = matched ?? list[0]

        setSelectedUuid(chosen.id)
        selectedRef.current = chosen.id
        writeStoredProjectUuid(chosen.id)
        return list
      } catch (e) {
        if (e instanceof UnauthorizedError) {
          clearProjectContext()
          expireSession()
        } else {
          setError((e as Error).message)
        }
        return []
      } finally {
        setLoading(false)
      }
    },
    [clearProjectContext, expireSession],
  )

  useEffect(() => {
    if (authStatus === 'authenticated' && user) {
      refreshProjects()
    } else if (authStatus === 'unauthenticated') {
      clearProjectContext()
    }
  }, [authStatus, user?.id, refreshProjects, clearProjectContext])

  const activeProject = useMemo(
    () => (selectedUuid ? projects.find((p) => p.id === selectedUuid) ?? null : null),
    [projects, selectedUuid],
  )

  const value = useMemo<ProjectContextValue>(
    () => ({
      activeProjectUuid: activeProject?.id ?? null,
      activeProjectId: activeProject?.project_id ?? null,
      activeProjectName: activeProject?.name ?? null,
      activeProject,
      projects,
      loading,
      error,
      selectProject,
      refreshProjects,
      clearProjectContext,
    }),
    [activeProject, projects, loading, error, selectProject, refreshProjects, clearProjectContext],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useProject() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useProject outside ProjectProvider')
  return c
}

