import { createPortal } from 'react-dom'

/** Di atas offcanvas (z-9999) dan modal bayar (z-102). */
export const MYBEDDien_TOAST_Z_CLASS = 'z-[10100]'

const TYPE_CLASSES = {
  error: 'bg-red-600 text-white',
  success: 'bg-teal-600 text-white',
  warning: 'bg-amber-600 text-white',
  info: 'bg-gray-800 text-white',
}

export function MybeddienToastPortal({ toast }) {
  if (!toast || typeof document === 'undefined') return null

  const typeClass = TYPE_CLASSES[toast.type] || TYPE_CLASSES.info

  return createPortal(
    <div
      className={`fixed top-[max(1rem,env(safe-area-inset-top,0px))] left-1/2 -translate-x-1/2 ${MYBEDDien_TOAST_Z_CLASS} px-4 py-2.5 rounded-lg shadow-lg text-sm max-w-[min(24rem,calc(100vw-2rem))] text-center pointer-events-none`}
      role="status"
      aria-live="polite"
    >
      <span className={`inline-block px-1 pointer-events-auto rounded-lg ${typeClass}`}>
        {toast.message}
      </span>
    </div>,
    document.body
  )
}
