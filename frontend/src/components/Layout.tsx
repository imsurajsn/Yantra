import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import api from '@/api/client'
import type { Page } from '@/types'

const NAV_LINK: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '7px 10px', borderRadius: 'var(--radius-md)',
  fontSize: 13, color: 'var(--color-text)', textDecoration: 'none',
  cursor: 'pointer',
}
const NAV_LINK_ACTIVE: React.CSSProperties = {
  ...NAV_LINK,
  background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
  color: 'var(--color-accent)',
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

interface PageGroup { name: string; pages: Page[] }

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<PageGroup[]>([])

  useEffect(() => {
    api.get('/pages').then(res => {
      const pages: Page[] = res.data.data || []
      const map = new Map<string, Page[]>()
      pages.forEach(p => {
        const g = p.group || 'General'
        if (!map.has(g)) map.set(g, [])
        map.get(g)!.push(p)
      })
      setGroups(Array.from(map.entries()).map(([name, pages]) => ({ name, pages })))
    }).catch(() => {})
  }, [])

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  const active = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/')
  const screenTitle = () => {
    const p = location.pathname
    if (p === '/' || p === '/pages') return 'Home'
    if (p.startsWith('/admin/users')) return 'Users'
    if (p.startsWith('/admin/groups')) return 'Groups'
    if (p.startsWith('/admin/audit')) return 'Audit Log'
    if (p.startsWith('/admin/pages')) return 'Pages'
    if (p === '/profile') return 'Profile'
    return ''
  }

  const isAdmin = user?.workspace_role === 'Admin'

  const TableIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="10" x2="9" y2="20"/>
    </svg>
  )
  const FormIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l3 3v15H6z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="9" y1="18" x2="13" y2="18"/>
    </svg>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 252, flexShrink: 0,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-divider)',
        display: 'flex', flexDirection: 'column',
        padding: 'var(--space-4) var(--space-3)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 var(--space-2)', marginBottom: 'var(--space-6)' }}>
          <div style={{
            width: 26, height: 26,
            border: '1.5px solid var(--color-accent)', borderRadius: 'var(--radius-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--color-accent)', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 13,
          }}>Y</div>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 16 }}>Yantra</div>
        </div>

        {/* Pages section */}
        <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 50%, transparent)', padding: '0 var(--space-2)', marginBottom: 6 }}>Pages</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 'var(--space-4)', overflowY: 'auto', flex: 1 }}>
          {groups.length === 0 && (
            <span style={{ padding: '6px 10px', fontSize: 12, color: 'var(--color-muted)' }}>No pages yet</span>
          )}
          {groups.map(g => (
            <div key={g.name} style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'color-mix(in srgb, var(--color-text) 65%, transparent)', padding: '4px var(--space-2)' }}>{g.name}</div>
              {g.pages.map(p => (
                <Link
                  key={p.id}
                  to={`/pages/${p.id}`}
                  style={active(`/pages/${p.id}`) ? NAV_LINK_ACTIVE : NAV_LINK}
                >
                  {p.page_type === 'form' ? <FormIcon /> : <TableIcon />}
                  {p.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Admin section */}
        {isAdmin && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 50%, transparent)', padding: '0 var(--space-2)', marginBottom: 6 }}>Admin</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { to: '/admin/users', label: 'Users', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.4"/><path d="M3 19c0-3.2 2.6-5 6-5s6 1.8 6 5"/><path d="M15.5 14.3c2.2.3 4 1.7 4 4.7"/></svg> },
                { to: '/admin/groups', label: 'Groups', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="15" width="7" height="7" rx="1.5"/><rect x="14" y="15" width="7" height="7" rx="1.5"/></svg> },
                { to: '/admin/pages', label: 'Pages', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg> },
                { to: '/admin/audit', label: 'Audit Log', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6z"/></svg> },
              ].map(({ to, label, icon }) => (
                <Link key={to} to={to} style={active(to) ? NAV_LINK_ACTIVE : NAV_LINK}>
                  {icon}{label}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Footer: Profile */}
        <div style={{ marginTop: 'auto', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Link to="/profile" style={active('/profile') ? NAV_LINK_ACTIVE : NAV_LINK}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>
            Profile
          </Link>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header className="nav" style={{ borderBottom: '1px solid var(--color-divider)', background: 'var(--color-bg)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 15 }}>{screenTitle()}</div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 12.5, color: 'var(--color-muted)' }}>
            {user && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'var(--color-accent-800)', color: 'var(--color-accent-100)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 600, flexShrink: 0,
                  }}>{initials(user.display_name)}</div>
                  <span>Signed in as <strong style={{ color: 'var(--color-text)', fontWeight: 500 }}>{user.display_name}</strong> · {user.workspace_role}</span>
                </div>
                <button className="btn btn-secondary" onClick={handleLogout} style={{ padding: '5px 12px' }}>Sign out</button>
              </>
            )}
          </div>
        </header>
        <main style={{ flex: 1, padding: 'var(--space-6) var(--space-8)', overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
