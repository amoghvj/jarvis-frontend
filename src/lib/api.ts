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

