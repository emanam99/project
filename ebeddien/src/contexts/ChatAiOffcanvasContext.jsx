import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const ChatAiOffcanvasContext = createContext(null)

export function ChatAiOffcanvasProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])

  const value = useMemo(
    () => ({
      isOpen,
      open,
      close,
      toggle,
    }),
    [isOpen, open, close, toggle]
  )

  return <ChatAiOffcanvasContext.Provider value={value}>{children}</ChatAiOffcanvasContext.Provider>
}

export function useChatAiOffcanvas() {
  const ctx = useContext(ChatAiOffcanvasContext)
  if (!ctx) {
    return {
      isOpen: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    }
  }
  return ctx
}
