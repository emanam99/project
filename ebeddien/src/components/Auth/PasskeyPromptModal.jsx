import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { browserSupportsWebAuthn, registerPasskey } from '../../utils/webauthnRegister'
import { setStoredLoginUsername } from '../../utils/passkeyLoginPrefs'
import { useAuthStore } from '../../store/authStore'

/**
 * Modal pengingat daftar passkey (setelah login password sesuai interval backend).
 */
export default function PasskeyPromptModal() {
  const open = useAuthStore((s) => s.passkeyPromptOpen)
  const setPasskeyPromptOpen = useAuthStore((s) => s.setPasskeyPromptOpen)
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn()

  const handleClose = () => {
    setError('')
    setPasskeyPromptOpen(false)
  }

  const handleRegister = async () => {
    setError('')
    if (!supported) return
    setLoading(true)
    try {
      await registerPasskey()
      setStoredLoginUsername(user?.username)
      setPasskeyPromptOpen(false)
    } catch (e) {
      setError(e?.message || 'Gagal mendaftarkan passkey.')
    } finally {
      setLoading(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && !loading && handleClose()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="passkey-prompt-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-2">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600 dark:text-primary-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.726 18M12 11h.01M12 18h.01" />
                  </svg>
                </div>
                <div>
                  <h2 id="passkey-prompt-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Pasang passkey (sidik jari / PIN perangkat)
                  </h2>
                  <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {supported
                      ? 'Anda belum mendaftarkan passkey. Dengan passkey, login bisa lebih cepat dan aman tanpa mengetik password di perangkat ini.'
                      : 'Browser Anda tidak mendukung WebAuthn / passkey. Gunakan browser terbaru (Chrome, Edge, Safari) atau aktifkan HTTPS untuk domain ini.'}
                  </p>
                </div>
              </div>
            </div>
            {error && (
              <div className="px-5 pb-2">
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
              </div>
            )}
            <div className="px-5 py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 dark:border-gray-700/80 bg-gray-50/80 dark:bg-gray-900/30">
              {supported ? (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={loading}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Nanti
                  </button>
                  <button
                    type="button"
                    onClick={handleRegister}
                    disabled={loading}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-60"
                  >
                    {loading ? 'Memproses…' : 'Daftarkan passkey sekarang'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700"
                >
                  Mengerti
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
