export type Theme = 'dark' | 'light'

const THEME_KEY = 'mdtwustha_theme'

export function getStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch (_) {}
  return 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch (_) {}
}
