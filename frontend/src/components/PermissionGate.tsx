import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth/AuthContext'

// Conditionally renders children based on the flattened permissions list
// GET /auth/me returns — never re-derives RBAC logic client-side (see
// AuthContext.can's doc comment).
export function PermissionGate({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(permission)) return null
  return <>{children}</>
}
