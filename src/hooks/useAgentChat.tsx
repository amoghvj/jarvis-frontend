import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { mockAgent } from '../lib/agent/mockAgent'
import type { AgentTransport, ChatMessage } from '../lib/agent/types'

interface AgentChatCtx {
  open: boolean
  setOpen: (open: boolean) => void
  messages: ChatMessage[]
  pending: boolean
  send: (text: string) => void
}

const Ctx = createContext<AgentChatCtx | null>(null)

/**
 * Lives at the authenticated-shell level so open state and history survive page changes.
 * In-memory only: nothing is persisted or sent to the backend.
 */
export function AgentChatProvider({ children, transport = mockAgent }: { children: ReactNode; transport?: AgentTransport }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const seq = useRef(0)
  const alive = useRef(true)
  const busy = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const send = useCallback((raw: string) => {
    const text = raw.trim()
    if (!text || busy.current) return
    busy.current = true
    setPending(true)
    setMessages((m) => [...m, { id: `u${++seq.current}`, role: 'user', text }])
    transport
      .respond(text)
      .then((report) => {
        if (alive.current) setMessages((m) => [...m, { id: `a${++seq.current}`, role: 'agent', report }])
      })
      .catch(() => { /* real transports should surface an error message here */ })
      .finally(() => {
        busy.current = false
        if (alive.current) setPending(false)
      })
  }, [transport])

  const value = useMemo(() => ({ open, setOpen, messages, pending, send }), [open, messages, pending, send])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAgentChat() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAgentChat outside AgentChatProvider')
  return c
}

