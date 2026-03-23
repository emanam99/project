import { createContext, useContext, useState, useCallback } from 'react'

const UnsavedChangesContext = createContext(null)

export function UnsavedChangesProvider({ children }) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [onSaveCallback, setOnSaveCallback] = useState(null)
  const [onValidateCallback, setOnValidateCallback] = useState(null)
  const [pendingNavigation, setPendingNavigation] = useState(null)

  const setUnsavedChanges = useCallback((hasChanges, saveCallback = null, validateCallback = null) => {
    setHasUnsavedChanges(hasChanges)
    setOnSaveCallback(() => saveCallback)
    setOnValidateCallback(() => validateCallback)
  }, [])

  const clearUnsavedChanges = useCallback(() => {
    setHasUnsavedChanges(false)
    setOnSaveCallback(null)
    setOnValidateCallback(null)
  }, [])

  const setPendingNav = useCallback((navPath) => {
    setPendingNavigation(navPath)
  }, [])

  const clearPendingNav = useCallback(() => {
    setPendingNavigation(null)
  }, [])

  const handleSaveAndNavigate = useCallback(async () => {
    if (onSaveCallback) {
      try {
        await onSaveCallback()
        clearUnsavedChanges()
        return true
      } catch (error) {
        console.error('Error saving before navigation:', error)
        return false
      }
    }
    return true
  }, [onSaveCallback, clearUnsavedChanges])

  const validateBeforeNavigate = useCallback(() => {
    if (onValidateCallback) {
      return onValidateCallback()
    }
    return { valid: true, missingFields: [] }
  }, [onValidateCallback])

  return (
    <UnsavedChangesContext.Provider
      value={{
        hasUnsavedChanges,
        setUnsavedChanges,
        clearUnsavedChanges,
        pendingNavigation,
        setPendingNav,
        clearPendingNav,
        handleSaveAndNavigate,
        validateBeforeNavigate
      }}
    >
      {children}
    </UnsavedChangesContext.Provider>
  )
}

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext)
  if (!context) {
    throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider')
  }
  return context
}
