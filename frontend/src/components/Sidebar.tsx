import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { pagesApi } from '../lib/api/pages'
import { groupsApi } from '../lib/api/groups'
import { useAuth } from '../lib/auth/AuthContext'
import { TableIcon, FormIcon, UsersIcon, GroupsIcon, AuditIcon } from './Icons'

// The mockup's left sidebar: pages listed grouped by their Group, plus a
// role-conditional bottom section — "Admin" (Users/Groups/Audit Log) for
// Admins, "Workspace" (Groups only) for Members, nothing extra for
// Viewers. This mirrors the mockup's own persona-conditional nav
// (`showAdminNav`/`showGroupsOnlyNav`) rather than re-deriving RBAC logic:
// it's a UI-layout branch, not a security boundary — every route it links
// to is independently permission-checked server-side regardless of what's
// shown here.
export function Sidebar() {
  const { user } = useAuth()
  const { data: pages } = useQuery({ queryKey: ['pages'], queryFn: pagesApi.list })
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  const groupsById = new Map((groups ?? []).map((g) => [g.id, g.name]))
  const pagesByGroup = new Map<number, typeof pages>()
  for (const p of pages ?? []) {
    const list = pagesByGroup.get(p.page_group_id) ?? []
    list.push(p)
    pagesByGroup.set(p.page_group_id, list)
  }

  return (
    <aside
      style={{
        width: 240,
        flex: 'none',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 12px',
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', marginBottom: 20 }}>
        <div
          style={{
            width: 26,
            height: 26,
            border: '1.5px solid var(--accent)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Y
        </div>
        <div style={{ fontWeight: 500, fontSize: 16 }}>Yantra</div>
      </div>

      {pagesByGroup.size > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Pages</SectionLabel>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {[...pagesByGroup.entries()].map(([groupId, groupPages]) => (
              <div key={groupId} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)', padding: '4px 8px' }}>
                  {groupsById.get(groupId) ?? `Group ${groupId}`}
                </div>
                {groupPages?.map((p) => (
                  <NavLink key={p.id} to={`/pages/${p.id}`} style={navStyle}>
                    {p.type === 'table' ? <TableIcon /> : <FormIcon />}
                    {p.name}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>
      )}

      {user?.role === 'admin' && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Admin</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <NavLink to="/users" style={navStyle}>
              <UsersIcon />
              Users
            </NavLink>
            <NavLink to="/groups" style={navStyle}>
              <GroupsIcon />
              Groups
            </NavLink>
            <NavLink to="/audit-log" style={navStyle}>
              <AuditIcon />
              Audit Log
            </NavLink>
          </div>
        </div>
      )}
      {user?.role === 'member' && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel>Workspace</SectionLabel>
          <NavLink to="/groups" style={navStyle}>
            <GroupsIcon />
            Groups
          </NavLink>
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <NavLink to="/profile" style={navStyle}>
          Profile
        </NavLink>
      </div>
    </aside>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--muted)',
        padding: '0 8px',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  )
}

function navStyle({ isActive }: { isActive: boolean }) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    fontSize: 13.5,
    textDecoration: 'none',
    color: isActive ? 'var(--accent)' : 'var(--text)',
    background: isActive ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
  }
}
