import { useEffect, useState } from 'react'
import api from '@/api/client'
import type { User } from '@/types'

function genPassword() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6).toUpperCase() + '!1'
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

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)
  const [form, setForm] = useState({ email: '', display_name: '', password: '', workspace_role: 'Member' })
  const [tempPassword, setTempPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = () => api.get('/admin/users').then(r => setUsers(r.data.data || []))
  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.post('/admin/users', form)
      setShowCreate(false)
      setForm({ email: '', display_name: '', password: '', workspace_role: 'Member' })
      load()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to create user')
    } finally { setLoading(false) }
  }

  const handleReset = async () => {
    if (!resetTarget) return
    setError(''); setLoading(true)
    try {
      await api.post(`/admin/users/${resetTarget.id}/reset-password`, { new_password: tempPassword })
      setResetTarget(null)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to reset password')
    } finally { setLoading(false) }
  }

  const handleToggleActive = async (u: User) => {
    await api.patch(`/admin/users/${u.id}/status`, { is_active: !u.is_active })
    setDeactivateTarget(null)
    load()
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => { setShowCreate(true); setError('') }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New user
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-4)' }}>{users.length} people in this workspace.</p>

      <div className="card elev-sm" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.display_name}</td>
                <td className="text-muted">{u.email}</td>
                <td>
                  <select className="input" style={{ minHeight: 30, padding: '3px 6px', width: 110 }}
                    value={u.workspace_role}
                    onChange={e => api.patch(`/admin/users/${u.id}/role`, { workspace_role: e.target.value }).then(load)}>
                    <option value="Admin">Admin</option>
                    <option value="Member">Member</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </td>
                <td className="text-muted">{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                <td>
                  <span className={u.is_active ? 'tag tag-accent' : 'tag tag-neutral'}>
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                  {u.must_change_password && u.is_active && (
                    <span className="tag tag-neutral" style={{ marginLeft: 6 }}>pending pw</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => { const pw = genPassword(); setTempPassword(pw); setResetTarget(u); setError('') }}>
                    Reset password
                  </button>{' '}
                  <button className="btn btn-ghost" style={{ fontSize: 12 }}
                    onClick={() => setDeactivateTarget(u)}>
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <Dialog title="New user" onClose={() => setShowCreate(false)}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} required autoFocus />
          </div>
          <div className="field">
            <label>Display name</label>
            <input className="input" value={form.display_name} onChange={set('display_name')} required />
          </div>
          <div className="field">
            <label>Initial password</label>
            <input className="input" value={form.password} onChange={set('password')} placeholder="Shared out-of-band with the user" required />
          </div>
          <div className="field">
            <label>Workspace role</label>
            <select className="input" value={form.workspace_role} onChange={set('workspace_role')}>
              <option value="Admin">Admin</option>
              <option value="Member">Member</option>
              <option value="Viewer">Viewer</option>
            </select>
          </div>
          <div className="dialog-body" style={{ fontSize: 12 }}>User will be forced to change this password on first login.</div>
          {error && <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13 }}>{error}</div>}
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={loading}>{loading ? 'Creating…' : 'Create user'}</button>
          </div>
        </Dialog>
      )}

      {resetTarget && (
        <Dialog title="Reset password" onClose={() => setResetTarget(null)}>
          <div className="dialog-body">
            A new temporary password will be set for <strong>{resetTarget.display_name}</strong>. They'll be forced to change it on next login.
          </div>
          <div className="field">
            <label>Temporary password</label>
            <input className="input" value={tempPassword} onChange={e => setTempPassword(e.target.value)} />
          </div>
          {error && <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13 }}>{error}</div>}
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => setResetTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleReset} disabled={loading}>{loading ? 'Setting…' : 'Set password'}</button>
          </div>
        </Dialog>
      )}

      {deactivateTarget && (
        <Dialog title={deactivateTarget.is_active ? 'Deactivate user' : 'Activate user'} onClose={() => setDeactivateTarget(null)}>
          <div className="dialog-body">
            {deactivateTarget.is_active
              ? `Deactivating ${deactivateTarget.display_name} will immediately invalidate their session. They will not be able to log in.`
              : `This will re-enable ${deactivateTarget.display_name}'s access to the workspace.`}
          </div>
          <div className="dialog-actions">
            <button className="btn btn-ghost" onClick={() => setDeactivateTarget(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={() => handleToggleActive(deactivateTarget)}>
              {deactivateTarget.is_active ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
