// Agent chat domain types + transport interface.
// To go live later, implement `AgentTransport` against a backend/streaming endpoint
// and swap it in `AgentChatProvider`. The UI only depends on these types.

export type Confidence = 'Low' | 'Medium' | 'High'

export interface TimelineStep {
  title: string
  time: string // HH:MM:SS (illustrative)
  detail: string
  highlight?: boolean // the key investigation stage
}

export interface AgentReport {
  /** True while the result is mock data. The UI must label such reports clearly. */
  mock: boolean
  summary: string
  issue: string
  hypothesis: string
  evidence: string[]
  actions: string[]
  confidence: Confidence
  status: string
  timeline: TimelineStep[]
}

export type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'agent'; report: AgentReport }

export interface AgentTransport {
  respond(message: string): Promise<AgentReport>
}

