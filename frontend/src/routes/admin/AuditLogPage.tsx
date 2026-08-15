import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '../../lib/api/audit'

const EVENT_TYPES = ['login', 'login_failed', 'logout', 'page_view', 'form_submit', 'api_call']

export function AuditLogPage() {
  const [eventType, setEventType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['audit-log', eventType, from, to],
    queryFn: () => auditApi.list({ event_type: eventType || undefined, from: from || undefined, to: to || undefined }),
  })

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <h1 style={{ marginBottom: 2 }}>Audit Log</h1>
      <p className="muted">Every login, page view, form submission and API call, kept forever.</p>

      <div style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
          <option value="">All actions</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {error && <p className="error">Failed to load audit log.</p>}

      {data && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <Th>Timestamp</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Result</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <Td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {e.timestamp}
                  </Td>
                  <Td>{e.user_email}</Td>
                  <Td>{e.event_type}</Td>
                  <Td className="muted">{e.target}</Td>
                  <Td>
                    <span className="tag">{resultLabel(e)}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <p className="muted" style={{ padding: 16 }}>No matching events.</p>}
        </div>
      )}
    </div>
  )
}

function resultLabel(e: { event_type: string; status_code?: number }) {
  if (e.event_type === 'login_failed') return 'failed'
  if (e.status_code !== undefined) return e.status_code >= 200 && e.status_code < 300 ? 'success' : `${e.status_code}`
  return 'success'
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th style={{ padding: '10px 16px', fontSize: 12, fontWeight: 500 }}>{children}</th>
}

function Td({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <td className={className} style={{ padding: '10px 16px', fontSize: 13, ...style }}>
      {children}
    </td>
  )
}
