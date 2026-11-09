import type { ReactNode } from 'react'
import { AgentChatProvider, useAgentChat } from '../hooks/useAgentChat'
import { AgentChatPanel } from './agent/AgentChatPanel'

function Frame({ children }: { children: ReactNode }) {
  const { open } = useAgentChat()
  // On large screens the page makes room for the panel; on small screens the panel overlays full-screen.
  return (
    <>
      <div className={`transition-[padding] duration-300 ease-out ${open ? 'lg:pr-[420px]' : ''}`}>{children}</div>
      <AgentChatPanel />
    </>
  )
}

/** Authenticated shell. Mounted once, so chat state survives page changes. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AgentChatProvider>
      <Frame>{children}</Frame>
    </AgentChatProvider>
  )
}

