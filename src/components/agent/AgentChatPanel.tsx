import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  AlertCircle,
  Bot,
  ChevronDown,
  Clock,
  Download,
  FolderGit2,
  History,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { useAgentChat } from '../../hooks/useAgentChat'
import { ConfirmDialog } from '../ConfirmDialog'
import { MarkdownMessage } from './MarkdownMessage'
import { RunActivityTimeline } from './RunActivityTimeline'
import type { ConversationSummary } from '../../lib/api'

function formatRelativeOrShort(iso: string): string {
  try {
    const d = new Date(iso)
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function AgentChatPanel() {
  const {
    open,
    setOpen,
    projectUuid,
    projectId,
    projectName,
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
  } = useAgentChat()

  const [draft, setDraft] = useState('')
  const [showHistoryList, setShowHistoryList] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const isRunActive =
    activeRun?.status === 'queued' || activeRun?.status === 'running'

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages.length, runSteps.length, activeRun?.status, sendingMessage, open])

  useEffect(() => {
    if (open && !showHistoryList && projectUuid) {
      inputRef.current?.focus()
    }
  }, [open, activeConversationId, showHistoryList, projectUuid])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !deleteTarget) {
        if (showHistoryList) setShowHistoryList(false)
        else setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen, showHistoryList, deleteTarget])

  // Close history drawer when project switches
  useEffect(() => {
    setShowHistoryList(false)
  }, [projectUuid])

  const statusIndicator = (() => {
    if (!projectUuid) {
      return { dot: 'bg-zinc-600', label: 'Select a project to begin' }
    }
    if (sendingMessage) {
      return { dot: 'bg-blue-400 animate-pulse', label: 'Submitting message…' }
    }
    switch (activeRun?.status) {
      case 'queued':
        return { dot: 'bg-amber-400 animate-pulse', label: 'Queued · waiting for worker' }
      case 'running':
        return { dot: 'bg-blue-400 animate-pulse', label: 'Investigating…' }
      case 'completed':
        return { dot: 'bg-emerald-400', label: 'Completed · ready for follow-up' }
      case 'failed':
        return { dot: 'bg-red-400', label: 'Last run failed · ready to retry' }
      case 'cancelled':
        return { dot: 'bg-zinc-500', label: 'Cancelled · ready' }
      default:
        return { dot: 'bg-emerald-400', label: `Idle · ${projectId ?? 'project'}` }
    }
  })()

  const canSend =
    Boolean(projectUuid) &&
    draft.trim().length > 0 &&
    !sendingMessage &&
    !isRunActive

  const handleSubmit = async () => {
    if (!canSend) return
    const textToSend = draft
    setDraft('')
    await sendMessage(textToSend)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleNewConversation = async () => {
    setShowHistoryList(false)
    const created = await createNewConversation()
    if (created) {
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }

  const handleSelectConversation = async (convId: string) => {
    setShowHistoryList(false)
    if (convId !== activeConversationId) {
      await selectConversation(convId)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const ok = await deleteConversationById(deleteTarget.id)
    if (ok) {
      setDeleteTarget(null)
    }
  }

  const activeTitle =
    activeConversation?.title?.trim() ||
    (activeConversation ? 'New Investigation' : 'No conversation selected')

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Agent Chat"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-black/50 ring-1 ring-red-400/40 transition hover:bg-red-500"
        >
          <MessageSquare className="h-4 w-4" /> Agent Chat
          {isRunActive && (
            <span className="ml-0.5 h-2 w-2 animate-pulse rounded-full bg-amber-300" />
          )}
        </button>
      )}

      <aside
        aria-label="J.A.R.V.I.S. Agent chat"
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-line bg-[#0c0c0f] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out sm:w-[420px] ${
          open ? 'translate-x-0' : 'invisible translate-x-full'
        }`}
        style={open ? undefined : { transitionProperty: 'transform, visibility', transitionDelay: '0s, 300ms' }}
      >
        {/* Top Agent Header */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-400 ring-1 ring-red-500/30">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">J.A.R.V.I.S. Agent</p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-zinc-400">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusIndicator.dot}`} />
              <span className="truncate">{statusIndicator.label}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Agent Chat"
            className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Project & Conversation Control Bar */}
        {projectUuid && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-card/50 px-3 py-2">
            <button
              type="button"
              onClick={() => setShowHistoryList((s) => !s)}
              aria-expanded={showHistoryList}
              aria-label="Toggle conversation history"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-left text-xs transition hover:border-zinc-600"
            >
              <History className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-200">
                {loadingConversations && conversations.length === 0
                  ? 'Loading conversations…'
                  : activeTitle}
              </span>
              {conversations.length > 0 && (
                <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                  {conversations.length}
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform ${
                  showHistoryList ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={handleNewConversation}
                disabled={creatingConversation}
                title="New conversation"
                aria-label="New conversation"
                className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
              >
                {creatingConversation ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                <span>New</span>
              </button>

              {activeConversation && (
                <>
                  <button
                    type="button"
                    onClick={exportActiveConversation}
                    title="Export conversation as Markdown"
                    aria-label="Export conversation as Markdown"
                    className="rounded-lg border border-line p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(activeConversation)}
                    disabled={deletingConversationId === activeConversation.id}
                    title="Delete conversation"
                    aria-label="Delete conversation"
                    className="rounded-lg border border-line p-1.5 text-zinc-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Collapsible Conversation History Drawer */}
        {projectUuid && showHistoryList && (
          <div className="max-h-72 shrink-0 overflow-y-auto border-b border-line bg-card px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Project Conversations ({projectName || projectId})
              </span>
              <button
                type="button"
                onClick={() => refreshConversations()}
                disabled={loadingConversations}
                title="Refresh conversation list"
                aria-label="Refresh conversation list"
                className="rounded p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingConversations ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingConversations && conversations.length === 0 ? (
              <div className="flex items-center gap-2 py-6 text-xs text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading conversations…
              </div>
            ) : conversations.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center">
                <p className="text-xs font-medium text-zinc-300">No conversations yet</p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Start a new conversation to investigate incidents in this project.
                </p>
              </div>
            ) : (
              <ul className="space-y-1" role="listbox" aria-label="Conversation history">
                {conversations.map((conv) => {
                  const selected = conv.id === activeConversationId
                  const title = conv.title?.trim() || 'New Investigation'
                  return (
                    <li
                      key={conv.id}
                      className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs transition ${
                        selected
                          ? 'bg-red-500/15 text-white ring-1 ring-red-500/30'
                          : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => handleSelectConversation(conv.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate font-medium" title={title}>
                          {title}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                          <Clock className="h-2.5 w-2.5" />
                          <span>{formatRelativeOrShort(conv.last_message_at || conv.updated_at)}</span>
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDeleteTarget(conv)
                        }}
                        disabled={deletingConversationId === conv.id}
                        aria-label={`Delete conversation ${title}`}
                        title="Delete conversation"
                        className="rounded p-1 text-zinc-500 opacity-70 transition hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div
            role="alert"
            className="mx-3 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="min-w-0 flex-1">
              <p className="break-words">{error}</p>
              {failedSubmission && (
                <button
                  type="button"
                  onClick={retryFailedSubmission}
                  disabled={sendingMessage}
                  className="mt-2 inline-flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" /> Retry sending message
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={clearError}
              aria-label="Dismiss error"
              className="rounded p-0.5 text-red-300/70 hover:text-red-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Main Transcript Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {!projectUuid ? (
            <div className="mt-12 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-zinc-400 ring-1 ring-line">
                <FolderGit2 className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-white">No project selected</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500">
                Select or create a project in the top header to start project-scoped incident investigations.
              </p>
            </div>
          ) : loadingMessages && messages.length === 0 ? (
            <div className="mt-12 flex flex-col items-center justify-center gap-2 text-xs text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
              <span>Loading conversation history…</span>
            </div>
          ) : messages.length === 0 && !activeRun && !sendingMessage ? (
            <div className="mt-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-red-500/10 text-red-400 ring-1 ring-red-500/30">
                <Bot className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-white">Ask the investigation agent</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500">
                Investigate incidents, correlate telemetry events, and inspect linked GitHub repositories for{' '}
                <span className="font-mono text-zinc-300">{projectId}</span>.
              </p>
            </div>
          ) : (
            <>
              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex flex-col items-end">
                    <div className="max-w-[85%] rounded-xl rounded-br-sm border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-zinc-100">
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                    {m.created_at && (
                      <time className="mt-1 px-1 font-mono text-[10px] text-zinc-600">
                        {formatMessageTime(m.created_at)}
                      </time>
                    )}
                  </div>
                ) : (
                  <article
                    key={m.id}
                    className="fade-up w-full rounded-xl border border-line bg-card p-4"
                  >
                    <header className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
                      <div className="flex items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded bg-red-500/10 text-red-400">
                          <Bot className="h-3.5 w-3.5" />
                        </span>
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                          J.A.R.V.I.S. Investigation
                        </span>
                      </div>
                      {m.created_at && (
                        <time className="font-mono text-[10px] text-zinc-500">
                          {formatMessageTime(m.created_at)}
                        </time>
                      )}
                    </header>
                    <MarkdownMessage content={m.content ?? ''} />
                  </article>
                ),
              )}

              {(activeRun || runSteps.length > 0) && (
                <RunActivityTimeline run={activeRun} steps={runSteps} />
              )}
            </>
          )}
          <div ref={endRef} />
        </div>

        {/* Message Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSubmit()
          }}
          className="shrink-0 border-t border-line p-3"
        >
          <div className="flex items-end gap-2 rounded-xl border border-line bg-card px-3 py-2 focus-within:border-zinc-600">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!projectUuid || isRunActive || sendingMessage}
              rows={1}
              placeholder={
                !projectUuid
                  ? 'Select a project first…'
                  : isRunActive
                    ? 'Investigation in progress…'
                    : 'Describe an incident or ask a follow-up question…'
              }
              aria-label="Message"
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              {sendingMessage ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-zinc-600">
            <span>Enter to send · Shift + Enter for a new line</span>
            {isRunActive && (
              <span className="text-amber-300/80">
                Active run ({activeRun?.status})
              </span>
            )}
          </div>
        </form>
      </aside>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete conversation?"
        body={`Delete "${deleteTarget?.title?.trim() || 'New Investigation'}" and its entire message and run history? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        busy={deletingConversationId !== null}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  )
}
