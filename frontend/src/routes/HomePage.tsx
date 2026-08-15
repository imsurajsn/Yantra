import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Dialog } from '../components/Dialog'
import { PermissionGate } from '../components/PermissionGate'
import { pagesApi } from '../lib/api/pages'
import { groupsApi } from '../lib/api/groups'
import { useAuth } from '../lib/auth/AuthContext'

export function HomePage() {
  const { user } = useAuth()
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
                <div className="card-kicker" style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>
                  {p.type === 'table' ? 'Data Table' : 'Form'}
                </div>
                <div style={{ fontWeight: 500, marginTop: 4 }}>{p.name}</div>
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
