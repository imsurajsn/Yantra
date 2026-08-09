import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/store/auth'
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'

import Setup from '@/pages/Setup'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
import Profile from '@/pages/Profile'
import Home from '@/pages/Home'
import NotAuthorized from '@/pages/NotAuthorized'

import AdminUsers from '@/pages/admin/Users'
import AdminGroups from '@/pages/admin/Groups'
import AdminAudit from '@/pages/admin/AuditLog'
import AdminPages from '@/pages/admin/Pages'

import PageViewer from '@/pages/app/PageViewer'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />

          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<Login />} />
          </Route>

          <Route path="/change-password" element={<ChangePassword />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="/home" element={<Home />} />
              <Route path="/pages/:id" element={<PageViewer />} />
              <Route path="/not-authorized" element={<NotAuthorized />} />
              <Route path="/profile" element={<Profile />} />

              <Route element={<AdminRoute />}>
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/groups" element={<AdminGroups />} />
                <Route path="/admin/audit" element={<AdminAudit />} />
                <Route path="/admin/pages" element={<AdminPages />} />
                <Route path="/admin/pages/new" element={<AdminPages mode="create" />} />
                <Route path="/admin/pages/:id/edit" element={<AdminPages mode="edit" />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
