import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, logout as apiLogout, type User } from '../lib/api'

type Status = 'loading' | 'authenticated' | 'unauthenticated' | 'error'

interface AuthCtx {
  status: Status
  user: User | null
  error: string | null
  retry: () => void
  expireSession: () => void
  logout: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<User | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setStatus('loading')
    fetchMe()
      .then((u) => {
        setUser(u)
        setStatus(u ? 'authenticated' : 'unauthenticated')
      })
      .catch((e: Error) => {
        setError(e.message)
        setStatus('error')
      })
  }, [])

  useEffect(load, [load])

  const logout = useCallback(async () => {
    await apiLogout() // throws if the server session was not ended
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const expireSession = useCallback(() => {
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  return <Ctx.Provider value={{ status, user, error, retry: load, expireSession, logout }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}


