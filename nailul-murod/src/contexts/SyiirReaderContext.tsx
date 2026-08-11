import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'nailulMurodSyiirLayoutMode'

export type SyiirLayoutMode = 'paired' | 'stacked'

export type SyiirReaderContextValue = {
  hasSyiir: boolean
  registerHasSyiir: (value: boolean) => void
  layoutMode: SyiirLayoutMode
  setLayoutMode: (mode: SyiirLayoutMode) => void
  toggleLayoutMode: () => void
}

const SyiirReaderContext = createContext<SyiirReaderContextValue | null>(null)

function readStoredMode(): SyiirLayoutMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'stacked' || v === 'paired') return v
  } catch {
    /* ignore */
  }
  return 'paired'
}

export function SyiirReaderProvider({ children }: { children: ReactNode }) {
  const [hasSyiir, setHasSyiir] = useState(false)
  const [layoutMode, setLayoutModeState] = useState<SyiirLayoutMode>(readStoredMode)

  const registerHasSyiir = useCallback((value: boolean) => {
    setHasSyiir(value)
  }, [])

  const setLayoutMode = useCallback((mode: SyiirLayoutMode) => {
    setLayoutModeState(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* ignore */
    }
  }, [])

  const toggleLayoutMode = useCallback(() => {
    setLayoutModeState((prev) => {
      const next: SyiirLayoutMode = prev === 'paired' ? 'stacked' : 'paired'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const value = useMemo<SyiirReaderContextValue>(
    () => ({
      hasSyiir,
      registerHasSyiir,
      layoutMode,
      setLayoutMode,
      toggleLayoutMode,
    }),
    [hasSyiir, registerHasSyiir, layoutMode, setLayoutMode, toggleLayoutMode],
  )

  return (
    <SyiirReaderContext.Provider value={value}>{children}</SyiirReaderContext.Provider>
  )
}

export function useSyiirReader(): SyiirReaderContextValue {
  const ctx = useContext(SyiirReaderContext)
  if (!ctx) {
    throw new Error('useSyiirReader harus di dalam SyiirReaderProvider')
  }
  return ctx
}
