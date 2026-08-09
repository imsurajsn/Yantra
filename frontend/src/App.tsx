import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/store/auth'
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from '@/components/ProtectedRoute'
import Layout from '@/components/Layout'

import Setup from '@/pages/Setup'
import Login from '@/pages/Login'
import ChangePassword from '@/pages/ChangePassword'
import Profile from '@/pages/Profile'

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

          {/* Accessible when logged in but must_change_password is true */}
          <Route path="/change-password" element={<ChangePassword />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/pages" replace />} />
              <Route path="/pages" element={<EmptyPageList />} />
              <Route path="/pages/:id" element={<PageViewer />} />
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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

function EmptyPageList() {
  return (
    <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>
      <p style={{ fontSize: 16 }}>Select a page from the sidebar.</p>
    </div>
  )
}
