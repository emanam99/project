import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react'
import { getTheme, setTheme as applyAndSaveTheme } from '../utils/theme'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => getTheme())

  // Samakan state dengan kelas dark di documentElement (setelah initTheme di main)
  useLayoutEffect(() => {
    const fromDom = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    setThemeState((prev) => (prev === fromDom ? prev : fromDom))
  }, [])

  const setTheme = useCallback((value) => {
    const next = applyAndSaveTheme(value)
    setThemeState(next)
    return next
  }, [])

  /** Selalu dari kelas dark di documentElement agar tidak salah flip dengan state React (batching). */
  const toggleTheme = useCallback(() => {
    const isDarkNow = document.documentElement.classList.contains('dark')
    return setTheme(isDarkNow ? 'light' : 'dark')
  }, [setTheme])

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
