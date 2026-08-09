import { useEffect, useState } from 'react'
import api from '@/api/client'
import type { AuditLog } from '@/types'

const S = {
  title: { fontSize: 20, fontWeight: 600, color: '#1e293b', marginBottom: 20 } as const,
  filters: { display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const },
  input: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 } as const,
  select: { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 } as const,
  btn: { padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 } as const,
  tableWrap: { background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0', overflowX: 'auto' as const },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
  th: { padding: '9px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' as const, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' as const },
  td: { padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#334155', verticalAlign: 'top' as const },
  pager: { display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, fontSize: 13, color: '#64748b' } as const,
  pgBtn: { padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', cursor: 'pointer', fontSize: 13 } as const,
}

const EVENT_TYPES = ['', 'login', 'logout', 'page_view', 'form_submit', 'api_call']

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ user_email: '', event_type: '', from: '', to: '' })

  const load = async (p = page) => {
    const params = new URLSearchParams({ page: String(p), page_size: '50' })
    if (filters.user_email) params.set('user_email', filters.user_email)
    if (filters.event_type) params.set('event_type', filters.event_type)
    if (filters.from) params.set('from', new Date(filters.from).toISOString())
    if (filters.to) params.set('to', new Date(filters.to).toISOString())
    const res = await api.get(`/admin/audit?${params}`)
    setLogs(res.data.data || [])
    setTotal(res.data.total)
    setTotalPages(res.data.total_pages)
  }

  useEffect(() => { load() }, [page])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    load(1)
  }

  const setFilter = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <h2 style={S.title}>Audit Log</h2>

      <form style={S.filters} onSubmit={handleSearch}>
        <input style={S.input} placeholder="Filter by email" value={filters.user_email} onChange={setFilter('user_email')} />
        <select style={S.select} value={filters.event_type} onChange={setFilter('event_type')}>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t || 'All events'}</option>)}
        </select>
        <input style={S.input} type="datetime-local" value={filters.from} onChange={setFilter('from')} title="From" />
        <input style={S.input} type="datetime-local" value={filters.to} onChange={setFilter('to')} title="To" />
        <button style={S.btn} type="submit">Search</button>
      </form>

      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10 }}>{total.toLocaleString()} entries</div>

      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              {['Timestamp', 'User', 'Event', 'Page', 'Method', 'Endpoint', 'Status', 'IP'].map((h) => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: '#94a3b8', padding: 32 }}>No entries found.</td></tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id}>
                  <td style={S.td}>{new Date(l.timestamp).toLocaleString()}</td>
                  <td style={S.td}>{l.user_email}</td>
                  <td style={S.td}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: eventColor(l.event_type), color: '#fff' }}>
                      {l.event_type}
                    </span>
                  </td>
                  <td style={S.td}>{l.page_id ?? '—'}</td>
                  <td style={S.td}>{l.http_method || '—'}</td>
                  <td style={S.td} title={l.endpoint}>{truncate(l.endpoint || '—', 40)}</td>
                  <td style={S.td}>{l.http_status ?? '—'}</td>
                  <td style={S.td}>{l.ip_address || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={S.pager}>
        <span>Page {page} of {totalPages}</span>
        <button style={S.pgBtn} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <button style={S.pgBtn} disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>
    </div>
  )
}

function eventColor(e: string) {
  const map: Record<string, string> = {
    login: '#10b981', logout: '#6366f1', page_view: '#3b82f6',
    form_submit: '#f59e0b', api_call: '#8b5cf6',
  }
  return map[e] || '#94a3b8'
}

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s }
