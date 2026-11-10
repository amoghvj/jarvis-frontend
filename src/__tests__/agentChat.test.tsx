import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { formatRunStepActivity, mergeRunSteps } from '../lib/agent/activity'
import { buildConversationMarkdown, buildExportFilename } from '../lib/agent/exportMarkdown'
import { mergeTranscriptMessages, AgentChatProvider, useAgentChat } from '../hooks/useAgentChat'
import { AgentChatPanel } from '../components/agent/AgentChatPanel'
import {
  ActiveRunConflictError,
  ApiHttpError,
  type AgentRun,
  type AgentRunStep,
  type ConversationDetail,
  type ConversationList,
  type ConversationMessage,
  type ConversationSummary,
} from '../lib/api'

// ---- Mock Auth & Project Contexts ----
let mockAuthStatus: 'authenticated' | 'unauthenticated' = 'authenticated'
const mockExpireSession = vi.fn()

let mockActiveProjectUuid: string | null = '11111111-1111-1111-1111-111111111111'
let mockActiveProjectId: string | null = 'payments-api'
let mockActiveProjectName: string | null = 'Payments API'

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    status: mockAuthStatus,
    user:
      mockAuthStatus === 'authenticated'
        ? {
            id: 'user-1',
            github_id: 1,
            github_username: 'octocat',
            email: null,
            avatar_url: null,
            created_at: '2026-11-10T00:00:00Z',
          }
        : null,
    error: null,
    retry: vi.fn(),
    expireSession: mockExpireSession,
    logout: vi.fn(),
  }),
}))

vi.mock('../hooks/useProject', () => ({
  useProject: () => ({
    activeProjectUuid: mockActiveProjectUuid,
    activeProjectId: mockActiveProjectId,
    activeProjectName: mockActiveProjectName,
    activeProject: mockActiveProjectUuid
      ? {
          id: mockActiveProjectUuid,
          project_id: mockActiveProjectId!,
          name: mockActiveProjectName!,
          created_at: '2026-11-10T00:00:00Z',
          updated_at: '2026-11-10T00:00:00Z',
        }
      : null,
    projects: [],
    loading: false,
    error: null,
    selectProject: vi.fn(),
    refreshProjects: vi.fn(),
    clearProjectContext: vi.fn(),
  }),
}))

// ---- Mock API functions ----
const mockListConversations = vi.fn()
const mockCreateConversation = vi.fn()
const mockGetConversation = vi.fn()
const mockDeleteConversation = vi.fn()
const mockSendConversationMessage = vi.fn()
const mockGetAgentRun = vi.fn()
const mockAdvanceAgentRun = vi.fn()

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    listConversations: (...args: unknown[]) => mockListConversations(...args),
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
    deleteConversation: (...args: unknown[]) => mockDeleteConversation(...args),
    sendConversationMessage: (...args: unknown[]) => mockSendConversationMessage(...args),
    getAgentRun: (...args: unknown[]) => mockGetAgentRun(...args),
    advanceAgentRun: (...args: unknown[]) => mockAdvanceAgentRun(...args),
  }
})

// ScrollIntoView stub for jsdom
if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn()
}

function makeConv(id: string, projectUuid: string, title: string | null = 'Investigate timeout'): ConversationSummary {
  return {
    id,
    project_id: projectUuid,
    title,
    created_at: '2026-11-10T04:40:00Z',
    updated_at: '2026-11-10T04:40:15Z',
    last_message_at: '2026-11-10T04:40:15Z',
  }
}

function makeMsg(
  id: string,
  convId: string,
  seq: number,
  role: 'user' | 'assistant',
  content: string,
  runId: string | null = 'run-1',
): ConversationMessage {
  return {
    id,
    conversation_id: convId,
    sequence_number: seq,
    role,
    message_type: 'text',
    content,
    metadata: {},
    run_id: runId,
    created_at: '2026-11-10T04:40:05Z',
  }
}

describe('Unit helpers: activity formatting, deduplication, and Markdown export', () => {
  it('prefers input_summary.activity over raw tool_name and never leaks raw args', () => {
    const step: AgentRunStep = {
      id: 'step-1',
      run_id: 'run-1',
      step_number: 2,
      step_type: 'tool_started',
      tool_name: 'get_incident',
      status: 'in_progress',
      input_summary: {
        activity: 'Investigating incident details and linked repositories',
        args: { incident_id: 'secret-internal-arg' },
      },
      output_summary: {},
      created_at: '2026-11-10T04:40:04Z',
    }
    const formatted = formatRunStepActivity(step)
    expect(formatted.label).toBe('Investigating incident details and linked repositories')
    expect(JSON.stringify(formatted)).not.toContain('secret-internal-arg')
  })

  it('deduplicates run steps by (run_id, step_number) and preserves chronological order', () => {
    const s1: AgentRunStep = {
      id: 's1',
      run_id: 'run-1',
      step_number: 1,
      step_type: 'model_started',
      tool_name: null,
      status: 'in_progress',
      input_summary: { activity: 'Analyzing your request' },
      output_summary: {},
      created_at: '2026-11-10T04:40:01Z',
    }
    const s2: AgentRunStep = {
      id: 's2',
      run_id: 'run-1',
      step_number: 2,
      step_type: 'tool_started',
      tool_name: 'get_incident',
      status: 'in_progress',
      input_summary: {},
      output_summary: {},
      created_at: '2026-11-10T04:40:02Z',
    }
    const s1Updated: AgentRunStep = { ...s1, status: 'completed' }

    const merged = mergeRunSteps([s2, s1], [s1Updated, s2])
    expect(merged).toHaveLength(2)
    expect(merged[0].step_number).toBe(1)
    expect(merged[0].status).toBe('completed')
    expect(merged[1].step_number).toBe(2)
  })

  it('deduplicates transcript messages by id and sorts by sequence_number', () => {
    const m1 = makeMsg('m1', 'c1', 1, 'user', 'Hello')
    const m2 = makeMsg('m2', 'c1', 2, 'assistant', 'World')
    const merged = mergeTranscriptMessages([m2, m1], [m1, m2])
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('exports conversation Markdown with formatting and excludes raw tool args or internal IDs', () => {
    const conv = makeConv('conv-uuid-999', 'proj-uuid-888', 'Database Pool Exhaustion')
    const messages: ConversationMessage[] = [
      makeMsg('m1', conv.id, 1, 'user', 'Why did checkout fail?'),
      makeMsg('m2', conv.id, 2, 'assistant', '### Root Cause\n- Pool exhausted in `db.py`'),
    ]
    const steps: AgentRunStep[] = [
      {
        id: 'step-uuid-777',
        run_id: 'run-uuid-666',
        step_number: 1,
        step_type: 'tool_completed',
        tool_name: 'get_incident',
        status: 'completed',
        input_summary: {
          activity: 'Investigating incident details',
          args: { secret_token: 'DO_NOT_EXPORT_ME' },
        },
        output_summary: { summary: 'Retrieved incident INC-1' },
        created_at: '2026-11-10T04:40:03Z',
      },
    ]

    const md = buildConversationMarkdown({
      conversation: conv,
      projectName: 'Payments API',
      projectId: 'payments-api',
      messages,
      runSteps: steps,
      exportedAt: new Date('2026-11-10T05:00:00Z'),
    })

    expect(md).toContain('# Database Pool Exhaustion')
    expect(md).toContain('Payments API (payments-api)')
    expect(md).toContain('Why did checkout fail?')
    expect(md).toContain('### Root Cause\n- Pool exhausted in `db.py`')
    expect(md).toContain('Investigating incident details — Retrieved incident INC-1')
    expect(md).not.toContain('DO_NOT_EXPORT_ME')
    expect(md).not.toContain('conv-uuid-999')
    expect(md).not.toContain('proj-uuid-888')

    const filename = buildExportFilename('Database Pool Exhaustion!', new Date('2026-11-10T05:00:00Z'))
    expect(filename).toBe('jarvis-database-pool-exhaustion-2026-11-10.md')
  })
})

describe('AgentChatProvider & AgentChatPanel integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStatus = 'authenticated'
    mockActiveProjectUuid = '11111111-1111-1111-1111-111111111111'
    mockActiveProjectId = 'payments-api'
    mockActiveProjectName = 'Payments API'
  })

  afterEach(() => {
    cleanup()
  })

  it('loads project conversations, selects the first conversation, and renders message history', async () => {
    const c1 = makeConv('conv-1', mockActiveProjectUuid!, 'Checkout 502 Spike')
    mockListConversations.mockResolvedValue({
      conversations: [c1],
      limit: 50,
      offset: 0,
      has_more: false,
    } satisfies ConversationList)

    mockGetConversation.mockResolvedValue({
      conversation: c1,
      messages: [
        makeMsg('m-1', 'conv-1', 1, 'user', 'Check checkout 502 errors'),
        makeMsg('m-2', 'conv-1', 2, 'assistant', 'Found **3** connection timeouts in `orders-db`.'),
      ],
      limit: 100,
      offset: 0,
      has_more: false,
    } satisfies ConversationDetail)

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    await waitFor(() => {
      expect(mockListConversations).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        expect.objectContaining({ limit: 50, offset: 0 }),
      )
    })

    await waitFor(() => {
      expect(screen.getByText('Check checkout 502 errors')).toBeDefined()
      expect(screen.getByText('orders-db')).toBeDefined()
    })
  })

  it('creates a new conversation, clears transcript, and does not auto-send a message', async () => {
    mockListConversations.mockResolvedValue({
      conversations: [],
      limit: 50,
      offset: 0,
      has_more: false,
    })

    const newConv = makeConv('conv-new', mockActiveProjectUuid!, null)
    mockCreateConversation.mockResolvedValue(newConv)

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    fireEvent.click(screen.getByLabelText('Open Agent Chat'))

    await waitFor(() => {
      expect(mockListConversations).toHaveBeenCalled()
    })

    fireEvent.click(screen.getByLabelText('New conversation'))

    await waitFor(() => {
      expect(mockCreateConversation).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        {},
      )
    })
    expect(mockSendConversationMessage).not.toHaveBeenCalled()
  })

  it('submits a message optimistically, polls incremental run steps, and merges final assistant response', async () => {
    const c1 = makeConv('conv-1', mockActiveProjectUuid!, 'Investigate latency')
    mockListConversations.mockResolvedValue({
      conversations: [c1],
      limit: 50,
      offset: 0,
      has_more: false,
    })
    mockGetConversation.mockResolvedValue({
      conversation: c1,
      messages: [],
      limit: 100,
      offset: 0,
      has_more: false,
    })

    mockSendConversationMessage.mockResolvedValue({
      run_id: 'run-100',
      conversation_id: 'conv-1',
      user_message_id: 'msg-user-100',
      status: 'queued',
      deduplicated: false,
      created_at: '2026-11-10T04:41:00Z',
    })

    const step1: AgentRunStep = {
      id: 'step-1',
      run_id: 'run-100',
      step_number: 1,
      step_type: 'tool_started',
      tool_name: 'get_incident',
      status: 'in_progress',
      input_summary: { activity: 'Investigating incident details and linked repositories' },
      output_summary: {},
      created_at: '2026-11-10T04:41:02Z',
    }
    const finalAssistantMsg = makeMsg(
      'msg-asst-100',
      'conv-1',
      2,
      'assistant',
      'Root cause identified: connection pool saturation.',
      'run-100',
    )

    let pollCallCount = 0
    mockGetAgentRun.mockImplementation(async () => {
      pollCallCount += 1
      if (pollCallCount === 1) {
        return {
          run_id: 'run-100',
          conversation_id: 'conv-1',
          user_message_id: 'msg-user-100',
          status: 'running',
          error_message: null,
          attempt_count: 1,
          max_attempts: 3,
          created_at: '2026-11-10T04:41:00Z',
          started_at: '2026-11-10T04:41:01Z',
          completed_at: null,
          updated_at: '2026-11-10T04:41:02Z',
          steps: [step1],
          latest_step_number: 1,
          assistant_messages: [],
        } satisfies AgentRun
      }
      return {
        run_id: 'run-100',
        conversation_id: 'conv-1',
        user_message_id: 'msg-user-100',
        status: 'completed',
        error_message: null,
        attempt_count: 1,
        max_attempts: 3,
        created_at: '2026-11-10T04:41:00Z',
        started_at: '2026-11-10T04:41:01Z',
        completed_at: '2026-11-10T04:41:05Z',
        updated_at: '2026-11-10T04:41:05Z',
        steps: [{ ...step1, status: 'completed', step_type: 'tool_completed' }],
        latest_step_number: 1,
        assistant_messages: [finalAssistantMsg],
      } satisfies AgentRun
    })

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    fireEvent.click(screen.getByLabelText('Open Agent Chat'))
    await waitFor(() => expect(mockGetConversation).toHaveBeenCalled())

    const input = screen.getByLabelText('Message')
    fireEvent.change(input, { target: { value: 'Investigate INC-42' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    // Optimistic user message appears immediately
    expect(screen.getByText('Investigate INC-42')).toBeDefined()

    await waitFor(() => {
      expect(mockSendConversationMessage).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'conv-1',
        expect.objectContaining({
          content: 'Investigate INC-42',
          client_request_id: expect.any(String),
        }),
      )
    })

    // First poll brings in step1 with after_step=0
    await waitFor(
      () => {
        expect(mockGetAgentRun).toHaveBeenCalledWith(
          '11111111-1111-1111-1111-111111111111',
          'conv-1',
          'run-100',
          expect.objectContaining({ after_step: 0 }),
        )
      },
      { timeout: 3000 },
    )

    // Second poll uses after_step=1 and completes the run
    await waitFor(
      () => {
        expect(mockGetAgentRun).toHaveBeenCalledWith(
          '11111111-1111-1111-1111-111111111111',
          'conv-1',
          'run-100',
          expect.objectContaining({ after_step: 1 }),
        )
        expect(screen.getByText(/Root cause identified: connection pool saturation/)).toBeDefined()
      },
      { timeout: 4000 },
    )
  })

  it('reuses the exact same client_request_id when retrying a failed message submission', async () => {
    const c1 = makeConv('conv-1', mockActiveProjectUuid!, 'Retry test')
    mockListConversations.mockResolvedValue({
      conversations: [c1],
      limit: 50,
      offset: 0,
      has_more: false,
    })
    mockGetConversation.mockResolvedValue({
      conversation: c1,
      messages: [],
      limit: 100,
      offset: 0,
      has_more: false,
    })

    mockSendConversationMessage
      .mockRejectedValueOnce(new Error('Temporary network outage'))
      .mockResolvedValueOnce({
        run_id: 'run-200',
        conversation_id: 'conv-1',
        user_message_id: 'msg-user-200',
        status: 'completed',
        deduplicated: true,
        created_at: '2026-11-10T04:42:00Z',
      })

    mockGetAgentRun.mockResolvedValue({
      run_id: 'run-200',
      conversation_id: 'conv-1',
      user_message_id: 'msg-user-200',
      status: 'completed',
      error_message: null,
      attempt_count: 1,
      max_attempts: 3,
      created_at: '2026-11-10T04:42:00Z',
      started_at: '2026-11-10T04:42:00Z',
      completed_at: '2026-11-10T04:42:01Z',
      updated_at: '2026-11-10T04:42:01Z',
      steps: [],
      latest_step_number: 0,
      assistant_messages: [],
    })

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    fireEvent.click(screen.getByLabelText('Open Agent Chat'))
    await waitFor(() => expect(mockGetConversation).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Check service health' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('Temporary network outage')).toBeDefined()
    })

    const firstClientReqId = mockSendConversationMessage.mock.calls[0][2].client_request_id
    expect(typeof firstClientReqId).toBe('string')
    expect(firstClientReqId.length).toBeGreaterThan(5)

    // Click Retry sending message
    fireEvent.click(screen.getByText('Retry sending message'))

    await waitFor(() => {
      expect(mockSendConversationMessage).toHaveBeenCalledTimes(2)
    })

    const secondClientReqId = mockSendConversationMessage.mock.calls[1][2].client_request_id
    expect(secondClientReqId).toBe(firstClientReqId)
  })

  it('handles 409 active_run_in_progress by informing the user and resuming polling the active run', async () => {
    const c1 = makeConv('conv-1', mockActiveProjectUuid!, 'Conflict test')
    mockListConversations.mockResolvedValue({
      conversations: [c1],
      limit: 50,
      offset: 0,
      has_more: false,
    })
    mockGetConversation.mockResolvedValue({
      conversation: c1,
      messages: [],
      limit: 100,
      offset: 0,
      has_more: false,
    })

    mockSendConversationMessage.mockRejectedValueOnce(
      new ActiveRunConflictError('Another run is currently active.', 'existing-run-99'),
    )

    mockGetAgentRun.mockResolvedValue({
      run_id: 'existing-run-99',
      conversation_id: 'conv-1',
      user_message_id: 'msg-user-99',
      status: 'completed',
      error_message: null,
      attempt_count: 1,
      max_attempts: 3,
      created_at: '2026-11-10T04:43:00Z',
      started_at: '2026-11-10T04:43:00Z',
      completed_at: '2026-11-10T04:43:02Z',
      updated_at: '2026-11-10T04:43:02Z',
      steps: [],
      latest_step_number: 0,
      assistant_messages: [],
    })

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    fireEvent.click(screen.getByLabelText('Open Agent Chat'))
    await waitFor(() => expect(mockGetConversation).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Duplicate trigger' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('Another run is currently active.')).toBeDefined()
    })

    await waitFor(
      () => {
        expect(mockGetAgentRun).toHaveBeenCalledWith(
          '11111111-1111-1111-1111-111111111111',
          'conv-1',
          'existing-run-99',
          expect.anything(),
        )
      },
      { timeout: 3000 },
    )
  })

  it('strictly isolates state on project switch and ignores stale responses from the previous project', async () => {
    const projA = '11111111-1111-1111-1111-111111111111'
    const projB = '22222222-2222-2222-2222-222222222222'

    let resolveProjADetail!: (val: ConversationDetail) => void
    const projADetailPromise = new Promise<ConversationDetail>((resolve) => {
      resolveProjADetail = resolve
    })

    const convA = makeConv('conv-proj-a', projA, 'Project A Secret Conversation')
    const convB = makeConv('conv-proj-b', projB, 'Project B Conversation')

    mockListConversations.mockImplementation(async (projectUuid: string) => {
      if (projectUuid === projA) {
        return { conversations: [convA], limit: 50, offset: 0, has_more: false }
      }
      return { conversations: [convB], limit: 50, offset: 0, has_more: false }
    })

    mockGetConversation.mockImplementation((projectUuid: string, convId: string) => {
      if (projectUuid === projA && convId === 'conv-proj-a') {
        return projADetailPromise
      }
      return Promise.resolve({
        conversation: convB,
        messages: [makeMsg('msg-b', 'conv-proj-b', 1, 'user', 'Message belonging to Project B')],
        limit: 100,
        offset: 0,
        has_more: false,
      })
    })

    const { rerender } = render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    await waitFor(() => expect(mockListConversations).toHaveBeenCalledWith(projA, expect.anything()))

    // Now switch active project to Project B BEFORE Project A's detail request resolves
    mockActiveProjectUuid = projB
    mockActiveProjectId = 'billing-service'
    mockActiveProjectName = 'Billing Service'

    rerender(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    await waitFor(() => expect(mockListConversations).toHaveBeenCalledWith(projB, expect.anything()))
    await waitFor(() => expect(screen.getByText('Message belonging to Project B')).toBeDefined())

    // Now resolve the stale Project A detail promise
    await act(async () => {
      resolveProjADetail({
        conversation: convA,
        messages: [makeMsg('msg-a', 'conv-proj-a', 1, 'user', 'LEAKED MESSAGE FROM PROJECT A')],
        limit: 100,
        offset: 0,
        has_more: false,
      })
    })

    // Ensure Project A's message NEVER appears in Project B's view
    expect(screen.queryByText('LEAKED MESSAGE FROM PROJECT A')).toBeNull()
    expect(screen.getByText('Message belonging to Project B')).toBeDefined()
  })

  it('deletes the active conversation after confirmation and selects the next available conversation', async () => {
    const c1 = makeConv('conv-1', mockActiveProjectUuid!, 'First Conversation')
    const c2 = makeConv('conv-2', mockActiveProjectUuid!, 'Second Conversation')

    mockListConversations.mockResolvedValue({
      conversations: [c1, c2],
      limit: 50,
      offset: 0,
      has_more: false,
    })

    mockGetConversation.mockImplementation(async (_projUuid: string, convId: string) => {
      if (convId === 'conv-1') {
        return {
          conversation: c1,
          messages: [makeMsg('m1', 'conv-1', 1, 'user', 'First conv message')],
          limit: 100,
          offset: 0,
          has_more: false,
        }
      }
      return {
        conversation: c2,
        messages: [makeMsg('m2', 'conv-2', 1, 'user', 'Second conv message')],
        limit: 100,
        offset: 0,
        has_more: false,
      }
    })

    mockDeleteConversation.mockResolvedValue({
      status: 'deleted',
      conversation_id: 'conv-1',
    })

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    fireEvent.click(screen.getByLabelText('Open Agent Chat'))
    await waitFor(() => expect(screen.getByText('First conv message')).toBeDefined())

    // Click Delete button in control bar
    fireEvent.click(screen.getByLabelText('Delete conversation'))

    // Confirmation dialog appears
    expect(screen.getByText('Delete conversation?')).toBeDefined()
    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(mockDeleteConversation).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'conv-1',
      )
    })

    // Fallback conversation c2 is selected automatically
    await waitFor(() => {
      expect(screen.getByText('Second conv message')).toBeDefined()
    })
  })

  it('clears all chat state on logout / session unauthentication', async () => {
    const c1 = makeConv('conv-1', mockActiveProjectUuid!, 'Sensitive Investigation')
    mockListConversations.mockResolvedValue({
      conversations: [c1],
      limit: 50,
      offset: 0,
      has_more: false,
    })
    mockGetConversation.mockResolvedValue({
      conversation: c1,
      messages: [makeMsg('m1', 'conv-1', 1, 'user', 'Confidential stack trace info')],
      limit: 100,
      offset: 0,
      has_more: false,
    })

    let latestCtx: ReturnType<typeof useAgentChat> | null = null
    function Inspector() {
      latestCtx = useAgentChat()
      return null
    }

    const { rerender } = render(
      <AgentChatProvider>
        <Inspector />
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    await waitFor(() => expect(screen.getByText('Confidential stack trace info')).toBeDefined())
    expect(latestCtx!.conversations).toHaveLength(1)

    // Simulate logout
    mockAuthStatus = 'unauthenticated'
    rerender(
      <AgentChatProvider>
        <Inspector />
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    await waitFor(() => {
      expect(latestCtx!.conversations).toHaveLength(0)
      expect(latestCtx!.messages).toHaveLength(0)
      expect(latestCtx!.activeConversationId).toBeNull()
    })
  })

  it('automatically coordinates sequential /advance invocations across multiple slices until completed', async () => {
    const c1 = makeConv('conv-adv', mockActiveProjectUuid!, 'Continuous Investigation')
    mockListConversations.mockResolvedValue({
      conversations: [c1],
      limit: 50,
      offset: 0,
      has_more: false,
    })
    mockGetConversation.mockResolvedValue({
      conversation: c1,
      messages: [],
      limit: 100,
      offset: 0,
      has_more: false,
    })

    mockSendConversationMessage.mockResolvedValue({
      run_id: 'run-slice-1',
      conversation_id: 'conv-adv',
      user_message_id: 'msg-u-slice-1',
      status: 'queued',
      deduplicated: false,
      created_at: '2026-11-10T04:45:00Z',
    })

    const step1: AgentRunStep = {
      id: 'st-1',
      run_id: 'run-slice-1',
      step_number: 1,
      step_type: 'tool_completed',
      tool_name: 'search_events',
      status: 'completed',
      input_summary: { activity: 'Searching telemetry events' },
      output_summary: { summary: 'Found 4 ERROR events' },
      created_at: '2026-11-10T04:45:02Z',
    }
    const step2: AgentRunStep = {
      id: 'st-2',
      run_id: 'run-slice-1',
      step_number: 2,
      step_type: 'tool_completed',
      tool_name: 'get_incident',
      status: 'completed',
      input_summary: { activity: 'Inspecting incident details' },
      output_summary: { summary: 'Loaded incident INC-77' },
      created_at: '2026-11-10T04:45:04Z',
    }
    const finalMsg = makeMsg(
      'msg-a-slice-1',
      'conv-adv',
      2,
      'assistant',
      'Completed multi-slice diagnosis without manual refresh.',
      'run-slice-1',
    )

    let advanceCalls = 0
    mockAdvanceAgentRun.mockImplementation(async () => {
      advanceCalls += 1
      if (advanceCalls === 1) {
        return {
          run_id: 'run-slice-1',
          conversation_id: 'conv-adv',
          user_message_id: 'msg-u-slice-1',
          status: 'queued',
          error_message: null,
          attempt_count: 0,
          max_attempts: 3,
          created_at: '2026-11-10T04:45:00Z',
          started_at: '2026-11-10T04:45:01Z',
          completed_at: null,
          updated_at: '2026-11-10T04:45:02Z',
          steps: [step1],
          latest_step_number: 1,
          assistant_messages: [],
        } satisfies AgentRun
      }
      if (advanceCalls === 2) {
        // Simulate another tab holding lease or second slice yielding
        return {
          run_id: 'run-slice-1',
          conversation_id: 'conv-adv',
          user_message_id: 'msg-u-slice-1',
          status: 'queued',
          error_message: null,
          attempt_count: 0,
          max_attempts: 3,
          created_at: '2026-11-10T04:45:00Z',
          started_at: '2026-11-10T04:45:01Z',
          completed_at: null,
          updated_at: '2026-11-10T04:45:04Z',
          steps: [step2],
          latest_step_number: 2,
          assistant_messages: [],
        } satisfies AgentRun
      }
      return {
        run_id: 'run-slice-1',
        conversation_id: 'conv-adv',
        user_message_id: 'msg-u-slice-1',
        status: 'completed',
        error_message: null,
        attempt_count: 1,
        max_attempts: 3,
        created_at: '2026-11-10T04:45:00Z',
        started_at: '2026-11-10T04:45:01Z',
        completed_at: '2026-11-10T04:45:06Z',
        updated_at: '2026-11-10T04:45:06Z',
        steps: [],
        latest_step_number: 2,
        assistant_messages: [finalMsg],
      } satisfies AgentRun
    })

    mockGetAgentRun.mockResolvedValue({
      run_id: 'run-slice-1',
      conversation_id: 'conv-adv',
      user_message_id: 'msg-u-slice-1',
      status: 'running',
      error_message: null,
      attempt_count: 1,
      max_attempts: 3,
      created_at: '2026-11-10T04:45:00Z',
      started_at: '2026-11-10T04:45:01Z',
      completed_at: null,
      updated_at: '2026-11-10T04:45:02Z',
      steps: [],
      latest_step_number: 1,
      assistant_messages: [],
    })

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    fireEvent.click(screen.getByLabelText('Open Agent Chat'))
    await waitFor(() => expect(mockGetConversation).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Run multi-slice check' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(
      () => {
        expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(3)
        expect(screen.getByText(/Completed multi-slice diagnosis without manual refresh/)).toBeDefined()
      },
      { timeout: 4000 },
    )
  })

  it('automatically resumes an active run on page reload and never restarts a completed run', async () => {
    const cActive = makeConv('conv-reload-active', mockActiveProjectUuid!, 'Reloaded Investigation')
    const cDone = makeConv('conv-reload-done', mockActiveProjectUuid!, 'Finished Investigation')

    mockListConversations.mockResolvedValue({
      conversations: [cActive, cDone],
      limit: 50,
      offset: 0,
      has_more: false,
    })

    const finalReloadMsg = makeMsg(
      'msg-reload-final',
      'conv-reload-active',
      2,
      'assistant',
      'Resumed after page reload and finished.',
      'run-reload-1',
    )

    mockGetConversation.mockImplementation(async (_projUuid: string, convId: string) => {
      if (convId === 'conv-reload-active') {
        return {
          conversation: cActive,
          messages: [makeMsg('msg-u-1', 'conv-reload-active', 1, 'user', 'Start before reload', 'run-reload-1')],
          limit: 100,
          offset: 0,
          has_more: false,
          active_run: {
            run_id: 'run-reload-1',
            conversation_id: 'conv-reload-active',
            user_message_id: 'msg-u-1',
            status: 'queued',
            error_message: null,
            attempt_count: 0,
            max_attempts: 3,
            created_at: '2026-11-10T04:46:00Z',
            started_at: '2026-11-10T04:46:01Z',
            completed_at: null,
            updated_at: '2026-11-10T04:46:02Z',
            steps: [],
            latest_step_number: 3,
            assistant_messages: [],
          },
        } satisfies ConversationDetail
      }
      return {
        conversation: cDone,
        messages: [
          makeMsg('msg-u-done', 'conv-reload-done', 1, 'user', 'Already done', 'run-done-99'),
          makeMsg('msg-a-done', 'conv-reload-done', 2, 'assistant', 'Done answer', 'run-done-99'),
        ],
        limit: 100,
        offset: 0,
        has_more: false,
        active_run: {
          run_id: 'run-done-99',
          conversation_id: 'conv-reload-done',
          user_message_id: 'msg-u-done',
          status: 'completed',
          error_message: null,
          attempt_count: 1,
          max_attempts: 3,
          created_at: '2026-11-10T04:40:00Z',
          started_at: '2026-11-10T04:40:01Z',
          completed_at: '2026-11-10T04:40:05Z',
          updated_at: '2026-11-10T04:40:05Z',
          steps: [],
          latest_step_number: 4,
          assistant_messages: [],
        },
      } satisfies ConversationDetail
    })

    mockAdvanceAgentRun.mockResolvedValue({
      run_id: 'run-reload-1',
      conversation_id: 'conv-reload-active',
      user_message_id: 'msg-u-1',
      status: 'completed',
      error_message: null,
      attempt_count: 1,
      max_attempts: 3,
      created_at: '2026-11-10T04:46:00Z',
      started_at: '2026-11-10T04:46:01Z',
      completed_at: '2026-11-10T04:46:05Z',
      updated_at: '2026-11-10T04:46:05Z',
      steps: [],
      latest_step_number: 4,
      assistant_messages: [finalReloadMsg],
    } satisfies AgentRun)

    let latestCtx: ReturnType<typeof useAgentChat> | null = null
    function Inspector() {
      latestCtx = useAgentChat()
      return null
    }

    render(
      <AgentChatProvider>
        <Inspector />
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    await waitFor(() => {
      expect(mockAdvanceAgentRun).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'conv-reload-active',
        'run-reload-1',
        expect.objectContaining({ after_step: 3 }),
      )
      expect(screen.getByText(/Resumed after page reload and finished/)).toBeDefined()
    })

    mockAdvanceAgentRun.mockClear()

    // Select the already-completed conversation: must NEVER invoke /advance on run-done-99
    await act(async () => {
      await latestCtx!.selectConversation('conv-reload-done')
    })

    expect(screen.getByText('Done answer')).toBeDefined()
    expect(mockAdvanceAgentRun).not.toHaveBeenCalled()
  })

  it('retries transient /advance network errors with backoff and stops immediately on permanent 403 errors', async () => {
    const c1 = makeConv('conv-err', mockActiveProjectUuid!, 'Error Handling Conv')
    mockListConversations.mockResolvedValue({
      conversations: [c1],
      limit: 50,
      offset: 0,
      has_more: false,
    })
    mockGetConversation.mockResolvedValue({
      conversation: c1,
      messages: [],
      limit: 100,
      offset: 0,
      has_more: false,
    })

    mockSendConversationMessage.mockResolvedValue({
      run_id: 'run-transient-1',
      conversation_id: 'conv-err',
      user_message_id: 'msg-u-err-1',
      status: 'queued',
      deduplicated: false,
      created_at: '2026-11-10T04:47:00Z',
    })

    // First /advance fails with transient network error; second succeeds and completes
    mockAdvanceAgentRun
      .mockRejectedValueOnce(new Error('Transient network glitch'))
      .mockResolvedValueOnce({
        run_id: 'run-transient-1',
        conversation_id: 'conv-err',
        user_message_id: 'msg-u-err-1',
        status: 'completed',
        error_message: null,
        attempt_count: 1,
        max_attempts: 3,
        created_at: '2026-11-10T04:47:00Z',
        started_at: '2026-11-10T04:47:01Z',
        completed_at: '2026-11-10T04:47:03Z',
        updated_at: '2026-11-10T04:47:03Z',
        steps: [],
        latest_step_number: 1,
        assistant_messages: [
          makeMsg('msg-a-err-1', 'conv-err', 2, 'assistant', 'Recovered after transient error.', 'run-transient-1'),
        ],
      } satisfies AgentRun)

    mockGetAgentRun.mockResolvedValue({
      run_id: 'run-transient-1',
      conversation_id: 'conv-err',
      user_message_id: 'msg-u-err-1',
      status: 'queued',
      error_message: null,
      attempt_count: 0,
      max_attempts: 3,
      created_at: '2026-11-10T04:47:00Z',
      started_at: null,
      completed_at: null,
      updated_at: '2026-11-10T04:47:00Z',
      steps: [],
      latest_step_number: 0,
      assistant_messages: [],
    })

    render(
      <AgentChatProvider>
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    fireEvent.click(screen.getByLabelText('Open Agent Chat'))
    await waitFor(() => expect(mockGetConversation).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Test transient backoff' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(
      () => {
        expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(2)
        expect(screen.getByText(/Recovered after transient error/)).toBeDefined()
      },
      { timeout: 4000 },
    )

    // Now test permanent 403 error on /advance: must NOT retry
    mockAdvanceAgentRun.mockClear()
    mockSendConversationMessage.mockResolvedValueOnce({
      run_id: 'run-perm-403',
      conversation_id: 'conv-err',
      user_message_id: 'msg-u-err-2',
      status: 'queued',
      deduplicated: false,
      created_at: '2026-11-10T04:48:00Z',
    })
    mockAdvanceAgentRun.mockRejectedValue(new ApiHttpError(403, 'Origin not trusted'))

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Trigger 403' } })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('Origin not trusted')).toBeDefined()
    })
    expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(1)
  })

  it('aborts in-flight /advance on project switch, resumes on return to interrupted conv, and never advances deduplicated terminal submit', async () => {
    const projA = '11111111-1111-1111-1111-111111111111'
    const projB = '22222222-2222-2222-2222-222222222222'
    const c1 = makeConv('conv-1', projA, 'Interrupted Conv')
    const c2 = makeConv('conv-2', projA, 'Other Conv')
    const cB = makeConv('conv-b', projB, 'Project B Conv')

    mockListConversations.mockImplementation(async (projectUuid: string) => {
      if (projectUuid === projA) {
        return { conversations: [c1, c2], limit: 50, offset: 0, has_more: false }
      }
      return { conversations: [cB], limit: 50, offset: 0, has_more: false }
    })

    let returnToConv1 = false
    mockGetConversation.mockImplementation(async (_projUuid: string, convId: string) => {
      if (convId === 'conv-1') {
        if (!returnToConv1) {
          return { conversation: c1, messages: [], limit: 100, offset: 0, has_more: false }
        }
        return {
          conversation: c1,
          messages: [makeMsg('m-u-ret', 'conv-1', 1, 'user', 'Check interrupted run', 'run-interrupted')],
          limit: 100,
          offset: 0,
          has_more: false,
          active_run: {
            run_id: 'run-interrupted',
            conversation_id: 'conv-1',
            user_message_id: 'm-u-ret',
            status: 'running',
            error_message: null,
            attempt_count: 1,
            max_attempts: 3,
            created_at: '2026-11-10T04:50:00Z',
            started_at: '2026-11-10T04:50:01Z',
            completed_at: null,
            updated_at: '2026-11-10T04:50:02Z',
            steps: [],
            latest_step_number: 2,
            assistant_messages: [],
          },
        } satisfies ConversationDetail
      }
      if (convId === 'conv-2') {
        return { conversation: c2, messages: [], limit: 100, offset: 0, has_more: false }
      }
      return { conversation: cB, messages: [], limit: 100, offset: 0, has_more: false }
    })

    let capturedSignal: AbortSignal | undefined
    mockAdvanceAgentRun.mockImplementation(async (_p, _c, _r, params: { signal?: AbortSignal }) => {
      capturedSignal = params?.signal
      if (returnToConv1) {
        return {
          run_id: 'run-interrupted',
          conversation_id: 'conv-1',
          user_message_id: 'm-u-ret',
          status: 'completed',
          error_message: null,
          attempt_count: 1,
          max_attempts: 3,
          created_at: '2026-11-10T04:50:00Z',
          started_at: '2026-11-10T04:50:01Z',
          completed_at: '2026-11-10T04:50:05Z',
          updated_at: '2026-11-10T04:50:05Z',
          steps: [],
          latest_step_number: 2,
          assistant_messages: [
            makeMsg('m-a-ret', 'conv-1', 2, 'assistant', 'Resumed interrupted run.', 'run-interrupted'),
          ],
        } satisfies AgentRun
      }
      return new Promise<AgentRun>(() => {
        /* stay in flight until aborted on project switch */
      })
    })

    mockSendConversationMessage.mockResolvedValueOnce({
      run_id: 'run-abort-test',
      conversation_id: 'conv-1',
      user_message_id: 'm-u-abort',
      status: 'queued',
      deduplicated: false,
      created_at: '2026-11-10T04:50:00Z',
    })

    let latestCtx: ReturnType<typeof useAgentChat> | null = null
    function Inspector() {
      latestCtx = useAgentChat()
      return null
    }

    const { rerender } = render(
      <AgentChatProvider>
        <Inspector />
        <AgentChatPanel />
      </AgentChatProvider>,
    )

    await waitFor(() => expect(mockGetConversation).toHaveBeenCalledWith(projA, 'conv-1', expect.anything()))

    await act(async () => {
      await latestCtx!.sendMessage('Start long invocation')
    })
    await waitFor(() => expect(capturedSignal).toBeDefined())
    expect(capturedSignal!.aborted).toBe(false)

    // Switch project while /advance is in flight -> signal must abort!
    mockActiveProjectUuid = projB
    rerender(
      <AgentChatProvider>
        <Inspector />
        <AgentChatPanel />
      </AgentChatProvider>,
    )
    await waitFor(() => expect(capturedSignal!.aborted).toBe(true))

    // Return to projA, switch away to conv-2, then return to conv-1 after interrupted invocation
    mockActiveProjectUuid = projA
    rerender(
      <AgentChatProvider>
        <Inspector />
        <AgentChatPanel />
      </AgentChatProvider>,
    )
    await waitFor(() => expect(mockListConversations).toHaveBeenCalledWith(projA, expect.anything()))

    await act(async () => {
      await latestCtx!.selectConversation('conv-2')
    })

    returnToConv1 = true
    mockAdvanceAgentRun.mockClear()
    await act(async () => {
      await latestCtx!.selectConversation('conv-1')
    })

    await waitFor(() => {
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(1)
      expect(screen.getByText(/Resumed interrupted run/)).toBeDefined()
    })

    // Terminal deduplicated submit response must NOT call /advance
    mockAdvanceAgentRun.mockClear()
    mockSendConversationMessage.mockResolvedValueOnce({
      run_id: 'run-already-done',
      conversation_id: 'conv-1',
      user_message_id: 'm-u-done',
      status: 'completed',
      deduplicated: true,
      created_at: '2026-11-10T04:51:00Z',
    })
    mockGetAgentRun.mockResolvedValueOnce({
      run_id: 'run-already-done',
      conversation_id: 'conv-1',
      user_message_id: 'm-u-done',
      status: 'completed',
      error_message: null,
      attempt_count: 1,
      max_attempts: 3,
      created_at: '2026-11-10T04:51:00Z',
      started_at: '2026-11-10T04:51:01Z',
      completed_at: '2026-11-10T04:51:02Z',
      updated_at: '2026-11-10T04:51:02Z',
      steps: [],
      latest_step_number: 1,
      assistant_messages: [],
    })

    await act(async () => {
      await latestCtx!.sendMessage('Duplicate completed submit')
    })
    expect(mockAdvanceAgentRun).not.toHaveBeenCalled()
  })

  it('automatically recovers and restarts /advance when polling sees queued after 6 transient /advance failures', async () => {
    vi.useFakeTimers()
    try {
      const c1 = makeConv('conv-rec', mockActiveProjectUuid!, 'Transient Recovery Conv')
      mockListConversations.mockResolvedValue({
        conversations: [c1],
        limit: 50,
        offset: 0,
        has_more: false,
      })
      mockGetConversation.mockResolvedValue({
        conversation: c1,
        messages: [],
        limit: 100,
        offset: 0,
        has_more: false,
      })
      mockSendConversationMessage.mockResolvedValue({
        run_id: 'run-rec-1',
        conversation_id: 'conv-rec',
        user_message_id: 'msg-u-rec-1',
        status: 'queued',
        deduplicated: false,
        created_at: '2026-11-10T05:00:00Z',
      })

      let advCalls = 0
      mockAdvanceAgentRun.mockImplementation(async () => {
        advCalls += 1
        if (advCalls <= 6) {
          throw new Error('Temporary 502 Bad Gateway')
        }
        return {
          run_id: 'run-rec-1',
          conversation_id: 'conv-rec',
          user_message_id: 'msg-u-rec-1',
          status: 'completed',
          error_message: null,
          attempt_count: 1,
          max_attempts: 3,
          created_at: '2026-11-10T05:00:00Z',
          started_at: '2026-11-10T05:00:01Z',
          completed_at: '2026-11-10T05:00:25Z',
          updated_at: '2026-11-10T05:00:25Z',
          steps: [],
          latest_step_number: 1,
          assistant_messages: [
            makeMsg('msg-a-rec-1', 'conv-rec', 2, 'assistant', 'Recovered seamlessly via polling.', 'run-rec-1'),
          ],
        } satisfies AgentRun
      })

      mockGetAgentRun.mockResolvedValue({
        run_id: 'run-rec-1',
        conversation_id: 'conv-rec',
        user_message_id: 'msg-u-rec-1',
        status: 'queued',
        error_message: null,
        attempt_count: 0,
        max_attempts: 3,
        created_at: '2026-11-10T05:00:00Z',
        started_at: null,
        completed_at: null,
        updated_at: '2026-11-10T05:00:00Z',
        steps: [],
        latest_step_number: 0,
        assistant_messages: [],
      })

      render(
        <AgentChatProvider>
          <AgentChatPanel />
        </AgentChatProvider>,
      )

      fireEvent.click(screen.getByLabelText('Open Agent Chat'))
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
      expect(mockGetConversation).toHaveBeenCalled()

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Recover after 6 failures' } })
      fireEvent.click(screen.getByLabelText('Send message'))

      // Flush submit + initial advance + all 5 exponential backoffs (15.5s -> 6 total /advance failures, before 15.6s poll)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15520)
      })
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(6)
      expect(screen.getByText(/Monitoring status to resume automatically/)).toBeDefined()

      // Poll tick at 15.6s returns queued -> automatically clears pause & calls /advance #7 -> completes!
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(7)
      expect(screen.getByText(/Recovered seamlessly via polling/)).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('prevents overlapping /advance requests and continues read-only polling when another worker holds a valid lease', async () => {
    vi.useFakeTimers()
    try {
      const c1 = makeConv('conv-sf', mockActiveProjectUuid!, 'Single Flight & Lease')
      mockListConversations.mockResolvedValue({
        conversations: [c1],
        limit: 50,
        offset: 0,
        has_more: false,
      })
      mockGetConversation.mockResolvedValue({
        conversation: c1,
        messages: [],
        limit: 100,
        offset: 0,
        has_more: false,
      })
      mockSendConversationMessage.mockResolvedValue({
        run_id: 'run-sf-1',
        conversation_id: 'conv-sf',
        user_message_id: 'msg-u-sf-1',
        status: 'queued',
        deduplicated: false,
        created_at: '2026-11-10T05:01:00Z',
      })

      let resolveFirstAdvance!: (val: AgentRun) => void
      const firstAdvancePromise = new Promise<AgentRun>((resolve) => {
        resolveFirstAdvance = resolve
      })

      let advCalls = 0
      mockAdvanceAgentRun.mockImplementation(() => {
        advCalls += 1
        if (advCalls === 1) {
          return firstAdvancePromise
        }
        return Promise.resolve({
          run_id: 'run-sf-1',
          conversation_id: 'conv-sf',
          user_message_id: 'msg-u-sf-1',
          status: 'completed',
          error_message: null,
          attempt_count: 1,
          max_attempts: 3,
          created_at: '2026-11-10T05:01:00Z',
          started_at: '2026-11-10T05:01:01Z',
          completed_at: '2026-11-10T05:01:10Z',
          updated_at: '2026-11-10T05:01:10Z',
          steps: [],
          latest_step_number: 2,
          assistant_messages: [
            makeMsg('msg-a-sf-1', 'conv-sf', 2, 'assistant', 'Finished cleanly after peer lease yielded.', 'run-sf-1'),
          ],
        } satisfies AgentRun)
      })

      let pollState: 'queued' | 'running' = 'queued'
      mockGetAgentRun.mockImplementation(async () => ({
        run_id: 'run-sf-1',
        conversation_id: 'conv-sf',
        user_message_id: 'msg-u-sf-1',
        status: pollState,
        error_message: null,
        attempt_count: 1,
        max_attempts: 3,
        created_at: '2026-11-10T05:01:00Z',
        started_at: '2026-11-10T05:01:01Z',
        completed_at: null,
        updated_at: '2026-11-10T05:01:03Z',
        steps: [],
        latest_step_number: 1,
        assistant_messages: [],
      }))

      render(
        <AgentChatProvider>
          <AgentChatPanel />
        </AgentChatProvider>,
      )

      fireEvent.click(screen.getByLabelText('Open Agent Chat'))
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Single flight check' } })
      fireEvent.click(screen.getByLabelText('Send message'))

      // While first /advance is still in flight, multiple polls fire -> MUST NOT overlap /advance!
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000)
      })
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(1)
      expect(mockGetAgentRun.mock.calls.length).toBeGreaterThanOrEqual(2)

      // Now first /advance resolves with status='running' (another worker holds valid lease)
      pollState = 'running'
      await act(async () => {
        resolveFirstAdvance({
          run_id: 'run-sf-1',
          conversation_id: 'conv-sf',
          user_message_id: 'msg-u-sf-1',
          status: 'running',
          error_message: null,
          attempt_count: 1,
          max_attempts: 3,
          created_at: '2026-11-10T05:01:00Z',
          started_at: '2026-11-10T05:01:01Z',
          completed_at: null,
          updated_at: '2026-11-10T05:01:02Z',
          steps: [],
          latest_step_number: 1,
          assistant_messages: [],
        })
        await Promise.resolve()
      })

      // During valid peer lease ('running'), polling continues without calling /advance!
      const pollsBefore = mockGetAgentRun.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(mockGetAgentRun.mock.calls.length).toBeGreaterThan(pollsBefore)
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(1)

      // Once peer worker yields back to 'queued', polling sees 'queued' and restarts /advance once!
      pollState = 'queued'
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(2)
      expect(screen.getByText(/Finished cleanly after peer lease yielded/)).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops all polling and advancing on terminal states and permanent 403 errors', async () => {
    vi.useFakeTimers()
    try {
      const c1 = makeConv('conv-term', mockActiveProjectUuid!, 'Terminal Stop Conv')
      mockListConversations.mockResolvedValue({
        conversations: [c1],
        limit: 50,
        offset: 0,
        has_more: false,
      })
      mockGetConversation.mockResolvedValue({
        conversation: c1,
        messages: [],
        limit: 100,
        offset: 0,
        has_more: false,
      })
      mockSendConversationMessage.mockResolvedValue({
        run_id: 'run-term-403',
        conversation_id: 'conv-term',
        user_message_id: 'msg-u-term',
        status: 'queued',
        deduplicated: false,
        created_at: '2026-11-10T05:02:00Z',
      })
      mockAdvanceAgentRun.mockRejectedValue(new ApiHttpError(403, 'Origin not trusted'))
      mockGetAgentRun.mockResolvedValue({
        run_id: 'run-term-403',
        conversation_id: 'conv-term',
        user_message_id: 'msg-u-term',
        status: 'queued',
        error_message: null,
        attempt_count: 0,
        max_attempts: 3,
        created_at: '2026-11-10T05:02:00Z',
        started_at: null,
        completed_at: null,
        updated_at: '2026-11-10T05:02:00Z',
        steps: [],
        latest_step_number: 0,
        assistant_messages: [],
      })

      render(
        <AgentChatProvider>
          <AgentChatPanel />
        </AgentChatProvider>,
      )

      fireEvent.click(screen.getByLabelText('Open Agent Chat'))
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Trigger permanent 403' } })
      fireEvent.click(screen.getByLabelText('Send message'))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200)
      })
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(1)
      expect(screen.getByText('Origin not trusted')).toBeDefined()

      const pollsAtStop = mockGetAgentRun.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15000)
      })
      // Neither /advance nor GET polling spins indefinitely after permanent error!
      expect(mockAdvanceAgentRun).toHaveBeenCalledTimes(1)
      expect(mockGetAgentRun).toHaveBeenCalledTimes(pollsAtStop)
    } finally {
      vi.useRealTimers()
    }
  })
})

