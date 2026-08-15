import { api } from './client'

export interface Group {
  id: number
  name: string
}

export interface GroupMember {
  user_id: number
  name: string
  email: string
  role_key: string
}

export interface GroupDetail {
  group: Group
  members: GroupMember[]
}

export const groupsApi = {
  list: () => api.get<Group[]>('/groups'),

  create: (name: string) => api.post<Group>('/groups', { name }),

  get: (id: number) => api.get<GroupDetail>(`/groups/${id}`),

  rename: (id: number, name: string) => api.patch<Group>(`/groups/${id}`, { name }),

  remove: (id: number) => api.delete<void>(`/groups/${id}`),

  addMember: (id: number, userId: number) => api.post<void>(`/groups/${id}/members`, { user_id: userId }),

  removeMember: (id: number, userId: number) => api.delete<void>(`/groups/${id}/members/${userId}`),

  changeMemberRole: (id: number, userId: number, roleKey: string) =>
    api.patch<void>(`/groups/${id}/members/${userId}`, { role_key: roleKey }),
}
