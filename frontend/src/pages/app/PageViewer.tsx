import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '@/api/client'
import type { Page } from '@/types'
import DataTablePage from './DataTablePage'
import FormPage from './FormPage'

export default function PageViewer() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState<Page | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    api.get('/pages')
      .then((res) => {
        const found = (res.data.data as Page[]).find((p) => p.id === Number(id))
        if (found) setPage(found)
        else setError('Page not found or access denied.')
      })
      .catch(() => setError('Failed to load page.'))
  }, [id])

  if (error) return <p style={{ color: '#dc2626' }}>{error}</p>
  if (!page) return <p style={{ color: '#64748b' }}>Loading…</p>

  if (page.page_type === 'form') return <FormPage page={page} />
  return <DataTablePage page={page} />
}
