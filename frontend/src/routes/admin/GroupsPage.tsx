import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '../../components/Dialog'
import { Field } from '../../components/AuthLayout'
import { groupsApi, type Group } from '../../lib/api/groups'
import { usersApi } from '../../lib/api/users'
import { ApiError } from '../../lib/api/client'

export function GroupsPage() {
  const queryClient = useQueryClient()
  const { data: groups, isLoading, error } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const invalidateGroups = () => queryClient.invalidateQueries({ queryKey: ['groups'] })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => groupsApi.remove(id),
    onSuccess: () => {
      invalidateGroups()
      setDeleteTarget(null)
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Failed to delete group.'),
  })

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Groups</h1>
        <button style={{ marginLeft: 'auto' }} onClick={() => setNewGroupOpen(true)}>
          New group
        </button>
      </div>
      <p className="muted">Members inherit page access granted to their groups.</p>
      {actionError && <p className="error">{actionError}</p>}
      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error">Failed to load groups.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {groups?.map((g) => (
          <GroupRow
            key={g.id}
            group={g}
            expanded={expandedId === g.id}
            onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)}
            onDelete={() => {
              setActionError(null)
              setDeleteTarget(g)
            }}
          />
        ))}
      </div>

      {newGroupOpen && <NewGroupDialog onClose={() => setNewGroupOpen(false)} onCreated={invalidateGroups} />}

      {deleteTarget && (
        <Dialog
          title="Delete group"
          onClose={() => setDeleteTarget(null)}
          actions={
            <>
              <button onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="submit" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteTarget.id)}>
                Delete
              </button>
            </>
          }
        >
          <p>
            Deleting <strong>{deleteTarget.name}</strong> removes all its page access entries. This can't be undone.
          </p>
        </Dialog>
      )}
    </div>
  )
}

function GroupRow({
  group,
  expanded,
  onToggle,
  onDelete,
}: {
  group: Group
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const queryClient = useQueryClient()
  const { data: detail } = useQuery({
    queryKey: ['groups', group.id],
    queryFn: () => groupsApi.get(group.id),
    enabled: expanded,
  })
  const { data: allUsers } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: expanded })
  const [addUserId, setAddUserId] = useState('')
  const [rowError, setRowError] = useState<string | null>(null)

  const invalidateDetail = () => queryClient.invalidateQueries({ queryKey: ['groups', group.id] })

  const addMemberMutation = useMutation({
    mutationFn: (userId: number) => groupsApi.addMember(group.id, userId),
    onSuccess: () => {
      invalidateDetail()
      setAddUserId('')
    },
    onError: (err) => setRowError(err instanceof ApiError ? err.message : 'Failed to add member.'),
  })

  const removeMemberMutation = useMutation({
    mutationFn: (userId: number) => groupsApi.removeMember(group.id, userId),
    onSuccess: invalidateDetail,
    onError: (err) => setRowError(err instanceof ApiError ? err.message : 'Failed to remove member.'),
  })

  const memberIds = new Set((detail?.members ?? []).map((m) => m.user_id))
  const addableUsers = (allUsers ?? []).filter((u) => !memberIds.has(u.id))

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer' }}
        onClick={onToggle}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.1s' }}>›</span>
        <strong style={{ fontWeight: 500 }}>{group.name}</strong>
        <span className="tag" style={{ marginLeft: 'auto' }}>
          {detail ? `${detail.members.length} member${detail.members.length === 1 ? '' : 's'}` : ''}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          Delete
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rowError && <p className="error">{rowError}</p>}
          {detail?.members.map((m) => (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                }}
              >
                {initials(m.name)}
              </span>
              {m.name}
              <span className="muted">{m.email}</span>
              {m.role_key === 'group_admin' && <span className="tag">Group Admin</span>}
              {m.role_key !== 'group_admin' && (
                <button
                  style={{ marginLeft: 'auto', fontSize: 12 }}
                  onClick={() => removeMemberMutation.mutate(m.user_id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {detail?.members.length === 0 && <p className="muted">No members yet.</p>}

          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)} style={{ flex: 1 }}>
              <option value="">Add a member…</option>
              {addableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </select>
            <button
              disabled={!addUserId || addMemberMutation.isPending}
              onClick={() => {
                setRowError(null)
                addMemberMutation.mutate(Number(addUserId))
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function NewGroupDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => groupsApi.create(name),
    onSuccess: () => {
      onCreated()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create group.'),
  })

  return (
    <Dialog
      title="New group"
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button
            type="submit"
            disabled={!name || createMutation.isPending}
            onClick={() => {
              setError(null)
              createMutation.mutate()
            }}
          >
            Create group
          </button>
        </>
      }
    >
      <Field label="Group name">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Support Leads" />
      </Field>
      {error && <p className="error">{error}</p>}
      <p className="muted" style={{ fontSize: 12 }}>
        You'll be the Group Admin.
      </p>
    </Dialog>
  )
}
