import { Fragment, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import { EditUserContent } from './EditUser'

/**
 * Panel kanan edit user — pola backdrop + slide seperti Detail Pengurus.
 */
export default function EditUserOffcanvas({ isOpen, userId, onClose, onUserSaved }) {
  const closeWithBack = useOffcanvasBackClose(isOpen, onClose)
  const [showPortal, setShowPortal] = useState(false)

  useEffect(() => {
    if (isOpen) setShowPortal(true)
  }, [isOpen])

  if (!isOpen && !showPortal) return null

  return createPortal(
    <AnimatePresence onExitComplete={() => setShowPortal(false)}>
      {isOpen && userId && (
        <Fragment key="edit-user-offcanvas">
          <motion.div
            key="edit-user-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeWithBack}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
          />
          <motion.div
            key="edit-user-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-gray-50 dark:bg-gray-900 shadow-2xl z-[201] flex flex-col rounded-l-2xl overflow-hidden border-l border-gray-200 dark:border-gray-700"
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">Edit User</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Akun, role, jabatan, dan akses</p>
                </div>
                <button
                  type="button"
                  onClick={closeWithBack}
                  className="p-2.5 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <EditUserContent
                userId={userId}
                variant="offcanvas"
                onClose={closeWithBack}
                onUserSaved={onUserSaved}
              />
            </div>
          </motion.div>
        </Fragment>
      )}
    </AnimatePresence>,
    document.body
  )
}
