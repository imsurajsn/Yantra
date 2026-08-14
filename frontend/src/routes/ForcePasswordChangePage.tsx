import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthScreenLayout, Field } from '../components/AuthLayout'
import { authApi } from '../lib/api/auth'
import { ApiError } from '../lib/api/client'
import { useAuth } from '../lib/auth/AuthContext'

// Shown when GET /auth/me reports must_change_password=true. Blocks every
// other route until a new password is set — the admin-issued temporary
// password must never remain valid past first login (PRD requirement 6).
export function ForcePasswordChangePage() {
  const navigate = useNavigate()
  const { user, refetch } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

    setSubmitting(true)
    try {
      await authApi.setFirstLoginPassword({ new_password: newPassword })
      await refetch()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthScreenLayout>
      <p className="tag">FIRST LOGIN</p>
      <h1>Set a new password</h1>
      <p className="muted">
        For your security, {user?.display_name ?? 'you'} must replace the temporary password before continuing.
      </p>
      <form onSubmit={handleSubmit}>
        <Field label="New password">
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
        </Field>
        <Field label="Confirm new password">
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </Field>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Set password & continue'}
        </button>
      </form>
    </AuthScreenLayout>
  )
}
