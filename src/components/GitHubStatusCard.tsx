import { ArrowRight } from 'lucide-react'
import { GithubIcon } from './GithubIcon'
import { useGitHubStatus } from '../hooks/useGitHubStatus'

export function GitHubStatusCard({ onOpen }: { onOpen: () => void }) {
  const { data, loading, error } = useGitHubStatus()
  const count = data?.installations.length ?? 0

  let dot = 'bg-zinc-600'
  let label = 'Checking…'
  if (!loading || data) {
    if (error && !data) { label = 'Status unavailable'; dot = 'bg-yellow-400' }
    else if (count > 0) { label = `${count} installation${count > 1 ? 's' : ''} connected`; dot = 'bg-emerald-400' }
    else { label = 'GitHub not connected'; dot = 'bg-zinc-600' }
  }

  return (
    <button onClick={onOpen} className="group mt-4 flex w-full items-center gap-4 rounded-xl border border-line bg-card p-5 text-left transition hover:border-zinc-600">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5"><GithubIcon className="h-5 w-5" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-white">GitHub Repository Access</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500"><span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</p>
      </div>
      <span className="hidden items-center gap-1 text-xs text-zinc-500 transition group-hover:text-zinc-200 sm:flex">
        {count > 0 ? 'Manage' : 'Authorize repositories'} <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

