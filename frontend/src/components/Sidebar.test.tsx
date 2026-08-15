import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import * as authContext from '../lib/auth/AuthContext'
import * as pagesApiModule from '../lib/api/pages'
import * as groupsApiModule from '../lib/api/groups'
import * as unsavedChangesModule from '../lib/unsavedChanges'
import { UnsavedChangesProvider } from '../lib/unsavedChanges'
import type { User } from '../lib/api/auth'

// Directly encodes the three reference screenshots' expected sidebar
// content per role, since a mismatch here has twice slipped past manual
// review — this is a regression guard, not just a smoke test.

function mockUser(role: string): User {
  return {
    id: 1,
    email: 'x@example.com',
    display_name: 'Test User',
    role,
    must_change_password: false,
    is_active: true,
    last_login_at: null,
  }
}

function renderSidebar(role: string) {
  vi.spyOn(authContext, 'useAuth').mockReturnValue({
    status: 'authenticated',
    user: mockUser(role),
    groups: [],
    can: () => true,
    refetch: vi.fn(),
    clearSession: vi.fn(),
  })
  vi.spyOn(pagesApiModule.pagesApi, 'list').mockResolvedValue([])
  vi.spyOn(groupsApiModule.groupsApi, 'list').mockResolvedValue([])

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UnsavedChangesProvider>
          <Sidebar />
        </UnsavedChangesProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sidebar — role-conditional bottom section', () => {
  it('shows Users, Groups, and Audit Log under an Admin section for admin', async () => {
    renderSidebar('admin')
    expect(await screen.findByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Groups')).toBeInTheDocument()
    expect(screen.getByText('Audit Log')).toBeInTheDocument()
  })

  it('shows only Groups under a Workspace section for member, no Users/Audit Log', async () => {
    renderSidebar('member')
    expect(await screen.findByText('Workspace')).toBeInTheDocument()
    expect(screen.getByText('Groups')).toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })

  it('shows neither Admin nor Workspace section for viewer', async () => {
    renderSidebar('viewer')
    // Wait for the async page/group queries to settle before asserting
    // absence, so this isn't just "not rendered yet."
    await screen.findByText('Yantra')
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Groups')).not.toBeInTheDocument()
    expect(screen.queryByText('Audit Log')).not.toBeInTheDocument()
  })

  it('always shows Profile regardless of role', async () => {
    renderSidebar('viewer')
    expect(await screen.findByText('Profile')).toBeInTheDocument()
  })
})

// The Yantra logo/home link: clicking it should navigate straight home
// when there's nothing unsaved, but prompt first when there is — this is
// the actual feature requested, not just "is it clickable."
describe('Sidebar — logo click and the unsaved-changes guard', () => {
  function renderWithHomeRoute(isDirty: boolean) {
    vi.spyOn(authContext, 'useAuth').mockReturnValue({
      status: 'authenticated',
      user: mockUser('admin'),
      groups: [],
      can: () => true,
      refetch: vi.fn(),
      clearSession: vi.fn(),
    })
    vi.spyOn(pagesApiModule.pagesApi, 'list').mockResolvedValue([])
    vi.spyOn(groupsApiModule.groupsApi, 'list').mockResolvedValue([])
    const setDirty = vi.fn()
    vi.spyOn(unsavedChangesModule, 'useUnsavedChanges').mockReturnValue({ isDirty, setDirty })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/users']}>
          <Routes>
            <Route path="/" element={<div>HOME SCREEN MARKER</div>} />
            <Route path="/users" element={<Sidebar />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return { setDirty }
  }

  it('navigates straight home on click when there is nothing unsaved', async () => {
    renderWithHomeRoute(false)
    fireEvent.click(screen.getByTitle('Go to Home'))
    expect(await screen.findByText('HOME SCREEN MARKER')).toBeInTheDocument()
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
  })

  it('prompts before navigating home when there are unsaved changes, and does not navigate if the user backs out', async () => {
    renderWithHomeRoute(true)
    fireEvent.click(screen.getByTitle('Go to Home'))
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument()
    expect(screen.queryByText('HOME SCREEN MARKER')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Keep editing'))
    expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument()
    expect(screen.queryByText('HOME SCREEN MARKER')).not.toBeInTheDocument()
  })

  it('navigates home and clears the dirty flag when the user confirms leaving', async () => {
    const { setDirty } = renderWithHomeRoute(true)
    fireEvent.click(screen.getByTitle('Go to Home'))
    fireEvent.click(await screen.findByText('Leave anyway'))
    expect(await screen.findByText('HOME SCREEN MARKER')).toBeInTheDocument()
    expect(setDirty).toHaveBeenCalledWith(false)
  })
})
