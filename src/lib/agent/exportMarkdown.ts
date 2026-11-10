import type { AgentRunStep, ConversationMessage, ConversationSummary } from '../api'
import { formatRunStepActivity } from './activity'

export interface ExportConversationOptions {
  conversation: ConversationSummary
  projectName: string | null
  projectId: string | null
  messages: ConversationMessage[]
  runSteps?: AgentRunStep[]
  exportedAt?: Date
}

/**
 * Build a sanitized filename based on the conversation title and export date.
 */
export function buildExportFilename(title: string | null | undefined, date = new Date()): string {
  const base = (title || 'investigation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'investigation'
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  return `jarvis-${base}-${yyyy}-${mm}-${dd}.md`
}

/**
 * Generate a clean Markdown transcript for a conversation.
 * Excludes raw tool-call JSON, raw tool arguments, credentials, private reasoning,
 * and internal database UUIDs.
 */
export function buildConversationMarkdown(opts: ExportConversationOptions): string {
  const {
    conversation,
    projectName,
    projectId,
    messages,
    runSteps = [],
    exportedAt = new Date(),
  } = opts

  const title = conversation.title?.trim() || 'Untitled Investigation'
  const projectLabel =
    projectName && projectId && projectName !== projectId
      ? `${projectName} (${projectId})`
      : projectId || projectName || 'Selected Project'

  const lines: string[] = [
    `# ${title}`,
    '',
    `- **Project:** ${projectLabel}`,
    `- **Created:** ${new Date(conversation.created_at).toISOString()}`,
    `- **Exported:** ${exportedAt.toISOString()}`,
    '',
    '---',
    '',
    '## Conversation Transcript',
    '',
  ]

  const visibleMessages = messages.filter(
    (m) => (m.role === 'user' || m.role === 'assistant') && m.message_type === 'text',
  )

  if (visibleMessages.length === 0) {
    lines.push('_No messages in this conversation._', '')
  } else {
    for (const msg of visibleMessages) {
      const speaker = msg.role === 'user' ? 'User' : 'J.A.R.V.I.S. Agent'
      const timeStr = msg.created_at ? new Date(msg.created_at).toISOString() : ''
      lines.push(`### ${speaker}${timeStr ? ` · ${timeStr}` : ''}`, '')
      lines.push((msg.content ?? '').trim() || '_(empty)_', '')
    }
  }

  if (runSteps.length > 0) {
    lines.push('---', '', '## Investigation Activity Summary', '')
    for (const step of runSteps) {
      const formatted = formatRunStepActivity(step)
      const timeStr = formatted.createdAt ? new Date(formatted.createdAt).toISOString() : ''
      const suffix = formatted.detail ? ` — ${formatted.detail}` : ''
      lines.push(`- **[${formatted.status}]** ${formatted.label}${suffix}${timeStr ? ` _(${timeStr})_` : ''}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Trigger a browser file download for the generated Markdown document.
 */
export function downloadMarkdownFile(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

