import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AuthScreenLayout, Field } from '../components/AuthLayout'
import { authApi } from '../lib/api/auth'
import { ApiError } from '../lib/api/client'
import { useAuth } from '../lib/auth/AuthContext'

interface LoginLocationState {
  message?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { refetch } = useAuth()
  const setupMessage = (location.state as LoginLocationState | null)?.message
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email || !password) {
      setError('Enter your email and password.')
      return
    }

    setSubmitting(true)
    try {
      await authApi.login({ email, password })
      await refetch()
      navigate('/', { replace: true })
    } catch (err) {
      // The backend intentionally returns the same generic message whether
      // the email doesn't exist or the password is wrong — no
      // user-enumeration signal. Don't add a more specific message here.
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreenLayout>
      <h1>Sign in</h1>
      {setupMessage && <p className="success">{setupMessage}</p>}
      <form onSubmit={handleSubmit}>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthScreenLayout>
  )
}
