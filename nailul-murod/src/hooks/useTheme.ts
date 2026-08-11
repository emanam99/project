import { useEffect, useState } from 'react'

const THEME_KEY = 'nailulMurodTheme'

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      // ignore localStorage failures
    }
  }, [theme])

  const toggleTheme = () => setTheme((v) => (v === 'dark' ? 'light' : 'dark'))

  return { theme, setTheme, toggleTheme }
}
