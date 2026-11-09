// DEMO / SAMPLE DATA ONLY. The backend does not yet expose incident endpoints.
export type Severity = 'critical' | 'high' | 'medium' | 'low'
export type IncidentStatus = 'open' | 'investigating' | 'resolved'

export interface Incident {
  id: string
  title: string
  severity: Severity
  service: string
  status: IncidentStatus
  detected: string
}

export const demoStats = [
  { label: 'Total incidents', value: 148, delta: '+148 today (initial launch)', spark: [0, 8, 15, 24, 38, 65, 102, 148] },
  { label: 'Open incidents', value: 17, delta: '17 active of 148 total', spark: [0, 4, 8, 14, 19, 23, 20, 17] },
  { label: 'Critical incidents', value: 3, delta: '3 requiring attention', spark: [0, 0, 1, 1, 2, 2, 2, 3] },
  { label: 'Monitored projects', value: 9, delta: '9 onboarded today', spark: [0, 1, 2, 4, 5, 7, 8, 9] },
]

export const demoIncidents: Incident[] = [
  { id: 'INC-1042', title: 'Elevated 5xx rate on checkout', severity: 'critical', service: 'payments-api', status: 'investigating', detected: '4 min ago' },
  { id: 'INC-1041', title: 'Database connection pool exhausted', severity: 'critical', service: 'orders-db', status: 'open', detected: '22 min ago' },
  { id: 'INC-1040', title: 'p95 latency regression after deploy', severity: 'high', service: 'search-service', status: 'investigating', detected: '48 min ago' },
  { id: 'INC-1039', title: 'Unhandled TypeError in session middleware', severity: 'medium', service: 'auth-gateway', status: 'open', detected: '1 h 35 min ago' },
  { id: 'INC-1038', title: 'Queue backlog growing on email worker', severity: 'medium', service: 'notifier', status: 'resolved', detected: '2 h 20 min ago' },
  { id: 'INC-1037', title: 'Deprecated API call warnings spike', severity: 'low', service: 'web-frontend', status: 'resolved', detected: '3 h 40 min ago' },
]

export const demoActivity = [
  { text: 'INC-1042 escalated to critical', time: '2 min ago', tone: 'red' },
  { text: 'Root-cause analysis generated for INC-1040', time: '9 min ago', tone: 'cyan' },
  { text: 'Deploy v2.14.3 detected on search-service', time: '52 min ago', tone: 'zinc' },
  { text: 'INC-1038 marked resolved', time: '2 h 5 min ago', tone: 'green' },
  { text: 'New project "billing-worker" connected', time: '3 h 30 min ago', tone: 'zinc' },
]

// 16 buckets of 15 minutes covering the last 4 hours (oldest first)
export const demoTrend = [2, 3, 2, 4, 3, 5, 4, 6, 5, 3, 4, 6, 5, 7, 6, 9]


