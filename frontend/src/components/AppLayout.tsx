import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { authApi } from '../lib/api/auth'
import { useAuth } from '../lib/auth/AuthContext'

// Left sidebar (pages by group + role-conditional admin/workspace section)
// plus a slim top header (screen title + who's signed in + sign out) —
// matching the mockup's actual shell, not a flat top-nav bar.
export function AppLayout({ children }: { children: ReactNode }) {
  const { user, refetch } = useAuth()
  const location = useLocation()

  async function handleSignOut() {
    await authApi.logout()
    await refetch()
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        >
          <div style={{ fontWeight: 500, fontSize: 15 }}>{screenTitle(location.pathname)}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5 }}>
            <span className="muted">
              Signed in as <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{user?.display_name}</strong> ·{' '}
              {user?.role}
            </span>
            <button onClick={handleSignOut}>Sign out</button>
          </div>
        </header>
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  )
}

function screenTitle(pathname: string): string {
  if (pathname === '/') return 'Home'
  if (pathname === '/groups') return 'Groups'
  if (pathname === '/users') return 'Users'
  if (pathname === '/audit-log') return 'Audit Log'
  if (pathname === '/profile') return 'Profile'
  if (pathname.startsWith('/pages/new/')) return 'New Page'
  if (pathname.endsWith('/edit')) return 'Edit Page'
  if (pathname.startsWith('/pages/')) return 'Page'
  return ''
}
