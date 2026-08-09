import { useState } from 'react'
import api from '@/api/client'
import { useAuth } from '@/store/auth'

const S = {
  section: { background: '#fff', borderRadius: 8, padding: 24, maxWidth: 480, border: '1px solid #e2e8f0' } as const,
  title: { fontSize: 18, fontWeight: 600, marginBottom: 4, color: '#1e293b' } as const,
  sub: { fontSize: 13, color: '#64748b', marginBottom: 24 } as const,
  row: { marginBottom: 16 } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' } as const,
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 } as const,
  btn: { padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer' } as const,
  err: { color: '#dc2626', fontSize: 13, marginBottom: 10 } as const,
  ok: { color: '#16a34a', fontSize: 13, marginBottom: 10 } as const,
  meta: { fontSize: 13, color: '#64748b', marginBottom: 6 } as const,
}

export default function Profile() {
  const { user, login } = useAuth()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')
    if (form.new_password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.new_password.length < 8) { setError('New password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await api.post('/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      if (res.data.token && user) {
        login(res.data.token, { ...user, must_change_password: false })
      }
      setOk('Password updated.')
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 20, color: '#1e293b' }}>Profile</h2>

      <div style={{ ...S.section, marginBottom: 20 }}>
        <h3 style={S.title}>Account info</h3>
        <p style={S.sub}>Your workspace account details.</p>
        <p style={S.meta}><strong>Name:</strong> {user?.display_name}</p>
        <p style={S.meta}><strong>Email:</strong> {user?.email}</p>
        <p style={S.meta}><strong>Role:</strong> {user?.workspace_role}</p>
      </div>

      <div style={S.section}>
        <h3 style={S.title}>Change password</h3>
        <p style={S.sub}>Update your password. You will be issued a new session token.</p>
        {error && <p style={S.err}>{error}</p>}
        {ok && <p style={S.ok}>{ok}</p>}
        <form onSubmit={handleSubmit}>
          <div style={S.row}>
            <label style={S.label}>Current password</label>
            <input style={S.input} type="password" value={form.current_password} onChange={set('current_password')} required />
          </div>
          <div style={S.row}>
            <label style={S.label}>New password</label>
            <input style={S.input} type="password" value={form.new_password} onChange={set('new_password')} required minLength={8} />
          </div>
          <div style={{ ...S.row, marginBottom: 20 }}>
            <label style={S.label}>Confirm new password</label>
            <input style={S.input} type="password" value={form.confirm} onChange={set('confirm')} required />
          </div>
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
