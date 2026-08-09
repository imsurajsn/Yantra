import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/store/auth'

export default function Setup() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [checking, setChecking] = useState(true)
  const [form, setForm] = useState({ display_name: '', email: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/setup/status').then(res => {
      if (res.data.setup_complete) navigate('/login', { replace: true })
      else setChecking(false)
    }).catch(() => setChecking(false))
  }, [navigate])

  if (checking) return null

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('Passwords do not match.'); return }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setError(''); setLoading(true)
    try {
      const res = await api.post('/setup', {
        display_name: form.display_name,
        email: form.email,
        password: form.password,
      })
      login(res.data.token, res.data.user)
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Setup failed.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card elev-md" style={{ width: 'min(440px, 100%)', padding: 'var(--space-8)', display: 'flex', flexDirection: 'column' }}>
        <div className="tag tag-outline" style={{ alignSelf: 'flex-start' }}>FIRST-RUN SETUP</div>
        <h2 style={{ marginTop: 'var(--space-3)' }}>Create the admin account</h2>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 'var(--space-4)' }}>
          This is a one-time step. Once an Admin exists, this screen disables itself.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div className="field">
            <label>Display name</label>
            <input className="input" value={form.display_name} onChange={set('display_name')} placeholder="Suraj Iyer" required />
          </div>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@company.com" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="Minimum 8 characters" required />
          </div>
          <div className="field" style={{ marginBottom: 'var(--space-1)' }}>
            <label>Confirm password</label>
            <input className="input" type="password" value={form.confirm} onChange={set('confirm')} required />
          </div>
          {error && (
            <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 17H3z"/><line x1="12" y1="9" x2="12" y2="14"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/></svg>
              {error}
            </div>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create admin account & continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
