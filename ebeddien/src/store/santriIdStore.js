import { create } from 'zustand'

// Helper untuk sync dengan localStorage
const getStoredId = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('currentSantriId') || ''
  }
  return ''
}

const setStoredId = (id) => {
  if (typeof window !== 'undefined') {
    if (id) {
      localStorage.setItem('currentSantriId', id)
    } else {
      localStorage.removeItem('currentSantriId')
    }
  }
}

export const useSantriIdStore = create((set) => ({
  currentSantriId: getStoredId(),
  
  setCurrentSantriId: (id) => {
    const sanitizedId = id || ''
    setStoredId(sanitizedId)
    set({ currentSantriId: sanitizedId })
  },
  
  clearSantriId: () => {
    setStoredId('')
    set({ currentSantriId: '' })
  }
}))

