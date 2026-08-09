import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function loadFromStorage(): { token: string | null; user: User | null } {
  try {
    const token = localStorage.getItem('yantra_token')
    const raw = localStorage.getItem('yantra_user')
    const user = raw ? (JSON.parse(raw) as User) : null
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(loadFromStorage)

  const login = useCallback((token: string, user: User) => {
    localStorage.setItem('yantra_token', token)
    localStorage.setItem('yantra_user', JSON.stringify(user))
    setState({ token, user })
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('yantra_token')
    localStorage.removeItem('yantra_user')
    setState({ token: null, user: null })
  }, [])

  const updateUser = useCallback((user: User) => {
    localStorage.setItem('yantra_user', JSON.stringify(user))
    setState((s) => ({ ...s, user }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
