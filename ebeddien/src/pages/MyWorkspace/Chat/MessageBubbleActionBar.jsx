import { useRef, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const LONG_PRESS_MS = 450

function ActionIcon({ label, onClick, children, className = '', isOwn = false }) {
  const timerRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => () => clearTimer(), [clearTimer])

  const onTouchStart = () => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      /* tooltip via title on desktop; long-press could extend later */
    }, LONG_PRESS_MS)
  }
  const onTouchEnd = () => clearTimer()

  const baseBtn = isOwn
    ? 'text-white/90 hover:bg-white/15 focus-visible:ring-white/50'
    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600/80 focus-visible:ring-teal-500'

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className={`inline-flex h-8 w-8 items-center justify-center rounded-full focus:outline-none focus-visible:ring-1 ${baseBtn} ${className}`}
      >
        {children}
      </button>
    </div>
  )
}

/** Tombol ⋮ di dalam bubble (baris waktu). */
export function MessageBubbleMenuTrigger({ open, onToggleOpen, isOwn, disabled }) {
  if (disabled) return null

  const btnClass = isOwn
    ? 'text-teal-100/95 hover:bg-white/15'
    : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-600/60'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onToggleOpen(!open)
      }}
      className={`ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${btnClass}`}
      aria-expanded={open}
      aria-label="Aksi pesan"
    >
      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
      </svg>
    </button>
  )
}

/** Panel aksi horizontal — in-flow di bawah bubble, menggeser pesan di bawahnya. */
export function MessageBubbleActionPanel({
  open,
  onToggleOpen,
  onReply,
  onForward,
  onLove,
  loved,
  onCopy,
  onEdit,
  onDelete,
  onPin,
  onInfo,
  canEdit,
  canDelete,
  canPin,
  isPinned,
  isOwn,
}) {
  const panelClass = isOwn
    ? 'bg-teal-600/90 border-teal-400/40'
    : 'bg-white border-gray-200 dark:bg-gray-700 dark:border-gray-600'

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="action-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className={`overflow-hidden w-max max-w-[calc(100vw-1.5rem)] ${isOwn ? 'self-end' : 'self-start'}`}
        >
          <div
            className={`mt-1 flex w-max max-w-full flex-nowrap items-center justify-end gap-0.5 rounded-lg border px-1 py-1 shadow-sm ${panelClass}`}
            role="toolbar"
            aria-label="Aksi pesan"
          >
            <ActionIcon label="Balas" isOwn={isOwn} onClick={() => { onToggleOpen(false); onReply?.() }}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </ActionIcon>
            <ActionIcon label="Teruskan" isOwn={isOwn} onClick={() => { onToggleOpen(false); onForward?.() }}>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 12h15" />
              </svg>
            </ActionIcon>
            <ActionIcon
              label={loved ? 'Batalkan suka' : 'Sukai'}
              isOwn={isOwn}
              onClick={() => { onToggleOpen(false); onLove?.() }}
              className={loved ? '!text-rose-300' : ''}
            >
              <svg className="h-4 w-4" fill={loved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </ActionIcon>
            {isOwn && onCopy ? (
              <ActionIcon label="Salin" isOwn={isOwn} onClick={() => { onToggleOpen(false); onCopy() }}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </ActionIcon>
            ) : null}
            {isOwn && canPin ? (
              <ActionIcon label={isPinned ? 'Lepaskan' : 'Sematkan'} isOwn={isOwn} onClick={() => { onToggleOpen(false); onPin?.() }}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </ActionIcon>
            ) : null}
            {isOwn && canEdit ? (
              <ActionIcon label="Edit" isOwn={isOwn} onClick={() => { onToggleOpen(false); onEdit?.() }}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </ActionIcon>
            ) : null}
            {isOwn && onInfo ? (
              <ActionIcon label="Info" isOwn={isOwn} onClick={() => { onToggleOpen(false); onInfo() }}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </ActionIcon>
            ) : null}
            {isOwn && canDelete ? (
              <ActionIcon label="Hapus" isOwn={isOwn} onClick={() => { onToggleOpen(false); onDelete?.() }} className="!text-red-300">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </ActionIcon>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Badge suka di bawah bubble. */
export function MessageBubbleLoveBadge({ loveCount, isOwn }) {
  if (!loveCount || loveCount < 1) return null
  return (
    <span
      className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] ${
        isOwn ? 'text-rose-200' : 'text-rose-500'
      } ${isOwn ? 'self-end' : 'self-start'}`}
    >
      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
      {loveCount}
    </span>
  )
}

/** Wrapper + klik di luar untuk menutup menu. */
export default function MessageBubbleActions({
  children,
  open,
  onToggleOpen,
  containerRef,
}) {
  const innerRef = useRef(null)
  const setRef = useCallback(
    (node) => {
      innerRef.current = node
      if (typeof containerRef === 'function') containerRef(node)
      else if (containerRef) containerRef.current = node
    },
    [containerRef],
  )

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => {
      if (innerRef.current && !innerRef.current.contains(e.target)) onToggleOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [open, onToggleOpen])

  return (
    <motion.div ref={setRef} className="flex max-w-full flex-col">
      {children}
    </motion.div>
  )
}
