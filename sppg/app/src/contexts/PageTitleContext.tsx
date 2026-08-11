import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type PageTitleContextValue = {
  title: string
  setTitle: (title: string) => void
}

const PageTitleContext = createContext<PageTitleContextValue | null>(null)

const DEFAULT_TITLE = 'SPPG'

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitleState] = useState(DEFAULT_TITLE)

  const setTitle = useCallback((next: string) => {
    const cleaned = next.trim() || DEFAULT_TITLE
    setTitleState((prev) => (prev === cleaned ? prev : cleaned))
  }, [])

  const value = useMemo(() => ({ title, setTitle }), [title, setTitle])

  return <PageTitleContext.Provider value={value}>{children}</PageTitleContext.Provider>
}

export function usePageTitleContext(): PageTitleContextValue {
  const ctx = useContext(PageTitleContext)
  if (!ctx) {
    throw new Error('usePageTitleContext harus di dalam PageTitleProvider')
  }
  return ctx
}

/** Set judul header untuk halaman ini; dibersihkan saat unmount. */
export function usePageTitle(title: string) {
  const { setTitle } = usePageTitleContext()
  useEffect(() => {
    setTitle(title)
    return () => setTitle(DEFAULT_TITLE)
  }, [title, setTitle])
}
