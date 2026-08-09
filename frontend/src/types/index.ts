export interface User {
  id: number
  email: string
  display_name: string
  workspace_role: 'Admin' | 'Member' | 'Viewer'
  must_change_password: boolean
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: number
  name: string
  created_at: string
  updated_at: string
}

export interface GroupMember {
  user_id: number
  email: string
  display_name: string
  group_role: 'Group Admin' | 'Group Member'
}

export interface Page {
  id: number
  title: string
  page_type: 'data_table' | 'form'
  page_role?: string
  created_at?: string
  updated_at?: string
}

export interface PageACLEntry {
  id: number
  page_id: number
  subject_type: 'user' | 'group'
  subject_id: number
  page_role: 'Owner' | 'Editor' | 'Viewer'
  created_at: string
}

export interface AuditLog {
  id: number
  user_email: string
  event_type: string
  page_id?: number
  ip_address?: string
  user_agent?: string
  endpoint?: string
  http_method?: string
  http_status?: number
  field_values?: string
  timestamp: string
}

export interface PageConfig {
  url: string
  method: string
  auth_header_name?: string
  auth_header_value?: string
  columns?: ColumnDef[]
  fields?: FormField[]
  [key: string]: unknown
}

export interface ColumnDef {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'boolean'
}

export interface FormField {
  key: string
  label: string
  type: 'text' | 'number' | 'email' | 'select' | 'textarea'
  required?: boolean
  options?: string[]
}

export interface AuthState {
  token: string | null
  user: User | null
}
