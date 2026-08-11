import { createContext, useContext, useMemo } from 'react'

/** Konteks layout /chat-ai: tab bagian atas vs navigasi di header */
const ChatAiChromeContext = createContext({
  showSectionTabs: false,
})

export function ChatAiChromeProvider({ showSectionTabs, children }) {
  const value = useMemo(() => ({ showSectionTabs: !!showSectionTabs }), [showSectionTabs])
  return (
    <ChatAiChromeContext.Provider value={value}>
      {children}
    </ChatAiChromeContext.Provider>
  )
}

export function useChatAiChrome() {
  return useContext(ChatAiChromeContext)
}
