import { api } from './client'

export type PageType = 'table' | 'form'

export interface PageListItem {
  id: number
  name: string
  description: string
  type: PageType
  page_group_id: number
  effective_role: 'Owner' | 'Editor' | 'Viewer'
}

export interface ValidateResult {
  valid: boolean
  errors: string[]
  title?: string
  description?: string
}

export interface AuthHeaderInput {
  name: string
  value: string
}

export interface TableColumn {
  key: string
  label: string
  sortable: boolean
  editable: boolean
}

export interface FormField {
  key: string
  label: string
  type: 'text' | 'number' | 'dropdown' | 'boolean'
  required: boolean
  sensitive: boolean
  options?: string[]
}

export interface TablePreviewResult {
  columns: TableColumn[]
  sample_data: unknown[]
  sample_status: number
}

export interface FormPreviewResult {
  fields: FormField[]
}

export interface TableWriteback {
  enabled: boolean
  method: string
  endpoint: string
  id_field: string
}

export interface TablePageConfig {
  source: { endpoint: string; method: string }
  pagination: { page_size: number }
  columns: TableColumn[]
  writeback: TableWriteback
}

export interface FormPageConfig {
  source: { endpoint: string; method: string }
  success_message: string
  fields: FormField[]
}

export interface PageDetail {
  id: number
  name: string
  description: string
  type: PageType
  page_group_id: number
  yaml: string
  // Same data as `yaml`, already validated and structured — the Table/Form
  // viewers render from this directly rather than parsing YAML client-side.
  config: TablePageConfig | FormPageConfig
  auth_header_names: string[]
  effective_role: 'Owner' | 'Editor' | 'Viewer'
  can_edit: boolean
  can_delete: boolean
  can_manage_acl: boolean
}

export interface PageACLEntry {
  id: number
  subject_type: 'user' | 'group'
  subject_id: number
  role: 'Owner' | 'Editor' | 'Viewer'
}

export interface FormSubmitResult {
  success: boolean
  status_code: number
  message: string
  response: unknown
}

export const pagesApi = {
  list: () => api.get<PageListItem[]>('/pages'),

  validate: (pageType: PageType, yamlText: string) =>
    api.post<ValidateResult>('/pages/validate', { page_type: pageType, yaml: yamlText }),

  previewTable: (pageType: PageType, yamlText: string, authHeaders: AuthHeaderInput[]) =>
    api.post<TablePreviewResult>('/pages/preview', { page_type: pageType, yaml: yamlText, auth_headers: authHeaders }),

  previewForm: (pageType: PageType, yamlText: string) =>
    api.post<FormPreviewResult>('/pages/preview', { page_type: pageType, yaml: yamlText, auth_headers: [] }),

  create: (input: { page_group_id: number; page_type: PageType; yaml: string; auth_headers: AuthHeaderInput[] }) =>
    api.post<{ id: number; name: string; type: PageType }>('/pages', input),

  get: (id: number) => api.get<PageDetail>(`/pages/${id}`),

  update: (id: number, input: { page_group_id: number; yaml: string; auth_headers: AuthHeaderInput[] }) =>
    api.patch<{ id: number; name: string }>(`/pages/${id}`, input),

  remove: (id: number) => api.delete<void>(`/pages/${id}`),

  acl: {
    list: (pageId: number) => api.get<PageACLEntry[]>(`/pages/${pageId}/acl`),
    add: (pageId: number, subjectType: 'user' | 'group', subjectId: number, role: string) =>
      api.post<PageACLEntry>(`/pages/${pageId}/acl`, { subject_type: subjectType, subject_id: subjectId, role }),
    remove: (pageId: number, aclId: number) => api.delete<void>(`/pages/${pageId}/acl/${aclId}`),
  },

  recordView: (id: number) => api.post<void>(`/pages/${id}/view`),

  data: (id: number) => api.get<unknown[]>(`/pages/${id}/data`),

  writeback: (id: number, rowId: string, fields: Record<string, unknown>) =>
    api.patch<unknown>(`/pages/${id}/data/${encodeURIComponent(rowId)}`, { fields }),

  submit: (id: number, fieldValues: Record<string, unknown>) =>
    api.post<FormSubmitResult>(`/pages/${id}/submit`, { field_values: fieldValues }),
}
