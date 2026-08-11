import { useActiveHijriyahTahunAjaran } from '../../hooks/useActiveTahunAjaran'
import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { rombelAPI, tahunAjaranAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'

const listBtnClass =
  'w-full text-left px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors'

/**
 * Offcanvas bawah untuk pindah rombel: pilih tahun ajaran → kelas (list) → kelompok/kel (list).
 * Responsif: HP full lebar, PC max-width agar tidak terlalu lebar.
 * Dipakai di page Rombel dan di DetailSantri offcanvas.
 */
export default function OffcanvasPindahRombel({
  isOpen,
  onClose,
  title = 'Pindah Rombel',
  lembagaId,
  excludeRombelId,
  onSelect,
  skipConfirmAfterSelect = false
}) {
  const tahunAjaranAktif = useActiveHijriyahTahunAjaran()
  const { options: tahunAjaranOptionsFallback } = useTahunAjaranStore()
  const [tahunAjaranOptionsList, setTahunAjaranOptionsList] = useState([])
  const [tahunAjaran, setTahunAjaran] = useState('')
  const [rombelList, setRombelList] = useState([])
  const [loadingRombel, setLoadingRombel] = useState(false)
  const [selectedKelas, setSelectedKelas] = useState('')

  useEffect(() => {
    if (!isOpen) {
      setTahunAjaran('')
      setRombelList([])
      setTahunAjaranOptionsList([])
      setSelectedKelas('')
      return
    }
    setTahunAjaran(tahunAjaranAktif || '')
    tahunAjaranAPI.getAll?.()
      .then((res) => {
        const data = res?.success && Array.isArray(res?.data) ? res.data : []
        const opts = data.map((row) => ({
          value: row.tahun_ajaran || row.value || '',
          label: row.tahun_ajaran || row.label || row.value || ''
        })).filter((o) => o.value && o.label)
        setTahunAjaranOptionsList(opts.length > 0 ? opts : (tahunAjaranOptionsFallback || []))
      })
      .catch(() => setTahunAjaranOptionsList(tahunAjaranOptionsFallback || []))
  }, [isOpen, tahunAjaranAktif, tahunAjaranOptionsFallback])

  useEffect(() => {
    if (!isOpen || !lembagaId) {
      setRombelList([])
      return
    }
    setLoadingRombel(true)
    rombelAPI.getAll({ lembaga_id: lembagaId, limit: 500, status: 'aktif' })
      .then((res) => {
        const list = res?.success && Array.isArray(res?.data) ? res.data : []
        const filtered = excludeRombelId != null && excludeRombelId !== ''
          ? list.filter((r) => String(r.id) !== String(excludeRombelId))
          : list
        setRombelList(filtered)
      })
      .catch(() => setRombelList([]))
      .finally(() => setLoadingRombel(false))
  }, [isOpen, lembagaId, excludeRombelId])

  useEffect(() => {
    if (!isOpen) setSelectedKelas('')
  }, [isOpen, tahunAjaran])

  const optionsToShow = tahunAjaranOptionsList.length > 0 ? tahunAjaranOptionsList : (tahunAjaranOptionsFallback || [])

  const kelasGroups = useMemo(() => {
    const map = new Map()
    rombelList.forEach((r) => {
      const k = String(r.kelas || '').trim() || '–'
      if (!map.has(k)) map.set(k, [])
      map.get(k).push(r)
    })
    return [...map.entries()]
      .map(([kelas, rombels]) => ({
        kelas,
        rombels: rombels.sort((a, b) =>
          String(a.kel || '').localeCompare(String(b.kel || ''), undefined, { numeric: true })
        )
      }))
      .sort((a, b) => a.kelas.localeCompare(b.kelas, undefined, { numeric: true }))
  }, [rombelList])

  const kelompokList = useMemo(() => {
    if (!selectedKelas) return []
    const group = kelasGroups.find((g) => g.kelas === selectedKelas)
    return group?.rombels ?? []
  }, [kelasGroups, selectedKelas])

  const handleChooseRombel = (r) => {
    const ta = (tahunAjaran || '').trim()
    if (!ta) {
      if (typeof window !== 'undefined') window.alert('Pilih tahun ajaran terlebih dahulu.')
      return
    }
    const label = (r.kelas || '–') + (r.kel ? ' (' + r.kel + ')' : '')
    if (skipConfirmAfterSelect) {
      onSelect?.(r.id, ta)
      onClose?.()
      return
    }
    if (window.confirm('Pindah ke ' + label + '?')) {
      onSelect?.(r.id, ta)
      onClose?.()
    }
  }

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
            key="offcanvas-pindah-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/50 z-[10258]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="offcanvas-pindah-panel"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="fixed bottom-0 left-0 right-0 z-[10259] flex flex-col max-h-[85vh] w-full rounded-t-xl bg-white dark:bg-gray-800 shadow-xl border-t border-gray-200 dark:border-gray-700 sm:left-auto sm:right-0 sm:w-[28rem] sm:max-w-[100vw]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offcanvas-pindah-rombel-title"
      >
        {/* Handle bar (mobile) */}
        <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
          <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
          <h2 id="offcanvas-pindah-rombel-title" className="text-lg font-semibold text-gray-900 dark:text-white">
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
        </div>
        <motion.div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6 sm:pb-4">
          <motion.div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Tahun Ajaran <span className="text-red-500">*</span>
            </label>
            <select
              value={tahunAjaran}
              onChange={(e) => setTahunAjaran(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            >
              <option value="">— Pilih Tahun Ajaran —</option>
              {optionsToShow.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </motion.div>

          {!tahunAjaran || !tahunAjaran.trim() ? (
            <p className="text-sm text-amber-600 dark:text-amber-400 py-3 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              Pilih tahun ajaran terlebih dahulu.
            </p>
          ) : loadingRombel ? (
            <motion.div className="flex justify-center py-6">
              <span className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
            </motion.div>
          ) : (
            <>
              {!selectedKelas ? (
                <motion.div key="kelas-list">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Kelas
                  </label>
                  {kelasGroups.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Tidak ada rombel lain di lembaga ini.</p>
                  ) : (
                    renderList(
                      kelasGroups,
                      (g) => setSelectedKelas(g.kelas),
                      (g) => g.kelas,
                      (g) => g.kelas
                    )
                  )}
                </motion.div>
              ) : (
                <motion.div key="kelompok-list" className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setSelectedKelas('')}
                    className="inline-flex items-center gap-1 text-sm text-teal-700 dark:text-teal-300 hover:underline"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Kembali ke kelas
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Kelas: <span className="font-medium text-gray-700 dark:text-gray-200">{selectedKelas}</span>
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Kelompok
                    </label>
                    {kelompokList.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Belum ada kelompok untuk kelas ini.</p>
                    ) : (
                      renderList(
                        kelompokList,
                        (r) => handleChooseRombel(r),
                        (r) => r.id,
                        (r) => (r.kel ? String(r.kel).trim() : '–')
                      )
                    )}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </motion.div>
      </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}
