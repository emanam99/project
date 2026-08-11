import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { lttqTingkatanAPI, tahunAjaranAPI } from '../../services/api'
import { useActiveHijriyahTahunAjaran } from '../../hooks/useActiveTahunAjaran'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import {
  formatTingkatanLabel,
  buildKelompokOptionsFromList,
  findTingkatanByProgramKelompok
} from './lttqKelompokUtils'

const LEMBAGA_LTTQ_ID = 'LTTQ'

const listBtnClass =
  'w-full text-left px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors'

/**
 * Offcanvas bawah: tahun ajaran → pilih tingkatan (list) → pilih kelompok (list).
 * Pola UI sama dengan OffcanvasPindahRombel (kelas → kelompok).
 */
export default function OffcanvasPindahLttq({
  isOpen,
  onClose,
  title = 'Pindah Tingkatan LTTQ',
  excludeTingkatanId,
  onSelect,
  skipConfirmAfterSelect = false
}) {
  const tahunAjaranAktif = useActiveHijriyahTahunAjaran()
  const { options: tahunAjaranOptionsFallback } = useTahunAjaranStore()
  const [tahunAjaran, setTahunAjaran] = useState('')
  const [tahunAjaranOptionsList, setTahunAjaranOptionsList] = useState([])
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [tingkatanProgram, setTingkatanProgram] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setTahunAjaran('')
      setList([])
      setTahunAjaranOptionsList([])
      setTingkatanProgram('')
      return
    }
    setTahunAjaran(tahunAjaranAktif || '')
    tahunAjaranAPI
      .getAll?.()
      .then((res) => {
        const data = res?.success && Array.isArray(res?.data) ? res.data : []
        const opts = data
          .map((row) => ({
            value: row.tahun_ajaran || row.value || '',
            label: row.tahun_ajaran || row.label || row.value || ''
          }))
          .filter((o) => o.value && o.label)
        setTahunAjaranOptionsList(opts.length > 0 ? opts : tahunAjaranOptionsFallback || [])
      })
      .catch(() => setTahunAjaranOptionsList(tahunAjaranOptionsFallback || []))
    setLoading(true)
    lttqTingkatanAPI
      .getAll({ lembaga_id: LEMBAGA_LTTQ_ID, status: 'aktif', limit: 500 })
      .then((res) => {
        const rows = res?.success && Array.isArray(res.data) ? res.data : []
        const filtered =
          excludeTingkatanId != null && excludeTingkatanId !== ''
            ? rows.filter((t) => String(t.id) !== String(excludeTingkatanId))
            : rows
        setList(filtered)
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [isOpen, tahunAjaranAktif, tahunAjaranOptionsFallback, excludeTingkatanId])

  const optionsToShow =
    tahunAjaranOptionsList.length > 0 ? tahunAjaranOptionsList : tahunAjaranOptionsFallback || []

  const tingkatanOptions = useMemo(() => {
    const map = new Map()
    list.forEach((r) => {
      const tk = String(r.tingkatan || '').trim()
      if (!tk) return
      map.set(tk, (map.get(tk) || 0) + 1)
    })
    return [...map.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [list])

  const kelompokOptions = useMemo(
    () => buildKelompokOptionsFromList(list, tingkatanProgram),
    [list, tingkatanProgram]
  )

  const handleChooseTingkatan = (tk) => {
    setTingkatanProgram(tk)
  }

  const handleChooseKelompok = (kelompok) => {
    const ta = (tahunAjaran || '').trim()
    if (!ta) {
      window.alert('Pilih tahun ajaran terlebih dahulu.')
      return
    }
    const row = findTingkatanByProgramKelompok(list, tingkatanProgram, kelompok)
    if (!row?.id) {
      window.alert('Tingkatan untuk kelompok ini belum ada. Buat master tingkatan terlebih dahulu.')
      return
    }
    const label = formatTingkatanLabel(row)
    if (skipConfirmAfterSelect) {
      onSelect?.(row.id, ta)
      onClose?.()
      return
    }
    if (window.confirm(`Pindah ke ${label}?`)) {
      onSelect?.(row.id, ta)
      onClose?.()
    }
  }

  const selectClass =
    'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent'

  const renderList = (items, onPick, getKey, getLabel) => (
    <ul className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-200 dark:divide-gray-600">
      {items.map((item) => (
        <li key={getKey(item)}>
          <button type="button" onClick={() => onPick(item)} className={listBtnClass}>
            {getLabel(item)}
          </button>
        </li>
      ))}
    </ul>
  )

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="offcanvas-pindah-lttq-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10258]"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="offcanvas-pindah-lttq-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed bottom-0 left-0 right-0 z-[10259] flex flex-col max-h-[85vh] w-full rounded-t-xl bg-white dark:bg-gray-800 shadow-xl border-t border-gray-200 dark:border-gray-700 sm:left-auto sm:right-0 sm:w-[28rem] sm:max-w-[100vw]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="offcanvas-pindah-lttq-title"
          >
            <motion.div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
              <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
            </motion.div>
            <motion.div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
              <h2 id="offcanvas-pindah-lttq-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6 sm:pb-4">
              <motion.div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Tahun Ajaran <span className="text-red-500">*</span>
                </label>
                <select value={tahunAjaran} onChange={(e) => setTahunAjaran(e.target.value)} className={selectClass}>
                  <option value="">— Pilih Tahun Ajaran —</option>
                  {optionsToShow.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </motion.div>

              {!tahunAjaran.trim() ? (
                <p className="text-sm text-amber-600 dark:text-amber-400 py-3 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  Pilih tahun ajaran terlebih dahulu.
                </p>
              ) : loading ? (
                <motion.div className="flex justify-center py-6">
                  <span className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                </motion.div>
              ) : (
                <>
                  {!tingkatanProgram ? (
                    <motion.div key="tingkatan-list">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                        Tingkatan
                      </label>
                      {tingkatanOptions.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                          Tidak ada tingkatan lain yang tersedia.
                        </p>
                      ) : (
                        renderList(
                          tingkatanOptions,
                          (o) => handleChooseTingkatan(o.value),
                          (o) => o.value,
                          (o) => o.label
                        )
                      )}
                    </motion.div>
                  ) : (
                    <motion.div key="kelompok-list" className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setTingkatanProgram('')}
                        className="inline-flex items-center gap-1 text-sm text-teal-700 dark:text-teal-300 hover:underline"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                        </svg>
                        Kembali ke tingkatan
                      </button>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Tingkatan: <span className="font-medium text-gray-700 dark:text-gray-200">{tingkatanProgram}</span>
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                          Kelompok
                        </label>
                        {kelompokOptions.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                            Belum ada kelompok untuk tingkatan ini.
                          </p>
                        ) : (
                          renderList(
                            kelompokOptions,
                            (o) => handleChooseKelompok(o.value),
                            (o) => o.value,
                            (o) => o.label
                          )
                        )}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
