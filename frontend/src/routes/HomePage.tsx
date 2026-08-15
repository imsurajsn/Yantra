import { authApi } from '../lib/api/auth'
import { useAuth } from '../lib/auth/AuthContext'

// Placeholder landing page for this PR's auth+setup vertical slice — the
// full dashboard (page cards grouped by Group, stats, "new page" dialog)
// lands in the pages-primitives PR.
export function HomePage() {
  const { user, refetch } = useAuth()

  async function handleSignOut() {
    await authApi.logout()
    await refetch()
  }

  return (
    <div className="page">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Welcome back, {user?.display_name}</h1>
        <p className="muted">
          Signed in as <strong style={{ color: 'var(--text)' }}>{user?.email}</strong> · {user?.role}
        </p>
        <button onClick={handleSignOut}>Sign out</button>
      </div>
    </div>
  )
}
