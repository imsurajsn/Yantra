import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

interface UnsavedChangesContextValue {
  isDirty: boolean
  setDirty: (dirty: boolean) => void
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null)

// Tracks whether the current screen has unsaved edits (the page config
// YAML editor sets this while typing, clears it on save). The sidebar logo
// checks this before navigating home. Also guards an actual tab close /
// refresh via beforeunload — same "finish your unsaved business first"
// intent, for the case the browser's own chrome controls and no custom
// dialog can intercept.
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [isDirty, setDirty] = useState(false)

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  return <UnsavedChangesContext.Provider value={{ isDirty, setDirty }}>{children}</UnsavedChangesContext.Provider>
}

export function useUnsavedChanges(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext)
  if (!ctx) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider')
  }
  return ctx
}
