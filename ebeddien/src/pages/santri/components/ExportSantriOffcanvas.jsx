import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import * as XLSX from 'xlsx'
import {
  EXPORT_COLUMNS,
  getExportColumnsSelection,
  setStoredExportColumns,
  getDefaultExportColumns,
  getOrderedExportColumns,
  setStoredColumnOrderKeys,
  buildAlamatGabungan
} from '../exportSantriConfig'
import { useNotification } from '../../../contexts/NotificationContext'

function ReorderExportColumnItem({ item, checked, disabled, onToggle }) {
  const dragControls = useDragControls()
  const isReq = !!disabled

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      className="flex items-center gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50/90 dark:bg-gray-800/50 px-2 py-1.5"
    >
      <button
        type="button"
        onPointerDown={(event) => dragControls.start(event)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-grab active:cursor-grabbing"
        title="Tarik untuk pindah urutan"
        aria-label={`Geser urutan kolom ${item.label}`}
        style={{ touchAction: 'none' }}
      >
        ≡
      </button>
      <input
        type="checkbox"
        id={`export-santri-${item.key}`}
        checked={checked}
        onChange={() => onToggle(item.key)}
        disabled={isReq}
        className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 shrink-0 disabled:opacity-70 disabled:cursor-not-allowed"
      />
      <label
        htmlFor={`export-santri-${item.key}`}
        className={`text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 ${isReq ? 'cursor-default' : 'cursor-pointer'}`}
      >
        {item.label}
        {item.required && (
          <span className="text-gray-400 dark:text-gray-500 ml-1">(wajib)</span>
        )}
      </label>
    </Reorder.Item>
  )
}

export default function ExportSantriOffcanvas({ isOpen, onClose, filteredData = [] }) {
  const { showNotification } = useNotification()
  const [selected, setSelected] = useState(() => getExportColumnsSelection())
  const [orderedColumns, setOrderedColumns] = useState(() => getOrderedExportColumns())

  useEffect(() => {
    if (isOpen) {
      setSelected(getExportColumnsSelection())
      setOrderedColumns(getOrderedExportColumns())
    }
  }, [isOpen])

  const isRequired = (key) => EXPORT_COLUMNS.find((c) => c.key === key)?.required === true

  const handleToggle = (key) => {
    if (isRequired(key)) return
    const next = { ...selected, [key]: !selected[key] }
    setSelected(next)
    setStoredExportColumns(next)
  }

  const handleSelectAll = (checked) => {
    const next = getDefaultExportColumns()
    EXPORT_COLUMNS.forEach(({ key }) => {
      next[key] = isRequired(key) ? true : checked
    })
    setSelected(next)
    setStoredExportColumns(next)
  }

  const handleReorder = useCallback((next) => {
    setOrderedColumns(next)
    setStoredColumnOrderKeys(next.map((c) => c.key))
  }, [])

  const handleExport = () => {
    const activeColumns = orderedColumns.filter(({ key }) => selected[key])
    if (activeColumns.length === 0) {
      showNotification('Pilih minimal satu kolom untuk dieksport', 'warning')
      return
    }

    const rows = filteredData.map((row, index) => {
      const daerahKamar = (row.daerah && row.kamar) ? `${row.daerah}.${row.kamar}` : (row.daerah || row.kamar || '-')
      const base = {
        ...row,
        no: index + 1,
        daerah_kamar: daerahKamar,
        alamat: buildAlamatGabungan(row)
      }
      const out = {}
      activeColumns.forEach(({ key, label }) => {
        const v = base[key]
        out[label] = v === null || v === undefined || v === '' ? '-' : v
      })
      return out
    })

    try {
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Data Santri')
      const filename = `Data_Santri_${new Date().toISOString().split('T')[0]}.xlsx`
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
        key="export-santri-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="export-santri-panel"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'tween', duration: 0.25 }}
        className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[9999] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Eksport Data Santri
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
            Data yang dieksport mengikuti filter saat ini. Jumlah baris: <strong>{filteredData.length}</strong>.
            Centang kolom yang disertakan; urutan di bawah mengikuti kolom di file Excel (geser ≡ untuk mengubah).
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
          <Reorder.Group axis="y" values={orderedColumns} onReorder={handleReorder} className="space-y-2">
            {orderedColumns.map((item) => (
              <ReorderExportColumnItem
                key={item.key}
                item={item}
                checked={!!selected[item.key]}
                disabled={!!item.required}
                onToggle={handleToggle}
              />
            ))}
          </Reorder.Group>
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
    </AnimatePresence>
  )
}
