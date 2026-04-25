import { useGlobalSyncOutbox } from '../../contexts/GlobalSyncOutboxContext'
import { useGlobalSyncOutboxCount } from '../../hooks/useGlobalSyncOutboxCount'

/**
 * Item menu header (dropdown user): buka offcanvas antrean global.
 */
export default function HeaderAntreanMenuItem({ onOpenPanel }) {
  const { open } = useGlobalSyncOutbox()
  const { n, showBadge } = useGlobalSyncOutboxCount()

  return (
    <button
      type="button"
      className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 justify-between"
      onClick={() => {
        onOpenPanel?.()
        open()
      }}
      title="Aksi belum tersinkron ke server (semua modul)"
    >
      <span className="flex items-center gap-2 min-w-0">
        <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M4 6h16M4 10h16M4 14h10M4 18h10"
          />
        </svg>
        Antrean sinkron
      </span>
      {showBadge && (
        <span className="shrink-0 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </button>
  )
}
