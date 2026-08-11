import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

const sheetTransition = { type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }
const backdropTransition = { duration: 0.2 }

/** Wrapper scroll: Layout memakai main overflow-hidden — isi halaman harus min-h-0 + overflow-y-auto di sini. */
export function WebsitePageShell({ children }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className="mx-auto max-w-6xl space-y-4 p-4 pb-24 md:space-y-5 md:p-6 md:pb-10">{children}</div>
      </div>
    </div>
  )
}

export const Card = ({ children, className = '' }) => (
  <div
    className={`rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/80 ${className}`}
  >
    {children}
  </div>
)

export const Field = ({ label, hint, error, children }) => (
  <label className="block text-sm">
    <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
    {error && <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">{error}</span>}
  </label>
)

const inputRing =
  'outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25 dark:focus:border-teal-400 dark:focus:ring-teal-400/20'

export const Input = (props) => (
  <input
    {...props}
    className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 ${inputRing} ${props.className || ''}`}
  />
)

export const Textarea = (props) => (
  <textarea
    {...props}
    className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-slate-500 ${inputRing} ${props.className || ''}`}
  />
)

export const Select = (props) => (
  <select
    {...props}
    className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white ${inputRing} ${props.className || ''}`}
  />
)

export const Btn = ({ variant = 'primary', className = '', ...rest }) => {
  const base =
    'inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50'
  const cls =
    variant === 'primary'
      ? 'bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500'
      : variant === 'danger'
        ? 'bg-rose-600 text-white hover:bg-rose-700'
        : variant === 'ghost'
          ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-700/60'
          : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'
  return <button {...rest} className={`${base} ${cls} ${className}`} />
}

export const PageHeader = ({ title, description, children }) => (
  <header className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-700/80 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h1>
      {description && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
      )}
    </div>
    {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
  </header>
)

function useEscClose(open, onClose) {
  useEffect(() => {
    if (!open) return undefined
    const fn = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [open, onClose])
}

/**
 * Panel bawah + backdrop (animasi), isi area tengah scroll — selaras pola PrintBoyong / pembayaran.
 * z-index di atas bottom nav eBeddien.
 */
export const BottomSheet = ({ open, title, onClose, children, footer }) => {
  useEscClose(open, onClose)

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="website-sheet-backdrop"
            role="presentation"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={backdropTransition}
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={onClose}
          />
          <motion.div
            key="website-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="website-sheet-title"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={sheetTransition}
            className="fixed bottom-0 left-0 right-0 z-[201] flex max-h-[min(92vh,100dvh)] flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-[0_-12px_32px_-8px_rgba(0,0,0,0.18)] dark:border-slate-600 dark:bg-slate-800"
            style={{ willChange: 'transform' }}
          >
            <div className="flex shrink-0 flex-col border-b border-slate-200/90 dark:border-slate-700">
              <div className="flex justify-center pt-2 pb-1">
                <span className="h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
              </div>
              <div className="flex items-center justify-between px-4 pb-3">
                <h2 id="website-sheet-title" className="text-base font-semibold text-teal-700 dark:text-teal-400">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label="Tutup"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-3">{children}</div>
            {footer ? (
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200/90 bg-slate-50/95 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

/** @deprecated Gunakan BottomSheet — nama lama untuk kompatibilitas impor. */
export const Modal = BottomSheet

export const StatusBadge = ({ status }) => {
  const cls =
    status === 'publish'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>
}
