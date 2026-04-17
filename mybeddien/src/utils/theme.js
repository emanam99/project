const STORAGE_KEY = 'mybeddian_theme'

export function getTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

export function setTheme(value) {
  const next = value === 'dark' ? 'dark' : 'light'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch (_) {}
  applyTheme(next)
  return next
}

export function applyTheme(value) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (value === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function initTheme() {
  applyTheme(getTheme())
}

export function toggleTheme() {
  const current = getTheme()
  return setTheme(current === 'dark' ? 'light' : 'dark')
}
