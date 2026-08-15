import type { ReactNode } from 'react'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  actions: ReactNode
}

// One shared modal for every confirm/create dialog (new user, reset
// password, deactivate confirmation, ...) rather than each screen rolling
// its own backdrop/keyboard handling.
export function Dialog({ title, onClose, children, actions }: DialogProps) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: 'min(420px, calc(100vw - 48px))', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{actions}</div>
      </div>
    </div>
  )
}
