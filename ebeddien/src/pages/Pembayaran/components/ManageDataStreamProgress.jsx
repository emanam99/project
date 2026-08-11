import { useEffect, useRef, useState } from 'react'

/**
 * Indikator muat bertahap (Manage Data UWABA / Khusus / Tunggakan).
 * Progress angka/bar dihaluskan (lerp) agar tidak melonjak meski banyak baris masuk sekaligus.
 * Setelah selesai (100%), panel disembunyikan otomatis setelah jeda singkat.
 */
export default function ManageDataStreamProgress({ active, loaded, total, errorMessage }) {
  const [smoothLoaded, setSmoothLoaded] = useState(0)
  const [panelHidden, setPanelHidden] = useState(false)
  const hideTimerRef = useRef(null)

  const tgtLoaded = Number(loaded) || 0
  const tgtTotal = Number(total) || 0

  useEffect(() => {
    if (active) {
      setSmoothLoaded(0)
    }
  }, [active])

  useEffect(() => {
    if (active || errorMessage) {
      setPanelHidden(false)
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [active, errorMessage])

  useEffect(() => {
    if (tgtLoaded === 0 && tgtTotal === 0 && !active && !errorMessage) {
      setSmoothLoaded(0)
      return
    }
    let intervalId
    const tick = () => {
      setSmoothLoaded((prev) => {
        if (prev === tgtLoaded) return prev
        const diff = tgtLoaded - prev
        const step = Math.max(1, Math.ceil(Math.abs(diff) * 0.085))
        const next = diff > 0 ? Math.min(tgtLoaded, prev + step) : Math.max(tgtLoaded, prev - step)
        return next
      })
    }
    intervalId = window.setInterval(tick, 42)
    tick()
    return () => clearInterval(intervalId)
  }, [tgtLoaded, tgtTotal, active, errorMessage])

  useEffect(() => {
    if (errorMessage) return
    const finished =
      !active &&
      ((tgtTotal > 0 && tgtLoaded >= tgtTotal) || (tgtTotal === 0 && tgtLoaded > 0))

    if (!finished) return

    hideTimerRef.current = window.setTimeout(() => {
      setPanelHidden(true)
      hideTimerRef.current = null
    }, 3000)

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
        hideTimerRef.current = null
      }
    }
  }, [active, errorMessage, tgtTotal, tgtLoaded])

  if (errorMessage) {
    return (
      <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 sm:px-4">
        {errorMessage}
      </div>
    )
  }

  if (panelHidden) {
    return null
  }

  const displayCount = Math.round(smoothLoaded)
  const pct =
    tgtTotal > 0
      ? Math.min(100, Math.round((smoothLoaded / tgtTotal) * 100))
      : active
        ? Math.min(99, Math.max(0, smoothLoaded > 0 ? 8 : 3))
        : displayCount > 0
          ? 100
          : 0

  const label =
    tgtTotal > 0
      ? `Memuat data: ${displayCount.toLocaleString('id-ID')} / ${tgtTotal.toLocaleString('id-ID')} baris (${pct}%)`
      : active
        ? 'Memuat data…'
        : `Selesai — ${displayCount.toLocaleString('id-ID')} baris`

  if (!active && displayCount === 0 && tgtTotal === 0) {
    return null
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50 px-3 py-2.5 transition-opacity duration-500 dark:border-gray-600 dark:bg-gray-900/40 sm:px-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-300">
        <span className="font-medium">{label}</span>
        {active || pct < 100 ? (
          <span className="tabular-nums text-teal-600 dark:text-teal-400">{pct}%</span>
        ) : (
          <span className="tabular-nums text-teal-700 dark:text-teal-300">100%</span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-teal-500 ease-out dark:bg-teal-400"
          style={{
            width: `${pct}%`,
            transition: 'width 420ms cubic-bezier(0.33, 1, 0.68, 1)',
          }}
        />
      </div>
    </div>
  )
}

export const MANAGE_DATA_CHUNK_SIZE = 400
