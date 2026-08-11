import { useEffect, useRef } from 'react'

/**
 * Pilihan lembaga tab Review — strip horizontal (mirip filter bulan / Aktivitas).
 */
export default function BisyarohReviewLembagaBar({
  lembagaList = [],
  lembagaId = '',
  onLembagaChange,
  loading = false,
  locked = false
}) {
  const scrollRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    if (lembagaList.length === 0) return
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (activeRef.current && scrollRef.current) {
          const el = scrollRef.current
          const btn = activeRef.current
          const scrollPosition = btn.offsetLeft - el.offsetWidth / 2 + btn.offsetWidth / 2
          el.scrollTo({ left: Math.max(0, scrollPosition), behavior: 'smooth' })
        }
      }, 150)
    })
  }, [lembagaList, lembagaId])

  const emptyMessage = loading
    ? 'Memuat lembaga…'
    : lembagaList.length === 0
      ? 'Belum ada lembaga dengan rekap terisi pada bulan ini'
      : null

  return (
    <div className="min-w-0">
      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 px-0.5 block">
        Lembaga
      </span>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1.5 leading-snug">
        Lembaga yang sudah mengisi rekap pada bulan yang dipilih (termasuk yang sudah dirilis).
      </p>
      <div
        ref={scrollRef}
        className="overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex gap-2 min-w-max items-center min-h-[32px]">
          {emptyMessage ? (
            <span className="text-sm text-gray-500 dark:text-gray-400 py-1">{emptyMessage}</span>
          ) : (
            lembagaList.map((l) => {
              const id = l.id
              const isActive = id === lembagaId
              return (
                <button
                  key={id}
                  type="button"
                  ref={isActive ? activeRef : null}
                  disabled={loading || (locked && !isActive)}
                  onClick={() => onLembagaChange(id)}
                  title={locked && isActive ? 'Satu lembaga dalam cakupan rekap Anda' : undefined}
                  className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap max-w-[200px] truncate disabled:opacity-50 ${
                    isActive
                      ? 'bg-teal-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {l.nama || id}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
