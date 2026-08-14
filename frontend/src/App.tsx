import { Route, Routes } from 'react-router-dom'
import { SetupPage } from './routes/SetupPage'
import { LoginPage } from './routes/LoginPage'
import { ForcePasswordChangePage } from './routes/ForcePasswordChangePage'
import { HomePage } from './routes/HomePage'
import { NotFoundPage } from './routes/NotFoundPage'
import { SetupGate } from './lib/routing/SetupGate'
import { ProtectedRoute } from './lib/routing/ProtectedRoute'

export function App() {
  return (
    <SetupGate>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/force-password-change" element={<ForcePasswordChangePage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </SetupGate>
  )
}
