import type { ReactNode } from 'react'

// Shared by every auth-flow screen (setup/login/force-password-change) —
// all three are a single centered card, so this is genuine reuse rather
// than a premature abstraction.
export function AuthScreenLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-screen">
      <div className="auth-card">{children}</div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
