import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/store/auth'
import type { Page } from '@/types'

interface PageGroup { name: string; pages: Page[] }
interface Stats { pages: number; users: number; events: number }

export default function Home() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState<PageGroup[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const isAdmin = user?.workspace_role === 'Admin'

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

      if (isAdmin) {
        Promise.all([
          api.get('/admin/users'),
          api.get('/admin/audit?page=1&page_size=1'),
        ]).then(([uRes, aRes]) => {
          setStats({ pages: pages.length, users: uRes.data.total || 0, events: aRes.data.total || 0 })
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [isAdmin])

  const greeting = () => {
    const h = new Date().getHours()
    const prefix = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
    return `${prefix}, ${user?.display_name?.split(' ')[0]}.`
  }

  const roleLabel = (p: Page) => {
    if (!p.page_role) return user?.workspace_role === 'Admin' ? 'Owner' : 'Viewer'
    return p.page_role
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{greeting()}</h1>
          <p className="text-muted" style={{ fontSize: 13.5 }}>Here's what you have access to.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => navigate('/admin/pages/new')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New page
          </button>
        )}
      </div>

      {isAdmin && stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          <div className="card">
            <div className="card-kicker">Active pages</div>
            <div className="card-title" style={{ fontSize: 26 }}>{stats.pages}</div>
          </div>
          <div className="card">
            <div className="card-kicker">Team members</div>
            <div className="card-title" style={{ fontSize: 26 }}>{stats.users}</div>
          </div>
          <div className="card">
            <div className="card-kicker">Events total</div>
            <div className="card-title" style={{ fontSize: 26 }}>{stats.events.toLocaleString()}</div>
          </div>
        </div>
      )}

      {groups.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-muted)' }}>
          <p style={{ fontSize: 15 }}>No pages yet.</p>
          {isAdmin && (
            <button className="btn btn-primary" style={{ marginTop: 'var(--space-3)' }} onClick={() => navigate('/admin/pages/new')}>Create your first page</button>
          )}
        </div>
      )}

      {groups.map(g => (
        <div key={g.name} style={{ marginBottom: 'var(--space-6)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)' }}>{g.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)' }}>
            {g.pages.map(p => (
              <div key={p.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/pages/${p.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="card-kicker" style={{ margin: 0 }}>{p.page_type === 'form' ? 'Form' : 'Data Table'}</div>
                  <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>{roleLabel(p)}</span>
                </div>
                <div className="card-title">{p.title}</div>
                {p.description && <p className="card-body">{p.description}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
