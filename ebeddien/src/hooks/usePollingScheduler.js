import { useEffect, useRef } from 'react'

/**
 * usePollingScheduler
 *
 * Scheduler tunggal untuk menjalankan banyak task polling tanpa membuat banyak setInterval terpisah.
 *
 * Sasaran:
 * - Konsolidasi banyak interval menjadi satu base tick (mis. 5–10 detik) untuk hemat CPU dan timer churn.
 * - Pause otomatis saat halaman hidden (Page Visibility API) atau saat browser offline.
 * - Eksponensial backoff saat task gagal berurutan (mis. server down, network drop) sampai batas maksimum.
 * - Resume eksplisit saat halaman kembali visible atau koneksi kembali online.
 * - Stabil terhadap perubahan callback: gunakan ref di dalam, sehingga rerender komponen tidak memicu re-init interval.
 *
 * Penggunaan:
 *   const scheduler = usePollingScheduler({ baseTickMs: 5000, tasks: [...] })
 *
 *   tasks: Array<{
 *     id: string,                 // identifier unik
 *     run: () => Promise<any> | any, // fungsi yang dipanggil saat task due
 *     intervalMs: number,         // interval dasar (ms) di antara dua eksekusi sukses
 *     enabled?: boolean | (() => boolean), // gating; default true
 *     immediate?: boolean,        // jalankan langsung saat enabled berubah dari false→true (default: true)
 *     maxBackoffMs?: number,      // max backoff (default: 5 menit)
 *   }>
 *
 *   baseTickMs: tick scheduler tunggal (default 5000ms). Pilih nilai paling rendah dari semua interval ÷ 2 atau sekitar 5–10 detik.
 *
 * Catatan: hook tidak memuntahkan event/state — hanya menjalankan callback yang Anda berikan.
 */
export function usePollingScheduler({ baseTickMs = 5000, tasks }) {
  const tasksRef = useRef([])
  const taskStateRef = useRef(new Map())
  const visibleRef = useRef(typeof document !== 'undefined' ? document.visibilityState !== 'hidden' : true)
  const onlineRef = useRef(typeof navigator !== 'undefined' ? (navigator.onLine !== false) : true)
  const tickHandleRef = useRef(null)

  tasksRef.current = Array.isArray(tasks) ? tasks : []

  useEffect(() => {
    if (!tasksRef.current.length) return undefined

    const ensureState = (id) => {
      if (!taskStateRef.current.has(id)) {
        taskStateRef.current.set(id, {
          lastSuccessAt: 0,
          lastAttemptAt: 0,
          inFlight: false,
          failures: 0,
          prevEnabled: false,
        })
      }
      return taskStateRef.current.get(id)
    }

    const isEnabled = (task) => {
      const e = task.enabled
      if (typeof e === 'function') return Boolean(e())
      if (typeof e === 'boolean') return e
      return true
    }

    const computeNextDelay = (task, state) => {
      const base = Math.max(1000, Number(task.intervalMs) || 30000)
      if (state.failures <= 0) return base
      const max = Math.max(base, Number(task.maxBackoffMs) || 5 * 60 * 1000)
      const factor = Math.pow(2, Math.min(state.failures, 6))
      return Math.min(max, base * factor)
    }

    const runTask = async (task, state, now) => {
      if (state.inFlight) return
      state.inFlight = true
      state.lastAttemptAt = now
      try {
        await task.run()
        state.failures = 0
        state.lastSuccessAt = Date.now()
      } catch (_) {
        state.failures = Math.min(7, (state.failures || 0) + 1)
      } finally {
        state.inFlight = false
      }
    }

    const tick = () => {
      const now = Date.now()
      if (!visibleRef.current || !onlineRef.current) return
      for (const task of tasksRef.current) {
        if (!task || !task.id || typeof task.run !== 'function') continue
        const state = ensureState(task.id)
        const enabledNow = isEnabled(task)

        if (enabledNow && !state.prevEnabled) {
          state.prevEnabled = true
          if (task.immediate !== false) {
            runTask(task, state, now)
            continue
          }
        }
        if (!enabledNow) {
          state.prevEnabled = false
          continue
        }

        const refAt = state.lastSuccessAt || state.lastAttemptAt
        const delay = computeNextDelay(task, state)
        if (refAt === 0 || now - refAt >= delay) {
          runTask(task, state, now)
        }
      }
    }

    const startInterval = () => {
      if (tickHandleRef.current) return
      tickHandleRef.current = setInterval(tick, Math.max(1000, baseTickMs))
    }
    const stopInterval = () => {
      if (tickHandleRef.current) {
        clearInterval(tickHandleRef.current)
        tickHandleRef.current = null
      }
    }

    const onVisibility = () => {
      const visible = document.visibilityState !== 'hidden'
      const wasVisible = visibleRef.current
      visibleRef.current = visible
      if (visible && !wasVisible) {
        for (const task of tasksRef.current) {
          if (!task || !task.id || typeof task.run !== 'function') continue
          if (!isEnabled(task)) continue
          const state = ensureState(task.id)
          runTask(task, state, Date.now())
        }
      }
    }

    const onOnline = () => {
      const wasOnline = onlineRef.current
      onlineRef.current = true
      if (!wasOnline) {
        for (const task of tasksRef.current) {
          if (!task || !task.id || typeof task.run !== 'function') continue
          if (!isEnabled(task)) continue
          const state = ensureState(task.id)
          state.failures = 0
          runTask(task, state, Date.now())
        }
      }
    }

    const onOffline = () => {
      onlineRef.current = false
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      window.addEventListener('focus', onVisibility)
    }

    tick()
    startInterval()

    return () => {
      stopInterval()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
        window.removeEventListener('focus', onVisibility)
      }
    }
  }, [baseTickMs])
}

export default usePollingScheduler
