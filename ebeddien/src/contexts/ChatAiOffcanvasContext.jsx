import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const CHAT_AI_OFFCANVAS_PIN_KEY = 'ebeddien_chat_ai_offcanvas_pinned'

function readPinnedPreference() {
  try {
    return localStorage.getItem(CHAT_AI_OFFCANVAS_PIN_KEY) === '1'
  } catch {
    return false
  }
}

const ChatAiOffcanvasContext = createContext(null)

export function ChatAiOffcanvasProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPinned, setIsPinnedState] = useState(() => readPinnedPreference())

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_AI_OFFCANVAS_PIN_KEY, isPinned ? '1' : '0')
    } catch {
      /* noop */
    }
  }, [isPinned])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const setPinned = useCallback((v) => setIsPinnedState(!!v), [])
  const togglePinned = useCallback(() => setIsPinnedState((p) => !p), [])

  const value = useMemo(
    () => ({
      isOpen,
      isPinned,
      setPinned,
      togglePinned,
      open,
      close,
      toggle,
    }),
    [isOpen, isPinned, setPinned, togglePinned, open, close, toggle]
  )

  return <ChatAiOffcanvasContext.Provider value={value}>{children}</ChatAiOffcanvasContext.Provider>
}

export function useChatAiOffcanvas() {
  const ctx = useContext(ChatAiOffcanvasContext)
  if (!ctx) {
    return {
      isOpen: false,
      isPinned: false,
      setPinned: () => {},
      togglePinned: () => {},
      open: () => {},
      close: () => {},
      toggle: () => {},
    }
  }
  return ctx
}
