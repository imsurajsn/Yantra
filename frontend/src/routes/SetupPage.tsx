import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AuthScreenLayout, Field } from '../components/AuthLayout'
import { authApi } from '../lib/api/auth'
import { ApiError } from '../lib/api/client'

export function SetupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!displayName || !email || !password) {
      setError('All fields are required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

    setSubmitting(true)
    try {
      await authApi.submitSetup({ email, display_name: displayName, password })
      // Write the known-fresh value directly into the cache rather than
      // just navigating and hoping SetupGate's query refetches in time —
      // it doesn't: SetupGate already has `{setup_complete: false}` cached
      // from before this call, isLoading is false (cached data exists), so
      // it renders on the STALE value immediately and bounces back to
      // /setup before the background refetch resolves. Only a manual
      // full-page reload (which clears the cache) used to work around it.
      queryClient.setQueryData(['setup', 'status'], { setup_complete: true })
      // Setup does NOT sign the new Admin in (PRD requirement 2 and the
      // mockup both send the user to /login, not straight into the app).
      navigate('/login', {
        replace: true,
        state: { message: 'Admin account created — sign in to continue.' },
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreenLayout>
      <p className="tag">FIRST-RUN SETUP</p>
      <h1>Create the admin account</h1>
      <p className="muted">This is a one-time step. Once an Admin exists, this screen disables itself.</p>
      <form onSubmit={handleSubmit}>
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
        </Field>
        <Field label="Confirm password">
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </Field>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create admin account & continue'}
        </button>
      </form>
    </AuthScreenLayout>
  )
}
