import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ThemeMode = 'light' | 'dark'

export type FontSizeId = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export type FontSizeOption = {
  id: FontSizeId
  label: string
  hint: string
  px: number
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { id: 'xs', label: 'Sangat kecil', hint: '12px', px: 12 },
  { id: 'sm', label: 'Kecil', hint: '13px', px: 13 },
  { id: 'md', label: 'Sedang', hint: '14px', px: 14 },
  { id: 'lg', label: 'Besar', hint: '16px', px: 16 },
  { id: 'xl', label: 'Sangat besar', hint: '18px', px: 18 },
]

const THEME_KEY = 'sppg_theme'
const FONT_KEY = 'sppg_font_size'

type ThemeContextValue = {
  theme: ThemeMode
  isDark: boolean
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
  fontSize: FontSizeId
  fontSizePx: number
  setFontSize: (size: FontSizeId) => void
  fontSizeOptions: FontSizeOption[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* ignore */
  }
  return 'light'
}

function readStoredFontSize(): FontSizeId {
  try {
    const saved = localStorage.getItem(FONT_KEY)
    if (FONT_SIZE_OPTIONS.some((o) => o.id === saved)) {
      return saved as FontSizeId
    }
  } catch {
    /* ignore */
  }
  return 'md'
}

function fontPx(id: FontSizeId): number {
  return FONT_SIZE_OPTIONS.find((o) => o.id === id)?.px ?? 14
}

function applyThemeClass(theme: ThemeMode): void {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0b1520' : '#2a96e0')
  }
}

function applyFontSize(id: FontSizeId): void {
  const root = document.documentElement
  const px = fontPx(id)
  root.style.setProperty('--app-font-size', `${px}px`)
  root.dataset.fontSize = id
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const initial = readStoredTheme()
    applyThemeClass(initial)
    return initial
  })

  const [fontSize, setFontSizeState] = useState<FontSizeId>(() => {
    const initial = readStoredFontSize()
    applyFontSize(initial)
    return initial
  })

  useEffect(() => {
    applyThemeClass(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    applyFontSize(fontSize)
    try {
      localStorage.setItem(FONT_KEY, fontSize)
    } catch {
      /* ignore */
    }
  }, [fontSize])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const setFontSize = useCallback((next: FontSizeId) => {
    setFontSizeState(next)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      isDark: theme === 'dark',
      setTheme,
      toggleTheme,
      fontSize,
      fontSizePx: fontPx(fontSize),
      setFontSize,
      fontSizeOptions: FONT_SIZE_OPTIONS,
    }),
    [theme, setTheme, toggleTheme, fontSize, setFontSize],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme harus dipakai di dalam ThemeProvider')
  }
  return ctx
}
