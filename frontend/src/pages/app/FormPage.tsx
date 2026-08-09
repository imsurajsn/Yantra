import { useEffect, useState } from 'react'
import api from '@/api/client'
import type { Page, PageConfig, FormField } from '@/types'

const S = {
  title: { fontSize: 20, fontWeight: 600, color: '#1e293b', marginBottom: 20 } as const,
  card: { background: '#fff', borderRadius: 8, padding: 28, maxWidth: 560, border: '1px solid #e2e8f0' } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151' } as const,
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 16 } as const,
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 16, minHeight: 80, resize: 'vertical' as const } as const,
  select: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, marginBottom: 16 } as const,
  btn: { padding: '9px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer' } as const,
  err: { color: '#dc2626', fontSize: 13, marginBottom: 12 } as const,
  ok: { color: '#16a34a', fontSize: 13, marginBottom: 12 } as const,
}

interface Props { page: Page }

export default function FormPage({ page }: Props) {
  const [config, setConfig] = useState<PageConfig | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get(`/pages/${page.id}/config`)
      .then((res) => {
        const cfg = res.data.config as PageConfig
        setConfig(cfg)
        // Initialise form state with empty strings
        const init: Record<string, string> = {}
        ;(cfg.fields || []).forEach((f) => { init[f.key] = '' })
        setFormData(init)
      })
      .catch(() => setError('Could not load form configuration.'))
  }, [page.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')
    setSubmitting(true)
    try {
      await api.post(`/pages/${page.id}/submit`, formData)
      setOk('Submitted successfully.')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Submission failed')
    } finally {
      setSubmitting(false)
    }
  }

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFormData((d) => ({ ...d, [key]: e.target.value }))

  const renderField = (field: FormField) => {
    switch (field.type) {
      case 'textarea':
        return <textarea key={field.key} style={S.textarea} value={formData[field.key] ?? ''} onChange={set(field.key)} required={field.required} />
      case 'select':
        return (
          <select key={field.key} style={S.select} value={formData[field.key] ?? ''} onChange={set(field.key)} required={field.required}>
            <option value="">Select…</option>
            {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        )
      default:
        return <input key={field.key} style={S.input} type={field.type} value={formData[field.key] ?? ''} onChange={set(field.key)} required={field.required} />
    }
  }

  if (!config) return error ? <p style={S.err}>{error}</p> : <p style={{ color: '#64748b' }}>Loading form…</p>

  const fields = config.fields || []

  return (
    <div>
      <h2 style={S.title}>{page.title}</h2>
      <div style={S.card}>
        {error && <p style={S.err}>{error}</p>}
        {ok && <p style={S.ok}>{ok}</p>}
        {fields.length === 0 ? (
          <p style={{ color: '#64748b' }}>No fields configured for this form.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {fields.map((field) => (
              <div key={field.key}>
                <label style={S.label}>{field.label}{field.required && <span style={{ color: '#dc2626' }}> *</span>}</label>
                {renderField(field)}
              </div>
            ))}
            <button style={S.btn} type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
