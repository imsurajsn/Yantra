import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

/**
 * Route guard order (per plan §4):
 *   setup_complete -> authenticated -> must_change_password -> permission gate.
 * Setup-completeness is checked one level up, in App.tsx's top-level
 * routing (it applies to every route, not just "protected" ones). This
 * component only handles the auth + forced-password-change steps.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return null
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace />
  }
  if (user?.must_change_password) {
    return <Navigate to="/force-password-change" replace />
  }
  return <>{children}</>
}
