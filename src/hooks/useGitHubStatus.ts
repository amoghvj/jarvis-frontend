import { useCallback, useEffect, useState } from 'react'
import { getGitHubStatus, UnauthorizedError, type GitHubIntegrationStatus } from '../lib/api'
import { useAuth } from './useAuth'

/** Loads GET /integrations/github/status. The backend response is the only source of truth. */
export function useGitHubStatus() {
  const { expireSession } = useAuth()
  const [data, setData] = useState<GitHubIntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getGitHubStatus())
      setError(null)
    } catch (e) {
      if (e instanceof UnauthorizedError) expireSession()
      else setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [expireSession])

  useEffect(() => { refresh() }, [refresh])

  return { data, loading, error, refresh, expireSession }
}

