import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field } from '../../components/AuthLayout'
import { pagesApi, type AuthHeaderInput, type PageType } from '../../lib/api/pages'
import { groupsApi } from '../../lib/api/groups'
import { ApiError } from '../../lib/api/client'
import { NotAuthorizedPage } from '../NotAuthorizedPage'
import { useUnsavedChanges } from '../../lib/unsavedChanges'

const DEFAULT_TABLE_YAML = `title: New Data Table Page
description: Describe what this page shows.
method: GET
endpoint: https://api.example.com/v1/resource
page_size: 50
columns:
  - key: id
    label: ID
    sortable: true
    editable: false
  - key: name
    label: Name
    sortable: true
    editable: false
writeback:
  enabled: false
  method: PATCH
  endpoint: https://api.example.com/v1/resource/{id}
  id_field: id
`

const DEFAULT_FORM_YAML = `title: New Form Page
description: Describe what this form does.
method: POST
endpoint: https://api.example.com/v1/action
fields:
  - key: field_key
    label: Field label
    type: text
    required: true
    sensitive: false
`

// Handles both create (/pages/new/:type) and edit (/pages/:id/edit) —
// the mockup's "Validate & preview" -> "Save page" two-stage flow.
export function PageConfigEditor() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setDirty } = useUnsavedChanges()
  const params = useParams<{ id?: string; type?: string }>()
  const isEdit = Boolean(params.id)
  const pageId = params.id ? Number(params.id) : undefined

  const { data: existing } = useQuery({
    queryKey: ['pages', pageId],
    queryFn: () => pagesApi.get(pageId!),
    enabled: isEdit,
  })
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  const pageType: PageType = (isEdit ? existing?.type : (params.type as PageType)) ?? 'table'
  const [yamlText, setYamlText] = useState(pageType === 'form' ? DEFAULT_FORM_YAML : DEFAULT_TABLE_YAML)
  const [groupId, setGroupId] = useState<number | ''>('')
  const [authHeaders, setAuthHeaders] = useState<AuthHeaderInput[]>([])
  const [existingHeaderNames, setExistingHeaderNames] = useState<string[]>([])
  const [stage, setStage] = useState<'edit' | 'preview'>('edit')
  const [errors, setErrors] = useState<string[]>([]);
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewDescription, setPreviewDescription] = useState('')
  const [previewColumns, setPreviewColumns] = useState<{ key: string; label: string }[]>([])
  const [previewFields, setPreviewFields] = useState<{ key: string; label: string; type: string }[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)

  // Syncs local editable state from the fetched page exactly once it
  // arrives (async — not available on first render). This is the
  // documented exception to "don't setState in an effect": there's no way
  // to derive these values during render since `existing` isn't there yet
  // on mount, and they must become independently editable afterward.
  useEffect(() => {
    if (existing) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setYamlText(existing.yaml)
      setGroupId(existing.page_group_id)
      setExistingHeaderNames(existing.auth_header_names)
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [existing])

  // Clears the "unsaved changes" flag when this editing session ends, no
  // matter how it ends (saved, cancelled, or navigated away and confirmed)
  // — it must never leak into whatever screen the user lands on next.
  useEffect(() => {
    return () => setDirty(false)
  }, [setDirty])

  const validateMutation = useMutation({
    mutationFn: () => pagesApi.validate(pageType, yamlText),
    onSuccess: async (result) => {
      if (!result.valid) {
        setErrors(result.errors)
        return
      }
      setErrors([])
      setPreviewTitle(result.title ?? '')
      setPreviewDescription(result.description ?? '')
      try {
        if (pageType === 'table') {
          const preview = await pagesApi.previewTable(pageType, yamlText, authHeaders)
          setPreviewColumns(preview.columns)
        } else {
          const preview = await pagesApi.previewForm(pageType, yamlText)
          setPreviewFields(preview.fields)
        }
        setStage('preview')
      } catch (err) {
        setErrors([err instanceof ApiError ? err.message : 'Preview failed.'])
      }
    },
    onError: (err) => setErrors([err instanceof ApiError ? err.message : 'Validation failed.']),
  })

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!groupId) throw new Error('Choose a group first.')
      if (isEdit) {
        return pagesApi.update(pageId!, { page_group_id: groupId, yaml: yamlText, auth_headers: authHeaders })
      }
      return pagesApi.create({ page_group_id: groupId, page_type: pageType, yaml: yamlText, auth_headers: authHeaders })
    },
    onSuccess: (result) => {
      setDirty(false)
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      navigate(`/pages/${result.id}`, { replace: true })
    },
    onError: (err) => setSaveError(err instanceof ApiError ? err.message : 'Failed to save page.'),
  })

  // page.edit_config is page-scoped (depends on this specific page's ACL),
  // so it can't be a static route-level PermissionRoute like /users or
  // /audit-log — checked here, after every hook above, once the page
  // detail (with its server-computed can_edit flag) has loaded.
  if (isEdit && existing && !existing.can_edit) {
    return <NotAuthorizedPage />
  }

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <h1 style={{ marginBottom: 2 }}>{isEdit ? `Edit "${existing?.name ?? ''}"` : pageType === 'table' ? 'New Data Table Page' : 'New Form Page'}</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        {pageType === 'table'
          ? 'Define the page as YAML — connects to a REST endpoint (GET) and renders a paginated, sortable table.'
          : 'Define the page as YAML — renders a form and POSTs the submission to a REST endpoint.'}
      </p>

      {stage === 'edit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', color: 'var(--muted)' }}>
              page.yaml
            </div>
            <textarea
              value={yamlText}
              onChange={(e) => {
                setYamlText(e.target.value)
                setDirty(true)
              }}
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: 420,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 12.5,
                lineHeight: 1.7,
                border: 'none',
                background: 'var(--bg)',
                color: 'var(--text)',
                padding: 16,
                resize: 'vertical',
              }}
            />
            {errors.length > 0 && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{errors.length} issue(s) — fix before previewing</div>
                {errors.map((e, i) => (
                  <div key={i} className="error" style={{ marginBottom: 3 }}>
                    {e}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <button
                type="submit"
                disabled={validateMutation.isPending}
                onClick={() => {
                  setErrors([])
                  validateMutation.mutate()
                }}
              >
                Validate &amp; preview
              </button>
              <button
                onClick={() => {
                  setDirty(false)
                  navigate(-1)
                }}
              >
                Cancel
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Group</h4>
              <select
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value ? Number(e.target.value) : '')
                  setDirty(true)
                }}
                style={{ width: '100%' }}
              >
                <option value="">Choose a group…</option>
                {groups?.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Auth headers</h4>
              {existingHeaderNames.length > 0 && (
                <p className="muted" style={{ fontSize: 12 }}>
                  Existing: {existingHeaderNames.join(', ')} (unchanged unless overwritten below)
                </p>
              )}
              <AuthHeaderEditor
                headers={authHeaders}
                onChange={(h) => {
                  setAuthHeaders(h)
                  setDirty(true)
                }}
              />
            </div>
            <div className="card">
              <h4 style={{ marginTop: 0, fontSize: 13 }}>Schema reference</h4>
              <div className="muted" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <span>title, description, method, endpoint</span>
                {pageType === 'table' ? (
                  <>
                    <span>columns: key, label, sortable, editable</span>
                    <span>writeback: enabled, method, endpoint, id_field</span>
                  </>
                ) : (
                  <span>fields: key, label, type, required, sensitive, options</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setStage('edit')}>Back to editor</button>
            <button
              type="submit"
              style={{ marginLeft: 'auto' }}
              disabled={saveMutation.isPending}
              onClick={() => {
                setSaveError(null)
                saveMutation.mutate()
              }}
            >
              Save page
            </button>
          </div>
          {saveError && <p className="error">{saveError}</p>}
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, fontSize: 12.5, marginBottom: 16 }}>
            This is what a user with access will see.
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ margin: '0 0 4px' }}>{previewTitle}</h2>
            <p className="muted" style={{ margin: 0 }}>
              {previewDescription}
            </p>
          </div>
          {pageType === 'table' ? (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {previewColumns.map((c) => (
                      <th key={c.key} style={{ padding: '8px 12px', fontSize: 12, textAlign: 'left' }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
              </table>
              <p className="muted" style={{ padding: 12, fontSize: 12 }}>Live sample data was fetched from the configured endpoint to validate connectivity.</p>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {previewFields.map((f) => (
                <Field key={f.key} label={f.label}>
                  {f.type === 'boolean' ? <input type="checkbox" disabled /> : <input disabled placeholder={f.type} />}
                </Field>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AuthHeaderEditor({ headers, onChange }: { headers: AuthHeaderInput[]; onChange: (h: AuthHeaderInput[]) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {headers.map((h, i) => (
        <div key={i} style={{ display: 'flex', gap: 6 }}>
          <input
            placeholder="Header name"
            value={h.name}
            onChange={(e) => onChange(headers.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)))}
            style={{ flex: 1 }}
          />
          <input
            placeholder="Value"
            value={h.value}
            onChange={(e) => onChange(headers.map((x, j) => (i === j ? { ...x, value: e.target.value } : x)))}
            style={{ flex: 1 }}
          />
          <button onClick={() => onChange(headers.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button onClick={() => onChange([...headers, { name: 'Authorization', value: '' }])}>+ Add header</button>
    </div>
  )
}
