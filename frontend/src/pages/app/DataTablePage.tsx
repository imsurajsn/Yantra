import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/store/auth'
import type { Page } from '@/types'

interface Props { page: Page }

function renderCell(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

export default function DataTablePage({ page }: Props) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDelete, setShowDelete] = useState(false)

  const canEdit = user?.workspace_role === 'Admin' || page.page_role === 'Owner' || page.page_role === 'Editor'
  const canDelete = user?.workspace_role === 'Admin' || page.page_role === 'Owner'

  const fetchData = async () => {
    setLoading(true); setError('')
    try {
      const res = await api.get(`/pages/${page.id}/data`)
      const data = res.data.data
      const arr: Record<string, unknown>[] = Array.isArray(data) ? data : data ? [data] : []
      setRows(arr)
      if (arr.length > 0) setColumns(Object.keys(arr[0]))
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      if (e.response?.data?.error?.includes('403') || (err as { response?: { status?: number } }).response?.status === 403) {
        navigate('/not-authorized')
      } else {
        setError(e.response?.data?.error || 'Failed to load data')
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [page.id])

  const handleDeletePage = async () => {
    await api.delete(`/pages/${page.id}`)
    navigate('/')
  }

  const roleLabel = page.page_role || (user?.workspace_role === 'Admin' ? 'Owner' : 'Viewer')

  return (
    <div style={{ maxWidth: 1080 }}>
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)' }}>
        <span className="tag tag-outline">{roleLabel}</span>
      </div>
      {page.description && (
        <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-3)' }}>{page.description}</p>
      )}

      {error && <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 13, marginBottom: 'var(--space-3)' }}>{error}</div>}

      <div className="card elev-sm" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>{columns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columns.length || 1} style={{ padding: 'var(--space-4)' }}><span className="text-muted">Loading…</span></td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={columns.length || 1} style={{ padding: 'var(--space-4)' }}><span className="text-muted">No data returned.</span></td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>{columns.map(c => <td key={c}>{renderCell(row[c])}</td>)}</tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-3)', borderTop: '1px solid var(--color-divider)' }}>
          <span className="text-muted" style={{ fontSize: 12 }}>{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          <div style={{ marginLeft: 'auto' }}>
            <button className="btn btn-secondary" onClick={fetchData} disabled={loading} style={{ fontSize: 13, padding: '5px 12px' }}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
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
