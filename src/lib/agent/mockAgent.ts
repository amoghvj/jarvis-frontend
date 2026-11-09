import type { AgentReport, AgentTransport } from './types'

// MOCK DATA. Illustrative only: no backend events were processed and no source code was retrieved.
export const MOCK_REPORT: AgentReport = {
  mock: true,
  summary: "I've completed an initial investigation of the reported incident.",
  issue: 'Database connection failures in the production backend.',
  hypothesis:
    'The application is experiencing intermittent connection timeouts while establishing database connections. This may indicate connection-pool exhaustion or an overly restrictive connection timeout.',
  evidence: [
    'Repeated database connection errors in the affected service.',
    'Stack traces point to the database connection-handling path.',
    'Failures occur during connection establishment rather than query execution.',
  ],
  actions: [
    'Inspect active database connections and connection-pool utilization.',
    'Review connection timeout and retry configuration.',
    'Verify that database connections are correctly released after use.',
  ],
  confidence: 'Medium',
  status: 'Further verification required.',
  timeline: [
    { title: 'Incident received', time: '10:42:03', detail: 'Production backend reported database connection failures.' },
    { title: 'Related events correlated', time: '10:42:05', detail: 'Multiple connection errors grouped into one incident.' },
    { title: 'Stack traces analysed', time: '10:42:08', detail: 'Database connection-handling path identified as relevant.' },
    { title: 'Source-code context retrieved', time: '10:42:11', detail: 'Relevant repository context examined.' },
    { title: 'Root-cause hypothesis generated', time: '10:42:15', detail: 'Connection-pool exhaustion or timeout configuration identified as a possible cause.', highlight: true },
    { title: 'Investigation completed', time: '10:42:17', detail: 'Evidence and remediation recommendations prepared.' },
  ],
}

export const MOCK_DELAY_MS = 1800

/** Returns the same static report for every message, after a short simulated delay. */
export const mockAgent: AgentTransport = {
  respond: () => new Promise((resolve) => setTimeout(() => resolve(MOCK_REPORT), MOCK_DELAY_MS)),
}

