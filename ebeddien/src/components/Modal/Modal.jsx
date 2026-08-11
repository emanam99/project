import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

const sizeToMaxWidth = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl'
}

function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size,
  maxWidth,
  showCloseButton = true,
  closeOnBackdropClick = true,
  zIndex = 99999,
  /** Saat true: backdrop, ESC, dan tombol tutup tidak menutup modal (mis. proses hapus sedang berjalan). */
  preventClose = false,
}) {
  const resolvedMaxWidth = maxWidth || (size && sizeToMaxWidth[size]) || 'max-w-2xl'
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen && onClose && !preventClose) {
        onClose()
      }
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose, preventClose])

  if (!isOpen) return null

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={closeOnBackdropClick && !preventClose ? onClose : undefined}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black bg-opacity-40"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0
            }}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl ${resolvedMaxWidth} w-full relative flex flex-col max-h-[90vh] overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              zIndex: zIndex + 1,
              maxHeight: '90vh',
              margin: 'auto'
            }}
          >
            {/* Header */}
            {title && (
              <div className="px-4 pt-5 pb-2 border-b dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold dark:text-gray-200">{title}</h2>
                {showCloseButton && !preventClose && (
                  <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 text-2xl dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    style={{ lineHeight: 1 }}
                    aria-label="Close modal"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )

  // Use portal to render modal at document body level
  return createPortal(modalContent, document.body)
}

export default Modal
