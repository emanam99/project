import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

const availableColumns = [
  { key: 'id', label: 'ID', default: true },
  { key: 'nama', label: 'Nama', default: true },
  { key: 'ayah', label: 'Ayah', default: false },
  { key: 'ibu', label: 'Ibu', default: false },
  { key: 'gender', label: 'Gender', default: true },
  { key: 'status_santri', label: 'Status', default: true },
  { key: 'domisili', label: 'Domisili', default: true }, // Gabungan daerah + kamar
  { key: 'diniyah', label: 'Diniyah', default: true }, // Gabungan diniyah + kelas_diniyah + kel_diniyah
  { key: 'formal', label: 'Formal', default: true }, // Gabungan formal + kelas_formal + kel_formal
  { key: 'wajib', label: 'Wajib', default: false },
  { key: 'bayar', label: 'Bayar', default: false },
  { key: 'ket', label: 'Ket', default: false }
]

function PrintDataModal({ isOpen, onClose, onPrint, data, filters }) {
  const [selectedColumns, setSelectedColumns] = useState(() => {
    // Default: semua kolom yang default: true
    return availableColumns.filter(col => col.default).map(col => col.key)
  })

  const handleToggleColumn = (key) => {
    setSelectedColumns(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key)
      } else {
        return [...prev, key]
      }
    })
  }

  const handleSelectAll = () => {
    if (selectedColumns.length === availableColumns.length) {
      setSelectedColumns([])
    } else {
      setSelectedColumns(availableColumns.map(col => col.key))
    }
  }

  const handlePrint = () => {
    if (selectedColumns.length === 0) {
      alert('Pilih minimal satu kolom untuk di-print')
      return
    }
    onPrint(selectedColumns)
  }

  if (!isOpen) return null

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-[9998]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Pilih Kolom untuk Print
                </h2>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="mb-4">
                  <button
                    onClick={handleSelectAll}
                    className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
                  >
                    {selectedColumns.length === availableColumns.length ? 'Hapus Semua' : 'Pilih Semua'}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {availableColumns.map((column) => {
                    const isSelected = selectedColumns.includes(column.key)
                    return (
                      <label
                        key={column.key}
                        className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleColumn(column.key)}
                          className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {column.label}
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    <strong>Total kolom terpilih:</strong> {selectedColumns.length} dari {availableColumns.length}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handlePrint}
                  disabled={selectedColumns.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Print
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(modalContent, document.body)
}

export default PrintDataModal
