import { create } from 'zustand'

const STORAGE_KEY = 'mybeddien_sidebar_collapsed'

const getInitialCollapsed = () => {
  if (typeof window === 'undefined') return false
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === null) return false
  try {
    return JSON.parse(saved)
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return false
  }
}

export const useSidebarStore = create((set) => ({
  isCollapsed: getInitialCollapsed(),

  setCollapsed: (value) => {
    set((state) => {
      const next = typeof value === 'function' ? value(state.isCollapsed) : value
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      }
      return { isCollapsed: next }
    })
  },

  toggleCollapsed: () => {
    set((state) => {
      const next = !state.isCollapsed
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      }
      return { isCollapsed: next }
    })
  },
}))
