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
  { label: 'Total incidents', value: 148, delta: '+12 this week', spark: [4, 6, 5, 9, 7, 11, 8, 12] },
  { label: 'Open incidents', value: 17, delta: '-3 vs last week', spark: [9, 8, 11, 10, 9, 7, 8, 6] },
  { label: 'Critical incidents', value: 3, delta: '+1 today', spark: [1, 0, 1, 2, 1, 1, 2, 3] },
  { label: 'Monitored projects', value: 9, delta: '2 added', spark: [5, 5, 6, 6, 7, 8, 8, 9] },
]

export const demoIncidents: Incident[] = [
  { id: 'INC-1042', title: 'Elevated 5xx rate on checkout', severity: 'critical', service: 'payments-api', status: 'investigating', detected: '4 min ago' },
  { id: 'INC-1041', title: 'Database connection pool exhausted', severity: 'critical', service: 'orders-db', status: 'open', detected: '22 min ago' },
  { id: 'INC-1040', title: 'p95 latency regression after deploy', severity: 'high', service: 'search-service', status: 'investigating', detected: '1 h ago' },
  { id: 'INC-1039', title: 'Unhandled TypeError in session middleware', severity: 'medium', service: 'auth-gateway', status: 'open', detected: '3 h ago' },
  { id: 'INC-1038', title: 'Queue backlog growing on email worker', severity: 'medium', service: 'notifier', status: 'resolved', detected: '6 h ago' },
  { id: 'INC-1037', title: 'Deprecated API call warnings spike', severity: 'low', service: 'web-frontend', status: 'resolved', detected: '1 d ago' },
]

export const demoActivity = [
  { text: 'INC-1042 escalated to critical', time: '2 min ago', tone: 'red' },
  { text: 'Root-cause analysis generated for INC-1040', time: '14 min ago', tone: 'cyan' },
  { text: 'Deploy v2.14.3 detected on search-service', time: '1 h ago', tone: 'zinc' },
  { text: 'INC-1038 marked resolved', time: '6 h ago', tone: 'green' },
  { text: 'New project "billing-worker" connected', time: '1 d ago', tone: 'zinc' },
]

export const demoTrend = [3, 5, 4, 8, 6, 9, 7, 12, 10, 6, 8, 11, 9, 14]

