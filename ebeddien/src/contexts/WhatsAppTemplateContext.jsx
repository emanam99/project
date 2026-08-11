import { createContext, useContext, useState, useCallback, useMemo } from 'react'

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
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
  return (
    <WhatsAppTemplateContext.Provider value={value}>
      {children}
    </WhatsAppTemplateContext.Provider>
  )
}
