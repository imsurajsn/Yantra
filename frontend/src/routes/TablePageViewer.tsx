import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pagesApi, type TablePageConfig } from '../lib/api/pages'
import { ApiError } from '../lib/api/client'

const PAGE_SIZE_FALLBACK = 50

export function TablePageViewer() {
  const { id } = useParams<{ id: string }>()
  const pageId = Number(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: page, error: pageError } = useQuery({
    queryKey: ['pages', pageId],
    queryFn: () => pagesApi.get(pageId),
  })

  useEffect(() => {
    if (page) void pagesApi.recordView(pageId)
    // Fires once per page load, deliberately not on every re-render — a
    // page_view audit row means "this page was opened," not "data was
    // re-rendered" (sort/pagination must not spam it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, Boolean(page)])

  const {
    data: rows,
    isLoading: dataLoading,
    error: dataError,
  } = useQuery({
    queryKey: ['pages', pageId, 'data'],
    queryFn: () => pagesApi.data(pageId) as Promise<Record<string, unknown>[]>,
    enabled: Boolean(page),
  })

  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [pageIndex, setPageIndex] = useState(0)
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [writebackError, setWritebackError] = useState<string | null>(null)

  const config = page?.config as TablePageConfig | undefined
  const pageSize = config?.pagination.page_size || PAGE_SIZE_FALLBACK

  // Defensive: the backend contract guarantees a bare array (it now
  // extracts via items_path and errors out rather than passing through a
  // wrapped object), but this guards against any future/unexpected shape
  // reaching the render path — a `.slice()` on a non-array previously
  // crashed this whole component with no error boundary present.
  const rowsIsArray = Array.isArray(rows)

  const sortedRows = useMemo(() => {
    if (!Array.isArray(rows)) return []
    if (!sortKey) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  const pageRows = sortedRows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize)

  const writebackMutation = useMutation({
    mutationFn: ({ rowId, fields }: { rowId: string; fields: Record<string, unknown> }) =>
      pagesApi.writeback(pageId, rowId, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', pageId, 'data'] })
      setEditingRow(null)
    },
    onError: (err) => setWritebackError(err instanceof ApiError ? err.message : 'Failed to save.'),
  })

  if (pageError) {
    return (
      <div className="page">
        <p className="error">Failed to load page.</p>
      </div>
    )
  }
  if (!page || !config) return null

  const canWrite = page.can_edit
  const showActionsColumn = config.writeback.enabled && canWrite

  function toggleSort(key: string, sortable: boolean) {
    if (!sortable) return
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    setPageIndex(0)
  }

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <h2 style={{ margin: 0 }}>{page.name}</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {canWrite && (
            <button onClick={() => navigate(`/pages/${pageId}/edit`)}>Edit config</button>
          )}
          {page.can_delete && <DeletePageButton pageId={pageId} pageName={page.name} />}
        </div>
      </div>
      <span className="tag">{page.effective_role}</span>
      <p className="muted" style={{ marginTop: 8 }}>
        {page.description}
      </p>
      {config.writeback.enabled && (
        <div
          style={{
            background: 'var(--surface-2)',
            borderRadius: 8,
            padding: 12,
            fontSize: 12.5,
            marginBottom: 16,
          }}
        >
          Editable — saved changes call {config.writeback.method} {config.writeback.endpoint}
        </div>
      )}

      {dataLoading && <p className="muted">Loading…</p>}
      {dataError && <p className="error">Failed to load data from the configured endpoint.</p>}
      {rows && !rowsIsArray && (
        <p className="error">The configured endpoint returned an unexpected response shape.</p>
      )}
      {writebackError && <p className="error">{writebackError}</p>}

      {rowsIsArray && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {config.columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => toggleSort(c.key, c.sortable)}
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      textAlign: 'left',
                      cursor: c.sortable ? 'pointer' : undefined,
                    }}
                  >
                    {c.label}
                    {sortKey === c.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                  </th>
                ))}
                {showActionsColumn && <th />}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const rowId = String(row[config.writeback.id_field])
                const isEditing = editingRow === rowId
                return (
                  <tr key={rowId} style={{ borderBottom: '1px solid var(--border)' }}>
                    {config.columns.map((c) => (
                      <td key={c.key} style={{ padding: '8px 12px', fontSize: 13 }}>
                        {isEditing && c.editable ? (
                          <input
                            value={String(draft[c.key] ?? row[c.key] ?? '')}
                            onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
                          />
                        ) : (
                          String(row[c.key] ?? '')
                        )}
                      </td>
                    ))}
                    {showActionsColumn && (
                      <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <>
                            <button
                              style={{ fontSize: 12 }}
                              disabled={writebackMutation.isPending}
                              onClick={() => {
                                setWritebackError(null)
                                writebackMutation.mutate({ rowId, fields: draft })
                              }}
                            >
                              Save
                            </button>{' '}
                            <button style={{ fontSize: 12 }} onClick={() => setEditingRow(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            style={{ fontSize: 12 }}
                            onClick={() => {
                              setEditingRow(rowId)
                              setDraft({})
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            <span className="muted" style={{ fontSize: 12 }}>
              Showing {sortedRows.length === 0 ? 0 : pageIndex * pageSize + 1}–
              {Math.min(pageIndex * pageSize + pageSize, sortedRows.length)} of {sortedRows.length}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button disabled={pageIndex === 0} onClick={() => setPageIndex(pageIndex - 1)}>
                ‹
              </button>
              <button
                disabled={pageIndex * pageSize + pageSize >= sortedRows.length}
                onClick={() => setPageIndex(pageIndex + 1)}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DeletePageButton({ pageId, pageName }: { pageId: number; pageName: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => pagesApi.remove(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      navigate('/', { replace: true })
    },
  })

  if (!confirming) {
    return <button onClick={() => setConfirming(true)}>Delete</button>
  }
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span className="muted" style={{ fontSize: 12 }}>
        Delete {pageName}?
      </span>
      <button disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
        Confirm
      </button>
      <button onClick={() => setConfirming(false)}>Cancel</button>
    </span>
  )
}
