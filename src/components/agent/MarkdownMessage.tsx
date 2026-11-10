import { type ReactNode } from 'react'

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  // Match inline code `...`, bold **...**, or links [label](https://...)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`c-${key++}`}
          className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-amber-200"
        >
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${key++}`} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      )
    } else if (token.startsWith('[')) {
      const m = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (m) {
        parts.push(
          <a
            key={`a-${key++}`}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2 hover:text-cyan-300"
          >
            {m[1]}
          </a>,
        )
      } else {
        parts.push(token)
      }
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

export function MarkdownMessage({ content }: { content: string }) {
  const blocks: ReactNode[] = []
  const lines = content.replace(/\r\n/g, '\n').split('\n')

  let i = 0
  let blockKey = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block ```
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // skip closing ```
      blocks.push(
        <div key={`code-${blockKey++}`} className="my-2 overflow-hidden rounded-lg border border-line bg-bg">
          {lang && (
            <div className="border-b border-line bg-white/[0.02] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-zinc-200">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      )
      continue
    }

    // Blank line
    if (!line.trim()) {
      i++
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      const cls =
        level === 1
          ? 'mt-3 mb-1.5 text-base font-semibold text-white'
          : level === 2
            ? 'mt-3 mb-1 text-sm font-semibold text-white'
            : 'mt-2.5 mb-1 text-xs font-semibold uppercase tracking-wider text-amber-300/90'
      blocks.push(
        <div key={`h-${blockKey++}`} className={cls}>
          {renderInline(text)}
        </div>,
      )
      i++
      continue
    }

    // Blockquote
    if (line.trimStart().startsWith('>')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith('>')) {
        quoteLines.push(lines[i].trimStart().replace(/^>\s?/, ''))
        i++
      }
      blocks.push(
        <blockquote
          key={`q-${blockKey++}`}
          className="my-2 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-1.5 text-xs text-zinc-300"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx} className="leading-relaxed">
              {renderInline(ql)}
            </p>
          ))}
        </blockquote>,
      )
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={`ul-${blockKey++}`} className="my-1.5 space-y-1 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed text-zinc-200">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" aria-hidden />
              <span className="min-w-0 flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      )
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push(
        <ol key={`ol-${blockKey++}`} className="my-1.5 space-y-1.5 pl-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-zinc-200">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/5 font-mono text-[11px] text-zinc-400 ring-1 ring-line">
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ol>,
      )
      continue
    }

    // Paragraph
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trimStart().startsWith('>') &&
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    blocks.push(
      <p key={`p-${blockKey++}`} className="my-1.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
        {renderInline(paraLines.join('\n'))}
      </p>,
    )
  }

  return <div className="space-y-1">{blocks}</div>
}

