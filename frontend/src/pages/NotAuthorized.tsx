import { useNavigate } from 'react-router-dom'

export default function NotAuthorized() {
  const navigate = useNavigate()
  return (
    <div style={{ maxWidth: 420, margin: '60px auto', textAlign: 'center' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent)', marginBottom: 'var(--space-4)' }}>
        <rect x="5" y="11" width="14" height="9" rx="2"/>
        <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
      </svg>
      <h2>Not authorized</h2>
      <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 'var(--space-4)' }}>
        You don't have access to this page. Ask a workspace Admin or the page owner to grant you access.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/')}>Back to home</button>
    </div>
  )
}
