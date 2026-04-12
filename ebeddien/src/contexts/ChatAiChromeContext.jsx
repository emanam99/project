import { createContext, useContext } from 'react'

/** Konteks layout /chat-ai: tab bagian atas vs navigasi di header */
const ChatAiChromeContext = createContext({
  showSectionTabs: false,
})

export function ChatAiChromeProvider({ showSectionTabs, children }) {
  return (
    <ChatAiChromeContext.Provider value={{ showSectionTabs: !!showSectionTabs }}>
      {children}
    </ChatAiChromeContext.Provider>
  )
}

export function useChatAiChrome() {
  return useContext(ChatAiChromeContext)
}
