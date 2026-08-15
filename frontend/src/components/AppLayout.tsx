import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { PermissionGate } from './PermissionGate'
import { authApi } from '../lib/api/auth'
import { useAuth } from '../lib/auth/AuthContext'

// Minimal top nav for the authenticated app shell. Not the mockup's full
// sidebar (persona switcher, pages listed inline per group) — this is a
// flat top nav to the section screens instead. Groups is visible to
// everyone (read-only for those without workspace.groups.create); Users
// and Audit Log are gated to the permissions that actually unlock them.
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
          <NavLink to="/groups" style={navStyle}>
            Groups
          </NavLink>
          <PermissionGate permission="workspace.users.view">
            <NavLink to="/users" style={navStyle}>
              Users
            </NavLink>
          </PermissionGate>
          <PermissionGate permission="workspace.audit.view">
            <NavLink to="/audit-log" style={navStyle}>
              Audit Log
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
