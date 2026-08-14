import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, useLocation } from 'react-router-dom'
import { authApi } from '../api/auth'

/**
 * Top of the route-guard order (plan §4): "setup_complete -> auth -> ...".
 * Applies to every route, not just protected ones — even /login must bounce
 * to /setup if no Admin exists yet (PRD: "on first launch ... all routes
 * redirect to /setup"), and /setup itself 404s server-side once an Admin
 * exists, so bounce away from it too.
 */
export function SetupGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { data, isLoading } = useQuery({
    queryKey: ['setup', 'status'],
    queryFn: authApi.setupStatus,
  })

  if (isLoading) {
    return null
  }

  if (!data?.setup_complete && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />
  }
  if (data?.setup_complete && location.pathname === '/setup') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
