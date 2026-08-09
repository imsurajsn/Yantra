import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/store/auth'
import type { User } from '@/types'

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' } as const,
  card: { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' } as const,
  title: { fontSize: 24, fontWeight: 700, marginBottom: 6, color: '#1e293b' } as const,
  sub: { fontSize: 14, color: '#64748b', marginBottom: 28 } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' } as const,
  input: { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none', marginBottom: 16 } as const,
  btn: { width: '100%', padding: '10px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer' } as const,
  err: { color: '#dc2626', fontSize: 13, marginBottom: 12 } as const,
}

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/login', form)
      login(res.data.token, res.data.user as User)
      if (res.data.must_change_password) {
        navigate('/change-password', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>Sign in to Yantra</h1>
        <p style={S.sub}>Enter your credentials to continue.</p>
        {error && <p style={S.err}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <label style={S.label}>Email address</label>
          <input style={S.input} type="email" value={form.email} onChange={set('email')} required autoFocus />
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" value={form.password} onChange={set('password')} required />
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
