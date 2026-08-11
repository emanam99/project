import { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import GlobalSyncOutboxOffcanvas from '../components/GlobalSyncOutboxOffcanvas'

const GlobalSyncOutboxContext = createContext(null)

const OPEN_EVENT = 'ebeddien-open-sync-outbox'

/**
 * Satu instance offcanvas antrean sinkron (global, semua modul) untuk seluruh app.
 */
export function GlobalSyncOutboxProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])
  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  useEffect(() => {
    const onWin = () => setIsOpen(true)
    window.addEventListener(OPEN_EVENT, onWin)
    return () => window.removeEventListener(OPEN_EVENT, onWin)
  }, [])

  const value = useMemo(() => ({ open, close, isOpen }), [open, close, isOpen])

  return (
    <GlobalSyncOutboxContext.Provider value={value}>
      {children}
      <GlobalSyncOutboxOffcanvas isOpen={isOpen} onClose={close} />
    </GlobalSyncOutboxContext.Provider>
  )
}

export function useGlobalSyncOutbox() {
  const ctx = useContext(GlobalSyncOutboxContext)
  if (!ctx) {
    throw new Error('useGlobalSyncOutbox must be used within GlobalSyncOutboxProvider')
  }
  return ctx
}

/** Buka offcanvas antrean sinkron dari mana saja (tanpa hook), mis. aksi programatik. */
export function openGlobalSyncOutboxFromAnywhere() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}
