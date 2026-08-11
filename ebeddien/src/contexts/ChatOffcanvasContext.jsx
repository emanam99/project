import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { chatUserAPI } from '../services/api'

const CHAT_OFFCANVAS_PIN_KEY = 'ebeddien_chat_offcanvas_pinned'

function readChatOffcanvasPinnedPreference() {
  try {
    return localStorage.getItem(CHAT_OFFCANVAS_PIN_KEY) === '1'
  } catch {
    return false
  }
}

const ChatOffcanvasContext = createContext(null)

function sumUnreadFromConversations(data) {
  if (!Array.isArray(data)) return 0
  return data.reduce((s, c) => s + (Number(c.unread_count) || 0), 0)
}

export function ChatOffcanvasProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPinned, setIsPinnedState] = useState(() => readChatOffcanvasPinnedPreference())
  /** Query internal chat offcanvas (c= / u= / new=) — dipertahankan saat panel ditutup lalu dibuka lagi */
  const [savedOffcanvasQueryString, setSavedOffcanvasQueryString] = useState('')
  /** Total unread semua percakapan (badge header / menu Chat) */
  const [chatTotalUnread, setChatTotalUnread] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_OFFCANVAS_PIN_KEY, isPinned ? '1' : '0')
    } catch {
      /* noop */
    }
  }, [isPinned])

  const persistOffcanvasQuery = useCallback((query) => {
    const s =
      typeof query === 'string'
        ? query
        : query instanceof URLSearchParams
          ? query.toString()
          : ''
    setSavedOffcanvasQueryString((prev) => (prev === s ? prev : s))
  }, [])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((v) => !v), [])
  const setPinned = useCallback((v) => setIsPinnedState(!!v), [])
  const togglePinned = useCallback(() => setIsPinnedState((p) => !p), [])

  /** Sinkronkan total dari API (halaman lain / polling / setelah pesan realtime) */
  const refreshChatUnreadFromApi = useCallback(async () => {
    try {
      const res = await chatUserAPI.getConversations()
      if (res?.success && Array.isArray(res.data)) {
        setChatTotalUnread(sumUnreadFromConversations(res.data))
      }
    } catch {
      /* abaikan */
    }
  }, [])

  const value = useMemo(
    () => ({
      isOpen,
      isPinned,
      setPinned,
      togglePinned,
      open,
      close,
      toggle,
      savedOffcanvasQueryString,
      persistOffcanvasQuery,
      chatTotalUnread,
      setChatTotalUnread,
      refreshChatUnreadFromApi,
    }),
    [
      isOpen,
      isPinned,
      setPinned,
      togglePinned,
      open,
      close,
      toggle,
      savedOffcanvasQueryString,
      persistOffcanvasQuery,
      chatTotalUnread,
      setChatTotalUnread,
      refreshChatUnreadFromApi,
    ]
  )

  return <ChatOffcanvasContext.Provider value={value}>{children}</ChatOffcanvasContext.Provider>
}

export function useChatOffcanvas() {
  const ctx = useContext(ChatOffcanvasContext)
  if (!ctx) {
    return {
      isOpen: false,
      isPinned: false,
      setPinned: () => {},
      togglePinned: () => {},
      open: () => {},
      close: () => {},
      toggle: () => {},
      savedOffcanvasQueryString: '',
      persistOffcanvasQuery: () => {},
      chatTotalUnread: 0,
      setChatTotalUnread: () => {},
      refreshChatUnreadFromApi: async () => {},
    }
  }
  return ctx
}
