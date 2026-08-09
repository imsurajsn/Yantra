import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'

const S = {
  page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' } as const,
  card: { background: '#fff', borderRadius: 12, padding: 40, width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' } as const,
  title: { fontSize: 24, fontWeight: 700, marginBottom: 6, color: '#1e293b' } as const,
  sub: { fontSize: 14, color: '#64748b', marginBottom: 28 } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' } as const,
  input: { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none', marginBottom: 16 } as const,
  btn: { width: '100%', padding: '10px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 4 } as const,
  err: { color: '#dc2626', fontSize: 13, marginBottom: 12 } as const,
}

export default function Setup() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [form, setForm] = useState({ email: '', display_name: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/setup/status').then((res) => {
      if (res.data.setup_complete) navigate('/login', { replace: true })
      else setChecking(false)
    }).catch(() => setChecking(false))
  }, [navigate])

  if (checking) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirm) { setError('Passwords do not match'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      await api.post('/setup', {
        email: form.email,
        display_name: form.display_name,
        password: form.password,
      })
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div style={S.page}>
      <div style={S.card}>
        <h1 style={S.title}>Welcome to Yantra</h1>
        <p style={S.sub}>Create your admin account to get started.</p>
        {error && <p style={S.err}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <label style={S.label}>Full name</label>
          <input style={S.input} value={form.display_name} onChange={set('display_name')} required />
          <label style={S.label}>Email address</label>
          <input style={S.input} type="email" value={form.email} onChange={set('email')} required />
          <label style={S.label}>Password</label>
          <input style={S.input} type="password" value={form.password} onChange={set('password')} required minLength={8} />
          <label style={S.label}>Confirm password</label>
          <input style={S.input} type="password" value={form.confirm} onChange={set('confirm')} required />
          <button style={S.btn} type="submit" disabled={loading}>
            {loading ? 'Setting up…' : 'Create workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
