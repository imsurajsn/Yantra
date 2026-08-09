import { useEffect, useState } from 'react'
import api from '@/api/client'
import type { Group, GroupMember } from '@/types'

const S = {
  hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } as const,
  title: { fontSize: 20, fontWeight: 600, color: '#1e293b' } as const,
  btn: { padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  smBtn: { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569', marginRight: 4 } as const,
  dangerBtn: { padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#dc2626' } as const,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 } as const,
  card: { background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 20 } as const,
  cardTitle: { fontWeight: 600, fontSize: 15, marginBottom: 12, color: '#1e293b' } as const,
  memberRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 } as const,
  modal: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  mcard: { background: '#fff', borderRadius: 10, padding: 28, width: 400, maxWidth: '90vw' } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151', marginTop: 12 } as const,
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 } as const,
  select: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 } as const,
  row: { display: 'flex', gap: 8, marginTop: 16 } as const,
  save: { flex: 1, padding: '9px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  cancel: { flex: 1, padding: '9px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  err: { color: '#dc2626', fontSize: 13, marginTop: 8 } as const,
}

export default function AdminGroups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [memberForm, setMemberForm] = useState({ user_id: '', group_role: 'Group Member' })
  const [error, setError] = useState('')

  const loadGroups = async () => {
    const res = await api.get('/groups')
    setGroups(res.data.data)
  }
  const loadMembers = async (groupId: number) => {
    const res = await api.get(`/groups/${groupId}/members`)
    setMembers(res.data.data)
  }

  useEffect(() => { loadGroups() }, [])
  useEffect(() => { if (selectedGroup) loadMembers(selectedGroup.id) }, [selectedGroup])

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/groups', { name: newGroupName })
      setShowCreate(false)
      setNewGroupName('')
      loadGroups()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to create group')
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selectedGroup) return
    try {
      await api.post(`/groups/${selectedGroup.id}/members`, {
        user_id: Number(memberForm.user_id),
        group_role: memberForm.group_role,
      })
      setShowAddMember(false)
      loadMembers(selectedGroup.id)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to add member')
    }
  }

  const handleRemoveMember = async (userId: number) => {
    if (!selectedGroup) return
    await api.delete(`/groups/${selectedGroup.id}/members/${userId}`)
    loadMembers(selectedGroup.id)
  }

  const handleDeleteGroup = async (group: Group) => {
    if (!window.confirm(`Delete group "${group.name}"?`)) return
    await api.delete(`/groups/${group.id}`)
    if (selectedGroup?.id === group.id) setSelectedGroup(null)
    loadGroups()
  }

  return (
    <div>
      <div style={S.hdr}>
        <h2 style={S.title}>Groups</h2>
        <button style={S.btn} onClick={() => { setShowCreate(true); setError('') }}>+ New group</button>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Group list */}
        <div style={{ width: 260 }}>
          {groups.length === 0 && <p style={{ color: '#94a3b8', fontSize: 14 }}>No groups yet.</p>}
          {groups.map((g) => (
            <div key={g.id} style={{
              ...S.card,
              marginBottom: 8,
              cursor: 'pointer',
              borderColor: selectedGroup?.id === g.id ? '#3b82f6' : '#e2e8f0',
            }} onClick={() => setSelectedGroup(g)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{g.name}</span>
                <button style={S.dangerBtn} onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g) }}>Del</button>
              </div>
            </div>
          ))}
        </div>

        {/* Members panel */}
        {selectedGroup && (
          <div style={{ flex: 1, ...S.card }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={S.cardTitle}>{selectedGroup.name} — Members</h3>
              <button style={S.smBtn} onClick={() => { setShowAddMember(true); setError('') }}>+ Add member</button>
            </div>
            {members.length === 0 && <p style={{ fontSize: 13, color: '#94a3b8' }}>No members.</p>}
            {members.map((m) => (
              <div key={m.user_id} style={S.memberRow}>
                <div>
                  <span style={{ fontWeight: 500 }}>{m.display_name}</span>
                  <span style={{ color: '#64748b', marginLeft: 8 }}>{m.email}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>{m.group_role}</span>
                  <button style={S.dangerBtn} onClick={() => handleRemoveMember(m.user_id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div style={S.modal} onClick={() => setShowCreate(false)}>
          <div style={S.mcard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>New group</h3>
            {error && <p style={S.err}>{error}</p>}
            <form onSubmit={handleCreateGroup}>
              <label style={S.label}>Group name</label>
              <input style={S.input} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} required autoFocus />
              <div style={S.row}>
                <button style={S.cancel} type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button style={S.save} type="submit">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddMember && selectedGroup && (
        <div style={S.modal} onClick={() => setShowAddMember(false)}>
          <div style={S.mcard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Add member to {selectedGroup.name}</h3>
            {error && <p style={S.err}>{error}</p>}
            <form onSubmit={handleAddMember}>
              <label style={S.label}>User ID</label>
              <input style={S.input} type="number" value={memberForm.user_id}
                onChange={(e) => setMemberForm((f) => ({ ...f, user_id: e.target.value }))} required />
              <label style={S.label}>Group role</label>
              <select style={S.select} value={memberForm.group_role}
                onChange={(e) => setMemberForm((f) => ({ ...f, group_role: e.target.value }))}>
                <option value="Group Member">Group Member</option>
                <option value="Group Admin">Group Admin</option>
              </select>
              <div style={S.row}>
                <button style={S.cancel} type="button" onClick={() => setShowAddMember(false)}>Cancel</button>
                <button style={S.save} type="submit">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
