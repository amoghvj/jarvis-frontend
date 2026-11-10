import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { ProfileMenu } from './ProfileMenu'
import { ProjectSelector } from './ProjectSelector'

export type Page = 'Overview' | 'Integrations' | 'API Keys'
const NAV: Page[] = ['Overview', 'Integrations', 'API Keys']

export function Header({ active, setActive }: { active: Page; setActive: (p: Page) => void }) {
  const [mobile, setMobile] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <ProfileMenu />
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <button
              key={n}
              onClick={() => setActive(n)}
              className={`rounded-md px-3 py-1.5 text-sm transition ${active === n ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'}`}
            >
              {n}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ProjectSelector />
          <button className="text-zinc-400 md:hidden" onClick={() => setMobile((m) => !m)} aria-label="Toggle navigation">
            {mobile ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {mobile && (
        <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden">
          {NAV.map((n) => (
            <button
              key={n}
              onClick={() => { setActive(n); setMobile(false) }}
              className={`rounded-md px-3 py-2 text-left text-sm ${active === n ? 'bg-white/10 text-white' : 'text-zinc-400'}`}
            >
              {n}
            </button>
          ))}
        </nav>
      )}
    </header>
  )
}



