import { useState } from 'react'
import api from '@/api/client'
import { useAuth } from '@/store/auth'

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function Profile() {
  const { user, login } = useAuth()
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirm) { setError('Passwords do not match.'); return }
    setError(''); setSuccess(false); setLoading(true)
    try {
      const res = await api.post('/auth/change-password', { current_password: current, new_password: newPw })
      if (res.data.token && user) login(res.data.token, { ...user, must_change_password: false })
      setSuccess(true)
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to update password.')
    } finally { setLoading(false) }
  }

  if (!user) return null

  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ marginBottom: 'var(--space-4)' }}>Profile</h2>

      <div className="card" style={{ padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'var(--color-accent-800)', color: 'var(--color-accent-100)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 600, flexShrink: 0,
          }}>{initials(user.display_name)}</div>
          <div>
            <div style={{ fontWeight: 500 }}>{user.display_name}</div>
            <div className="text-muted" style={{ fontSize: 12.5 }}>{user.email}</div>
          </div>
          <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>{user.workspace_role}</span>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-6)' }}>
        <h4 style={{ margin: '0 0 var(--space-4)' }}>Change password</h4>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="field">
            <label>Current password</label>
            <input className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label>New password</label>
            <input className="input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && (
            <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13 }}>{error}</div>
          )}
          {success && (
            <div style={{ background: 'var(--color-accent-900)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13, color: 'var(--color-accent-200)' }}>Password updated.</div>
          )}
          <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-start' }} disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
