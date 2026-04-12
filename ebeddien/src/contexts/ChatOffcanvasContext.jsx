import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { chatUserAPI } from '../services/api'

const ChatOffcanvasContext = createContext(null)

function sumUnreadFromConversations(data) {
  if (!Array.isArray(data)) return 0
  return data.reduce((s, c) => s + (Number(c.unread_count) || 0), 0)
}

export function ChatOffcanvasProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  /** Query internal chat offcanvas (c= / u= / new=) — dipertahankan saat panel ditutup lalu dibuka lagi */
  const [savedOffcanvasQueryString, setSavedOffcanvasQueryString] = useState('')
  /** Total unread semua percakapan (badge header / menu Chat) */
  const [chatTotalUnread, setChatTotalUnread] = useState(0)

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
