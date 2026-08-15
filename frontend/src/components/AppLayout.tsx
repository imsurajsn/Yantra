import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { PermissionGate } from './PermissionGate'
import { authApi } from '../lib/api/auth'
import { useAuth } from '../lib/auth/AuthContext'

// Minimal top nav for the authenticated app shell. Not the mockup's full
// sidebar (page groups, persona switcher) — that lands with the Pages PR,
// once there's something for a sidebar to actually list. This exists so
// admin-only screens (Users, and later Groups/Pages/Audit) are reachable at
// all, rather than requiring a user to know the URL.
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, refetch } = useAuth()

  async function handleSignOut() {
    await authApi.logout()
    await refetch()
  }

  return (
    <div>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <strong>Yantra</strong>
        <nav style={{ display: 'flex', gap: 16 }}>
          <NavLink to="/" end style={navStyle}>
            Home
          </NavLink>
          <PermissionGate permission="workspace.users.view">
            <NavLink to="/users" style={navStyle}>
              Users
            </NavLink>
          </PermissionGate>
        </nav>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <span className="muted">
            {user?.email} · {user?.role}
          </span>
          <button onClick={handleSignOut}>Sign out</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function navStyle({ isActive }: { isActive: boolean }) {
  return {
    color: isActive ? 'var(--accent)' : 'var(--text)',
    textDecoration: 'none',
    fontSize: 14,
  }
}
