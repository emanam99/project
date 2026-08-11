import { useEffect, useRef } from 'react'

const NAMA_BULAN_MASEHI = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
]

const NAMA_BULAN_HIJRIYAH = [
  'Muharram',
  'Shafar',
  'Rabiul Awal',
  'Rabiul Akhir',
  'Jumadil Ula',
  'Jumadil Akhir',
  'Rajab',
  "Sya'ban",
  'Ramadhan',
  'Syawal',
  "Dzul Qo'dah",
  'Dzul Hijjah'
]

function stripPeriodeLabel(ym, kalender) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''))
  if (!m) return ym || '—'
  const idx = Number(m[2]) - 1
  if (kalender === 'hijriyah') {
    return `${NAMA_BULAN_HIJRIYAH[idx] || m[2]} ${m[1]}`
  }
  return `${NAMA_BULAN_MASEHI[idx] || m[2]} ${m[1]}`
}

/**
 * Filter bulan tab Review: strip horizontal + toggle kalender tetap (mirip Aktivitas Keuangan).
 */
export default function BisyarohReviewPeriodeBar({
  periodeKalender,
  onKalenderMode,
  periodeBulan,
  onPeriodeChange,
  periodeOptions = [],
  disabled = false
}) {
  const monthScrollRef = useRef(null)
  const activeMonthRef = useRef(null)

  useEffect(() => {
    if (periodeOptions.length === 0) return
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (activeMonthRef.current && monthScrollRef.current) {
          const scrollContainer = monthScrollRef.current
          const activeButton = activeMonthRef.current
          const containerWidth = scrollContainer.offsetWidth
          const buttonLeft = activeButton.offsetLeft
          const buttonWidth = activeButton.offsetWidth
          const scrollPosition = buttonLeft - containerWidth / 2 + buttonWidth / 2
          scrollContainer.scrollTo({
            left: Math.max(0, scrollPosition),
            behavior: 'smooth'
          })
        }
      }, 150)
    })
  }, [periodeOptions, periodeBulan, periodeKalender])

  const emptyMessage =
    periodeOptions.length === 0 ? 'Tidak ada bulan dengan data rekap' : null

  return (
    <div className="flex items-stretch gap-3 min-w-0">
      <div className="flex-shrink-0 flex flex-col justify-center gap-1 self-center">
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-0.5">
          Kalender
        </span>
        <div className="inline-flex flex-col rounded-lg border border-gray-200 dark:border-gray-600 p-0.5 bg-gray-100 dark:bg-gray-900/50">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onKalenderMode('masehi')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              periodeKalender === 'masehi'
                ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            } disabled:opacity-50`}
          >
            Masehi
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onKalenderMode('hijriyah')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              periodeKalender === 'hijriyah'
                ? 'bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            } disabled:opacity-50`}
          >
            Hijriyah
          </button>
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 px-0.5">
          Periode
        </span>
        <div
          ref={monthScrollRef}
          className="overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <div className="flex gap-2 min-w-max items-center min-h-[32px]">
            {emptyMessage ? (
              <span className="text-sm text-gray-500 dark:text-gray-400 py-1">{emptyMessage}</span>
            ) : (
              periodeOptions.map((p) => {
                const ym = p.periode_bulan
                const kal = p.kalender || periodeKalender
                const isActive = ym === periodeBulan && kal === periodeKalender
                return (
                  <button
                    key={`${kal}-${ym}`}
                    type="button"
                    ref={isActive ? activeMonthRef : null}
                    disabled={disabled}
                    onClick={() => onPeriodeChange(ym, kal)}
                    className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50 ${
                      isActive
                        ? 'bg-teal-600 text-white shadow-md'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {stripPeriodeLabel(ym, kal)}
                  </button>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
