import type { AgentRunStep } from '../api'

export interface FormattedActivityStep {
  id: string
  stepNumber: number
  stepType: string
  status: 'in_progress' | 'completed' | 'failed' | string
  label: string
  detail: string | null
  createdAt: string
}

function safeString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

/**
 * Translate a backend `AgentRunStep` into a concise, sanitized human-readable activity item.
 * Never exposes raw tool arguments or raw tool output payloads.
 */
export function formatRunStepActivity(step: AgentRunStep): FormattedActivityStep {
  const inputActivity = safeString(step.input_summary?.activity)
  const outputActivity = safeString(step.output_summary?.activity)
  const outputSummary = safeString(step.output_summary?.summary)
  const errorMessage = safeString(step.output_summary?.message) ?? safeString(step.output_summary?.error_message)
  const toolName = step.tool_name || 'investigation tool'

  let label = ''
  let detail: string | null = null

  switch (step.step_type) {
    case 'model_started':
      label = inputActivity ?? 'Analyzing your request'
      break
    case 'tool_started':
      label = inputActivity ?? `Using ${toolName}`
      break
    case 'tool_completed':
      label = inputActivity ?? `Completed ${toolName}`
      detail = outputSummary
      break
    case 'tool_failed':
      label = `${toolName} encountered an issue`
      detail = outputSummary ?? errorMessage
      break
    case 'model_completed':
      label = 'Reviewing investigation results'
      break
    case 'run_completed':
      label = outputActivity ?? 'Investigation completed'
      break
    case 'run_failed':
      label = 'Investigation failed'
      detail = errorMessage ?? outputSummary
      break
    default:
      label = inputActivity ?? outputActivity ?? `Step: ${step.step_type}`
      detail = outputSummary
      break
  }

  return {
    id: step.id,
    stepNumber: step.step_number,
    stepType: step.step_type,
    status: step.status,
    label,
    detail,
    createdAt: step.created_at,
  }
}

/**
 * Deduplicate and sort run steps strictly by `(run_id, step_number)`.
 * If an existing step is updated, the newer status/summary wins.
 */
export function mergeRunSteps(existing: AgentRunStep[], incoming: AgentRunStep[]): AgentRunStep[] {
  if (incoming.length === 0) return existing
  const byKey = new Map<string, AgentRunStep>()
  for (const s of existing) {
    byKey.set(`${s.run_id}:${s.step_number}`, s)
  }
  for (const s of incoming) {
    byKey.set(`${s.run_id}:${s.step_number}`, s)
  }
  return Array.from(byKey.values()).sort((a, b) => a.step_number - b.step_number)
}

