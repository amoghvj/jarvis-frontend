// Query parameters set by the backend callback redirect (app/routes/github.py):
//   ?github_app=connected&installation_id=<id>   or   ?github_app=error&reason=<code>
// These are UI hints only. The status endpoint is the source of truth.
export interface GitHubCallback {
  result: 'connected' | 'error'
  installationId: number | null
  reason: string | null
}

const REASONS: Record<string, string> = {
  invalid_state: 'The authorization session was invalid. Please try again.',
  expired_state: 'The authorization session expired. Please try again.',
  replayed_state: 'This authorization link was already used. Please start again.',
  cancelled: 'Authorization was cancelled.',
  missing_params: 'GitHub did not return the expected information. Please try again.',
  identity_mismatch: 'The GitHub account used does not match your J.A.R.V.I.S. account.',
  installation_not_accessible: 'That installation is not accessible to your GitHub account.',
  installation_suspended: 'That installation is suspended on GitHub.',
  installation_already_linked: 'That installation is already linked to another J.A.R.V.I.S. account.',
  github_oauth_error: 'GitHub reported an error during authorization.',
}

export const reasonText = (code: string | null) =>
  (code && REASONS[code]) || 'GitHub authorization could not be completed.'

/** Reads and strips the callback params from the URL. Returns null when absent/unrecognised. */
export function consumeGitHubCallback(): GitHubCallback | null {
  const url = new URL(window.location.href)
  const result = url.searchParams.get('github_app')
  if (result === null) return null
  const id = url.searchParams.get('installation_id')
  const reason = url.searchParams.get('reason')
  for (const k of ['github_app', 'installation_id', 'reason']) url.searchParams.delete(k)
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  if (result !== 'connected' && result !== 'error') return null
  return {
    result,
    installationId: id && /^\d+$/.test(id) ? Number(id) : null,
    reason: reason && /^[a-z_]+$/.test(reason) ? reason : null,
  }
}

