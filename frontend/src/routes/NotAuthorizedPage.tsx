export function NotAuthorizedPage() {
  return (
    <div className="page" style={{ textAlign: 'center', marginTop: 80 }}>
      <h1>Not authorized</h1>
      <p className="muted">You don't have access to this page. Ask a workspace Admin or the page owner to grant you access.</p>
    </div>
  )
}
