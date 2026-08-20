import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { uwabaAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import {
  buildLengkapiPayloadFromRow,
  filterOnboardingTargets,
  groupByRombelDiniyah,
  HIJRI_UWABA_BULAN_IDS,
} from '../utils/uwabaManageHelpers'

const panelTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

function GenerateTaUwabaOffcanvas({
  isOpen,
  onClose,
  mode = 'generate',
  filteredRows = [],
  uwabaPrices,
  tahunAjaran,
  onSuccess,
}) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' })
  const [errors, setErrors] = useState([])

  const targets = useMemo(
    () => filterOnboardingTargets(filteredRows, mode),
    [filteredRows, mode]
  )

  const rombelGroups = useMemo(() => groupByRombelDiniyah(targets), [targets])

  const title = mode === 'generate' ? 'Generate UWABA TA (terfilter)' : 'Lengkapi UWABA (terfilter)'
  const subtitle =
    mode === 'generate'
      ? 'Buat 10 bulan UWABA untuk santri yang belum punya data (count 0), kecuali Boyong/Alumni/Lulus.'
      : 'Tambah bulan yang belum ada hingga lengkap 10, per biodata masing-masing santri.'

  const run = async () => {
    if (!tahunAjaran) {
      showNotification('Pilih tahun ajaran dulu', 'error')
      return
    }
    if (!uwabaPrices) {
      showNotification('Data harga UWABA belum dimuat', 'error')
      return
    }
    if (targets.length === 0) {
      showNotification('Tidak ada santri yang memenuhi kriteria pada filter aktif', 'warning')
      return
    }

    setLoading(true)
    setErrors([])
    setProgress({ current: 0, total: targets.length, name: '' })
    let ok = 0
    const fails = []

    try {
      for (let i = 0; i < targets.length; i++) {
        const santri = targets[i]
        setProgress({ current: i + 1, total: targets.length, name: santri.nama || santri.id })
        const payload = buildLengkapiPayloadFromRow(santri, uwabaPrices)
        if (!payload.status_santri) {
          fails.push(`${santri.nama} (${santri.nis ?? santri.id}): status santri kosong`)
          continue
        }
        try {
          const res = await uwabaAPI.lengkapiData(santri.id, tahunAjaran, payload, {
            mode: 'create',
            idBulans: mode === 'generate' ? HIJRI_UWABA_BULAN_IDS : undefined,
          })
          if (res?.success) ok++
          else fails.push(`${santri.nama} (${santri.nis ?? santri.id}): ${res?.message || 'Gagal'}`)
        } catch (e) {
          fails.push(`${santri.nama} (${santri.nis ?? santri.id}): ${e?.message || 'Error'}`)
        }
      }
      setErrors(fails)
      if (ok > 0) {
        onSuccess?.()
        showNotification(
          `Berhasil ${mode === 'generate' ? 'generate' : 'lengkapi'} ${ok} santri${fails.length ? `, ${fails.length} gagal` : ''}`,
          fails.length ? 'warning' : 'success'
        )
        if (!fails.length) onClose()
      } else {
        showNotification('Tidak ada santri yang berhasil diproses', 'error')
      }
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0, name: '' })
    }
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            key="gen-ta-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={loading ? undefined : onClose}
          />
          <motion.div
            key="gen-ta-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={panelTransition}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[61] flex flex-col"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">TA {tahunAjaran || '—'}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              <p className="text-xs text-gray-600 dark:text-gray-400">{subtitle}</p>
              <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 p-3">
                <p className="text-teal-800 dark:text-teal-200 font-semibold">{targets.length} santri siap diproses</p>
                <p className="text-[11px] text-teal-700/80 dark:text-teal-300/80 mt-1">
                  Gunakan filter rombel di tabel, lalu jalankan per kelompok secara bertahap.
                </p>
              </div>
              {rombelGroups.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Per rombel diniyah</p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto text-xs">
                    {rombelGroups.map(([label, n]) => (
                      <li
                        key={label}
                        className="flex justify-between px-2 py-1 rounded bg-gray-50 dark:bg-gray-700/50"
                      >
                        <span className="truncate pr-2">{label}</span>
                        <span className="font-medium shrink-0">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {loading && progress.total > 0 ? (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  Memproses {progress.current}/{progress.total}
                  {progress.name ? ` — ${progress.name}` : ''}
                </div>
              ) : null}
              {errors.length > 0 ? (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-2 max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Gagal ({errors.length})</p>
                  <ul className="text-[11px] text-amber-900 dark:text-amber-100 space-y-0.5">
                    {errors.slice(0, 20).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {errors.length > 20 ? <li>…dan {errors.length - 20} lainnya</li> : null}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={run}
                disabled={loading || targets.length === 0}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50"
              >
                {loading ? 'Memproses…' : `Jalankan (${targets.length})`}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}

export default GenerateTaUwabaOffcanvas
