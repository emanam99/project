import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  EXPORT_COLUMNS,
  getExportColumnsSelection,
  setStoredExportColumns,
  getDefaultExportColumns
} from './exportIjinConfig'
import { useNotification } from '../../../contexts/NotificationContext'

function getKetPembayaran(santri) {
  const wajib = santri.wajib || 0
  const bayar = santri.bayar || 0
  if (wajib === 0) return { label: 'belum' }
  if (bayar >= wajib) return { label: 'lunas' }
  if (bayar > 0) return { label: 'kurang' }
  return { label: 'belum' }
}

export default function ExportIjinOffcanvas({
  isOpen,
  onClose,
  data = [],
  tahunAjaran
}) {
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

  const handleExport = () => {
    const activeColumns = EXPORT_COLUMNS.filter(({ key }) => selected[key])
    if (activeColumns.length === 0) {
      showNotification('Pilih minimal satu kolom untuk dieksport', 'warning')
      return
    }

    const rows = data.map((santri) => {
      const ketPembayaran = getKetPembayaran(santri)
      const base = {
        nis: santri.nis ?? santri.id,
        nama: santri.nama ?? '',
        ayah: santri.ayah ?? '',
        ibu: santri.ibu ?? '',
        gender: santri.gender ?? '',
        status_santri: santri.status_santri ?? santri.status ?? '',
        daerah: santri.daerah ?? '',
        kamar: santri.kamar ?? '',
        diniyah: santri.diniyah ?? '',
        kelas_diniyah: santri.kelas_diniyah ?? '',
        kel_diniyah: santri.kel_diniyah ?? '',
        formal: santri.formal ?? '',
        kelas_formal: santri.kelas_formal ?? '',
        kel_formal: santri.kel_formal ?? '',
        wajib: santri.wajib ?? 0,
        bayar: santri.bayar ?? 0,
        ket: ketPembayaran.label ?? ''
      }
      const out = {}
      activeColumns.forEach(({ key, label }) => {
        const v = base[key]
        out[label] = v === null || v === undefined || v === '' ? '' : v
      })
      return out
    })

    try {
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data Ijin')
      const filename = `Data_Ijin_${tahunAjaran || 'All'}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, filename)
      showNotification(`Berhasil eksport ${rows.length} baris`, 'success')
      onClose()
    } catch (e) {
      showNotification('Gagal eksport: ' + (e.message || 'Unknown error'), 'error')
    }
  }

  const noneChecked = EXPORT_COLUMNS.every(({ key }) => !selected[key])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <motion.div
        key="export-ijin-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="export-ijin-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Eksport Data Ijin
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
            Data yang dieksport mengikuti filter saat ini. Jumlah baris: <strong>{data.length}</strong>. Pilih kolom yang akan disertakan:
          </p>
          <div className="flex gap-2 mb-4">
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
          <ul className="space-y-2">
            {EXPORT_COLUMNS.map(({ key, label }) => (
              <li key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`export-ijin-${key}`}
                  checked={!!selected[key]}
                  onChange={() => handleToggle(key)}
                  className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor={`export-ijin-${key}`} className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={data.length === 0 || noneChecked}
            className="w-full inline-flex justify-center items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Eksport ke Excel
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
