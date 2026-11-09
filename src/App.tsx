import { Loader2 } from 'lucide-react'
import { useAuth } from './hooks/useAuth'
import { LoginScreen } from './components/LoginScreen'
import { useState } from 'react'
import { Header, type Page } from './components/Header'
import { Dashboard } from './pages/Dashboard'
import { ApiKeys } from './pages/ApiKeys'

export default function App() {
  const { status, user, error, retry } = useAuth()
  const [page, setPage] = useState<Page>('Overview')

  if (status === 'loading')
    return <div className="grid min-h-screen place-items-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>

  if (status === 'error')
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div>
          <p className="text-zinc-300">Couldn't reach the J.A.R.V.I.S. backend.</p>
          <p className="mt-1 text-xs text-zinc-600">{error}</p>
          <button onClick={retry} className="mt-4 rounded-lg border border-line px-4 py-2 text-sm hover:bg-white/5">Retry</button>
        </div>
      </div>
    )

  if (status === 'unauthenticated' || !user) return <LoginScreen />

  return (
    <>
      <Header active={page} setActive={setPage} />
      {page === 'API Keys' ? <ApiKeys /> : <Dashboard username={user.github_username} />}
    </>
  )
}


