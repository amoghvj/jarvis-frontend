import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AlertCircle, FolderPlus, Loader2, X } from 'lucide-react'
import { createProject, DuplicateProjectError, UnauthorizedError, type Project } from '../lib/api'
import { useAuth } from '../hooks/useAuth'

// Matches backend app/services/project_service.py:
// PROJECT_ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{2,63}")
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/

export function validateProjectIdInput(raw: string): string | null {
  const val = raw.trim()
  if (!val) return 'Project ID is required.'
  if (val.length < 3 || val.length > 64) {
    return 'Project ID must be between 3 and 64 characters.'
  }
  if (!/^[A-Za-z0-9]/.test(val)) {
    return 'Project ID must start with a letter or digit.'
  }
  if (!PROJECT_ID_RE.test(val)) {
    return "Project ID may only contain letters, digits, '.', '_' or '-'."
  }
  return null
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (project: Project) => Promise<void> | void
}

export function CreateProjectModal({ open, onClose, onCreated }: Props) {
  const { expireSession } = useAuth()
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDuplicate, setIsDuplicate] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setProjectId('')
    setError(null)
    setIsDuplicate(false)
    setBusy(false)
    const t = setTimeout(() => inputRef.current?.focus(), 20)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const validationErr = validateProjectIdInput(projectId)
    if (validationErr) {
      setError(validationErr)
      setIsDuplicate(false)
      return
    }

    setBusy(true)
    setError(null)
    setIsDuplicate(false)
    try {
      const created = await createProject({ project_id: projectId.trim() })
      await onCreated(created)
      onClose()
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onClose()
        expireSession()
        return
      }
      if (err instanceof DuplicateProjectError) {
        setIsDuplicate(true)
        setError(err.message)
      } else {
        setError((err as Error).message)
      }
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4"
      onMouseDown={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="fade-up w-full max-w-md rounded-xl border border-line bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/30">
              <FolderPlus className="h-4 w-4" />
            </div>
            <div>
              <h2 id="create-project-title" className="font-medium text-white">New Project</h2>
              <p className="text-xs text-zinc-500">Choose a unique identifier for your telemetry SDKs.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close modal"
            className="rounded-md p-1 text-zinc-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5" noValidate>
          <label htmlFor="project-id-input" className="block text-xs font-medium text-zinc-300">
            Project ID <span className="font-mono text-zinc-500">(project_id)</span>
          </label>
          <input
            id="project-id-input"
            ref={inputRef}
            type="text"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value)
              if (error) {
                setError(null)
                setIsDuplicate(false)
              }
            }}
            disabled={busy}
            maxLength={64}
            placeholder="e.g. payments-service"
            autoComplete="off"
            spellCheck={false}
            className={`mt-1.5 w-full rounded-lg border bg-bg px-3 py-2 font-mono text-sm text-white placeholder:font-sans placeholder:text-zinc-600 focus:outline-none ${
              error ? 'border-red-500/60 focus:border-red-400' : 'border-line focus:border-accent/60'
            }`}
          />
          <p className="mt-1.5 text-[11px] text-zinc-500">
            3–64 characters: letters, digits, <code className="font-mono">.</code>, <code className="font-mono">_</code>, or <code className="font-mono">-</code> (must start with a letter or digit).
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-300"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div>
                {isDuplicate && <p className="font-semibold text-red-200">Duplicate Project ID</p>}
                <p>{error}</p>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !projectId.trim()}
              className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

