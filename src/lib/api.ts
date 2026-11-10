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

// ---- Conversational Investigation Agent (backend app/routes/conversations.py + app/schemas.py) ----
export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ConversationSummary {
  id: string
  project_id: string
  title: string | null
  created_at: string
  updated_at: string
  last_message_at: string
}

export interface ConversationList {
  conversations: ConversationSummary[]
  limit: number
  offset: number
  has_more: boolean
}

export interface ConversationMessage {
  id: string
  conversation_id: string
  sequence_number: number
  role: 'user' | 'assistant' | string
  message_type: 'text' | string
  content: string | null
  metadata: Record<string, unknown>
  run_id: string | null
  created_at: string
}

export interface ConversationDetail {
  conversation: ConversationSummary
  messages: ConversationMessage[]
  limit: number
  offset: number
  has_more: boolean
  active_run?: AgentRun | null
}

export interface ConversationCreateRequest {
  title?: string | null
}

export interface ConversationMessageSubmitRequest {
  content: string
  client_request_id?: string | null
}

export interface ConversationMessageSubmitResponse {
  run_id: string
  conversation_id: string
  user_message_id: string
  status: AgentRunStatus
  deduplicated: boolean
  created_at: string
}

export interface AgentRunStep {
  id: string
  run_id: string
  step_number: number
  step_type:
    | 'model_started'
    | 'tool_started'
    | 'tool_completed'
    | 'tool_failed'
    | 'model_completed'
    | 'run_completed'
    | 'run_failed'
    | string
  tool_name: string | null
  status: 'in_progress' | 'completed' | 'failed' | string
  input_summary: Record<string, unknown>
  output_summary: Record<string, unknown>
  created_at: string
}

export interface AgentRun {
  run_id: string
  conversation_id: string
  user_message_id: string
  status: AgentRunStatus
  error_message: string | null
  attempt_count: number
  max_attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
  steps: AgentRunStep[]
  latest_step_number: number
  assistant_messages: ConversationMessage[]
}

export interface ConversationDeleteResponse {
  status: string
  conversation_id: string
}

/** Thrown on 409 Conflict when an active investigation run is already in progress on the conversation. */
export class ActiveRunConflictError extends Error {
  readonly code: string
  readonly activeRunId: string | null

  constructor(message: string, activeRunId: string | null = null, code = 'active_run_in_progress') {
    super(message)
    this.code = code
    this.activeRunId = activeRunId
  }
}

/** Thrown on HTTP errors with status code attached for callers that need status-specific handling. */
export class ApiHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseErrorDetail(res: Response): Promise<string> {
  const fallback =
    res.status === 404
      ? 'Requested resource was not found.'
      : res.status === 429
        ? 'Too many requests. Please wait a moment and try again.'
        : res.status >= 500
          ? 'The J.A.R.V.I.S. server encountered an error. Please try again.'
          : `Request failed (${res.status})`
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') return body.detail
    if (typeof body?.detail?.message === 'string') return body.detail.message
    if (Array.isArray(body?.detail) && body.detail[0]?.msg) return String(body.detail[0].msg)
    if (typeof body?.message === 'string') return body.message
  } catch { /* non-JSON error body */ }
  return fallback
}

async function authedJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include' })
  if (res.status === 401) throw new UnauthorizedError()
  if (res.status === 403) {
    throw new ApiHttpError(
      403,
      'Request blocked: this origin is not trusted by the backend (check FRONTEND_URL) or access is forbidden.',
    )
  }
  if (res.status === 409) {
    let message = 'Another investigation run is already in progress for this conversation.'
    let activeRunId: string | null = null
    let code = 'active_run_in_progress'
    try {
      const body = await res.json()
      const detail = body?.detail
      if (typeof detail === 'string') {
        message = detail
      } else if (detail && typeof detail === 'object') {
        if (typeof detail.message === 'string') message = detail.message
        if (typeof detail.active_run_id === 'string') activeRunId = detail.active_run_id
        if (typeof detail.code === 'string') code = detail.code
      }
    } catch { /* ignore */ }
    throw new ActiveRunConflictError(message, activeRunId, code)
  }
  if (!res.ok) {
    const detail = await parseErrorDetail(res)
    throw new ApiHttpError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export function listConversations(
  projectUuid: string,
  params?: { limit?: number; offset?: number; signal?: AbortSignal },
): Promise<ConversationList> {
  const qs = new URLSearchParams()
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return authedJson<ConversationList>(
    `/projects/${encodeURIComponent(projectUuid)}/conversations${suffix}`,
    { signal: params?.signal },
  )
}

export function createConversation(
  projectUuid: string,
  payload?: ConversationCreateRequest,
  options?: { signal?: AbortSignal },
): Promise<ConversationSummary> {
  const bodyObj: ConversationCreateRequest = {}
  if (payload?.title && payload.title.trim()) {
    bodyObj.title = payload.title.trim()
  }
  return authedJson<ConversationSummary>(
    `/projects/${encodeURIComponent(projectUuid)}/conversations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
      signal: options?.signal,
    },
  )
}

export function getConversation(
  projectUuid: string,
  conversationId: string,
  params?: { limit?: number; offset?: number; signal?: AbortSignal },
): Promise<ConversationDetail> {
  const qs = new URLSearchParams()
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.offset !== undefined) qs.set('offset', String(params.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return authedJson<ConversationDetail>(
    `/projects/${encodeURIComponent(projectUuid)}/conversations/${encodeURIComponent(conversationId)}${suffix}`,
    { signal: params?.signal },
  )
}

export function deleteConversation(
  projectUuid: string,
  conversationId: string,
  options?: { signal?: AbortSignal },
): Promise<ConversationDeleteResponse> {
  return authedJson<ConversationDeleteResponse>(
    `/projects/${encodeURIComponent(projectUuid)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
      signal: options?.signal,
    },
  )
}

export function sendConversationMessage(
  projectUuid: string,
  conversationId: string,
  payload: ConversationMessageSubmitRequest,
  options?: { signal?: AbortSignal },
): Promise<ConversationMessageSubmitResponse> {
  return authedJson<ConversationMessageSubmitResponse>(
    `/projects/${encodeURIComponent(projectUuid)}/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: payload.content,
        client_request_id: payload.client_request_id ?? null,
      }),
      signal: options?.signal,
    },
  )
}

export function getAgentRun(
  projectUuid: string,
  conversationId: string,
  runId: string,
  params?: { after_step?: number; limit?: number; signal?: AbortSignal },
): Promise<AgentRun> {
  const qs = new URLSearchParams()
  if (params?.after_step !== undefined) qs.set('after_step', String(params.after_step))
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return authedJson<AgentRun>(
    `/projects/${encodeURIComponent(projectUuid)}/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}${suffix}`,
    { signal: params?.signal },
  )
}

export function advanceAgentRun(
  projectUuid: string,
  conversationId: string,
  runId: string,
  params?: { after_step?: number; limit?: number; signal?: AbortSignal },
): Promise<AgentRun> {
  const qs = new URLSearchParams()
  if (params?.after_step !== undefined) qs.set('after_step', String(params.after_step))
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return authedJson<AgentRun>(
    `/projects/${encodeURIComponent(projectUuid)}/conversations/${encodeURIComponent(conversationId)}/runs/${encodeURIComponent(runId)}/advance${suffix}`,
    {
      method: 'POST',
      signal: params?.signal,
    },
  )
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



