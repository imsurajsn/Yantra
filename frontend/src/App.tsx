import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { SetupPage } from './routes/SetupPage'
import { LoginPage } from './routes/LoginPage'
import { ForcePasswordChangePage } from './routes/ForcePasswordChangePage'
import { HomePage } from './routes/HomePage'
import { PageViewer } from './routes/PageViewer'
import { UsersPage } from './routes/admin/UsersPage'
import { GroupsPage } from './routes/admin/GroupsPage'
import { PageConfigEditor } from './routes/admin/PageConfigEditor'
import { AuditLogPage } from './routes/admin/AuditLogPage'
import { NotFoundPage } from './routes/NotFoundPage'
import { SetupGate } from './lib/routing/SetupGate'
import { ProtectedRoute } from './lib/routing/ProtectedRoute'
import { PermissionRoute } from './lib/routing/PermissionRoute'
import { AppLayout } from './components/AppLayout'

// Every authenticated screen goes through the same auth-check + nav shell —
// this collapses the repeated ProtectedRoute > AppLayout nesting into one
// wrapper per route below.
function Authed({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  )
}

export function App() {
  return (
    <SetupGate>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/force-password-change" element={<ForcePasswordChangePage />} />

        <Route path="/" element={<Authed><HomePage /></Authed>} />
        <Route path="/groups" element={<Authed><GroupsPage /></Authed>} />

        <Route
          path="/users"
          element={
            <Authed>
              <PermissionRoute permission="workspace.users.view">
                <UsersPage />
              </PermissionRoute>
            </Authed>
          }
        />
        <Route
          path="/audit-log"
          element={
            <Authed>
              <PermissionRoute permission="workspace.audit.view">
                <AuditLogPage />
              </PermissionRoute>
            </Authed>
          }
        />

        <Route
          path="/pages/new/:type"
          element={
            <Authed>
              <PermissionRoute permission="workspace.pages.create">
                <PageConfigEditor />
              </PermissionRoute>
            </Authed>
          }
        />
        <Route path="/pages/:id/edit" element={<Authed><PageConfigEditor /></Authed>} />
        <Route path="/pages/:id" element={<Authed><PageViewer /></Authed>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SetupGate>
  )
}
