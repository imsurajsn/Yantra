import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/store/auth'

export function ProtectedRoute() {
  const { token, user } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (user?.must_change_password) return <Navigate to="/change-password" replace />
  return <Outlet />
}

export function AdminRoute() {
  const { token, user } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (user?.must_change_password) return <Navigate to="/change-password" replace />
  if (user?.workspace_role !== 'Admin') return <Navigate to="/" replace />
  return <Outlet />
}

export function PublicOnlyRoute() {
  const { token } = useAuth()
  if (token) return <Navigate to="/" replace />
  return <Outlet />
}
