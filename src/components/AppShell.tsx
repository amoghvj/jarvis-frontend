import type { ReactNode } from 'react'
import { AgentChatProvider, useAgentChat } from '../hooks/useAgentChat'
import { ProjectProvider } from '../hooks/useProject'
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

/** Authenticated shell. Mounted once, so project selection and chat state survive page changes. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ProjectProvider>
      <AgentChatProvider>
        <Frame>{children}</Frame>
      </AgentChatProvider>
    </ProjectProvider>
  )
}

