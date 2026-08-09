import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import type { Page } from '@/types'
import DataTablePage from './DataTablePage'
import FormPage from './FormPage'

export default function PageViewer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [page, setPage] = useState<Page | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api.get('/pages')
      .then(res => {
        const found = (res.data.data as Page[]).find(p => p.id === Number(id))
        if (found) setPage(found)
        else setError('Page not found or access denied.')
      })
      .catch(() => setError('Failed to load page.'))
  }, [id])

  if (error) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', textAlign: 'center' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent)', marginBottom: 'var(--space-4)' }}>
          <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        </svg>
        <h2>Not authorized</h2>
        <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-4)' }}>
          You don't have access to this page. Ask a workspace Admin or the page owner to grant you access.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/')}>Back to home</button>
      </div>
    )
  }

  if (!page) return <p className="text-muted" style={{ fontSize: 14 }}>Loading…</p>
  if (page.page_type === 'form') return <FormPage page={page} />
  return <DataTablePage page={page} />
}
