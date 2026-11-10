export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

// Matches backend app/schemas.py UserOut
export interface User {
  id: string
  github_id: number
  github_username: string
  email: string | null
  avatar_url: string | null
  created_at: string
}

export const githubLoginUrl = `${API_BASE_URL}/auth/github`

/** Returns the user, or null when unauthenticated (401). Throws on other failures. */
export async function fetchMe(): Promise<User | null> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Failed to load session (${res.status})`)
  return res.json()
}

/** Browser sets the Origin header automatically; backend checks it against FRONTEND_URL. */
export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' })
  if (!res.ok) throw new Error(`Logout failed (${res.status})`)
}


// ---- API keys (backend app/schemas.py: ApiKeyStatusOut, RotatedKeyOut, MessageOut) ----
export interface ApiKeyStatus {
  active: boolean
  key_prefix: string | null
  created_at: string | null
  last_used_at: string | null
}
export interface RotatedKey {
  api_key: string
  key_prefix: string
  created_at: string
  message: string
}
export interface MessageOut {
  status: string
  message: string
}

/** Thrown when the backend answers 401 so callers can fall back to the login screen. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.')
  }
}

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include' })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new Error('Request blocked: this origin is not trusted by the backend (check FRONTEND_URL).')
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) detail = body.detail[0].msg
      else if (typeof body?.message === 'string') detail = body.message
    } catch { /* non-JSON error body */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const getApiKeyStatus = () => authed<ApiKeyStatus>('/api-keys/status')
export const rotateApiKey = () => authed<RotatedKey>('/api-keys/rotate', { method: 'POST' })
export const revokeApiKey = () => authed<MessageOut>('/api-keys', { method: 'DELETE' })

// ---- GitHub App integration (backend app/schemas.py + app/routes/github.py) ----
export interface GitHubInstallation {
  installation_id: number
  account_id: number
  account_login: string
  account_type: string
  repository_selection: string | null
  permissions: Record<string, unknown>
  suspended_at: string | null
  created_at: string
  updated_at: string
}
export interface GitHubIntegrationStatus {
  connected: boolean
  installations: GitHubInstallation[]
}
export interface GitHubDisconnect {
  status: string
  message: string
  installation_id: number
}

/** Full-page navigation target; the backend validates the session and redirects to GitHub. */
export const githubInstallUrl = `${API_BASE_URL}/integrations/github/install`

export const getGitHubStatus = () => authed<GitHubIntegrationStatus>('/integrations/github/status')
export const disconnectGitHubInstallation = (installationId: number) =>
  authed<GitHubDisconnect>(`/integrations/github/installations/${encodeURIComponent(String(installationId))}`, { method: 'DELETE' })

// ---- Projects (backend app/schemas.py + app/routes/projects.py) ----
export interface Project {
  id: string // Internal UUID
  project_id: string // External user-chosen project identifier
  name: string // Display name
  created_at: string
  updated_at: string
}

export interface ProjectList {
  projects: Project[]
}

export interface ProjectCreateInput {
  project_id: string
  name?: string | null
}

/** Thrown on 409 Conflict when the user already has a project with the given project_id. */
export class DuplicateProjectError extends Error {
  constructor(message = 'You already have a project with this project_id') {
    super(message)
  }
}

export const listProjects = () => authed<ProjectList>('/projects')

export const getProject = (projectUuid: string) =>
  authed<Project>(`/projects/${encodeURIComponent(projectUuid)}`)

export async function createProject(input: ProjectCreateInput): Promise<Project> {
  const payload: ProjectCreateInput = { project_id: input.project_id }
  if (input.name && input.name.trim()) {
    payload.name = input.name.trim()
  }
  const res = await fetch(`${API_BASE_URL}/projects`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) throw new Error('Request blocked: this origin is not trusted by the backend (check FRONTEND_URL).')
  if (res.status === 409) {
    let detail = 'You already have a project with this project_id'
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch { /* ignore */ }
    throw new DuplicateProjectError(detail)
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) detail = body.detail[0].msg
      else if (typeof body?.message === 'string') detail = body.message
    } catch { /* non-JSON error body */ }
    throw new Error(detail)
  }
  return res.json() as Promise<Project>
}

// ---- Incidents (backend app/schemas.py: IncidentOut, IncidentListOut + app/routes/projects.py) ----
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved'
export type IncidentSeverity = 'CRITICAL' | 'ERROR' | 'WARNING' | 'INFO' | 'DEBUG'

export interface Incident {
  id: string
  project_id: string
  title: string
  status: IncidentStatus | (string & {})
  severity: IncidentSeverity | (string & {}) | null
  service_id: string | null
  environment: string | null
  event_count: number
  first_seen_at: string | null
  last_seen_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface IncidentList {
  incidents: Incident[]
  limit: number
  offset: number
  has_more: boolean
}

export interface ListIncidentsParams {
  status?: IncidentStatus
  limit?: number
  offset?: number
  signal?: AbortSignal
}

export function listIncidents(
  projectUuid: string,
  params: ListIncidentsParams = {},
): Promise<IncidentList> {
  const qs = new URLSearchParams()
  if (params.status !== undefined) qs.set('status', params.status)
  if (params.limit !== undefined) qs.set('limit', String(params.limit))
  if (params.offset !== undefined) qs.set('offset', String(params.offset))
  const query = qs.toString()
  const path = `/projects/${encodeURIComponent(projectUuid)}/incidents${query ? `?${query}` : ''}`
  return authed<IncidentList>(path, params.signal ? { signal: params.signal } : {})
}



