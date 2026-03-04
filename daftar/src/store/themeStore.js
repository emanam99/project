import { create } from 'zustand'

// Initialize theme from localStorage or system preference
const getInitialTheme = () => {
  const saved = localStorage.getItem('theme')
  if (saved) {
    return saved === 'dark' ? 'dark' : 'light'
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export const useThemeStore = create((set) => {
  const initialTheme = getInitialTheme()
  
  // Apply theme immediately
  if (initialTheme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
  
  return {
    theme: initialTheme,
    toggleTheme: () => {
      set((state) => {
        const newTheme = state.theme === 'dark' ? 'light' : 'dark'
        localStorage.setItem('theme', newTheme)
        
        if (newTheme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        
        return { theme: newTheme }
      })
    }
  }
})
