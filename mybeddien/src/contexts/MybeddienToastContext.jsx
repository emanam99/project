import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { MybeddienToastPortal } from '../components/MybeddienToast'

const MybeddienToastContext = createContext(null)

export function MybeddienToastProvider({ children, durationMs = 4000 }) {
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)

  const showToast = useCallback(
    (message, type = 'info') => {
      setToast({ message, type })
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = window.setTimeout(() => setToast(null), durationMs)
    },
    [durationMs]
  )

  const value = useMemo(() => ({ showToast }), [showToast])

  return (
    <MybeddienToastContext.Provider value={value}>
      {children}
      <MybeddienToastPortal toast={toast} />
    </MybeddienToastContext.Provider>
  )
}

export function useMybeddienToast() {
  const ctx = useContext(MybeddienToastContext)
  if (!ctx) {
    throw new Error('useMybeddienToast harus dipakai di dalam MybeddienToastProvider')
  }
  return ctx
}
