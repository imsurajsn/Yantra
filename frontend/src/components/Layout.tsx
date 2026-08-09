import { useState } from 'react'
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import api from '@/api/client'

const S = {
  shell: { display: 'flex', height: '100vh', overflow: 'hidden' } as const,
  sidebar: {
    width: 220,
    background: '#1e293b',
    color: '#cbd5e1',
    display: 'flex',
    flexDirection: 'column' as const,
    flexShrink: 0,
  },
  logo: {
    padding: '20px 16px 16px',
    fontSize: 18,
    fontWeight: 700,
    color: '#f8fafc',
    borderBottom: '1px solid #334155',
  },
  nav: { flex: 1, overflowY: 'auto' as const, padding: '8px 0' },
  navSection: { padding: '8px 16px 4px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: 1 },
  link: (active: boolean) => ({
    display: 'block',
    padding: '8px 16px',
    color: active ? '#f8fafc' : '#94a3b8',
    background: active ? '#334155' : 'transparent',
    textDecoration: 'none',
    fontSize: 14,
    borderRadius: 4,
    margin: '1px 8px',
    cursor: 'pointer',
  }),
  footer: { padding: '12px 16px', borderTop: '1px solid #334155', fontSize: 13, color: '#64748b' },
  main: { flex: 1, overflowY: 'auto' as const, background: '#f8fafc' },
  header: {
    padding: '12px 24px',
    background: '#fff',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  },
  content: { padding: '24px' },
  btn: {
    padding: '6px 14px',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    background: '#fff',
    cursor: 'pointer',
    fontSize: 13,
    color: '#475569',
  },
}

interface NavItem { label: string; to: string }

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [pages, setPages] = useState<{ id: number; title: string }[]>([])
  const [pagesLoaded, setPagesLoaded] = useState(false)

  const handleNavExpand = async () => {
    if (pagesLoaded) return
    try {
      const res = await api.get('/pages')
      setPages(res.data.data || [])
      setPagesLoaded(true)
    } catch { /* ignore */ }
  }

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    logout()
    navigate('/login')
  }

  const adminNav: NavItem[] = [
    { label: 'Users', to: '/admin/users' },
    { label: 'Groups', to: '/admin/groups' },
    { label: 'Pages', to: '/admin/pages' },
    { label: 'Audit Log', to: '/admin/audit' },
  ]

  const active = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/')

  return (
    <div style={S.shell}>
      <aside style={S.sidebar}>
        <div style={S.logo}>Yantra</div>
        <nav style={S.nav} onClick={handleNavExpand}>
          <div style={S.navSection}>Pages</div>
          {pages.length === 0 && pagesLoaded && (
            <span style={{ padding: '6px 16px', fontSize: 13, color: '#475569', display: 'block' }}>No pages yet</span>
          )}
          {pages.map((p) => (
            <Link key={p.id} to={`/pages/${p.id}`} style={S.link(active(`/pages/${p.id}`))}>
              {p.title}
            </Link>
          ))}

          {user?.workspace_role === 'Admin' && (
            <>
              <div style={{ ...S.navSection, marginTop: 12 }}>Admin</div>
              {adminNav.map((n) => (
                <Link key={n.to} to={n.to} style={S.link(active(n.to))}>
                  {n.label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div style={S.footer}>
          <div style={{ marginBottom: 4, color: '#e2e8f0', fontWeight: 500 }}>{user?.display_name}</div>
          <div style={{ fontSize: 11 }}>{user?.email}</div>
          <div style={{ fontSize: 11, marginTop: 2, color: '#475569' }}>{user?.workspace_role}</div>
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={S.header}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#1e293b' }}>
            {location.pathname === '/' ? 'Home' : ''}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link to="/profile" style={{ ...S.btn, textDecoration: 'none' }}>Profile</Link>
            <button style={S.btn} onClick={handleLogout}>Logout</button>
          </div>
        </header>
        <main style={S.main}>
          <div style={S.content}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
