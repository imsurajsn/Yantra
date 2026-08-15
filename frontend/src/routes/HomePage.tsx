import { useAuth } from '../lib/auth/AuthContext'

// Placeholder landing page — the full dashboard (page cards grouped by
// Group, stats, "new page" dialog) lands with the Pages PR. AppLayout
// already provides the header/nav/sign-out, so this is just the content
// area.
export function HomePage() {
  const { user } = useAuth()

  return (
    <div className="page">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Welcome back, {user?.display_name}</h1>
        <p className="muted">Here's what you have access to. (Pages aren't built yet — coming next.)</p>
      </div>
    </div>
  )
}
