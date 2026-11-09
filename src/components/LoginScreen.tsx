import { Logo } from './Logo'
import { GithubIcon } from './GithubIcon'
import { githubLoginUrl } from '../lib/api'

export function LoginScreen() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div className="fade-up relative w-full max-w-sm rounded-2xl border border-line bg-card/90 p-8 text-center shadow-2xl shadow-black/50">
        <div className="mb-6 flex justify-center"><Logo size="lg" /></div>
        <p className="text-sm font-medium text-zinc-300">Justified Analysis, Reasoning &amp; Visualization of Incident Systems</p>
        <p className="mt-2 text-sm text-zinc-500">Sign in to monitor and understand your incidents.</p>
        <a
          href={githubLoginUrl}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200"
        >
          <GithubIcon /> Continue with GitHub
        </a>
      </div>
    </main>
  )
}

