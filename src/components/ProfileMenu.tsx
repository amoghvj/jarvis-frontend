import { useEffect, useRef, useState } from 'react'
import { LogOut, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export function ProfileMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  if (!user) return null
  const avatar = user.avatar_url ? (
    <img src={user.avatar_url} alt={user.github_username} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
  ) : (
    <span className="grid h-full w-full place-items-center bg-zinc-800 text-sm font-medium uppercase">{user.github_username[0]}</span>
  )

  const onLogout = async () => {
    setBusy(true)
    setErr(null)
    try {
      await logout()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open profile menu"
        aria-expanded={open}
        className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-line transition hover:ring-accent/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {avatar}
      </button>
      {open && (
        <div className="fade-up absolute left-0 top-12 z-50 w-72 rounded-xl border border-line bg-card p-4 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full ring-1 ring-line">{avatar}</div>
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{user.github_username}</p>
              <p className="truncate text-xs text-zinc-500">{user.email ?? 'No public email'}</p>
            </div>
          </div>
          <div className="my-3 h-px bg-line" />
          <button
            onClick={onLogout}
            disabled={busy}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Log out
          </button>
          {err && <p className="mt-2 px-3 text-xs text-red-400">{err}</p>}
        </div>
      )}
    </div>
  )
}

