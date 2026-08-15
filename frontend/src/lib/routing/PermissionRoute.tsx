import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { NotAuthorizedPage } from '../../routes/NotAuthorizedPage'

// Full-page permission gate for routes (vs. PermissionGate, which hides a
// UI fragment). Nav links are already hidden via PermissionGate, but a user
// can still type the URL directly — this is the backstop, matching the
// mockup's "Not Authorized" screen rather than a blank page.
export function PermissionRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(permission)) {
    return <NotAuthorizedPage />
  }
  return <>{children}</>
}
