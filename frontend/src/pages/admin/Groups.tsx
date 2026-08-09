import { useEffect, useState } from 'react'
import api from '@/api/client'
import type { Group, GroupMember, User } from '@/types'

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        {children}
      </div>
    </div>
  )
}

interface GroupState extends Group {
  members: GroupMember[]
  expanded: boolean
  addMemberUserId: string
}

export default function AdminGroups() {
  const [groups, setGroups] = useState<GroupState[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [error, setError] = useState('')

  const loadAll = async () => {
    const [gRes, uRes] = await Promise.all([api.get('/groups'), api.get('/admin/users')])
    const grps: Group[] = gRes.data.data || []
    setAllUsers(uRes.data.data || [])
    const withMembers = await Promise.all(grps.map(async g => {
      const mRes = await api.get(`/groups/${g.id}/members`)
      return { ...g, members: mRes.data.data || [], expanded: false, addMemberUserId: '' }
    }))
    setGroups(withMembers)
  }

  useEffect(() => { loadAll() }, [])

  const toggleExpand = (id: number) =>
    setGroups(gs => gs.map(g => g.id === id ? { ...g, expanded: !g.expanded } : g))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/groups', { name: newGroupName })
      setShowCreate(false); setNewGroupName('')
      loadAll()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to create group')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await api.delete(`/groups/${deleteTarget.id}`)
    setDeleteTarget(null); loadAll()
  }

  const handleAddMember = async (groupId: number, userId: string) => {
    if (!userId) return
    await api.post(`/groups/${groupId}/members`, { user_id: Number(userId), group_role: 'Group Member' })
    setGroups(gs => gs.map(g => g.id === groupId ? { ...g, addMemberUserId: '' } : g))
    loadAll()
  }

  const handleRemoveMember = async (groupId: number, userId: number) => {
    await api.delete(`/groups/${groupId}/members/${userId}`)
    loadAll()
  }

  const addableUsers = (g: GroupState) => {
    const memberIds = new Set(g.members.map(m => m.user_id))
    return allUsers.filter(u => !memberIds.has(u.id))
  }

  const adminName = (g: GroupState) => {
    const admin = g.members.find(m => m.group_role === 'Group Admin')
    return admin?.display_name || '—'
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
        <h2 style={{ margin: 0 }}>Groups</h2>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setShowCreate(true); setError('') }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New group
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-4)' }}>Members inherit page access granted to their groups.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {groups.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13 }}>No groups yet.</p>
        )}
        {groups.map(g => (
          <div key={g.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 'var(--space-3) var(--space-4)', cursor: 'pointer' }}
              onClick={() => toggleExpand(g.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transition: 'transform 0.15s', transform: g.expanded ? 'rotate(90deg)' : 'none' }}>
                <polyline points="9 6 15 12 9 18"/>
              </svg>
              <strong style={{ fontWeight: 500 }}>{g.name}</strong>
              <span className="text-muted" style={{ fontSize: 12.5 }}>admin: {adminName(g)}</span>
              <span className="tag tag-neutral" style={{ marginLeft: 'auto' }}>{g.members.length} member{g.members.length !== 1 ? 's' : ''}</span>
              <button className="btn btn-ghost" style={{ fontSize: 12 }}
                onClick={e => { e.stopPropagation(); setDeleteTarget(g) }}>Delete</button>
            </div>

            {/* Expanded body */}
            {g.expanded && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.members.length === 0 && (
                  <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>No members yet.</p>
                )}
                {g.members.map(m => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: 'var(--color-accent-800)', color: 'var(--color-accent-100)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, flexShrink: 0,
                    }}>{initials(m.display_name)}</div>
                    <span>{m.display_name}</span>
                    <span className="text-muted">{m.email}</span>
                    {m.group_role === 'Group Admin' && <span className="tag tag-outline">Group Admin</span>}
                    <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 12 }}
                      onClick={() => handleRemoveMember(g.id, m.user_id)}>Remove</button>
                  </div>
                ))}

                {/* Add member inline dropdown */}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <select className="input" style={{ flex: 1 }}
                    value={g.addMemberUserId}
                    onChange={e => setGroups(gs => gs.map(x => x.id === g.id ? { ...x, addMemberUserId: e.target.value } : x))}>
                    <option value="">Add a member…</option>
                    {addableUsers(g).map(u => <option key={u.id} value={u.id}>{u.display_name}</option>)}
                  </select>
                  <button className="btn btn-secondary" onClick={() => handleAddMember(g.id, g.addMemberUserId)}>Add</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showCreate && (
        <Dialog title="New group" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label>Group name</label>
              <input className="input" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Support Leads" required autoFocus />
            </div>
            <div className="dialog-body" style={{ fontSize: 12 }}>You'll be the Group Admin.</div>
            {error && <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13 }}>{error}</div>}
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create group</button>
            </div>
          </form>
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog title="Delete group" onClose={() => setDeleteTarget(null)}>
          <div className="dialog-body">
            Deleting <strong>{deleteTarget.name}</strong> removes all its page access entries. This can't be undone.
          </div>
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleDelete}>Delete</button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
