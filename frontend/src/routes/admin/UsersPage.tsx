import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '../../components/Dialog'
import { Field } from '../../components/AuthLayout'
import { usersApi } from '../../lib/api/users'
import { ApiError } from '../../lib/api/client'
import type { User } from '../../lib/api/auth'

const WORKSPACE_ROLES = ['admin', 'member', 'viewer'] as const

function randomTempPassword() {
  return 'Temp' + Math.floor(1000 + Math.random() * 9000) + '!'
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const { data: users, isLoading, error } = useQuery({ queryKey: ['users'], queryFn: usersApi.list })

  const [newUserOpen, setNewUserOpen] = useState(false)
  const [resetPasswordFor, setResetPasswordFor] = useState<User | null>(null)
  const [tempPasswordResult, setTempPasswordResult] = useState<string | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users'] })

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, roleKey }: { id: number; roleKey: string }) => usersApi.changeRole(id, roleKey),
    onSuccess: invalidateUsers,
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Failed to change role.'),
  })

  const deactivateMutation = useMutation({
    mutationFn: (user: User) => (user.is_active ? usersApi.deactivate(user.id) : usersApi.reactivate(user.id)),
    onSuccess: () => {
      invalidateUsers()
      setDeactivateTarget(null)
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Failed to update user status.'),
  })

  const resetPasswordMutation = useMutation({
    mutationFn: (user: User) => usersApi.resetPassword(user.id),
    onSuccess: (result) => {
      invalidateUsers()
      setTempPasswordResult(result.temp_password)
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Failed to reset password.'),
  })

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>Users</h1>
        <button style={{ marginLeft: 'auto' }} onClick={() => setNewUserOpen(true)}>
          New user
        </button>
      </div>
      <p className="muted">{users?.length ?? 0} people in this workspace.</p>
      {actionError && <p className="error">{actionError}</p>}

      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error">Failed to load users.</p>}

      {users && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Last login</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td>{u.display_name}</Td>
                  <Td className="muted">{u.email}</Td>
                  <Td>
                    <select
                      value={u.role}
                      disabled={changeRoleMutation.isPending}
                      onChange={(e) => {
                        setActionError(null)
                        changeRoleMutation.mutate({ id: u.id, roleKey: e.target.value })
                      }}
                    >
                      {WORKSPACE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td className="muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}</Td>
                  <Td>
                    <span className={u.is_active ? 'tag' : 'tag error'}>
                      {u.is_active ? (u.must_change_password ? 'Pending' : 'Active') : 'Disabled'}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => {
                          setActionError(null)
                          setResetPasswordFor(u)
                        }}
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => {
                          setActionError(null)
                          setDeactivateTarget(u)
                        }}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {newUserOpen && <NewUserDialog onClose={() => setNewUserOpen(false)} onCreated={invalidateUsers} />}

      {resetPasswordFor && !tempPasswordResult && (
        <Dialog
          title="Reset password"
          onClose={() => setResetPasswordFor(null)}
          actions={
            <>
              <button onClick={() => setResetPasswordFor(null)}>Cancel</button>
              <button
                type="submit"
                disabled={resetPasswordMutation.isPending}
                onClick={() => resetPasswordMutation.mutate(resetPasswordFor)}
              >
                Set password
              </button>
            </>
          }
        >
          <p>
            A new temporary password will be set for <strong>{resetPasswordFor.display_name}</strong>. They'll be
            forced to change it on next login.
          </p>
        </Dialog>
      )}

      {resetPasswordFor && tempPasswordResult && (
        <Dialog
          title="Temporary password"
          onClose={() => {
            setResetPasswordFor(null)
            setTempPasswordResult(null)
          }}
          actions={
            <button
              onClick={() => {
                setResetPasswordFor(null)
                setTempPasswordResult(null)
              }}
            >
              Done
            </button>
          }
        >
          <p className="muted">Share this with {resetPasswordFor.display_name} out-of-band. It won't be shown again.</p>
          <Field label="Temporary password">
            <input readOnly value={tempPasswordResult} onFocus={(e) => e.target.select()} />
          </Field>
        </Dialog>
      )}

      {deactivateTarget && (
        <Dialog
          title={deactivateTarget.is_active ? 'Deactivate user' : 'Activate user'}
          onClose={() => setDeactivateTarget(null)}
          actions={
            <>
              <button onClick={() => setDeactivateTarget(null)}>Cancel</button>
              <button
                type="submit"
                disabled={deactivateMutation.isPending}
                onClick={() => deactivateMutation.mutate(deactivateTarget)}
              >
                Confirm
              </button>
            </>
          }
        >
          <p>
            {deactivateTarget.is_active ? 'Deactivate' : 'Activate'} <strong>{deactivateTarget.display_name}</strong> (
            {deactivateTarget.email})?
          </p>
        </Dialog>
      )}
    </div>
  )
}

function NewUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState(randomTempPassword)
  const [roleKey, setRoleKey] = useState<string>('member')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => usersApi.create({ email, display_name: displayName, password, role_key: roleKey }),
    onSuccess: () => {
      onCreated()
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create user.'),
  })

  return (
    <Dialog
      title="New user"
      onClose={onClose}
      actions={
        <>
          <button onClick={onClose}>Cancel</button>
          <button
            type="submit"
            disabled={!email || !displayName || createMutation.isPending}
            onClick={() => {
              setError(null)
              createMutation.mutate()
            }}
          >
            Create user
          </button>
        </>
      }
    >
      <Field label="Email">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Display name">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </Field>
      <Field label="Initial password">
        <input value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Workspace role">
        <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
          {WORKSPACE_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      {error && <p className="error">{error}</p>}
      <p className="muted" style={{ fontSize: 12 }}>
        User will be forced to change this password on first login.
      </p>
    </Dialog>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500 }}>{children}</th>
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={className} style={{ padding: '10px 16px', fontSize: 13 }}>
      {children}
    </td>
  )
}
