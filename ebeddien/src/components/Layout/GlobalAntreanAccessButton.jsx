import { useGlobalSyncOutbox } from '../../contexts/GlobalSyncOutboxContext'
import { useGlobalSyncOutboxCount } from '../../hooks/useGlobalSyncOutboxCount'

/**
 * Tombol akses antrean sinkron saat header disembunyikan (Beranda, Semua menu, Chat).
 * Satu offcanvas instance lewat GlobalSyncOutboxProvider.
 */
export default function GlobalAntreanAccessButton() {
  const { open } = useGlobalSyncOutbox()
  const { n, showBadge } = useGlobalSyncOutboxCount()

  return (
    <button
      type="button"
      onClick={open}
      className="fixed z-[45] right-3 bottom-[4.5rem] sm:bottom-20 flex items-center gap-1.5 pl-2.5 pr-2 py-2 rounded-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-100 text-xs font-medium shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors max-w-[calc(100vw-1.5rem)]"
      title="Antrean sinkron (aksi belum terkirim ke server)"
    >
      <svg className="w-4 h-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 6h16M4 10h16M4 14h10M4 18h10"
        />
      </svg>
      <span className="truncate sm:inline">Antrean</span>
      {showBadge && (
        <span className="shrink-0 min-w-[1.125rem] h-[1.125rem] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
          {n > 99 ? '99+' : n}
        </span>
      )}
    </button>
  )
}
