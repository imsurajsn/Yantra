import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { pagesApi } from '../lib/api/pages'
import { TablePageViewer } from './TablePageViewer'
import { FormPageViewer } from './FormPageViewer'
import { NotAuthorizedPage } from './NotAuthorizedPage'

// /pages/:id dispatches to the Table or Form viewer based on the page's
// type — one route, since the sidebar/home links don't know (or need to
// know) the type ahead of time.
export function PageViewer() {
  const { id } = useParams<{ id: string }>()
  const pageId = Number(id)

  const { data: page, isLoading, error } = useQuery({ queryKey: ['pages', pageId], queryFn: () => pagesApi.get(pageId) })

  if (isLoading) return null
  if (error) return <NotAuthorizedPage />
  if (!page) return null

  return page.type === 'table' ? <TablePageViewer /> : <FormPageViewer />
}
