import { create } from 'zustand'

const getInitialCollapsed = () => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('sidebarCollapsed')
    if (saved !== null) {
      try {
        return JSON.parse(saved)
      } catch (error) {
        localStorage.removeItem('sidebarCollapsed')
      }
    }
  }
  return false
}

export const useSidebarStore = create((set) => ({
  isCollapsed: getInitialCollapsed(),

  setCollapsed: (value) => {
    set((state) => {
      const next = typeof value === 'function' ? value(state.isCollapsed) : value
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebarCollapsed', JSON.stringify(next))
      }
      return { isCollapsed: next }
    })
  },

  toggleCollapsed: () => {
    set((state) => {
      const next = !state.isCollapsed
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebarCollapsed', JSON.stringify(next))
      }
      return { isCollapsed: next }
    })
  }
}))
