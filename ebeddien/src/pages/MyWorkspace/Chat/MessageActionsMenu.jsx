import { useState, useRef, useEffect } from 'react'

/** Menu titik tiga untuk bubble pesan sendiri. */
export default function MessageActionsMenu({
  onEdit,
  onDelete,
  onPin,
  onCopy,
  onInfo,
  canEdit,
  canDelete,
  canPin,
  /** true = pesan ini sudah ada di daftar sematan grup */
  isPinned,
  disabled,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [])

  if (disabled) return null

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded p-0.5 opacity-80 hover:opacity-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/80"
        aria-expanded={open}
        aria-label="Aksi pesan"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
      {open ? (
        <div className="absolute bottom-full right-0 z-40 mb-1 min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {onCopy ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                setOpen(false)
                onCopy()
              }}
            >
              Salin
            </button>
          ) : null}
          {canPin ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                setOpen(false)
                onPin?.()
              }}
            >
              {isPinned ? 'Lepaskan' : 'Sematkan'}
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                setOpen(false)
                onEdit?.()
              }}
            >
              Edit
            </button>
          ) : null}
          {onInfo ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => {
                setOpen(false)
                onInfo()
              }}
            >
              Info
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={() => {
                setOpen(false)
                onDelete?.()
              }}
            >
              Hapus untuk semua
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
