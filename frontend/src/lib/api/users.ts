import { api } from './client'
import type { User } from './auth'

export interface CreateUserInput {
  email: string
  display_name: string
  password: string
  role_key: string
}

export const usersApi = {
  list: () => api.get<User[]>('/users'),

  create: (input: CreateUserInput) => api.post<User>('/users', input),

  changeRole: (id: number, roleKey: string) => api.patch<User>(`/users/${id}/role`, { role_key: roleKey }),

  deactivate: (id: number) => api.post<void>(`/users/${id}/deactivate`),

  reactivate: (id: number) => api.post<void>(`/users/${id}/reactivate`),

  resetPassword: (id: number) => api.post<{ temp_password: string }>(`/users/${id}/reset-password`),
}
