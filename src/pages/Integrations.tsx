import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Unlink, X } from 'lucide-react'
import { GithubIcon } from '../components/GithubIcon'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useGitHubStatus } from '../hooks/useGitHubStatus'
import { disconnectGitHubInstallation, githubInstallUrl, UnauthorizedError, type GitHubInstallation } from '../lib/api'
import { reasonText, type GitHubCallback } from '../lib/githubCallback'

const fmt = (iso: string) => new Date(iso).toLocaleDateString()

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading GitHub status">
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse rounded-lg border border-line p-4">
          <div className="h-4 w-40 rounded bg-white/10" />
          <div className="mt-3 h-3 w-64 rounded bg-white/5" />
        </div>
      ))}
    </div>
  )
}

function InstallationCard({ inst, onDisconnect }: { inst: GitHubInstallation; onDisconnect: () => void }) {
  const suspended = inst.suspended_at !== null
  return (
    <div className="rounded-lg border border-line p-4 transition hover:border-zinc-600">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-white/5"><GithubIcon className="h-5 w-5" /></div>
          <div>
            <p className="font-medium text-white">{inst.account_login}</p>
            <p className="text-xs text-zinc-500">{inst.account_type} · linked {fmt(inst.created_at)}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-0.5 text-xs ring-1 ${suspended ? 'bg-yellow-500/10 text-yellow-300 ring-yellow-500/30' : 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/30'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${suspended ? 'bg-yellow-300' : 'bg-emerald-400'}`} />
          {suspended ? 'Suspended' : 'Connected'}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div><dt className="text-xs text-zinc-500">Repository access</dt><dd className="mt-1 text-zinc-200">{inst.repository_selection === 'all' ? 'All repositories' : inst.repository_selection === 'selected' ? 'Selected repositories' : inst.repository_selection ?? 'Unknown'}</dd></div>
        <div><dt className="text-xs text-zinc-500">Installation ID</dt><dd className="mt-1 font-mono text-zinc-200">{inst.installation_id}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={onDisconnect} className="flex items-center gap-2 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm text-red-300 hover:bg-red-500/10">
          <Unlink className="h-4 w-4" /> Disconnect from J.A.R.V.I.S.
        </button>
      </div>
    </div>
  )
}

export function Integrations({ callback, onCallbackDismiss }: { callback: GitHubCallback | null; onCallbackDismiss: () => void }) {
  const { data, loading, error, refresh, expireSession } = useGitHubStatus()
  const [target, setTarget] = useState<GitHubInstallation | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const disconnect = async () => {
    if (!target) return
    setBusy(true)
    setActionError(null)
    try {
      const r = await disconnectGitHubInstallation(target.installation_id)
      setNotice(r.message)
      setTarget(null)
      await refresh()
    } catch (e) {
      setTarget(null)
      if (e instanceof UnauthorizedError) expireSession()
      else setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Callback params are only a hint: success is shown only if the status endpoint confirms it.
  let banner: { tone: 'ok' | 'warn' | 'err'; text: string } | null = null
  if (callback?.result === 'error') banner = { tone: 'err', text: reasonText(callback.reason) }
  else if (callback?.result === 'connected' && data) {
    const confirmed = callback.installationId === null
      ? data.installations.length > 0
      : data.installations.some((i) => i.installation_id === callback.installationId)
    banner = confirmed
      ? { tone: 'ok', text: 'GitHub repositories authorized successfully.' }
      : { tone: 'warn', text: 'GitHub reported success, but the installation could not be confirmed yet. Refresh to check again.' }
  }
  const tones = {
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warn: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
    err: 'border-red-500/30 bg-red-500/10 text-red-300',
  }

  const AuthorizeButton = ({ label = 'Authorize Repositories' }: { label?: string }) => (
    <a href={githubInstallUrl} className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200">
      <GithubIcon className="h-4 w-4" /> {label}
    </a>
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-white">Integrations</h1>
      <p className="mt-1 text-sm text-zinc-500">Connect the sources J.A.R.V.I.S. uses to investigate incidents.</p>

      {banner && (
        <div role="status" className={`mt-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${tones[banner.tone]}`}>
          {banner.tone === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <p className="flex-1">{banner.text}</p>
          <button onClick={onCallbackDismiss} aria-label="Dismiss"><X className="h-4 w-4" /></button>
        </div>
      )}
      {notice && <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{notice}</div>}
      {actionError && <div role="alert" className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{actionError}</div>}

      <section className="mt-6 rounded-xl border border-line bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/5 text-white"><GithubIcon className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-white">GitHub Repository Access</h2>
            <p className="mt-1 text-sm text-zinc-400">Connect your GitHub repositories to J.A.R.V.I.S. to enable source-code investigation, dependency analysis and evidence-backed incident diagnosis.</p>
          </div>
        </div>
        <div className="mt-4 flex gap-3 rounded-lg border border-line bg-bg p-3 text-sm text-zinc-400">
          <ShieldCheck className="h-5 w-5 shrink-0 text-accent" />
          <p><span className="text-zinc-200">Read-only access.</span> The GitHub App requests read-only permissions for repository metadata and contents. J.A.R.V.I.S. cannot modify your code. You choose which repositories to share on GitHub.</p>
        </div>

        <div className="mt-6">
          {loading && !data ? (
            <Skeleton />
          ) : error && !data ? (
            <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <p>Couldn't load GitHub integration status.</p>
              <p className="mt-1 text-xs text-red-300/70">{error}</p>
              <button onClick={refresh} className="mt-3 rounded-lg border border-red-500/40 px-3 py-1.5 hover:bg-red-500/10">Retry</button>
            </div>
          ) : data && data.installations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line p-8 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5"><GithubIcon className="h-6 w-6 text-zinc-400" /></div>
              <p className="mt-4 font-medium text-white">GitHub not connected</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">No GitHub installations are linked to your account yet. Authorize repositories to get started.</p>
              <div className="mt-5"><AuthorizeButton /></div>
            </div>
          ) : data ? (
            <div className="space-y-3">
              {error && <p className="text-xs text-red-300">Could not refresh: {error}</p>}
              {data.installations.map((i) => (
                <InstallationCard key={i.installation_id} inst={i} onDisconnect={() => { setNotice(null); setTarget(i) }} />
              ))}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <AuthorizeButton label="Authorize more repositories" />
                <button onClick={refresh} disabled={loading} className="flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-60">
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} Refresh
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={target !== null}
        title={`Disconnect ${target?.account_login ?? ''}?`}
        body="Disconnecting removes this repository installation from your J.A.R.V.I.S. account. It does not necessarily uninstall the GitHub App from GitHub."
        confirmLabel="Disconnect"
        danger
        busy={busy}
        onConfirm={disconnect}
        onCancel={() => setTarget(null)}
      />
    </div>
  )
}

