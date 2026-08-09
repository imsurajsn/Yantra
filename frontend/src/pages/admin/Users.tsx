import { useEffect, useState } from 'react'
import api from '@/api/client'
import type { User } from '@/types'

const S = {
  hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } as const,
  title: { fontSize: 20, fontWeight: 600, color: '#1e293b' } as const,
  btn: { padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  tableWrap: { background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflowX: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' as const, fontWeight: 600, color: '#374151' },
  td: { padding: '10px 16px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' },
  badge: (active: boolean) => ({ padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: active ? '#dcfce7' : '#fee2e2', color: active ? '#15803d' : '#dc2626' }),
  modal: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  mcard: { background: '#fff', borderRadius: 10, padding: 32, width: 420, maxWidth: '90vw' } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151', marginTop: 12 } as const,
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 } as const,
  select: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 } as const,
  row: { display: 'flex', gap: 8, marginTop: 20 } as const,
  save: { flex: 1, padding: '9px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  cancel: { flex: 1, padding: '9px 0', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  err: { color: '#dc2626', fontSize: 13, marginTop: 8 } as const,
  smBtn: { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569', marginRight: 4 } as const,
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showReset, setShowReset] = useState<User | null>(null)
  const [form, setForm] = useState({ email: '', display_name: '', password: '', workspace_role: 'Viewer' })
  const [resetPw, setResetPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const load = async () => {
    const res = await api.get('/admin/users')
    setUsers(res.data.data)
  }
  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/admin/users', form)
      setShowCreate(false)
      setForm({ email: '', display_name: '', password: '', workspace_role: 'Viewer' })
      load()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  const handleRoleChange = async (user: User, role: string) => {
    await api.patch(`/admin/users/${user.id}/role`, { workspace_role: role })
    load()
  }

  const handleToggleActive = async (user: User) => {
    await api.patch(`/admin/users/${user.id}/status`, { is_active: !user.is_active })
    load()
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showReset) return
    setError('')
    setLoading(true)
    try {
      await api.post(`/admin/users/${showReset.id}/reset-password`, { new_password: resetPw })
      setShowReset(null)
      setResetPw('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <div style={S.hdr}>
        <h2 style={S.title}>Users</h2>
        <button style={S.btn} onClick={() => setShowCreate(true)}>+ Invite user</button>
      </div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Status', 'Last login', 'Actions'].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={S.td}>{u.display_name}</td>
                <td style={S.td}>{u.email}</td>
                <td style={S.td}>
                  <select value={u.workspace_role} style={{ ...S.select, marginBottom: 0, padding: '4px 8px', width: 'auto' }}
                    onChange={(e) => handleRoleChange(u, e.target.value)}>
                    {['Admin', 'Member', 'Viewer'].map((r) => <option key={r}>{r}</option>)}
                  </select>
                </td>
                <td style={S.td}>
                  <span style={S.badge(u.is_active)}>{u.is_active ? 'Active' : 'Disabled'}</span>
                  {u.must_change_password && u.is_active && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: '#d97706' }}>pending pw</span>
                  )}
                </td>
                <td style={S.td}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                <td style={S.td}>
                  <button style={S.smBtn} onClick={() => { setShowReset(u); setError('') }}>Reset pw</button>
                  <button style={S.smBtn} onClick={() => handleToggleActive(u)}>
                    {u.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div style={S.modal} onClick={() => setShowCreate(false)}>
          <div style={S.mcard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Invite user</h3>
            {error && <p style={S.err}>{error}</p>}
            <form onSubmit={handleCreate}>
              <label style={S.label}>Full name</label>
              <input style={S.input} value={form.display_name} onChange={set('display_name')} required />
              <label style={S.label}>Email</label>
              <input style={S.input} type="email" value={form.email} onChange={set('email')} required />
              <label style={S.label}>Temporary password</label>
              <input style={S.input} type="password" value={form.password} onChange={set('password')} required minLength={8} />
              <label style={S.label}>Workspace role</label>
              <select style={S.select} value={form.workspace_role} onChange={set('workspace_role')}>
                {['Admin', 'Member', 'Viewer'].map((r) => <option key={r}>{r}</option>)}
              </select>
              <div style={S.row}>
                <button style={S.cancel} type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button style={S.save} type="submit" disabled={loading}>{loading ? 'Creating…' : 'Create user'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReset && (
        <div style={S.modal} onClick={() => setShowReset(null)}>
          <div style={S.mcard} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontWeight: 600, marginBottom: 4 }}>Reset password for {showReset.email}</h3>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
              The user will be required to change their password on next login.
            </p>
            {error && <p style={S.err}>{error}</p>}
            <form onSubmit={handleReset}>
              <label style={S.label}>New temporary password</label>
              <input style={S.input} type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} required minLength={8} />
              <div style={S.row}>
                <button style={S.cancel} type="button" onClick={() => setShowReset(null)}>Cancel</button>
                <button style={S.save} type="submit" disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
