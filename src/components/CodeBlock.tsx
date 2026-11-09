export function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-4 font-mono text-xs leading-relaxed text-zinc-300"><code>{code}</code></pre>
    </div>
  )
}

