import { useEffect, useState, useCallback } from 'react'
import api from '@/api/client'
import type { AuditLog } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  login: 'Login', logout: 'Logout', page_view: 'Page view',
  form_submit: 'Form submission', api_call: 'API call',
}

function eventTarget(log: AuditLog): string {
  if (log.page_id) return `Page #${log.page_id}`
  if (log.endpoint) return log.endpoint.length > 50 ? log.endpoint.slice(0, 50) + '…' : log.endpoint
  return '—'
}

function eventResult(log: AuditLog): { label: string; cls: string } {
  if (log.http_status) {
    if (log.http_status < 300) return { label: 'OK', cls: 'tag-accent' }
    if (log.http_status < 500) return { label: String(log.http_status), cls: 'tag-neutral' }
    return { label: String(log.http_status), cls: 'tag-neutral' }
  }
  return { label: 'OK', cls: 'tag-accent' }
}

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ user_email: '', event_type: '', from: '', to: '' })

  const load = useCallback(async (p = page) => {
    const params = new URLSearchParams({ page: String(p), page_size: '50' })
    if (filters.user_email) params.set('user_email', filters.user_email)
    if (filters.event_type) params.set('event_type', filters.event_type)
    if (filters.from) params.set('from', new Date(filters.from).toISOString())
    if (filters.to) params.set('to', new Date(filters.to).toISOString())
    const res = await api.get(`/admin/audit?${params}`)
    setLogs(res.data.data || [])
    setTotal(res.data.total)
    setTotalPages(res.data.total_pages || 1)
  }, [page, filters])

  useEffect(() => { load() }, [page])

  const setFilter = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters(f => ({ ...f, [k]: e.target.value }))

  return (
    <div style={{ maxWidth: 1100 }}>
      <h2 style={{ marginBottom: 2 }}>Audit Log</h2>
      <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-4)' }}>Every login, page view, form submission and API call, kept forever.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        <select className="input" style={{ width: 170 }} value={filters.user_email} onChange={setFilter('user_email')}>
          <option value="">All users</option>
          {[...new Set(logs.map(l => l.user_email))].map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="input" style={{ width: 170 }} value={filters.event_type} onChange={e => { setFilters(f => ({ ...f, event_type: e.target.value })); setPage(1); }}>
          <option value="">All actions</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
          <option value="page_view">Page view</option>
          <option value="form_submit">Form submission</option>
          <option value="api_call">API call</option>
        </select>
        <input className="input" style={{ width: 150 }} type="date" value={filters.from} onChange={setFilter('from')} />
        <input className="input" style={{ width: 150 }} type="date" value={filters.to} onChange={setFilter('to')} />
        <button className="btn btn-secondary" onClick={() => { setPage(1); load(1) }}>Apply</button>
      </div>

      <div className="card elev-sm" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Target</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 'var(--space-4)' }}><span className="text-muted" style={{ fontSize: 13 }}>No matching events.</span></td></tr>
            ) : (
              logs.map(l => {
                const res = eventResult(l)
                return (
                  <tr key={l.id}>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{new Date(l.timestamp).toLocaleString()}</td>
                    <td>{l.user_email}</td>
                    <td>{ACTION_LABELS[l.event_type] || l.event_type}</td>
                    <td className="text-muted">{eventTarget(l)}</td>
                    <td><span className={`tag ${res.cls}`}>{res.label}</span></td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'var(--space-3)' }}>
        <p className="text-muted" style={{ fontSize: 11.5 }}>Audit entries are permanent — no user, including Admins, can edit or delete them.</p>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span className="text-muted">Page {page} of {totalPages} ({total.toLocaleString()} total)</span>
            <button className="btn btn-secondary btn-icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button className="btn btn-secondary btn-icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
