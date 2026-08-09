import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import type { Page, PageConfig, ColumnDef, FormField } from '@/types'

const S = {
  hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 } as const,
  title: { fontSize: 20, fontWeight: 600, color: '#1e293b' } as const,
  btn: { padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  smBtn: { padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569', marginRight: 4 } as const,
  dangerBtn: { padding: '4px 10px', border: '1px solid #fecaca', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#dc2626' } as const,
  tableWrap: { background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflowX: 'auto' as const, marginBottom: 24 },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' as const, fontWeight: 600, color: '#374151' },
  td: { padding: '10px 16px', borderBottom: '1px solid #f1f5f9', color: '#1e293b' },
  form: { background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 28, maxWidth: 680 } as const,
  label: { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#374151', marginTop: 16 } as const,
  input: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 } as const,
  select: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14 } as const,
  textarea: { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, minHeight: 80, resize: 'vertical' as const, fontFamily: 'monospace' } as const,
  row: { display: 'flex', gap: 8, marginTop: 20 } as const,
  save: { padding: '9px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  cancel: { padding: '9px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 } as const,
  err: { color: '#dc2626', fontSize: 13, marginTop: 8 } as const,
  ok: { color: '#16a34a', fontSize: 13, marginTop: 8 } as const,
  subSection: { border: '1px solid #e2e8f0', borderRadius: 6, padding: 16, marginTop: 12 } as const,
  addBtn: { padding: '5px 12px', border: '1px dashed #94a3b8', borderRadius: 5, background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#64748b', marginTop: 8 } as const,
}

interface Props { mode?: 'create' | 'edit' }

export default function AdminPages({ mode }: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [pages, setPages] = useState<Page[]>([])
  const editing = mode === 'create' || mode === 'edit'
  const [form, setForm] = useState<{
    title: string; page_type: 'data_table' | 'form'
    config: PageConfig
  }>({
    title: '',
    page_type: 'data_table',
    config: { url: '', method: 'GET', auth_header_name: '', auth_header_value: '', columns: [], fields: [] },
  })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [loading, setLoading] = useState(false)

  const loadPages = async () => {
    const res = await api.get('/pages')
    setPages(res.data.data || [])
  }

  const loadPageConfig = async (pageId: string) => {
    const res = await api.get(`/pages/${pageId}/config`)
    setForm({
      title: res.data.title,
      page_type: res.data.page_type,
      config: res.data.config,
    })
  }

  useEffect(() => { loadPages() }, [])
  useEffect(() => {
    if (mode === 'edit' && id) loadPageConfig(id)
  }, [mode, id])

  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const setCfg = (k: keyof PageConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, config: { ...f.config, [k]: e.target.value } }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setOk('')
    setLoading(true)
    try {
      if (mode === 'edit' && id) {
        await api.put(`/pages/${id}/config`, form)
        setOk('Page updated.')
      } else {
        const res = await api.post('/pages', form)
        navigate(`/admin/pages/${res.data.id}/edit`, { replace: true })
        setOk('Page created.')
      }
      loadPages()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to save page')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (page: Page) => {
    if (!window.confirm(`Delete page "${page.title}"?`)) return
    await api.delete(`/pages/${page.id}`)
    loadPages()
  }

  // Columns editor helpers
  const addColumn = () => setForm((f) => ({
    ...f, config: { ...f.config, columns: [...(f.config.columns || []), { key: '', label: '', type: 'text' }] }
  }))
  const setCol = (i: number, k: keyof ColumnDef, v: string) => setForm((f) => {
    const cols = [...(f.config.columns || [])]
    cols[i] = { ...cols[i], [k]: v }
    return { ...f, config: { ...f.config, columns: cols } }
  })
  const removeCol = (i: number) => setForm((f) => {
    const cols = (f.config.columns || []).filter((_, idx) => idx !== i)
    return { ...f, config: { ...f.config, columns: cols } }
  })

  // Fields editor helpers
  const addField = () => setForm((f) => ({
    ...f, config: { ...f.config, fields: [...(f.config.fields || []), { key: '', label: '', type: 'text', required: false }] }
  }))
  const setField = (i: number, k: keyof FormField, v: string | boolean) => setForm((f) => {
    const flds = [...(f.config.fields || [])]
    flds[i] = { ...flds[i], [k]: v }
    return { ...f, config: { ...f.config, fields: flds } }
  })
  const removeField = (i: number) => setForm((f) => {
    const flds = (f.config.fields || []).filter((_, idx) => idx !== i)
    return { ...f, config: { ...f.config, fields: flds } }
  })

  if (!editing) {
    return (
      <div>
        <div style={S.hdr}>
          <h2 style={S.title}>Pages</h2>
          <button style={S.btn} onClick={() => navigate('/admin/pages/new')}>+ New page</button>
        </div>
        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Title', 'Type', 'Created', 'Actions'].map((h) => <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {pages.length === 0 && (
                <tr><td colSpan={4} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 32 }}>No pages yet.</td></tr>
              )}
              {pages.map((p) => (
                <tr key={p.id}>
                  <td style={S.td}>{p.title}</td>
                  <td style={S.td}>{p.page_type}</td>
                  <td style={S.td}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                  <td style={S.td}>
                    <button style={S.smBtn} onClick={() => navigate(`/admin/pages/${p.id}/edit`)}>Edit</button>
                    <button style={S.dangerBtn} onClick={() => handleDelete(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={S.hdr}>
        <h2 style={S.title}>{mode === 'edit' ? 'Edit page' : 'New page'}</h2>
        <button style={S.cancel} onClick={() => navigate('/admin/pages')}>← Back to pages</button>
      </div>

      {error && <p style={S.err}>{error}</p>}
      {ok && <p style={S.ok}>{ok}</p>}

      <form style={S.form} onSubmit={handleSubmit}>
        <label style={S.label}>Page title</label>
        <input style={S.input} value={form.title} onChange={setF('title')} required />

        <label style={S.label}>Page type</label>
        <select style={S.select} value={form.page_type}
          onChange={(e) => setForm((f) => ({ ...f, page_type: e.target.value as 'data_table' | 'form' }))}>
          <option value="data_table">Data Table</option>
          <option value="form">Form</option>
        </select>

        <div style={{ marginTop: 20, fontWeight: 600, fontSize: 14, color: '#374151' }}>Data Source (REST API)</div>
        <label style={S.label}>URL</label>
        <input style={S.input} value={form.config.url} onChange={setCfg('url')} placeholder="https://api.example.com/data" required />

        <label style={S.label}>HTTP method</label>
        <select style={S.select} value={form.config.method}
          onChange={(e) => setForm((f) => ({ ...f, config: { ...f.config, method: e.target.value } }))}>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => <option key={m}>{m}</option>)}
        </select>

        <label style={S.label}>Auth header name <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
        <input style={S.input} value={form.config.auth_header_name || ''} onChange={setCfg('auth_header_name')} placeholder="Authorization" />

        <label style={S.label}>Auth header value <span style={{ fontWeight: 400, color: '#94a3b8' }}>(stored encrypted)</span></label>
        <input style={S.input} value={form.config.auth_header_value || ''} onChange={setCfg('auth_header_value')}
          placeholder={mode === 'edit' ? '[REDACTED]' : 'Bearer <token>'} />

        {/* Column definitions for Data Table pages */}
        {form.page_type === 'data_table' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Column definitions <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 12 }}>(leave empty to auto-detect)</span></div>
            {(form.config.columns || []).map((col, i) => (
              <div key={i} style={{ ...S.subSection, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input style={{ ...S.input, marginBottom: 0 }} placeholder="key" value={col.key} onChange={(e) => setCol(i, 'key', e.target.value)} />
                <input style={{ ...S.input, marginBottom: 0 }} placeholder="Label" value={col.label} onChange={(e) => setCol(i, 'label', e.target.value)} />
                <select style={{ ...S.select, marginBottom: 0, width: 100 }} value={col.type || 'text'} onChange={(e) => setCol(i, 'type', e.target.value)}>
                  {['text', 'number', 'date', 'boolean'].map((t) => <option key={t}>{t}</option>)}
                </select>
                <button type="button" style={S.dangerBtn} onClick={() => removeCol(i)}>✕</button>
              </div>
            ))}
            <button type="button" style={S.addBtn} onClick={addColumn}>+ Add column</button>
          </div>
        )}

        {/* Field definitions for Form pages */}
        {form.page_type === 'form' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#374151' }}>Form fields</div>
            {(form.config.fields || []).map((field, i) => (
              <div key={i} style={{ ...S.subSection, display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                <input style={{ ...S.input, marginBottom: 0, flex: '1 1 100px' }} placeholder="key" value={field.key} onChange={(e) => setField(i, 'key', e.target.value)} />
                <input style={{ ...S.input, marginBottom: 0, flex: '1 1 150px' }} placeholder="Label" value={field.label} onChange={(e) => setField(i, 'label', e.target.value)} />
                <select style={{ ...S.select, marginBottom: 0, width: 100 }} value={field.type} onChange={(e) => setField(i, 'type', e.target.value)}>
                  {['text', 'number', 'email', 'select', 'textarea'].map((t) => <option key={t}>{t}</option>)}
                </select>
                <label style={{ fontSize: 12, whiteSpace: 'nowrap' as const }}>
                  <input type="checkbox" checked={!!field.required} onChange={(e) => setField(i, 'required', e.target.checked)} style={{ marginRight: 4 }} />
                  Required
                </label>
                <button type="button" style={S.dangerBtn} onClick={() => removeField(i)}>✕</button>
              </div>
            ))}
            <button type="button" style={S.addBtn} onClick={addField}>+ Add field</button>
          </div>
        )}

        <div style={S.row}>
          <button style={S.save} type="submit" disabled={loading}>
            {loading ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create page'}
          </button>
        </div>
      </form>
    </div>
  )
}
