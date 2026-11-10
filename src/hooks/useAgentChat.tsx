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
import {
  ActiveRunConflictError,
  advanceAgentRun as apiAdvanceAgentRun,
  ApiHttpError,
  createConversation as apiCreateConversation,
  deleteConversation as apiDeleteConversation,
  getAgentRun as apiGetAgentRun,
  getConversation as apiGetConversation,
  listConversations as apiListConversations,
  sendConversationMessage as apiSendConversationMessage,
  UnauthorizedError,
  type AgentRun,
  type AgentRunStep,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
} from '../lib/api'
import { mergeRunSteps } from '../lib/agent/activity'
import {
  buildConversationMarkdown,
  buildExportFilename,
  downloadMarkdownFile,
} from '../lib/agent/exportMarkdown'
import { useAuth } from './useAuth'
import { useProject } from './useProject'

const POLL_INTERVAL_MS = 1500
const ADVANCE_QUEUED_DELAY_MS = 250
const MAX_CONSECUTIVE_POLL_FAILURES = 6
const MAX_CONSECUTIVE_ADVANCE_FAILURES = 6
const MAX_ADVANCE_RECOVERY_CYCLES = 4
const STALE_RUNNING_LEASE_PROBE_MS = 95000

function generateClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === 'AbortError'
  ) || (err instanceof Error && err.name === 'AbortError')
}

/**
 * Deduplicate and sort messages strictly by sequence_number and id.
 * Replaces optimistic placeholder messages once the server user message arrives.
 */
export function mergeTranscriptMessages(
  existing: ConversationMessage[],
  incoming: ConversationMessage[],
  replaceOptimisticId?: string | null,
): ConversationMessage[] {
  const filteredExisting = replaceOptimisticId
    ? existing.filter((m) => m.id !== replaceOptimisticId)
    : existing
  const byId = new Map<string, ConversationMessage>()
  for (const m of filteredExisting) {
    if ((m.role === 'user' || m.role === 'assistant') && m.message_type === 'text') {
      byId.set(m.id, m)
    }
  }
  for (const m of incoming) {
    if ((m.role === 'user' || m.role === 'assistant') && m.message_type === 'text') {
      byId.set(m.id, m)
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    if (a.sequence_number !== b.sequence_number) {
      return a.sequence_number - b.sequence_number
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

export interface FailedSubmissionState {
  projectUuid: string
  conversationId: string
  content: string
  clientRequestId: string
  optimisticMessageId: string
}

export interface AgentChatContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  projectUuid: string | null
  projectId: string | null
  projectName: string | null
  conversations: ConversationSummary[]
  activeConversationId: string | null
  activeConversation: ConversationSummary | null
  messages: ConversationMessage[]
  activeRun: AgentRun | null
  runSteps: AgentRunStep[]
  loadingConversations: boolean
  loadingMessages: boolean
  creatingConversation: boolean
  sendingMessage: boolean
  deletingConversationId: string | null
  error: string | null
  clearError: () => void
  failedSubmission: FailedSubmissionState | null
  refreshConversations: () => Promise<void>
  createNewConversation: (title?: string) => Promise<ConversationSummary | null>
  selectConversation: (conversationId: string) => Promise<void>
  deleteConversationById: (conversationId: string) => Promise<boolean>
  sendMessage: (content: string) => Promise<void>
  retryFailedSubmission: () => Promise<void>
  exportActiveConversation: () => void
}

const Ctx = createContext<AgentChatContextValue | null>(null)

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, expireSession } = useAuth()
  const { activeProjectUuid, activeProjectId, activeProjectName } = useProject()

  const [open, setOpen] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [activeRun, setActiveRun] = useState<AgentRun | null>(null)
  const [runSteps, setRunSteps] = useState<AgentRunStep[]>([])
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [creatingConversation, setCreatingConversation] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedSubmission, setFailedSubmission] = useState<FailedSubmissionState | null>(null)

  // Generation counters & AbortControllers for strict project and conversation isolation
  const projectGenRef = useRef(0)
  const convGenRef = useRef(0)
  const pollGenRef = useRef(0)
  const advanceGenRef = useRef(0)

  const listAbortRef = useRef<AbortController | null>(null)
  const detailAbortRef = useRef<AbortController | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advanceAbortRef = useRef<AbortController | null>(null)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advanceInFlightRunIdRef = useRef<string | null>(null)
  const advanceActiveRef = useRef(false)
  const advancePermanentErrorRunIdRef = useRef<string | null>(null)
  const advanceRecoveryCyclesRef = useRef(0)
  const advanceTransientErrorActiveRef = useRef(false)
  const lastObservedUpdatedAtRef = useRef<string | null>(null)
  const lastRunningProgressAtRef = useRef(0)

  const activeProjectUuidRef = useRef<string | null>(activeProjectUuid)
  const activeConversationIdRef = useRef<string | null>(activeConversationId)
  const latestStepRef = useRef<number>(0)
  const sendingLockRef = useRef(false)
  const optimisticCounterRef = useRef(0)

  const conversationsRef = useRef<ConversationSummary[]>(conversations)

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    activeProjectUuidRef.current = activeProjectUuid
  }, [activeProjectUuid])

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId
  }, [activeConversationId])

  const stopAdvancing = useCallback(() => {
    advanceGenRef.current += 1
    advanceActiveRef.current = false
    advanceInFlightRunIdRef.current = null
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
    if (advanceAbortRef.current) {
      advanceAbortRef.current.abort()
      advanceAbortRef.current = null
    }
  }, [])

  const stopPolling = useCallback(() => {
    stopAdvancing()
    pollGenRef.current += 1
    advanceTransientErrorActiveRef.current = false
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (pollAbortRef.current) {
      pollAbortRef.current.abort()
      pollAbortRef.current = null
    }
  }, [stopAdvancing])

  const abortAllRequests = useCallback(() => {
    stopPolling()
    if (listAbortRef.current) {
      listAbortRef.current.abort()
      listAbortRef.current = null
    }
    if (detailAbortRef.current) {
      detailAbortRef.current.abort()
      detailAbortRef.current = null
    }
  }, [stopPolling])

  const resetAllChatState = useCallback(() => {
    projectGenRef.current += 1
    convGenRef.current += 1
    abortAllRequests()
    advancePermanentErrorRunIdRef.current = null
    advanceRecoveryCyclesRef.current = 0
    lastObservedUpdatedAtRef.current = null
    lastRunningProgressAtRef.current = 0
    setConversations([])
    setActiveConversationId(null)
    activeConversationIdRef.current = null
    setMessages([])
    setActiveRun(null)
    setRunSteps([])
    latestStepRef.current = 0
    setLoadingConversations(false)
    setLoadingMessages(false)
    setCreatingConversation(false)
    setSendingMessage(false)
    sendingLockRef.current = false
    setDeletingConversationId(null)
    setError(null)
    setFailedSubmission(null)
  }, [abortAllRequests])

  const handleApiError = useCallback(
    (err: unknown): string | null => {
      if (isAbortError(err)) return null
      if (err instanceof UnauthorizedError) {
        resetAllChatState()
        expireSession()
        return null
      }
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
      setError(msg)
      return msg
    },
    [expireSession, resetAllChatState],
  )

  const clearError = useCallback(() => setError(null), [])

  // Reconcile conversation detail & title once on terminal completion
  const reconcileCompletedConversation = useCallback(
    async (
      projectUuid: string,
      conversationId: string,
      expectedProjectGen: number,
      expectedConvGen: number,
    ) => {
      try {
        const detail = await apiGetConversation(projectUuid, conversationId, {
          limit: 200,
          offset: 0,
        })
        if (
          projectGenRef.current === expectedProjectGen &&
          convGenRef.current === expectedConvGen &&
          activeProjectUuidRef.current === projectUuid &&
          activeConversationIdRef.current === conversationId
        ) {
          setConversations((prev) =>
            prev.map((c) => (c.id === detail.conversation.id ? detail.conversation : c)),
          )
          setMessages((prev) => mergeTranscriptMessages(prev, detail.messages))
        }
      } catch {
        /* non-fatal reconciliation failure */
      }
    },
    [],
  )

  // Sequential bounded execution coordinator (`POST .../runs/{run_id}/advance`)
  const startRunExecution = useCallback(
    (projectUuid: string, conversationId: string, runId: string) => {
      if (
        advanceInFlightRunIdRef.current === runId ||
        advancePermanentErrorRunIdRef.current === runId
      ) {
        return
      }
      stopAdvancing()
      advanceActiveRef.current = true
      const myAdvanceGen = advanceGenRef.current
      const myProjectGen = projectGenRef.current
      const myConvGen = convGenRef.current

      let consecutiveFailures = 0

      const advanceOnce = async () => {
        if (
          advanceGenRef.current !== myAdvanceGen ||
          projectGenRef.current !== myProjectGen ||
          convGenRef.current !== myConvGen ||
          activeProjectUuidRef.current !== projectUuid ||
          activeConversationIdRef.current !== conversationId ||
          advancePermanentErrorRunIdRef.current === runId
        ) {
          return
        }

        // Enforce single in-flight /advance request per run
        if (advanceInFlightRunIdRef.current === runId) {
          return
        }

        const controller = new AbortController()
        advanceAbortRef.current = controller
        advanceInFlightRunIdRef.current = runId

        try {
          const runData = await apiAdvanceAgentRun(projectUuid, conversationId, runId, {
            after_step: latestStepRef.current,
            limit: 100,
            signal: controller.signal,
          })

          if (advanceAbortRef.current === controller) {
            advanceAbortRef.current = null
            advanceInFlightRunIdRef.current = null
          }

          if (
            !runData ||
            advanceGenRef.current !== myAdvanceGen ||
            projectGenRef.current !== myProjectGen ||
            convGenRef.current !== myConvGen ||
            activeProjectUuidRef.current !== projectUuid ||
            activeConversationIdRef.current !== conversationId
          ) {
            if (!runData && advanceGenRef.current === myAdvanceGen) {
              advanceActiveRef.current = false
            }
            return
          }

          consecutiveFailures = 0
          advanceRecoveryCyclesRef.current = 0
          if (advanceTransientErrorActiveRef.current) {
            advanceTransientErrorActiveRef.current = false
            setError(null)
          }

          if (
            runData.latest_step_number > latestStepRef.current ||
            runData.updated_at !== lastObservedUpdatedAtRef.current
          ) {
            lastObservedUpdatedAtRef.current = runData.updated_at
            lastRunningProgressAtRef.current = Date.now()
          }
          if (runData.latest_step_number > latestStepRef.current) {
            latestStepRef.current = runData.latest_step_number
          }

          setActiveRun(runData)
          if (runData.steps && runData.steps.length > 0) {
            setRunSteps((prev) => mergeRunSteps(prev, runData.steps))
          }
          if (runData.assistant_messages && runData.assistant_messages.length > 0) {
            setMessages((prev) => mergeTranscriptMessages(prev, runData.assistant_messages))
          }

          const isTerminal =
            runData.status === 'completed' ||
            runData.status === 'failed' ||
            runData.status === 'cancelled'

          if (isTerminal) {
            stopPolling()
            await reconcileCompletedConversation(
              projectUuid,
              conversationId,
              myProjectGen,
              myConvGen,
            )
            return
          }

          if (runData.status === 'queued') {
            advanceTimerRef.current = setTimeout(advanceOnce, ADVANCE_QUEUED_DELAY_MS)
          } else {
            // Another worker currently holds a valid lease: let read-only polling monitor
            // until the lease yields back to `queued`, reaches terminal, or goes stale.
            stopAdvancing()
          }
        } catch (err) {
          if (advanceAbortRef.current === controller) {
            advanceAbortRef.current = null
            advanceInFlightRunIdRef.current = null
          }
          if (isAbortError(err)) return
          if (
            advanceGenRef.current !== myAdvanceGen ||
            projectGenRef.current !== myProjectGen ||
            convGenRef.current !== myConvGen
          ) {
            return
          }
          if (err instanceof UnauthorizedError) {
            resetAllChatState()
            expireSession()
            return
          }
          // Do not retry permanent HTTP errors (403, 404, 422); stop polling to avoid spinning.
          if (
            err instanceof ApiHttpError &&
            (err.status === 403 || err.status === 404 || err.status === 422)
          ) {
            advancePermanentErrorRunIdRef.current = runId
            stopPolling()
            setError(
              err.status === 404
                ? 'The active investigation run could not be found.'
                : err.message,
            )
            return
          }

          consecutiveFailures += 1
          if (consecutiveFailures >= MAX_CONSECUTIVE_ADVANCE_FAILURES) {
            advanceRecoveryCyclesRef.current += 1
            if (advanceRecoveryCyclesRef.current >= MAX_ADVANCE_RECOVERY_CYCLES) {
              advancePermanentErrorRunIdRef.current = runId
              stopPolling()
              setError(
                err instanceof Error
                  ? `Unable to advance investigation run after repeated errors: ${err.message}`
                  : 'Unable to advance investigation run after repeated errors.',
              )
              return
            }
            stopAdvancing()
            advanceTransientErrorActiveRef.current = true
            setError(
              err instanceof Error
                ? `Temporary error advancing investigation run: ${err.message}. Monitoring status to resume automatically.`
                : 'Temporary error advancing investigation run. Monitoring status to resume automatically.',
            )
            return
          }

          const backoffMs = Math.min(
            8000,
            ADVANCE_QUEUED_DELAY_MS * Math.pow(2, consecutiveFailures),
          )
          advanceTimerRef.current = setTimeout(advanceOnce, backoffMs)
        }
      }

      // Invoke immediately for queued/eligible runs
      void advanceOnce()
    },
    [expireSession, reconcileCompletedConversation, resetAllChatState, stopAdvancing, stopPolling],
  )

  // Start incremental run polling + bounded execution for a given (projectUuid, conversationId, runId)
  const startRunPolling = useCallback(
    (projectUuid: string, conversationId: string, runId: string, initialAfterStep = 0) => {
      stopPolling()
      advancePermanentErrorRunIdRef.current = null
      advanceRecoveryCyclesRef.current = 0
      advanceTransientErrorActiveRef.current = false
      lastObservedUpdatedAtRef.current = null
      lastRunningProgressAtRef.current = Date.now()
      const myPollGen = pollGenRef.current
      const myProjectGen = projectGenRef.current
      const myConvGen = convGenRef.current
      latestStepRef.current = initialAfterStep

      // Launch automatic bounded execution slices alongside read-only status polling
      startRunExecution(projectUuid, conversationId, runId)

      let consecutiveFailures = 0

      const pollOnce = async () => {
        if (
          pollGenRef.current !== myPollGen ||
          projectGenRef.current !== myProjectGen ||
          convGenRef.current !== myConvGen ||
          activeProjectUuidRef.current !== projectUuid ||
          activeConversationIdRef.current !== conversationId
        ) {
          return
        }

        const controller = new AbortController()
        pollAbortRef.current = controller

        try {
          const runData = await apiGetAgentRun(projectUuid, conversationId, runId, {
            after_step: latestStepRef.current,
            limit: 100,
            signal: controller.signal,
          })

          if (
            pollGenRef.current !== myPollGen ||
            projectGenRef.current !== myProjectGen ||
            convGenRef.current !== myConvGen ||
            activeProjectUuidRef.current !== projectUuid ||
            activeConversationIdRef.current !== conversationId
          ) {
            return
          }

          consecutiveFailures = 0
          if (
            runData.latest_step_number > latestStepRef.current ||
            runData.updated_at !== lastObservedUpdatedAtRef.current
          ) {
            lastObservedUpdatedAtRef.current = runData.updated_at
            lastRunningProgressAtRef.current = Date.now()
          }
          if (runData.latest_step_number > latestStepRef.current) {
            latestStepRef.current = runData.latest_step_number
          }

          setActiveRun(runData)
          if (runData.steps.length > 0) {
            setRunSteps((prev) => mergeRunSteps(prev, runData.steps))
          }

          if (runData.assistant_messages && runData.assistant_messages.length > 0) {
            setMessages((prev) => mergeTranscriptMessages(prev, runData.assistant_messages))
          }

          const isTerminal =
            runData.status === 'completed' ||
            runData.status === 'failed' ||
            runData.status === 'cancelled'

          if (isTerminal) {
            stopPolling()
            await reconcileCompletedConversation(
              projectUuid,
              conversationId,
              myProjectGen,
              myConvGen,
            )
            return
          }

          // Reconcile paused advancing after transient failures or another worker releasing its lease.
          const canResumeAdvancing =
            !advanceActiveRef.current &&
            advanceInFlightRunIdRef.current !== runId &&
            advancePermanentErrorRunIdRef.current !== runId &&
            advanceRecoveryCyclesRef.current < MAX_ADVANCE_RECOVERY_CYCLES

          if (canResumeAdvancing && runData.status === 'queued') {
            if (advanceTransientErrorActiveRef.current) {
              advanceTransientErrorActiveRef.current = false
              setError(null)
            }
            startRunExecution(projectUuid, conversationId, runId)
          } else if (
            canResumeAdvancing &&
            runData.status === 'running' &&
            Date.now() - lastRunningProgressAtRef.current >= STALE_RUNNING_LEASE_PROBE_MS
          ) {
            lastRunningProgressAtRef.current = Date.now()
            if (advanceTransientErrorActiveRef.current) {
              advanceTransientErrorActiveRef.current = false
              setError(null)
            }
            startRunExecution(projectUuid, conversationId, runId)
          }

          pollTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS)
        } catch (err) {
          if (isAbortError(err)) return
          if (
            pollGenRef.current !== myPollGen ||
            projectGenRef.current !== myProjectGen ||
            convGenRef.current !== myConvGen
          ) {
            return
          }
          if (err instanceof UnauthorizedError) {
            resetAllChatState()
            expireSession()
            return
          }
          if (err instanceof ApiHttpError && err.status === 404) {
            stopPolling()
            setError('The active investigation run could not be found.')
            return
          }

          consecutiveFailures += 1
          if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            stopPolling()
            setError(
              err instanceof Error
                ? `Lost connection while polling investigation status: ${err.message}`
                : 'Lost connection while polling investigation status.',
            )
            return
          }

          const backoffMs = Math.min(8000, POLL_INTERVAL_MS * Math.pow(1.6, consecutiveFailures))
          pollTimerRef.current = setTimeout(pollOnce, backoffMs)
        }
      }

      pollTimerRef.current = setTimeout(pollOnce, 600)
    },
    [expireSession, reconcileCompletedConversation, resetAllChatState, startRunExecution, stopPolling],
  )

  // Fetch conversation detail once (used when selecting a conversation or reloading the page)
  const fetchConversationDetail = useCallback(
    async (
      projectUuid: string,
      conversationId: string,
      expectedProjectGen: number,
      expectedConvGen: number,
    ): Promise<ConversationDetail | null> => {
      if (detailAbortRef.current) {
        detailAbortRef.current.abort()
      }
      const controller = new AbortController()
      detailAbortRef.current = controller

      setLoadingMessages(true)
      try {
        const detail = await apiGetConversation(projectUuid, conversationId, {
          limit: 200,
          offset: 0,
          signal: controller.signal,
        })
        if (
          projectGenRef.current !== expectedProjectGen ||
          convGenRef.current !== expectedConvGen ||
          activeProjectUuidRef.current !== projectUuid
        ) {
          return null
        }
        setConversations((prev) => {
          const exists = prev.some((c) => c.id === detail.conversation.id)
          if (!exists) return [detail.conversation, ...prev]
          return prev.map((c) => (c.id === detail.conversation.id ? detail.conversation : c))
        })
        setMessages((prev) => mergeTranscriptMessages(prev, detail.messages))

        if (detail.active_run && activeConversationIdRef.current === conversationId) {
          const resumedRun = detail.active_run
          const stepCursor = resumedRun.latest_step_number || 0
          latestStepRef.current = stepCursor
          setActiveRun(resumedRun)
          if (resumedRun.steps && resumedRun.steps.length > 0) {
            setRunSteps((prev) => mergeRunSteps(prev, resumedRun.steps))
          }
          if (resumedRun.assistant_messages && resumedRun.assistant_messages.length > 0) {
            setMessages((prev) => mergeTranscriptMessages(prev, resumedRun.assistant_messages))
          }
          if (resumedRun.status === 'queued' || resumedRun.status === 'running') {
            startRunPolling(projectUuid, conversationId, resumedRun.run_id, stepCursor)
          }
        }
        return detail
      } catch (err) {
        if (
          projectGenRef.current === expectedProjectGen &&
          convGenRef.current === expectedConvGen
        ) {
          handleApiError(err)
        }
        return null
      } finally {
        if (
          projectGenRef.current === expectedProjectGen &&
          convGenRef.current === expectedConvGen
        ) {
          setLoadingMessages(false)
        }
      }
    },
    [handleApiError, startRunPolling],
  )

  const selectConversation = useCallback(
    async (conversationId: string) => {
      const projectUuid = activeProjectUuidRef.current
      if (!projectUuid) return

      convGenRef.current += 1
      const myConvGen = convGenRef.current
      const myProjectGen = projectGenRef.current

      stopPolling()
      if (detailAbortRef.current) {
        detailAbortRef.current.abort()
        detailAbortRef.current = null
      }

      setActiveConversationId(conversationId)
      activeConversationIdRef.current = conversationId
      setMessages([])
      setActiveRun(null)
      setRunSteps([])
      latestStepRef.current = 0
      setError(null)
      setFailedSubmission(null)

      await fetchConversationDetail(projectUuid, conversationId, myProjectGen, myConvGen)
    },
    [fetchConversationDetail, stopPolling],
  )

  const refreshConversations = useCallback(async () => {
    const projectUuid = activeProjectUuidRef.current
    if (!projectUuid) {
      setConversations([])
      return
    }

    const myProjectGen = projectGenRef.current
    if (listAbortRef.current) {
      listAbortRef.current.abort()
    }
    const controller = new AbortController()
    listAbortRef.current = controller

    setLoadingConversations(true)
    try {
      const res = await apiListConversations(projectUuid, {
        limit: 50,
        offset: 0,
        signal: controller.signal,
      })
      if (
        projectGenRef.current !== myProjectGen ||
        activeProjectUuidRef.current !== projectUuid
      ) {
        return
      }
      const list = res.conversations ?? []
      setConversations(list)
      setError(null)

      // If no conversation is selected yet, or current selection does not belong to this project's list,
      // select the first available conversation if one exists.
      const currentConvId = activeConversationIdRef.current
      const validExisting = currentConvId ? list.find((c) => c.id === currentConvId) : undefined
      if (!validExisting && list.length > 0) {
        const firstId = list[0].id
        convGenRef.current += 1
        const myConvGen = convGenRef.current
        setActiveConversationId(firstId)
        activeConversationIdRef.current = firstId
        setMessages([])
        setActiveRun(null)
        setRunSteps([])
        latestStepRef.current = 0
        await fetchConversationDetail(projectUuid, firstId, myProjectGen, myConvGen)
      }
    } catch (err) {
      if (projectGenRef.current === myProjectGen) {
        handleApiError(err)
      }
    } finally {
      if (projectGenRef.current === myProjectGen) {
        setLoadingConversations(false)
      }
    }
  }, [fetchConversationDetail, handleApiError])

  // Strict project switch and auth lifecycle isolation
  const prevProjectUuidRef = useRef<string | null>(null)
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      prevProjectUuidRef.current = null
      resetAllChatState()
      return
    }

    if (activeProjectUuid !== prevProjectUuidRef.current) {
      prevProjectUuidRef.current = activeProjectUuid
      resetAllChatState()
      if (activeProjectUuid) {
        refreshConversations()
      }
    }
  }, [authStatus, activeProjectUuid, refreshConversations, resetAllChatState])

  // Also refresh conversations when the panel is opened if none are loaded yet
  const prevOpenRef = useRef(false)
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (
      justOpened &&
      authStatus === 'authenticated' &&
      activeProjectUuid &&
      conversations.length === 0 &&
      !loadingConversations
    ) {
      refreshConversations()
    }
  }, [open, authStatus, activeProjectUuid, conversations.length, loadingConversations, refreshConversations])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortAllRequests()
    }
  }, [abortAllRequests])

  const createNewConversation = useCallback(
    async (title?: string): Promise<ConversationSummary | null> => {
      const projectUuid = activeProjectUuidRef.current
      if (!projectUuid || creatingConversation) return null

      const myProjectGen = projectGenRef.current
      setCreatingConversation(true)
      setError(null)
      try {
        const created = await apiCreateConversation(projectUuid, title ? { title } : {})
        if (
          projectGenRef.current !== myProjectGen ||
          activeProjectUuidRef.current !== projectUuid
        ) {
          return null
        }
        stopPolling()
        if (detailAbortRef.current) {
          detailAbortRef.current.abort()
          detailAbortRef.current = null
        }
        convGenRef.current += 1
        setConversations((prev) => [created, ...prev.filter((c) => c.id !== created.id)])
        setActiveConversationId(created.id)
        activeConversationIdRef.current = created.id
        setMessages([])
        setActiveRun(null)
        setRunSteps([])
        latestStepRef.current = 0
        setFailedSubmission(null)
        return created
      } catch (err) {
        if (projectGenRef.current === myProjectGen) {
          handleApiError(err)
        }
        return null
      } finally {
        if (projectGenRef.current === myProjectGen) {
          setCreatingConversation(false)
        }
      }
    },
    [creatingConversation, handleApiError, stopPolling],
  )

  const deleteConversationById = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const projectUuid = activeProjectUuidRef.current
      if (!projectUuid || deletingConversationId) return false

      const myProjectGen = projectGenRef.current
      setDeletingConversationId(conversationId)
      setError(null)
      try {
        await apiDeleteConversation(projectUuid, conversationId)
        if (
          projectGenRef.current !== myProjectGen ||
          activeProjectUuidRef.current !== projectUuid
        ) {
          return false
        }

        const wasActive = activeConversationIdRef.current === conversationId
        if (wasActive) {
          stopPolling()
          if (detailAbortRef.current) {
            detailAbortRef.current.abort()
            detailAbortRef.current = null
          }
          setMessages([])
          setActiveRun(null)
          setRunSteps([])
          latestStepRef.current = 0
          setFailedSubmission(null)
        }

        const remaining = conversationsRef.current.filter((c) => c.id !== conversationId)
        conversationsRef.current = remaining
        setConversations(remaining)

        if (wasActive) {
          const nextConv = remaining[0] ?? null
          convGenRef.current += 1
          const myConvGen = convGenRef.current
          if (nextConv) {
            setActiveConversationId(nextConv.id)
            activeConversationIdRef.current = nextConv.id
            await fetchConversationDetail(projectUuid, nextConv.id, myProjectGen, myConvGen)
          } else {
            setActiveConversationId(null)
            activeConversationIdRef.current = null
          }
        }
        return true
      } catch (err) {
        if (projectGenRef.current === myProjectGen) {
          handleApiError(err)
        }
        return false
      } finally {
        if (projectGenRef.current === myProjectGen) {
          setDeletingConversationId(null)
        }
      }
    },
    [deletingConversationId, fetchConversationDetail, handleApiError, stopPolling],
  )

  const executeMessageSubmission = useCallback(
    async (
      projectUuid: string,
      targetConversationId: string,
      trimmedContent: string,
      clientRequestId: string,
      optimisticId: string,
      myProjectGen: number,
      myConvGen: number,
    ) => {
      try {
        const submitRes = await apiSendConversationMessage(projectUuid, targetConversationId, {
          content: trimmedContent,
          client_request_id: clientRequestId,
        })

        if (
          projectGenRef.current !== myProjectGen ||
          convGenRef.current !== myConvGen ||
          activeProjectUuidRef.current !== projectUuid ||
          activeConversationIdRef.current !== targetConversationId
        ) {
          return
        }

        setFailedSubmission(null)

        // Replace optimistic ID with real user_message_id
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimisticId
              ? {
                  ...m,
                  id: submitRes.user_message_id,
                  run_id: submitRes.run_id,
                  created_at: submitRes.created_at,
                }
              : m,
          ),
        )

        // Move conversation to top of list & update timestamps
        const nowIso = submitRes.created_at || new Date().toISOString()
        setConversations((prev) => {
          const target = prev.find((c) => c.id === targetConversationId)
          if (!target) return prev
          const updated: ConversationSummary = {
            ...target,
            title: target.title || trimmedContent.slice(0, 80),
            updated_at: nowIso,
            last_message_at: nowIso,
          }
          return [updated, ...prev.filter((c) => c.id !== targetConversationId)]
        })

        const initialRun: AgentRun = {
          run_id: submitRes.run_id,
          conversation_id: submitRes.conversation_id,
          user_message_id: submitRes.user_message_id,
          status: submitRes.status,
          error_message: null,
          attempt_count: 0,
          max_attempts: 3,
          created_at: submitRes.created_at,
          started_at: null,
          completed_at: null,
          updated_at: submitRes.created_at,
          steps: [],
          latest_step_number: 0,
          assistant_messages: [],
        }
        setActiveRun(initialRun)
        setRunSteps([])
        latestStepRef.current = 0

        const submitIsTerminal =
          submitRes.status === 'completed' ||
          submitRes.status === 'failed' ||
          submitRes.status === 'cancelled'

        if (submitIsTerminal) {
          // Terminal deduplicated run: reconcile status and messages once without calling /advance.
          try {
            const runData = await apiGetAgentRun(projectUuid, targetConversationId, submitRes.run_id, {
              after_step: 0,
              limit: 100,
            })
            if (
              projectGenRef.current === myProjectGen &&
              convGenRef.current === myConvGen &&
              activeProjectUuidRef.current === projectUuid &&
              activeConversationIdRef.current === targetConversationId
            ) {
              setActiveRun(runData)
              if (runData.steps.length > 0) {
                setRunSteps((prev) => mergeRunSteps(prev, runData.steps))
              }
              if (runData.assistant_messages && runData.assistant_messages.length > 0) {
                setMessages((prev) => mergeTranscriptMessages(prev, runData.assistant_messages))
              }
            }
          } catch {
            /* fallback to conversation reconciliation below */
          }
          await reconcileCompletedConversation(
            projectUuid,
            targetConversationId,
            myProjectGen,
            myConvGen,
          )
        } else {
          startRunPolling(projectUuid, targetConversationId, submitRes.run_id, 0)
        }
      } catch (err) {
        if (
          projectGenRef.current !== myProjectGen ||
          convGenRef.current !== myConvGen ||
          activeProjectUuidRef.current !== projectUuid
        ) {
          return
        }

        if (err instanceof ActiveRunConflictError) {
          // Remove the optimistic duplicate message since the server rejected it due to active run
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          setFailedSubmission(null)
          setError(err.message || 'Another investigation is currently active in this conversation.')

          if (
            err.activeRunId &&
            activeConversationIdRef.current === targetConversationId
          ) {
            // Reconcile conversation messages and resume polling the active run if not already started by detail fetch
            const detail = await fetchConversationDetail(
              projectUuid,
              targetConversationId,
              myProjectGen,
              myConvGen,
            )
            const resumedSameRun =
              detail?.active_run?.run_id === err.activeRunId &&
              (detail.active_run.status === 'queued' || detail.active_run.status === 'running')
            if (!resumedSameRun) {
              startRunPolling(projectUuid, targetConversationId, err.activeRunId, 0)
            }
          }
          return
        }

        if (err instanceof UnauthorizedError) {
          resetAllChatState()
          expireSession()
          return
        }

        // Preserve failedSubmission with the SAME clientRequestId so retrying is idempotent
        setFailedSubmission({
          projectUuid,
          conversationId: targetConversationId,
          content: trimmedContent,
          clientRequestId,
          optimisticMessageId: optimisticId,
        })
        handleApiError(err)
      } finally {
        sendingLockRef.current = false
        if (projectGenRef.current === myProjectGen) {
          setSendingMessage(false)
        }
      }
    },
    [
      expireSession,
      fetchConversationDetail,
      handleApiError,
      reconcileCompletedConversation,
      resetAllChatState,
      startRunPolling,
    ],
  )

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const trimmed = rawContent.trim()
      const projectUuid = activeProjectUuidRef.current
      if (!trimmed || !projectUuid || sendingLockRef.current) return

      const isRunActive =
        activeRun?.status === 'queued' || activeRun?.status === 'running'
      if (isRunActive) return

      sendingLockRef.current = true
      setSendingMessage(true)
      setError(null)
      setFailedSubmission(null)

      const myProjectGen = projectGenRef.current
      let targetConversationId = activeConversationIdRef.current

      try {
        // Auto-create a conversation if the user sends a message when none is selected
        if (!targetConversationId) {
          const created = await apiCreateConversation(projectUuid, {})
          if (
            projectGenRef.current !== myProjectGen ||
            activeProjectUuidRef.current !== projectUuid
          ) {
            sendingLockRef.current = false
            setSendingMessage(false)
            return
          }
          convGenRef.current += 1
          targetConversationId = created.id
          setConversations((prev) => [created, ...prev.filter((c) => c.id !== created.id)])
          setActiveConversationId(created.id)
          activeConversationIdRef.current = created.id
          setMessages([])
          setActiveRun(null)
          setRunSteps([])
          latestStepRef.current = 0
        }
      } catch (err) {
        sendingLockRef.current = false
        setSendingMessage(false)
        if (projectGenRef.current === myProjectGen) {
          handleApiError(err)
        }
        return
      }

      const myConvGen = convGenRef.current
      const clientRequestId = generateClientRequestId()
      const optimisticId = `optimistic-${++optimisticCounterRef.current}`
      const nowIso = new Date().toISOString()

      setMessages((prev) => {
        const maxSeq = prev.reduce((acc, m) => Math.max(acc, m.sequence_number), 0)
        const optimisticMsg: ConversationMessage = {
          id: optimisticId,
          conversation_id: targetConversationId!,
          sequence_number: maxSeq + 1,
          role: 'user',
          message_type: 'text',
          content: trimmed,
          metadata: { optimistic: true },
          run_id: null,
          created_at: nowIso,
        }
        return [...prev, optimisticMsg]
      })

      await executeMessageSubmission(
        projectUuid,
        targetConversationId,
        trimmed,
        clientRequestId,
        optimisticId,
        myProjectGen,
        myConvGen,
      )
    },
    [activeRun?.status, executeMessageSubmission, handleApiError],
  )

  const retryFailedSubmission = useCallback(async () => {
    if (!failedSubmission || sendingLockRef.current) return
    const {
      projectUuid,
      conversationId,
      content,
      clientRequestId,
      optimisticMessageId,
    } = failedSubmission

    if (
      activeProjectUuidRef.current !== projectUuid ||
      activeConversationIdRef.current !== conversationId
    ) {
      setFailedSubmission(null)
      return
    }

    sendingLockRef.current = true
    setSendingMessage(true)
    setError(null)

    await executeMessageSubmission(
      projectUuid,
      conversationId,
      content,
      clientRequestId, // Reuse exact same client_request_id for idempotency
      optimisticMessageId,
      projectGenRef.current,
      convGenRef.current,
    )
  }, [executeMessageSubmission, failedSubmission])

  const activeConversation = useMemo(
    () => (activeConversationId ? conversations.find((c) => c.id === activeConversationId) ?? null : null),
    [conversations, activeConversationId],
  )

  const exportActiveConversation = useCallback(() => {
    if (!activeConversation) return
    const md = buildConversationMarkdown({
      conversation: activeConversation,
      projectName: activeProjectName,
      projectId: activeProjectId,
      messages,
      runSteps,
    })
    const filename = buildExportFilename(activeConversation.title)
    downloadMarkdownFile(filename, md)
  }, [activeConversation, activeProjectId, activeProjectName, messages, runSteps])

  const value = useMemo<AgentChatContextValue>(
    () => ({
      open,
      setOpen,
      projectUuid: activeProjectUuid,
      projectId: activeProjectId,
      projectName: activeProjectName,
      conversations,
      activeConversationId,
      activeConversation,
      messages,
      activeRun,
      runSteps,
      loadingConversations,
      loadingMessages,
      creatingConversation,
      sendingMessage,
      deletingConversationId,
      error,
      clearError,
      failedSubmission,
      refreshConversations,
      createNewConversation,
      selectConversation,
      deleteConversationById,
      sendMessage,
      retryFailedSubmission,
      exportActiveConversation,
    }),
    [
      open,
      activeProjectUuid,
      activeProjectId,
      activeProjectName,
      conversations,
      activeConversationId,
      activeConversation,
      messages,
      activeRun,
      runSteps,
      loadingConversations,
      loadingMessages,
      creatingConversation,
      sendingMessage,
      deletingConversationId,
      error,
      clearError,
      failedSubmission,
      refreshConversations,
      createNewConversation,
      selectConversation,
      deleteConversationById,
      sendMessage,
      retryFailedSubmission,
      exportActiveConversation,
    ],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAgentChat() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAgentChat outside AgentChatProvider')
  return c
}
