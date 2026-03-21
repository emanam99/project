import { createContext, useContext } from 'react'

/** Slot header tunggal untuk /chat-ai/* (chat utama + pelatihan) agar tidak remount gaya penuh saat pindah rute. */
export const ChatAiHeaderContext = createContext(null)

export function useChatAiHeaderSlot() {
  return useContext(ChatAiHeaderContext)
}
