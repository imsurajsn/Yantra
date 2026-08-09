import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/store/auth'
import type { Page, PageConfig, FormField } from '@/types'

interface Props { page: Page }

export default function FormPage({ page }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [config, setConfig] = useState<PageConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const canEdit = user?.workspace_role === 'Admin' || page.page_role === 'Owner' || page.page_role === 'Editor'
  const canDelete = user?.workspace_role === 'Admin' || page.page_role === 'Owner'
  const isViewOnly = page.page_role === 'Viewer' && user?.workspace_role !== 'Admin'
  const roleLabel = page.page_role || (user?.workspace_role === 'Admin' ? 'Owner' : 'Viewer')

  useEffect(() => {
    api.get(`/pages/${page.id}/config`)
      .then(res => {
        const cfg = res.data.config as PageConfig
        setConfig(cfg)
        const init: Record<string, string> = {}
        ;(cfg.fields || []).forEach(f => { init[f.key] = '' })
        setFormData(init)
      })
      .catch(err => {
        const e = err as { response?: { status?: number } }
        if (e.response?.status === 403) navigate('/not-authorized')
        else setError('Could not load form configuration.')
      })
  }, [page.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setStatus(null); setSubmitting(true)
    try {
      await api.post(`/pages/${page.id}/submit`, formData)
      setStatus({ ok: true, message: 'Submitted successfully.' })
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setStatus({ ok: false, message: e.response?.data?.error || 'Submission failed.' })
    } finally { setSubmitting(false) }
  }

  const handleDeletePage = async () => {
    await api.delete(`/pages/${page.id}`)
    navigate('/')
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFormData(d => ({ ...d, [key]: e.target.value }))

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'textarea':
        return <textarea className="input" key={field.key} value={formData[field.key] ?? ''} onChange={set(field.key)} required={field.required} disabled={isViewOnly} style={{ minHeight: 80 }} />
      case 'select':
        return (
          <select className="input" key={field.key} value={formData[field.key] ?? ''} onChange={set(field.key)} required={field.required} disabled={isViewOnly}>
            <option value="">Select…</option>
            {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      default:
        return <input className="input" key={field.key} type={field.type} value={formData[field.key] ?? ''} onChange={set(field.key)} required={field.required} disabled={isViewOnly} />
    }
  }

  if (!config && !error) return <p className="text-muted">Loading…</p>
  if (error) return <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 13 }}>{error}</div>

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 2 }}>
        <h2 style={{ margin: 0 }}>{page.title}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => navigate(`/admin/pages/${page.id}/edit`)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
              Edit config
            </button>
          )}
          {canDelete && (
            <button className="btn btn-secondary" onClick={() => setShowDelete(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
              Delete
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
        <span className="tag tag-outline">{roleLabel}</span>
      </div>
      {page.description && (
        <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-4)' }}>{page.description}</p>
      )}

      {status && (
        <div style={{
          background: status.ok ? 'var(--color-accent-900)' : 'var(--color-neutral-800)',
          color: status.ok ? 'var(--color-accent-200)' : 'var(--color-text)',
          borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', fontSize: 13.5,
        }}>{status.message}</div>
      )}
      {isViewOnly && (
        <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', fontSize: 13.5 }}>
          You have view-only access to this page. Fields are shown for reference and cannot be submitted.
        </div>
      )}

      <div className="card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        {(config?.fields || []).map(field => (
          <div key={field.key} className="field">
            <label>{field.label}{field.required && !isViewOnly && <span style={{ color: 'var(--color-accent)', marginLeft: 2 }}>*</span>}</label>
            {renderField(field)}
          </div>
        ))}
        {!isViewOnly && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</button>
            <button className="btn btn-ghost" onClick={() => {
              const init: Record<string, string> = {}
              ;(config?.fields || []).forEach(f => { init[f.key] = '' })
              setFormData(init); setStatus(null)
            }}>Reset</button>
          </div>
        )}
      </div>

      {showDelete && (
        <div className="dialog-backdrop" onClick={() => setShowDelete(false)}>
          <div className="dialog" onClick={e => e.stopPropagation()}>
            <div className="dialog-title">Delete page</div>
            <div className="dialog-body">Deleting <strong>{page.title}</strong> is permanent and removes it for everyone with access.</div>
            <div className="dialog-actions">
              <button className="btn btn-ghost" onClick={() => setShowDelete(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleDeletePage}>Delete page</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
