import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '@/api/client'
import type { Page, PageACLEntry, Group, User } from '@/types'

interface Props { mode?: 'create' | 'edit' }

type ConfigStage = 'edit' | 'preview'
type PageType = 'data_table' | 'form'

interface ParsedConfig {
  title?: string
  description?: string
  group?: string
  page_type?: string
  method?: string
  endpoint?: string
  url?: string
  authHeaders?: Record<string, string>
  columns?: { key: string; label: string; sortable?: boolean; editable?: boolean }[]
  fields?: { key: string; label: string; type?: string; required?: boolean; sensitive?: boolean; options?: string[] }[]
  writeback?: { enabled: boolean; method?: string; endpoint?: string }
}

function parseYaml(yaml: string): { config: ParsedConfig | null; errors: { line: number; message: string }[] } {
  const errors: { line: number; message: string }[] = []
  try {
    // Light YAML subset parser: key: value, nested via indentation
    // Enough for the page config schema
    const lines = yaml.split('\n')
    const obj: Record<string, unknown> = {}
    const stack: { indent: number; obj: Record<string, unknown> }[] = [{ indent: -1, obj }]
    let lastKey = ''
    let inList = false
    let listItems: Record<string, unknown>[] = []
    let listKey = ''

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]
      const trimmed = raw.trimEnd()
      if (!trimmed || trimmed.trim().startsWith('#')) continue
      const indent = raw.length - raw.trimStart().length
      const content = trimmed.trim()

      if (content.startsWith('- ')) {
        // list item
        if (!inList) { inList = true; listItems = []; }
        const itemContent = content.slice(2)
        if (itemContent.includes(':')) {
          const item: Record<string, unknown> = {}
          // parse inline key-values for list items
          const kvMatch = itemContent.match(/^([^:]+):\s*(.*)$/)
          if (kvMatch) item[kvMatch[1].trim()] = kvMatch[2].trim()
          listItems.push(item)
        } else {
          listItems.push({ value: itemContent })
        }
        continue
      }

      if (inList && content.includes(':') && !content.startsWith('-')) {
        // continuation of list item properties
        const last = listItems[listItems.length - 1]
        if (last) {
          const kvMatch = content.match(/^([^:]+):\s*(.*)$/)
          if (kvMatch) last[kvMatch[1].trim()] = kvMatch[2].trim() || true
          continue
        }
      }

      if (inList) {
        // flush list
        const top = stack[stack.length - 1].obj
        top[listKey] = listItems
        inList = false; listItems = []
      }

      if (content.endsWith(':')) {
        lastKey = content.slice(0, -1).trim()
        const top = stack[stack.length - 1].obj
        const newObj: Record<string, unknown> = {}
        top[lastKey] = newObj
        stack.push({ indent, obj: newObj })
        continue
      }

      const kvMatch = content.match(/^([^:]+):\s*(.*)$/)
      if (kvMatch) {
        const key = kvMatch[1].trim()
        const value = kvMatch[2].trim()
        if (!value) {
          // next lines may be a list
          listKey = key
          inList = false
        } else {
          const top = stack[stack.length - 1].obj
          top[key] = value === 'true' ? true : value === 'false' ? false : value
        }
      }
    }

    if (inList) {
      const top = stack[stack.length - 1].obj
      top[listKey] = listItems
    }

    if (!obj.title) errors.push({ line: 1, message: '`title` is required' })
    if (!obj.endpoint && !obj.url) errors.push({ line: 1, message: '`endpoint` or `url` is required' })

    return { config: obj as unknown as ParsedConfig, errors }
  } catch {
    errors.push({ line: 1, message: 'Invalid YAML — check your formatting' })
    return { config: null, errors }
  }
}

const DEFAULT_TABLE_YAML = `title: My Data Table
description: A description of this page.
group: General
page_type: data_table
method: GET
endpoint: https://api.example.com/records
authHeaders:
  Authorization: Bearer [REDACTED]
columns:
  - key: id
    label: ID
  - key: name
    label: Name
    sortable: true
  - key: status
    label: Status
`

const DEFAULT_FORM_YAML = `title: My Form
description: A description of this page.
group: General
page_type: form
method: POST
endpoint: https://api.example.com/submit
authHeaders:
  Authorization: Bearer [REDACTED]
fields:
  - key: name
    label: Full name
    type: text
    required: true
  - key: email
    label: Email address
    type: text
    required: true
  - key: message
    label: Message
    type: text
`

function ACLDialog({ pageId, onClose }: { pageId: number; onClose: () => void }) {
  const [acl, setAcl] = useState<PageACLEntry[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [addType, setAddType] = useState<'group' | 'user'>('group')
  const [addId, setAddId] = useState('')
  const [addRole, setAddRole] = useState<'Viewer' | 'Editor' | 'Owner'>('Viewer')
  const [matrixMode, setMatrixMode] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get(`/pages/${pageId}/acl`),
      api.get('/groups'),
      api.get('/admin/users'),
    ]).then(([aclR, gR, uR]) => {
      setAcl(aclR.data.data || [])
      setGroups(gR.data.data || [])
      setUsers(uR.data.data || [])
    })
  }, [pageId])

  const subjectLabel = (entry: PageACLEntry) => {
    if (entry.subject_type === 'group') {
      return groups.find(g => g.id === entry.subject_id)?.name || `Group #${entry.subject_id}`
    }
    const u = users.find(u => u.id === entry.subject_id)
    return u ? `${u.display_name} <${u.email}>` : `User #${entry.subject_id}`
  }

  const handleAdd = async () => {
    if (!addId) return
    await api.post(`/pages/${pageId}/acl`, { subject_type: addType, subject_id: Number(addId), page_role: addRole })
    const r = await api.get(`/pages/${pageId}/acl`)
    setAcl(r.data.data || [])
    setAddId('')
  }

  const handleRemove = async (entry: PageACLEntry) => {
    await api.delete(`/pages/${pageId}/acl/${entry.id}`)
    setAcl(a => a.filter(e => e.id !== entry.id))
  }

  const addOptions = addType === 'group'
    ? groups.filter(g => !acl.some(a => a.subject_type === 'group' && a.subject_id === g.id))
    : users.filter(u => !acl.some(a => a.subject_type === 'user' && a.subject_id === u.id))

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ width: 'min(560px, 100%)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="dialog-title">Manage access</div>
          <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setMatrixMode(m => !m)}>
            {matrixMode ? 'Switch to list' : 'Switch to matrix'}
          </button>
        </div>

        {!matrixMode ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {acl.map(entry => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <span>{entry.subject_type === 'group' ? '👥' : '👤'}</span>
                  <span>{subjectLabel(entry)}</span>
                  <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>{entry.page_role}</span>
                  <button className="btn btn-ghost btn-icon" style={{ width: 26, height: 26 }} onClick={() => handleRemove(entry)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
              {acl.length === 0 && <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>No one has access yet.</p>}
            </div>
            <div className="hr" />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <select className="input" style={{ width: 90 }} value={addType} onChange={e => { setAddType(e.target.value as 'group' | 'user'); setAddId('') }}>
                <option value="group">Group</option>
                <option value="user">Person</option>
              </select>
              <select className="input" style={{ flex: 1 }} value={addId} onChange={e => setAddId(e.target.value)}>
                <option value="">Choose…</option>
                {addOptions.map(o => <option key={o.id} value={o.id}>{'name' in o ? o.name : (o as User).display_name}</option>)}
              </select>
              <select className="input" style={{ width: 90 }} value={addRole} onChange={e => setAddRole(e.target.value as typeof addRole)}>
                <option value="Viewer">Viewer</option>
                <option value="Editor">Editor</option>
                <option value="Owner">Owner</option>
              </select>
              <button className="btn btn-secondary" onClick={handleAdd}>Add</button>
            </div>
          </>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Subject</th><th>None</th><th>Viewer</th><th>Editor</th><th>Owner</th></tr></thead>
              <tbody>
                {[...groups.map(g => ({ type: 'group' as const, id: g.id, label: g.name })), ...users.map(u => ({ type: 'user' as const, id: u.id, label: `${u.display_name}` }))].map(subject => {
                  const entry = acl.find(a => a.subject_type === subject.type && a.subject_id === subject.id)
                  const currentRole = entry?.page_role || 'None'
                  const setRole = async (role: string) => {
                    if (role === 'None') {
                      if (entry) await handleRemove(entry)
                    } else if (entry) {
                      // update via upsert
                      await api.post(`/pages/${pageId}/acl`, { subject_type: subject.type, subject_id: subject.id, page_role: role })
                    } else {
                      await api.post(`/pages/${pageId}/acl`, { subject_type: subject.type, subject_id: subject.id, page_role: role })
                    }
                    const r = await api.get(`/pages/${pageId}/acl`)
                    setAcl(r.data.data || [])
                  }
                  return (
                    <tr key={`${subject.type}-${subject.id}`}>
                      <td>{subject.type === 'group' ? '👥' : '👤'} {subject.label}</td>
                      {['None', 'Viewer', 'Editor', 'Owner'].map(role => (
                        <td key={role} style={{ textAlign: 'center' }}>
                          <label className="radio" style={{ justifyContent: 'center' }}>
                            <input type="radio" name={`acl-${subject.type}-${subject.id}`} checked={currentRole === role} onChange={() => setRole(role)} />
                            <span className="dot" />
                          </label>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

export default function AdminPages({ mode }: Props) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [pages, setPages] = useState<Page[]>([])
  const [deleteTarget, setDeleteTarget] = useState<Page | null>(null)
  const [showAcl, setShowAcl] = useState<number | null>(null)

  // YAML editor state
  const [chooseType, setChooseType] = useState(false)
  const [yamlText, setYamlText] = useState('')
  const [stage, setStage] = useState<ConfigStage>('edit')
  const [yamlErrors, setYamlErrors] = useState<{ line: number; message: string }[]>([])
  const [parsedConfig, setParsedConfig] = useState<ParsedConfig | null>(null)
  const [saving, setSaving] = useState(false)

  const loadPages = () => api.get('/pages').then(r => setPages(r.data.data || []))

  useEffect(() => { loadPages() }, [])

  useEffect(() => {
    if (mode === 'edit' && id) {
      api.get(`/pages/${id}/config`).then(r => {
        // Try to reconstruct yaml from config object
        const cfg = r.data
        const yaml = configToYaml(cfg)
        setYamlText(yaml)
        setStage('edit')
      })
    }
  }, [mode, id])

  const configToYaml = (cfg: Record<string, unknown>): string => {
    const lines: string[] = []
    const str = (k: string, v: unknown) => `${k}: ${v}`
    if (cfg.title) lines.push(str('title', cfg.title))
    if (cfg.description) lines.push(str('description', cfg.description))
    if (cfg.group) lines.push(str('group', cfg.group))
    lines.push(str('page_type', cfg.page_type || 'data_table'))
    const config = (cfg.config as Record<string, unknown>) || {}
    if (config.method) lines.push(str('method', config.method))
    if (config.url) lines.push(str('endpoint', config.url))
    if (config.auth_header_name && config.auth_header_value) {
      lines.push('authHeaders:')
      lines.push(`  ${config.auth_header_name}: ${config.auth_header_value}`)
    }
    const cols = config.columns as unknown[]
    if (cols?.length) {
      lines.push('columns:')
      cols.forEach((c: unknown) => {
        const col = c as { key: string; label: string }
        lines.push(`  - key: ${col.key}`)
        lines.push(`    label: ${col.label}`)
      })
    }
    const flds = config.fields as unknown[]
    if (flds?.length) {
      lines.push('fields:')
      flds.forEach((f: unknown) => {
        const fld = f as { key: string; label: string; type?: string; required?: boolean }
        lines.push(`  - key: ${fld.key}`)
        lines.push(`    label: ${fld.label}`)
        if (fld.type) lines.push(`    type: ${fld.type}`)
        if (fld.required) lines.push(`    required: true`)
      })
    }
    return lines.join('\n')
  }

  const handleValidate = () => {
    const { config, errors } = parseYaml(yamlText)
    setYamlErrors(errors)
    if (errors.length === 0 && config) {
      setParsedConfig(config)
      setStage('preview')
    }
  }

  const handleSave = async () => {
    if (!parsedConfig) return
    setSaving(true)
    try {
      const pageType: PageType = (parsedConfig.page_type === 'form' ? 'form' : 'data_table')
      const payload = {
        title: parsedConfig.title,
        description: parsedConfig.description,
        group: parsedConfig.group,
        page_type: pageType,
        config: {
          url: parsedConfig.endpoint || parsedConfig.url || '',
          method: parsedConfig.method || 'GET',
          auth_header_name: parsedConfig.authHeaders ? Object.keys(parsedConfig.authHeaders)[0] : undefined,
          auth_header_value: parsedConfig.authHeaders ? Object.values(parsedConfig.authHeaders)[0] : undefined,
          columns: parsedConfig.columns,
          fields: parsedConfig.fields,
          writeback: parsedConfig.writeback,
        },
      }
      if (mode === 'edit' && id) {
        await api.put(`/pages/${id}/config`, payload)
      } else {
        await api.post('/pages', payload)
      }
      navigate('/admin/pages')
      loadPages()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      alert(e.response?.data?.error || 'Failed to save page')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await api.delete(`/pages/${deleteTarget.id}`)
    setDeleteTarget(null); loadPages()
  }

  const isTableConfig = parsedConfig?.page_type !== 'form'

  // ── List view ──
  if (!mode) {
    return (
      <div style={{ maxWidth: 1040 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
          <h2 style={{ margin: 0 }}>Pages</h2>
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setChooseType(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New page
          </button>
        </div>
        <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-4)' }}>{pages.length} page{pages.length !== 1 ? 's' : ''} in this workspace.</p>

        <div className="card elev-sm" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Title</th><th>Type</th><th>Group</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {pages.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 'var(--space-4)' }}><span className="text-muted" style={{ fontSize: 13 }}>No pages yet.</span></td></tr>
              )}
              {pages.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 500 }}>{p.title}</td>
                  <td className="text-muted">{p.page_type === 'form' ? 'Form' : 'Data Table'}</td>
                  <td className="text-muted">{p.group || '—'}</td>
                  <td className="text-muted">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => navigate(`/admin/pages/${p.id}/edit`)}>Edit config</button>{' '}
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowAcl(p.id)}>Access</button>{' '}
                    <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setDeleteTarget(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {chooseType && (
          <div className="dialog-backdrop" onClick={() => setChooseType(false)}>
            <div className="dialog" onClick={e => e.stopPropagation()}>
              <div className="dialog-title">New page</div>
              <div className="dialog-body">Choose the page type. Both are config-driven via YAML — no visual builder in V1.</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary btn-block" onClick={() => { navigate('/admin/pages/new?type=data_table'); setChooseType(false) }}>Data Table Page</button>
                <button className="btn btn-secondary btn-block" onClick={() => { navigate('/admin/pages/new?type=form'); setChooseType(false) }}>Form Page</button>
              </div>
              <div className="dialog-actions"><button className="btn btn-ghost" onClick={() => setChooseType(false)}>Cancel</button></div>
            </div>
          </div>
        )}

        {deleteTarget && (
          <div className="dialog-backdrop" onClick={() => setDeleteTarget(null)}>
            <div className="dialog" onClick={e => e.stopPropagation()}>
              <div className="dialog-title">Delete page</div>
              <div className="dialog-body">Deleting <strong>{deleteTarget.title}</strong> is permanent and removes it for everyone with access.</div>
              <div className="dialog-actions">
                <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleDelete}>Delete page</button>
              </div>
            </div>
          </div>
        )}

        {showAcl !== null && <ACLDialog pageId={showAcl} onClose={() => setShowAcl(null)} />}
      </div>
    )
  }

  // ── Create / Edit view ──
  const isNew = mode === 'create'
  const pageTypeFromQuery = new URLSearchParams(window.location.search).get('type') as PageType | null

  const initYaml = () => {
    if (yamlText) return
    if (pageTypeFromQuery === 'form') setYamlText(DEFAULT_FORM_YAML)
    else setYamlText(DEFAULT_TABLE_YAML)
  }
  if (!yamlText && isNew) initYaml()

  return (
    <div style={{ maxWidth: 1040 }}>
      <h2 style={{ marginBottom: 2 }}>{isNew ? 'New page' : 'Edit page config'}</h2>
      <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-5)' }}>
        {isNew ? 'Define the page in YAML, then validate and preview before saving.' : 'Edit the YAML config, then validate and preview before saving.'}
      </p>

      {stage === 'edit' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--color-divider)' }}>
              <span style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>page.yaml</span>
              <span className="tag tag-outline" style={{ marginLeft: 'auto' }}>YAML</span>
            </div>
            <textarea
              className="input"
              style={{ width: '100%', minHeight: 440, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, lineHeight: 1.7, border: 'none', borderRadius: 0, resize: 'vertical', background: 'var(--color-bg)' }}
              value={yamlText}
              onChange={e => setYamlText(e.target.value)}
              spellCheck={false}
            />
            {yamlErrors.length > 0 && (
              <div style={{ padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-divider)', background: 'var(--color-neutral-800)' }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{yamlErrors.length} issue(s) — fix before previewing</div>
                {yamlErrors.map((err, i) => (
                  <div key={i} style={{ fontSize: 12, display: 'flex', gap: 8, marginBottom: 3 }}>
                    <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>Line {err.line}</span>
                    {err.message}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, padding: 'var(--space-3) var(--space-4)', borderTop: '1px solid var(--color-divider)' }}>
              <button className="btn btn-primary" onClick={handleValidate}>Validate & preview</button>
              <button className="btn btn-ghost" onClick={() => navigate('/admin/pages')}>Cancel</button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {!isNew && id && (
              <div className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                  <h4 style={{ margin: 0 }}>Access</h4>
                  <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 12.5 }} onClick={() => setShowAcl(Number(id))}>Manage</button>
                </div>
                <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Manage who can view or edit this page.</p>
              </div>
            )}
            <div className="card" style={{ padding: 'var(--space-4)' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13 }}>Schema reference</h4>
              <div className="text-muted" style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1.6, fontSize: 12 }}>
                <span>title, description, group</span>
                <span>page_type: data_table | form</span>
                <span>method, endpoint, authHeaders</span>
                {pageTypeFromQuery !== 'form'
                  ? <><span>columns: key, label, sortable, editable</span><span>writeback: enabled, method, endpoint</span></>
                  : <span>fields: key, label, type, required, sensitive, options</span>
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {stage === 'preview' && parsedConfig && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={() => setStage('edit')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back to editor
            </button>
            <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save page'}
            </button>
          </div>
          <div style={{ background: 'var(--color-neutral-800)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 12.5, marginBottom: 'var(--space-4)' }}>
            This is what a user with access will see.{isNew && ' Sample data shown until this is connected to a live endpoint.'}
          </div>

          <div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ margin: '0 0 4px' }}>{parsedConfig.title}</h2>
            <p className="text-muted" style={{ fontSize: 13.5, margin: 0 }}>{parsedConfig.description}</p>
          </div>

          {isTableConfig ? (
            <div className="card elev-sm" style={{ padding: 0 }}>
              <table className="table">
                <thead><tr>
                  {(parsedConfig.columns || [{ key: 'col1', label: 'Column 1' }, { key: 'col2', label: 'Column 2' }]).map((c: { key: string; label: string }) => <th key={c.key}>{c.label}</th>)}
                </tr></thead>
                <tbody>
                  {[1, 2, 3].map(i => (
                    <tr key={i}>
                      {(parsedConfig.columns || [{ key: 'col1' }, { key: 'col2' }]).map((c: { key: string }) => (
                        <td key={c.key} className="text-muted">Sample data {i}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {(parsedConfig.fields || []).map((f: { key: string; label: string; type?: string }) => (
                <div key={f.key} className="field">
                  <label>{f.label}</label>
                  <input className="input" disabled placeholder={`Enter ${f.label.toLowerCase()}…`} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showAcl !== null && <ACLDialog pageId={showAcl} onClose={() => setShowAcl(null)} />}
    </div>
  )
}
