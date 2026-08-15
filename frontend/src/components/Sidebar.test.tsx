import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from './Sidebar'
import * as authContext from '../lib/auth/AuthContext'
import * as pagesApiModule from '../lib/api/pages'
import * as groupsApiModule from '../lib/api/groups'
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
        <Sidebar />
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
