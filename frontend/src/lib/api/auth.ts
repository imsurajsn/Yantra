import { api } from './client'

export interface User {
  id: number
  email: string
  display_name: string
  role: string
  must_change_password: boolean
  is_active: boolean
  last_login_at: string | null
}

export interface UserGroup {
  id: number
  name: string
  role: string
}

export interface MeResponse {
  user: User
  permissions: string[]
  groups: UserGroup[]
}

export interface SetupStatus {
  setup_complete: boolean
}

export const authApi = {
  setupStatus: () => api.get<SetupStatus>('/setup/status'),

  submitSetup: (input: { email: string; display_name: string; password: string }) =>
    api.post<{ user: User }>('/setup', input),

  login: (input: { email: string; password: string }) => api.post<{ user: User }>('/auth/login', input),

  logout: () => api.post<void>('/auth/logout'),

  me: () => api.get<MeResponse>('/auth/me'),

  changePassword: (input: { current_password: string; new_password: string }) =>
    api.post<void>('/auth/change-password', input),

  // No current_password field on purpose — see the backend handler's doc
  // comment for why that's safe only in the must_change_password=true case.
  setFirstLoginPassword: (input: { new_password: string }) =>
    api.post<void>('/auth/set-first-login-password', input),
}
