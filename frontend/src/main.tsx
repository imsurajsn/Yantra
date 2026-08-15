import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import { App } from './App.tsx'
import { AuthProvider } from './lib/auth/AuthContext.tsx'
import { UnsavedChangesProvider } from './lib/unsavedChanges.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Server state here changes on user action (login, role change,
      // etc.), not on a timer — refetch on demand (via AuthContext.refetch)
      // rather than polling.
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <UnsavedChangesProvider>
            <App />
          </UnsavedChangesProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
