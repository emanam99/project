import { create } from 'zustand'

// Load theme from localStorage
const getInitialTheme = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') {
      return saved
    }
  }
  return 'light'
}

// Apply theme to document
const applyTheme = (theme) => {
  if (typeof document !== 'undefined') {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
}

// Initialize theme on load
const initialTheme = getInitialTheme()
applyTheme(initialTheme)

export const useThemeStore = create((set) => ({
  theme: initialTheme,
  
  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light'
      applyTheme(newTheme)
      localStorage.setItem('theme', newTheme)
      return { theme: newTheme }
    })
  },
  
  setTheme: (theme) => {
    applyTheme(theme)
    localStorage.setItem('theme', theme)
    set({ theme })
  }
}))

