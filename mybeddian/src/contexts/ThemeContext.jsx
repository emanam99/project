import { createContext, useContext, useState } from 'react'
import { getTheme, setTheme as applyAndSaveTheme } from '../utils/theme'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => getTheme())

  const setTheme = (value) => {
    const next = applyAndSaveTheme(value)
    setThemeState(next)
    return next
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    return setTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
