import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, Copy, KeyRound, Loader2, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import {
  getApiKeyStatus, revokeApiKey, rotateApiKey, UnauthorizedError,
  type ApiKeyStatus,
} from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { CodeBlock } from '../components/CodeBlock'

type Confirm = 'rotate' | 'revoke' | null

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

const PY = `# pip install jarvis-observe
import os
import jarvis_observe

jarvis_observe.init(
    endpoint="https://YOUR-API-DOMAIN/v1/events",
    api_key=os.environ["JARVIS_API_KEY"],
    project_id="my-project",
    service_id="backend",
    repository="https://github.com/user/project",
)`

const JS = `// npm install ./jarvis-observe   (Node.js 18+, CommonJS)
const jarvis = require("jarvis-observe");

jarvis.init({
  endpoint: "https://YOUR-API-DOMAIN/v1/events",
  apiKey: process.env.JARVIS_API_KEY,
  projectId: "my-project",
  serviceId: "backend",
  repository: "https://github.com/user/project",
  environment: "production",
});`

export function ApiKeys() {
  const { expireSession } = useAuth()
  const [status, setStatus] = useState<ApiKeyStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  // Raw key lives only in component state; cleared on dismiss/unmount. Never persisted.
  const [revealed, setRevealed] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handle = useCallback((e: unknown) => {
    if (e instanceof UnauthorizedError) expireSession()
    else setError((e as Error).message)
  }, [expireSession])

  const refresh = useCallback(async () => {
    try {
      setStatus(await getApiKeyStatus())
      setError(null)
    } catch (e) {
      handle(e)
    } finally {
      setLoading(false)
    }
  }, [handle])

  useEffect(() => { refresh() }, [refresh])

  const run = async (action: Exclude<Confirm, null>) => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (action === 'rotate') {
        const r = await rotateApiKey()
        setRevealed(r.api_key)
        setCopied(false)
      } else {
        const r = await revokeApiKey()
        setNotice(r.message)
      }
      setConfirm(null)
      await refresh()
    } catch (e) {
      setConfirm(null)
      handle(e)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copy failed. Select the key and copy it manually.')
    }
  }

  const dismiss = () => { setRevealed(null); setCopied(false) }

  const active = status?.active

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-white">API Keys</h1>
      <p className="mt-1 text-sm text-zinc-500">Authenticate the J.A.R.V.I.S. SDKs that send telemetry from your applications. One key per account.</p>

      {error && <div role="alert" className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {notice && <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}

      {revealed && (
        <section className="fade-up mt-6 rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-300" />
            <div className="min-w-0 flex-1">
              <h2 className="font-medium text-white">Your new API key</h2>
              <p className="mt-1 text-sm text-yellow-200/80">Copy it now. This key is shown only once and cannot be retrieved again.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-sm text-accent select-all">{revealed}</code>
                <button onClick={copy} className="flex items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-white/5">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button onClick={dismiss} className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200">
                I've saved my key
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-white"><KeyRound className="h-4 w-4 text-accent" /> Current key</div>
        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading status…</div>
        ) : status ? (
          <>
            <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-zinc-500">Status</dt>
                <dd className="mt-1 inline-flex items-center gap-2 text-zinc-200">
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-zinc-600'}`} />{active ? 'Active' : 'No active key'}
                </dd>
              </div>
              <div><dt className="text-xs text-zinc-500">Key prefix</dt><dd className="mt-1 font-mono text-zinc-200">{active && status.key_prefix ? `${status.key_prefix}…` : '—'}</dd></div>
              <div><dt className="text-xs text-zinc-500">Created</dt><dd className="mt-1 text-zinc-200">{fmt(status.created_at)}</dd></div>
              <div><dt className="text-xs text-zinc-500">Last used</dt><dd className="mt-1 text-zinc-200">{active ? (status.last_used_at ? fmt(status.last_used_at) : 'Never') : '—'}</dd></div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <button disabled={busy} onClick={() => setConfirm('rotate')} className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-60">
                <RefreshCw className="h-4 w-4" />{active ? 'Regenerate API Key' : 'Generate API Key'}
              </button>
              {active && (
                <button disabled={busy} onClick={() => setConfirm('revoke')} className="flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm text-red-300 hover:bg-red-500/10 disabled:opacity-60">
                  <Trash2 className="h-4 w-4" /> Revoke API Key
                </button>
              )}
            </div>
          </>
        ) : (
          <button onClick={() => { setLoading(true); refresh() }} className="mt-5 rounded-lg border border-line px-4 py-2 text-sm hover:bg-white/5">Retry</button>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <h2 className="text-sm font-medium text-white">SDK setup</h2>
        <div className="mt-3 flex gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <ShieldAlert className="h-5 w-5 shrink-0" />
          <p>Never commit API keys to source control. Load them from environment variables or a secret manager and add <code className="font-mono">.env</code> to <code className="font-mono">.gitignore</code>.</p>
        </div>
        <div className="mt-5 space-y-5">
          <CodeBlock label="Python" code={PY} />
          <CodeBlock label="JavaScript (Node.js)" code={JS} />
        </div>
        <p className="mt-4 text-xs text-zinc-500">Replace <span className="font-mono">YOUR-API-DOMAIN</span> with your J.A.R.V.I.S. backend domain. <span className="font-mono">project_id</span> must be an existing project owned by your account.</p>
      </section>

      <ConfirmDialog
        open={confirm === 'rotate'}
        title={active ? 'Regenerate API key?' : 'Generate API key?'}
        body={active ? 'The current key will stop working immediately. Update every application that uses it.' : 'A new key will be created and shown once.'}
        confirmLabel={active ? 'Regenerate' : 'Generate'}
        busy={busy}
        onConfirm={() => run('rotate')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'revoke'}
        title="Revoke API key?"
        body="Applications using this key will immediately stop sending telemetry. This cannot be undone."
        confirmLabel="Revoke"
        danger
        busy={busy}
        onConfirm={() => run('revoke')}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

