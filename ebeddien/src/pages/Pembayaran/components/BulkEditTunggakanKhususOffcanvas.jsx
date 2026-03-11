import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { paymentAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useAuthStore } from '../../../store/authStore'

function BulkEditTunggakanKhususOffcanvas({ isOpen, onClose, selectedDataList, allData, mode = 'tunggakan', onSuccess }) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentItem: null })
  const [selectedField, setSelectedField] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [inputValue, setInputValue] = useState('')

  // Field labels untuk display
  const fieldLabels = {
    'tahun_ajaran': 'Tahun Ajaran',
    'lembaga': 'Lembaga',
    'keterangan_1': 'Keterangan 1',
    'keterangan_2': 'Keterangan 2',
    'total': 'Total Wajib'
  }

  // Reset form saat offcanvas dibuka
  useEffect(() => {
    if (isOpen) {
      setSelectedField('')
      setSelectedValue('')
      setInputValue('')
      setProgress({ current: 0, total: 0, currentItem: null })
    }
  }, [isOpen])

  // Get unique values untuk field yang dipilih (kecuali total yang menggunakan input)
  const availableValues = useMemo(() => {
    if (!selectedField || !allData || allData.length === 0 || selectedField === 'total') {
      return []
    }

    const values = [...new Set(allData.map(item => item[selectedField]).filter(Boolean))]
    return values.sort()
  }, [selectedField, allData])

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value)
  }

  const parseCurrency = (value) => {
    // Remove currency symbols and spaces, then parse
    const cleaned = value.toString().replace(/[Rp\s.,]/g, '')
    return parseInt(cleaned) || 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedField) {
      showNotification('Pilih kolom yang ingin diubah', 'error')
      return
    }

    if (selectedField === 'total') {
      if (!inputValue || parseCurrency(inputValue) <= 0) {
        showNotification('Masukkan nilai total wajib yang valid', 'error')
        return
      }
    } else {
      if (selectedValue === undefined) {
        showNotification('Pilih nilai baru', 'error')
        return
      }
    }

    if (!selectedDataList || selectedDataList.length === 0) {
      showNotification('Tidak ada data yang dipilih', 'error')
      return
    }

    setLoading(true)
    setProgress({ current: 0, total: selectedDataList.length, currentItem: null })

    let successCount = 0
    let failCount = 0
    const errors = []

    try {
      for (let i = 0; i < selectedDataList.length; i++) {
        const item = selectedDataList[i]
        setProgress({ current: i + 1, total: selectedDataList.length, currentItem: item.nama })

        try {
          // Get the ID from the item - for tunggakan use id_tunggakan, for khusus use id_khusus
          // The ID should be the primary key from uwaba___tunggakan or uwaba___khusus table
          const itemId = mode === 'tunggakan' 
            ? (item.id_tunggakan || item.id)
            : (item.id_khusus || item.id)
          
          // Prepare update data with current values dari item
          // Gunakan nilai saat ini dari item untuk memastikan field yang tidak diubah tetap sama
          // Pastikan wajib menggunakan nilai yang benar (bisa dari wajib, total_wajib, atau total)
          // Prioritas: wajib > total_wajib > total (untuk backward compatibility)
          const currentWajib = item.wajib ?? item.total_wajib ?? item.total ?? 0
          
          // Validasi: pastikan wajib tidak 0 (kecuali memang ingin diubah ke 0)
          if (currentWajib <= 0 && selectedField !== 'total') {
            console.warn(`Item ${item.nama} (ID: ${itemId}) memiliki wajib = ${currentWajib}, item data:`, item)
          }
          
          // Siapkan data update dengan nilai saat ini dari item
          // Semua field harus dikirim dengan nilai yang benar
          const updateData = {
            id: itemId,
            keterangan_1: item.keterangan_1 || '',
            keterangan_2: item.keterangan_2 || null,
            total: currentWajib, // Gunakan nilai wajib saat ini
            tahun_ajaran: item.tahun_ajaran || null,
            lembaga: item.lembaga || null,
            id_admin: user?.id || null
          }

          // Update field yang dipilih saja, field lain tetap menggunakan nilai saat ini dari item
          if (selectedField === 'total') {
            updateData.total = parseCurrency(inputValue)
          } else {
            const valueToUpdate = selectedValue === '' ? null : (selectedValue || null)
            updateData[selectedField] = valueToUpdate
          }
          
          // Validasi final: pastikan total tidak 0 sebelum update
          if (updateData.total <= 0) {
            throw new Error(`Total wajib tidak boleh 0 atau negatif untuk ${item.nama}`)
          }

          const result = await paymentAPI.updateTunggakanKhusus(updateData, mode)
          if (result.success) {
            successCount++
          } else {
            failCount++
            errors.push(`${item.nama}: ${result.message || 'Gagal update'}`)
          }
        } catch (error) {
          failCount++
          errors.push(`${item.nama}: ${error.message || 'Error'}`)
        }
      }

      if (successCount > 0) {
        showNotification(
          `Berhasil mengupdate ${successCount} data${failCount > 0 ? `, ${failCount} gagal` : ''}`,
          failCount > 0 ? 'warning' : 'success'
        )
        if (onSuccess) {
          onSuccess()
        }
        onClose()
      } else {
        showNotification(`Gagal mengupdate semua data. ${errors.slice(0, 3).join('; ')}`, 'error')
      }
    } catch (error) {
      console.error('Bulk update error:', error)
      showNotification('Terjadi kesalahan saat mengupdate data', 'error')
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0, currentItem: null })
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Offcanvas */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Ubah Data Massal ({mode === 'tunggakan' ? 'Tunggakan' : 'Khusus'})
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                disabled={loading}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Mengubah <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedDataList?.length || 0}</span> data yang dipilih
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Field Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pilih Kolom yang Ingin Diubah
                  </label>
                  <select
                    value={selectedField}
                    onChange={(e) => {
                      setSelectedField(e.target.value)
                      setSelectedValue('')
                      setInputValue('')
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    disabled={loading}
                    required
                  >
                    <option value="">-- Pilih Kolom --</option>
                    {Object.keys(fieldLabels).map(field => (
                      <option key={field} value={field}>
                        {fieldLabels[field]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Value Selection - Dropdown untuk non-numeric fields */}
                {selectedField && selectedField !== 'total' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Pilih Nilai Baru
                    </label>
                    <select
                      value={selectedValue}
                      onChange={(e) => setSelectedValue(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      disabled={loading}
                      required
                    >
                      <option value="">-- Kosongkan --</option>
                      {availableValues.map(value => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Pilih nilai baru untuk kolom <span className="font-medium">{fieldLabels[selectedField]}</span>
                    </p>
                  </div>
                )}

                {/* Value Input - Input untuk total (numeric) */}
                {selectedField === 'total' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Masukkan Total Wajib Baru
                    </label>
                    <input
                      type="text"
                      value={inputValue}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d]/g, '')
                        setInputValue(value)
                      }}
                      placeholder="Contoh: 500000"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      disabled={loading}
                      required
                    />
                    {inputValue && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatCurrency(parseCurrency(inputValue))}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Masukkan nilai total wajib baru (tanpa titik atau koma)
                    </p>
                  </div>
                )}

                {/* Progress */}
                {loading && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Memproses...
                      </span>
                      <span className="text-sm text-blue-600 dark:text-blue-400">
                        {progress.current} / {progress.total}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                    {progress.currentItem && (
                      <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                        Memproses: {progress.currentItem}
                      </p>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !selectedField || (selectedField === 'total' ? !inputValue : selectedValue === undefined)}
                    className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Memproses...' : 'Update'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default BulkEditTunggakanKhususOffcanvas
