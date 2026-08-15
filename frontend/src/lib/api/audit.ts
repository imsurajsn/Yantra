import { api } from './client'

export interface AuditEntry {
  id: number
  timestamp: string
  user_email: string
  event_type: string
  target: string
  status_code?: number
}

export interface AuditPage {
  items: AuditEntry[]
  total: number
  page: number
  page_size: number
}

export interface AuditFilters {
  user_id?: number
  event_type?: string
  from?: string
  to?: string
  page?: number
}

export const auditApi = {
  list: (filters: AuditFilters) => {
    const params = new URLSearchParams()
    if (filters.user_id) params.set('user_id', String(filters.user_id))
    if (filters.event_type) params.set('event_type', filters.event_type)
    if (filters.from) params.set('from', filters.from)
    if (filters.to) params.set('to', filters.to)
    if (filters.page) params.set('page', String(filters.page))
    const qs = params.toString()
    return api.get<AuditPage>(`/audit-log${qs ? `?${qs}` : ''}`)
  },
}
