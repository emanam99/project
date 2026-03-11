import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

/**
 * Offcanvas ubah massal Data Pendaftar.
 * Hanya kolom psb___registrasi yang diizinkan: status_pendaftar, formal (daftar_formal), diniyah (daftar_diniyah), gelombang.
 * Kolom keterangan_status tidak boleh diubah via ubah masal (hanya lewat sync/flow berkas & pembayaran).
 */
function BulkEditPendaftarOffcanvas({ isOpen, onClose, selectedPendaftarList, allPendaftarList, onSuccess }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentNama: null })
  const [selectedField, setSelectedField] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [useManualInput, setUseManualInput] = useState(false)

  // Field key di frontend -> key di API (psb___registrasi). keterangan_status sengaja tidak disertakan.
  const fieldMapping = {
    status_pendaftar: 'status_pendaftar',
    status_murid: 'status_murid',
    formal: 'daftar_formal',
    diniyah: 'daftar_diniyah',
    gelombang: 'gelombang'
  }

  const fieldLabels = {
    status_pendaftar: 'Status Pendaftar',
    status_murid: 'Status Murid',
    formal: 'Formal',
    diniyah: 'Diniyah',
    gelombang: 'Gelombang'
  }

  useEffect(() => {
    if (isOpen) {
      setSelectedField('')
      setSelectedValue('')
      setUseManualInput(false)
      setProgress({ current: 0, total: 0, currentNama: null })
    }
  }, [isOpen])

  const availableValues = useMemo(() => {
    if (!selectedField || !allPendaftarList || allPendaftarList.length === 0) {
      return []
    }
    const key = selectedField
    const values = [
      ...new Set(
        allPendaftarList
          .map(p => (p[key] != null && p[key] !== '') ? String(p[key]).trim() : null)
          .filter(Boolean)
      )
    ]
    return values.sort()
  }, [selectedField, allPendaftarList])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedField) {
      showNotification('Pilih kolom yang ingin diubah', 'error')
      return
    }
    if (selectedValue === undefined) {
      showNotification('Pilih atau isi nilai baru', 'error')
      return
    }
    if (!selectedPendaftarList || selectedPendaftarList.length === 0) {
      showNotification('Tidak ada pendaftar yang dipilih', 'error')
      return
    }

    const apiField = fieldMapping[selectedField] || selectedField
    const valueToSet = selectedValue === '' ? null : (selectedValue || null)
    const updates = selectedPendaftarList.map(p => ({
      id_registrasi: p.id_registrasi,
      [apiField]: valueToSet
    }))

    setLoading(true)
    setProgress({ current: 0, total: selectedPendaftarList.length, currentNama: null })

    try {
      const result = await pendaftaranAPI.bulkUpdateRegistrasi({ updates })
      if (result.success) {
        showNotification(result.message || `Berhasil mengupdate ${result.data?.updated ?? updates.length} registrasi`, 'success')
        if (onSuccess) onSuccess()
        onClose()
      } else {
        showNotification(result.message || 'Gagal mengupdate data', 'error')
      }
    } catch (error) {
      console.error('Bulk update pendaftar error:', error)
      showNotification(error?.response?.data?.message || 'Terjadi kesalahan saat mengupdate data', 'error')
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0, currentNama: null })
    }
  }

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  if (!isOpen) return null

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998 }}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col"
            style={{ position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 99999 }}
          >
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Ubah Data Massal
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

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Mengubah <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedPendaftarList?.length || 0}</span> pendaftar yang dipilih (kondisi terkait pembayaran)
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pilih Kolom yang Ingin Diubah
                  </label>
                  <select
                    value={selectedField}
                    onChange={(e) => {
                      setSelectedField(e.target.value)
                      setSelectedValue('')
                      setUseManualInput(false)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    disabled={loading}
                    required
                  >
                    <option value="">-- Pilih Kolom --</option>
                    {Object.keys(fieldLabels).map(field => (
                      <option key={field} value={field}>{fieldLabels[field]}</option>
                    ))}
                  </select>
                </div>

                {selectedField && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Pilih Nilai Baru
                    </label>
                    <div className="flex items-center gap-2 mb-2">
                      <input
                        id="bulk-pendaftar-manual-input"
                        type="checkbox"
                        checked={useManualInput}
                        onChange={(e) => {
                          setUseManualInput(e.target.checked)
                          setSelectedValue('')
                        }}
                        disabled={loading}
                        className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <label htmlFor="bulk-pendaftar-manual-input" className="text-sm text-gray-700 dark:text-gray-300 select-none">
                        Input manual
                      </label>
                    </div>
                    {useManualInput ? (
                      <input
                        type="text"
                        value={selectedValue}
                        onChange={(e) => setSelectedValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={loading}
                        placeholder="Ketik nilai baru (kosongkan untuk menghapus)"
                      />
                    ) : (
                      <select
                        value={selectedValue}
                        onChange={(e) => setSelectedValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={loading}
                        required
                      >
                        <option value="">-- Kosongkan --</option>
                        {availableValues.map(value => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {useManualInput
                        ? `Input manual untuk kolom ${fieldLabels[selectedField]}. Biarkan kosong untuk menghapus.`
                        : `Pilih nilai baru untuk kolom ${fieldLabels[selectedField]}`}
                    </p>
                  </div>
                )}

                {loading && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Memproses...</span>
                      <span className="text-sm text-blue-600 dark:text-blue-400">{progress.current} / {progress.total}</span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                      <div
                        className="bg-blue-600 dark:bg-blue-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                    {progress.currentNama && (
                      <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">Memproses: {progress.currentNama}</p>
                    )}
                  </div>
                )}

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
                    disabled={loading || !selectedField || selectedValue === undefined}
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

  return createPortal(offcanvasContent, document.body)
}

export default BulkEditPendaftarOffcanvas
