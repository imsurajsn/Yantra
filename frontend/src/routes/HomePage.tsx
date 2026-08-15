import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dialog } from '../components/Dialog'
import { PermissionGate } from '../components/PermissionGate'
import { pagesApi } from '../lib/api/pages'
import { groupsApi } from '../lib/api/groups'
import { usersApi } from '../lib/api/users'
import { auditApi } from '../lib/api/audit'
import { useAuth } from '../lib/auth/AuthContext'

export function HomePage() {
  const { user, can } = useAuth()
  const navigate = useNavigate()
  const [newPageOpen, setNewPageOpen] = useState(false)

  const { data: pages, isLoading, error } = useQuery({ queryKey: ['pages'], queryFn: pagesApi.list })
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  const groupsById = new Map((groups ?? []).map((g) => [g.id, g.name]))
  const pagesByGroup = new Map<number, typeof pages>()
  for (const p of pages ?? []) {
    const list = pagesByGroup.get(p.page_group_id) ?? []
    list.push(p)
    pagesByGroup.set(p.page_group_id, list)
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Welcome back, {user?.display_name}</h1>
          <p className="muted">Here's what you have access to.</p>
        </div>
        <PermissionGate permission="workspace.pages.create">
          <button style={{ marginLeft: 'auto' }} onClick={() => setNewPageOpen(true)}>
            + New page
          </button>
        </PermissionGate>
      </div>

      {can('workspace.audit.view') && <HomeStats pageCount={pages?.length ?? 0} />}

      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error">Failed to load pages.</p>}

      {pagesByGroup.size === 0 && pages && (
        <p className="muted">No pages yet. {groups?.length ? 'Create one to get started.' : 'Create a group first, then a page.'}</p>
      )}

      {[...pagesByGroup.entries()].map(([groupId, groupPages]) => (
        <div key={groupId} style={{ marginBottom: 32 }}>
          <h3 style={{ marginBottom: 12 }}>{groupsById.get(groupId) ?? `Group ${groupId}`}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {groupPages?.map((p) => (
              <div key={p.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/pages/${p.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>
                    {p.type === 'table' ? 'Data Table' : 'Form'}
                  </span>
                  <span className="tag" style={{ marginLeft: 'auto' }}>
                    {p.effective_role}
                  </span>
                </div>
                <div style={{ fontWeight: 500, marginTop: 4 }}>{p.name}</div>
                {p.description && (
                  <p className="muted" style={{ fontSize: 12.5, marginTop: 4, marginBottom: 0 }}>
                    {p.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {newPageOpen && (
        <Dialog
          title="New page"
          onClose={() => setNewPageOpen(false)}
          actions={<button onClick={() => setNewPageOpen(false)}>Cancel</button>}
        >
          <p className="muted" style={{ fontSize: 13 }}>
            Choose the page type. Both are config-driven via YAML — no visual builder in V1.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={{ flex: 1 }} onClick={() => navigate('/pages/new/table')}>
              Data Table Page
            </button>
            <button style={{ flex: 1 }} onClick={() => navigate('/pages/new/form')}>
              Form Page
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}

// Admin-only stat row (matches the mockup's `showHomeStats: persona ===
// 'admin'`) — gated on workspace.audit.view as the closest existing
// "is this an Admin" permission signal, since Admin holds every workspace
// permission and Member/Viewer hold none of them.
function HomeStats({ pageCount }: { pageCount: number }) {
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })
  const { data: todayEvents } = useQuery({
    queryKey: ['audit-log', 'today'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const result = await auditApi.list({ from: today })
      return result.total
    },
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
      <StatCard label="Active pages" value={pageCount} />
      <StatCard label="Team members" value={users?.length ?? '—'} />
      <StatCard label="Events today" value={todayEvents ?? '—'} />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 26, marginTop: 4 }}>{value}</div>
    </div>
  )
}
