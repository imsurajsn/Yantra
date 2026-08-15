import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Field } from '../components/AuthLayout'
import { pagesApi, type FormPageConfig } from '../lib/api/pages'
import { ApiError } from '../lib/api/client'

export function FormPageViewer() {
  const { id } = useParams<{ id: string }>()
  const pageId = Number(id)
  const navigate = useNavigate()

  const { data: page, error: pageError } = useQuery({ queryKey: ['pages', pageId], queryFn: () => pagesApi.get(pageId) })

  useEffect(() => {
    if (page) void pagesApi.recordView(pageId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, Boolean(page)])

  const [values, setValues] = useState<Record<string, unknown>>({})
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null)

  const submitMutation = useMutation({
    mutationFn: () => pagesApi.submit(pageId, values),
    onSuccess: (result) => {
      setStatus({ success: result.success, message: result.message })
      if (result.success) setValues({})
    },
    onError: (err) => setStatus({ success: false, message: err instanceof ApiError ? err.message : 'Submission failed.' }),
  })

  if (pageError) {
    return (
      <div className="page">
        <p className="error">Failed to load page.</p>
      </div>
    )
  }
  if (!page) return null

  const config = page.config as FormPageConfig
  const canSubmit = page.can_edit
  const missingRequired = config.fields.filter((f) => f.required && f.type !== 'boolean' && !values[f.key])

  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <h2 style={{ margin: 0 }}>{page.name}</h2>
        {canSubmit && (
          <button style={{ marginLeft: 'auto' }} onClick={() => navigate(`/pages/${pageId}/edit`)}>
            Edit config
          </button>
        )}
      </div>
      <span className="tag">{page.effective_role}</span>
      <p className="muted" style={{ marginTop: 8, marginBottom: 16 }}>
        {page.description}
      </p>

      {status && <p className={status.success ? 'success' : 'error'}>{status.message}</p>}
      {!canSubmit && (
        <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: 12, fontSize: 13.5, marginBottom: 16 }}>
          You have view-only access to this page. Fields are shown for reference and cannot be submitted.
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {config.fields.map((f) => (
          <Field key={f.key} label={f.label + (f.required ? ' *' : '')}>
            {f.type === 'boolean' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  disabled={!canSubmit}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                />
                {f.label}
              </label>
            ) : f.type === 'dropdown' ? (
              <select
                value={String(values[f.key] ?? '')}
                disabled={!canSubmit}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              >
                <option value="">Select…</option>
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === 'number' ? 'number' : 'text'}
                value={String(values[f.key] ?? '')}
                disabled={!canSubmit}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </Field>
        ))}
        {canSubmit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="submit"
              disabled={missingRequired.length > 0 || submitMutation.isPending}
              onClick={() => {
                setStatus(null)
                submitMutation.mutate()
              }}
            >
              Submit
            </button>
            <button onClick={() => setValues({})}>Reset</button>
          </div>
        )}
      </div>
    </div>
  )
}
