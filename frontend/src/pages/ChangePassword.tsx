import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/store/auth'

export default function ChangePassword() {
  const navigate = useNavigate()
  const { login, user } = useAuth()
  const forced = user?.must_change_password ?? false

  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPw !== confirm) { setError('Passwords do not match.'); return }
    if (newPw.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError(''); setLoading(true)
    try {
      const res = await api.post('/auth/change-password', {
        current_password: forced ? '' : current,
        new_password: newPw,
      })
      if (res.data.token && user) login(res.data.token, { ...user, must_change_password: false })
      navigate('/', { replace: true })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to change password.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card elev-md" style={{ width: 'min(420px, 100%)', padding: 'var(--space-8)', display: 'flex', flexDirection: 'column' }}>
        {forced && (
          <div className="tag tag-outline" style={{ alignSelf: 'flex-start', marginBottom: 'var(--space-3)' }}>FIRST LOGIN</div>
        )}
        <h2>Set a new password</h2>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 'var(--space-4)' }}>
          {forced
            ? 'For your security, replace the temporary password before continuing.'
            : 'Choose a strong password for your account.'}
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {!forced && (
            <div className="field">
              <label>Current password</label>
              <input className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} required />
            </div>
          )}
          <div className="field">
            <label>New password</label>
            <input className="input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Minimum 8 characters" required />
          </div>
          <div className="field" style={{ marginBottom: 'var(--space-1)' }}>
            <label>Confirm new password</label>
            <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && (
            <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13 }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'Setting…' : 'Set password & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
