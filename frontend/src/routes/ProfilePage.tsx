import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Field } from '../components/AuthLayout'
import { authApi } from '../lib/api/auth'
import { ApiError } from '../lib/api/client'
import { useAuth } from '../lib/auth/AuthContext'

export function ProfilePage() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      setSuccess(true)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to update password.'),
  })

  function handleSubmit() {
    setError(null)
    setSuccess(false)
    if (!current) {
      setError('Enter your current password.')
      return
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setError("Passwords don't match.")
      return
    }
    mutation.mutate()
  }

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 style={{ marginBottom: 20 }}>Profile</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 15,
            }}
          >
            {initials(user?.display_name ?? '')}
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>{user?.display_name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {user?.email}
            </div>
          </div>
          <span className="tag" style={{ marginLeft: 'auto' }}>
            {user?.role}
          </span>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h4 style={{ margin: 0 }}>Change password</h4>
        <Field label="Current password">
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password">
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p className="error">{error}</p>}
        {success && <p className="success">Password updated.</p>}
        <button type="submit" style={{ alignSelf: 'flex-start' }} disabled={mutation.isPending} onClick={handleSubmit}>
          Update password
        </button>
      </div>
    </div>
  )
}

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
