import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/store/auth'

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' } as const,
  card: { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' } as const,
  title: { fontSize: 22, fontWeight: 700, marginBottom: 6, color: '#1e293b' } as const,
  sub: { fontSize: 14, color: '#64748b', marginBottom: 28 } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' } as const,
  input: { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none', marginBottom: 16 } as const,
  btn: { width: '100%', padding: '10px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer' } as const,
  err: { color: '#dc2626', fontSize: 13, marginBottom: 12 } as const,
  ok: { color: '#16a34a', fontSize: 13, marginBottom: 12 } as const,
}

export default function ChangePassword() {
  const navigate = useNavigate()
  const { login, user, token } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')
    if (form.new_password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.new_password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      // Server issues a new token; update stored session
      if (res.data.token && user) {
        login(res.data.token, { ...user, must_change_password: false })
      }
      setOk('Password changed successfully.')
      setTimeout(() => navigate('/', { replace: true }), 1000)
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const isForced = user?.must_change_password

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>{isForced ? 'Set your password' : 'Change password'}</h1>
        <p style={S.sub}>
          {isForced
            ? 'Your account requires a password change before you can continue.'
            : 'Choose a new password for your account.'}
        </p>
        {error && <p style={S.err}>{error}</p>}
        {ok && <p style={S.ok}>{ok}</p>}
        <form onSubmit={handleSubmit}>
          <label style={S.label}>Current password</label>
          <input style={S.input} type="password" value={form.current_password} onChange={set('current_password')} required autoFocus />
          <label style={S.label}>New password</label>
          <input style={S.input} type="password" value={form.new_password} onChange={set('new_password')} required minLength={8} />
          <label style={S.label}>Confirm new password</label>
          <input style={S.input} type="password" value={form.confirm} onChange={set('confirm')} required />
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Change password'}
          </button>
        </form>
        {!isForced && token && (
          <p style={{ marginTop: 16, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
            <a href="/" style={{ color: '#3b82f6' }}>← Back</a>
          </p>
        )}
      </div>
    </div>
  )
}
