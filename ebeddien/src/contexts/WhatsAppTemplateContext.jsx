import { createContext, useContext, useState, useCallback } from 'react'

export const WhatsAppTemplateContext = createContext({
  isOpen: false,
  open: () => {},
  close: () => {}
})

export function useWhatsAppTemplate() {
  const ctx = useContext(WhatsAppTemplateContext)
  if (!ctx) {
    return { isOpen: false, open: () => {}, close: () => {} }
  }
  return ctx
}

export function WhatsAppTemplateProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  return (
    <WhatsAppTemplateContext.Provider value={{ isOpen, open, close }}>
      {children}
    </WhatsAppTemplateContext.Provider>
  )
}
