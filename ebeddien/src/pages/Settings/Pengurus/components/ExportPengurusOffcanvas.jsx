import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  EXPORT_COLUMNS,
  getExportColumnsSelection,
  setStoredExportColumns,
  getDefaultExportColumns,
  DATE_KEYS
} from '../exportPengurusConfig'
import { useNotification } from '../../../../contexts/NotificationContext'

export default function ExportPengurusOffcanvas({ isOpen, onClose, filteredData = [], lembagaList = [] }) {
  const { showNotification } = useNotification()
  const [selected, setSelected] = useState(() => getExportColumnsSelection())

  useEffect(() => {
    if (isOpen) {
      setSelected(getExportColumnsSelection())
    }
  }, [isOpen])

  const handleToggle = (key) => {
    const next = { ...selected, [key]: !selected[key] }
    setSelected(next)
    setStoredExportColumns(next)
  }

  const handleSelectAll = (checked) => {
    const next = getDefaultExportColumns()
    EXPORT_COLUMNS.forEach(({ key }) => { next[key] = checked })
    setSelected(next)
    setStoredExportColumns(next)
  }

  const getLembagaNama = (lembagaId) => {
    if (!lembagaId) return ''
    const found = (lembagaList || []).find((l) => String(l.id) === String(lembagaId))
    return found?.nama || lembagaId
  }

  const formatValue = (v, key) => {
    if (v === null || v === undefined || v === '') return '-'
    if (DATE_KEYS.includes(key) && v) {
      try {
        const d = new Date(v)
        if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('id-ID')
      } catch (_) {}
    }
    return String(v)
  }

  const handleExport = () => {
    const activeColumns = EXPORT_COLUMNS.filter(({ key }) => selected[key])
    if (activeColumns.length === 0) {
      showNotification('Pilih minimal satu kolom untuk dieksport', 'warning')
      return
    }

    const rows = filteredData.map((p, index) => {
      const jabatanList = p.jabatan || []
      const lembagaFromApi = p.lembaga || []
      const kategoriLembagaStr = lembagaFromApi.length > 0
        ? [...new Set(lembagaFromApi.map((l) => l.kategori).filter(Boolean))].join(', ') || '-'
        : '-'
      const lembagaStr = lembagaFromApi.length > 0
        ? lembagaFromApi.map((l) => l.nama || '').filter(Boolean).join(', ') || '-'
        : (() => {
            const lembagaIds = [...new Set(jabatanList.map((j) => j.lembaga_id).filter(Boolean))]
            return lembagaIds.map((id) => getLembagaNama(id)).filter(Boolean).join(', ') || '-'
          })()
      const jabatanStr = jabatanList.length
        ? jabatanList
            .map((j) => (j.lembaga_id ? `${j.jabatan_nama || '-'} (${getLembagaNama(j.lembaga_id)})` : (j.jabatan_nama || '-')))
            .join('; ')
        : '-'
      const base = {
        ...p,
        no: index + 1,
        kategori_lembaga: kategoriLembagaStr,
        lembaga: lembagaStr,
        jabatan: jabatanStr
      }
      const out = {}
      activeColumns.forEach(({ key, label }) => {
        const v = base[key]
        out[label] = formatValue(v, key)
      })
      return out
    })

    try {
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Pengurus')
      const filename = `pengurus_export_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, filename)
      showNotification(`Berhasil eksport ${rows.length} baris`, 'success')
      onClose()
    } catch (e) {
      showNotification('Gagal eksport: ' + (e.message || 'Unknown error'), 'error')
    }
  }

  const noneChecked = EXPORT_COLUMNS.every(({ key }) => !selected[key])
  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="export-pengurus-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/50 z-[9998]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {isOpen && (
        <motion.div
          key="export-pengurus-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
        >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Eksport Data Pengurus
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Data yang dieksport mengikuti filter dan pencarian saat ini. Jumlah baris: <strong>{filteredData.length}</strong>. Pilih kolom yang akan disertakan:
          </p>
          <ul className="space-y-2 mb-4">
            {EXPORT_COLUMNS.map(({ key, label }) => (
              <li key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`export-pengurus-${key}`}
                  checked={!!selected[key]}
                  onChange={() => handleToggle(key)}
                  className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor={`export-pengurus-${key}`} className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  {label}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="text-xs px-2 py-1 rounded bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-800/50"
            >
              Centang semua
            </button>
            <button
              type="button"
              onClick={() => handleSelectAll(false)}
              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Hapus centang
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={filteredData.length === 0 || noneChecked}
            className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Eksport ke Excel
          </button>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  )
}
