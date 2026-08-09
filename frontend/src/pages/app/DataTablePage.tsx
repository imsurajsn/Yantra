import { useEffect, useState } from 'react'
import api from '@/api/client'
import type { Page } from '@/types'

const S = {
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 } as const,
  title: { fontSize: 20, fontWeight: 600, color: '#1e293b' } as const,
  refreshBtn: { padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 } as const,
  tableWrap: { overflowX: 'auto' as const, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { padding: '10px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' as const, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' as const },
  td: { padding: '10px 16px', borderBottom: '1px solid #f1f5f9', color: '#1e293b', verticalAlign: 'top' as const },
  empty: { padding: '40px 16px', textAlign: 'center' as const, color: '#94a3b8' },
  err: { color: '#dc2626', fontSize: 14, padding: 16 } as const,
}

interface Props { page: Page }

export default function DataTablePage({ page }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/pages/${page.id}/data`)
      const data = res.data.data
      const arr: Record<string, unknown>[] = Array.isArray(data) ? data : (data ? [data] : [])
      setRows(arr)
      if (arr.length > 0) {
        setColumns(Object.keys(arr[0]))
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [page.id])

  return (
    <div>
      <div style={S.header}>
        <h2 style={S.title}>{page.title}</h2>
        <button style={S.refreshBtn} onClick={fetchData} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <p style={S.err}>{error}</p>}

      {!error && (
        <div style={S.tableWrap}>
          <table style={S.table}>
            {columns.length > 0 && (
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col} style={S.th}>{col}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.length === 0 && !loading ? (
                <tr>
                  <td colSpan={columns.length || 1} style={S.empty}>No data returned.</td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i}>
                    {columns.map((col) => (
                      <td key={col} style={S.td}>
                        {renderCell(row[col])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function renderCell(val: unknown): string {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'Yes' : 'No'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}
