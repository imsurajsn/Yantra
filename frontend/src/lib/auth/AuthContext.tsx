import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, type MeResponse, type UserGroup, type User } from '../api/auth'

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated'

interface AuthContextValue {
  status: SessionStatus
  user: User | null
  groups: UserGroup[]
  /** The single source of truth for permission checks — always reads the
   * flattened list the backend computed in GET /auth/me. Never re-derive
   * RBAC logic here; that is exactly the drift the backend's
   * `effective_role`/`can_*` flags and this list exist to prevent. */
  can: (permissionKey: string) => boolean
  refetch: () => Promise<unknown>
  clearSession: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ME_QUERY_KEY = ['auth', 'me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery<MeResponse>({
    queryKey: ME_QUERY_KEY,
    queryFn: authApi.me,
    retry: false,
  })

  const clearSession = useCallback(() => {
    queryClient.setQueryData(ME_QUERY_KEY, undefined)
    queryClient.removeQueries({ queryKey: ME_QUERY_KEY })
  }, [queryClient])

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }),
    [queryClient],
  )

  const value = useMemo<AuthContextValue>(() => {
    const status: SessionStatus = isLoading ? 'loading' : data ? 'authenticated' : 'anonymous'
    const permissionSet = new Set(data?.permissions ?? [])
    return {
      status: isError ? 'anonymous' : status,
      user: data?.user ?? null,
      groups: data?.groups ?? [],
      can: (permissionKey: string) => permissionSet.has(permissionKey),
      refetch,
      clearSession,
    }
  }, [data, isLoading, isError, refetch, clearSession])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
