import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Bot, MessageSquare, SendHorizontal, X } from 'lucide-react'
import { useAgentChat } from '../../hooks/useAgentChat'
import { AgentReportCard } from './AgentReportCard'

function Thinking() {
  return (
    <div className="flex items-center gap-2 text-xs text-blue-300" role="status" aria-label="Agent is investigating">
      <span className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" style={{ animationDelay: `${d}ms` }} />
        ))}
      </span>
      Investigating…
    </div>
  )
}

export function AgentChatPanel() {
  const { open, setOpen, messages, pending, send } = useAgentChat()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [messages, pending, open])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const canSend = draft.trim().length > 0 && !pending
  const submit = () => {
    if (!canSend) return
    send(draft)
    setDraft('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Agent Chat"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg shadow-black/50 ring-1 ring-red-400/40 transition hover:bg-red-500"
        >
          <MessageSquare className="h-4 w-4" /> Agent Chat
        </button>
      )}

      <aside
        aria-label="J.A.R.V.I.S. Agent chat"
        aria-hidden={!open}
        className={`fixed right-0 top-0 z-50 flex h-dvh w-full flex-col border-l border-line bg-[#0c0c0f] shadow-2xl shadow-black/60 transition-transform duration-300 ease-out sm:w-[420px] ${open ? 'translate-x-0' : 'invisible translate-x-full'}`}
        style={open ? undefined : { transitionProperty: 'transform, visibility', transitionDelay: '0s, 300ms' }}
      >
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-4">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-red-500/10 text-red-400 ring-1 ring-red-500/30"><Bot className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">J.A.R.V.I.S. Agent</p>
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Ready · demo mode (mock responses)
            </p>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Close Agent Chat" className="rounded-md p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !pending && (
            <div className="mt-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-red-500/10 text-red-400 ring-1 ring-red-500/30"><Bot className="h-6 w-6" /></div>
              <p className="mt-4 text-sm font-medium text-white">Ask the investigation agent</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-zinc-500">
                Demo mode: every message returns the same illustrative investigation report. No data is sent anywhere.
              </p>
            </div>
          )}
          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-br-sm border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-zinc-100">{m.text}</p>
              </div>
            ) : (
              <AgentReportCard key={m.id} report={m.report} />
            ),
          )}
          {pending && <Thinking />}
          <div ref={endRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); submit() }} className="shrink-0 border-t border-line p-3">
          <div className="flex items-end gap-2 rounded-xl border border-line bg-card px-3 py-2 focus-within:border-zinc-600">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Describe an incident to investigate…"
              aria-label="Message"
              className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-zinc-600">Enter to send · Shift + Enter for a new line</p>
        </form>
      </aside>
    </>
  )
}

