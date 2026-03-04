import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { santriAPI, pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

function BulkEditOffcanvas({ isOpen, onClose, selectedSantriList, allDataSantri, onSuccess }) {
  const { showNotification } = useNotification()
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentSantri: null })
  const [selectedField, setSelectedField] = useState('')
  const [selectedValue, setSelectedValue] = useState('')
  const [useManualInput, setUseManualInput] = useState(false)
  const [rombelDiniyahOptions, setRombelDiniyahOptions] = useState([])
  const [rombelFormalOptions, setRombelFormalOptions] = useState([])
  const [rombelOptionsLoading, setRombelOptionsLoading] = useState(false)

  // Mapping field name ke field database (diniyah/formal kirim id_diniyah/id_formal ke backend)
  const fieldMapping = {
    'status': 'status_santri',
    'kategori': 'kategori',
    'diniyah': 'id_diniyah',
    'kelas_diniyah': 'kelas_diniyah',
    'kel_diniyah': 'kel_diniyah',
    'formal': 'id_formal',
    'kelas_formal': 'kelas_formal',
    'kel_formal': 'kel_formal',
    'lttq': 'lttq',
    'kelas_lttq': 'kelas_lttq',
    'kel_lttq': 'kel_lttq',
    'saudara_di_pesantren': 'saudara_di_pesantren'
  }

  // Field labels untuk display
  const fieldLabels = {
    'status': 'Status',
    'kategori': 'Kategori',
    'diniyah': 'Diniyah',
    'kelas_diniyah': 'Kelas Diniyah',
    'kel_diniyah': 'Kel Diniyah',
    'formal': 'Formal',
    'kelas_formal': 'Kelas Formal',
    'kel_formal': 'Kel Formal',
    'lttq': 'LTTQ',
    'kelas_lttq': 'Kelas LTTQ',
    'kel_lttq': 'Kel LTTQ',
    'saudara_di_pesantren': 'Saudara di Pesantren'
  }

  // Reset form saat offcanvas dibuka
  useEffect(() => {
    if (isOpen) {
      setSelectedField('')
      setSelectedValue('')
      setUseManualInput(false)
      setProgress({ current: 0, total: 0, currentSantri: null })
    }
  }, [isOpen])

  // Load rombel options untuk diniyah/formal (database baru: ubah masal pakai id_diniyah/id_formal)
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const load = async () => {
      setRombelOptionsLoading(true)
      try {
        const [dRes, fRes] = await Promise.all([
          pendaftaranAPI.getRombelOptions('Diniyah'),
          pendaftaranAPI.getRombelOptions('Formal')
        ])
        if (cancelled) return
        const dList = (dRes?.success && Array.isArray(dRes.data)) ? dRes.data : []
        const fList = (fRes?.success && Array.isArray(fRes.data)) ? fRes.data : []
        setRombelDiniyahOptions(dList)
        setRombelFormalOptions(fList)
      } catch (e) {
        if (!cancelled) {
          setRombelDiniyahOptions([])
          setRombelFormalOptions([])
        }
      } finally {
        if (!cancelled) setRombelOptionsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [isOpen])

  const isRombelField = selectedField === 'diniyah' || selectedField === 'formal'
  const rombelOptions = selectedField === 'diniyah' ? rombelDiniyahOptions : selectedField === 'formal' ? rombelFormalOptions : []

  // Get unique values untuk field yang dipilih (untuk kolom selain diniyah/formal)
  const availableValues = useMemo(() => {
    if (!selectedField || !allDataSantri || allDataSantri.length === 0) {
      return []
    }
    if (isRombelField) return []
    const fieldNameForOptions = selectedField
    const values = [
      ...new Set(
        allDataSantri
          .map(s => s?.[fieldNameForOptions])
          .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      )
    ]
    return values.sort()
  }, [selectedField, allDataSantri, isRombelField])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!selectedField) {
      showNotification('Pilih kolom yang ingin diubah', 'error')
      return
    }

    // Allow empty string (to clear the field), but not undefined
    if (selectedValue === undefined) {
      showNotification('Pilih nilai baru', 'error')
      return
    }

    if (!selectedSantriList || selectedSantriList.length === 0) {
      showNotification('Tidak ada santri yang dipilih', 'error')
      return
    }

    const fieldName = fieldMapping[selectedField] || selectedField
    // Untuk id_diniyah/id_formal nilai harus number atau null
    let valueToUpdate = selectedValue === '' ? null : (selectedValue ?? null)
    if ((fieldName === 'id_diniyah' || fieldName === 'id_formal') && valueToUpdate != null) {
      valueToUpdate = parseInt(valueToUpdate, 10)
      if (Number.isNaN(valueToUpdate)) valueToUpdate = null
    }
    const updateData = { [fieldName]: valueToUpdate }

    setLoading(true)
    setProgress({ current: 0, total: selectedSantriList.length, currentSantri: null })

    let successCount = 0
    let failCount = 0
    const errors = []

    try {
      for (let i = 0; i < selectedSantriList.length; i++) {
        const santri = selectedSantriList[i]
        setProgress({ current: i + 1, total: selectedSantriList.length, currentSantri: santri.nama })

        try {
          const result = await santriAPI.update(santri.id, updateData)
          if (result.success) {
            successCount++
          } else {
            failCount++
            errors.push(`${santri.nama} (${santri.id}): ${result.message || 'Gagal update'}`)
          }
        } catch (error) {
          failCount++
          errors.push(`${santri.nama} (${santri.id}): ${error.message || 'Error'}`)
        }
      }

      if (successCount > 0) {
        showNotification(
          `Berhasil mengupdate ${successCount} santri${failCount > 0 ? `, ${failCount} gagal` : ''}`,
          failCount > 0 ? 'warning' : 'success'
        )
        if (onSuccess) {
          onSuccess()
        }
        onClose()
      } else {
        showNotification(`Gagal mengupdate semua santri. ${errors.slice(0, 3).join('; ')}`, 'error')
      }
    } catch (error) {
      console.error('Bulk update error:', error)
      showNotification('Terjadi kesalahan saat mengupdate data', 'error')
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0, currentSantri: null })
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

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Mengubah <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedSantriList?.length || 0}</span> santri yang dipilih
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
                      setUseManualInput(false)
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

                {/* Value Selection */}
                {selectedField && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Pilih Nilai Baru
                    </label>

                    {!isRombelField && (
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          id="bulk-edit-manual-input"
                          type="checkbox"
                          checked={useManualInput}
                          onChange={(e) => {
                            setUseManualInput(e.target.checked)
                            setSelectedValue('')
                          }}
                          disabled={loading}
                          className="w-4 h-4 text-teal-600 bg-gray-100 border-gray-300 rounded focus:ring-teal-500 dark:focus:ring-teal-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <label
                          htmlFor="bulk-edit-manual-input"
                          className="text-sm text-gray-700 dark:text-gray-300 select-none"
                        >
                          Input manual
                        </label>
                      </div>
                    )}

                    {useManualInput && !isRombelField ? (
                      <input
                        type="text"
                        value={selectedValue}
                        onChange={(e) => setSelectedValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={loading}
                        placeholder="Ketik nilai baru (kosongkan untuk menghapus)"
                      />
                    ) : isRombelField ? (
                      <select
                        value={selectedValue}
                        onChange={(e) => setSelectedValue(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        disabled={loading || rombelOptionsLoading}
                        required
                      >
                        <option value="">-- Pilih rombel --</option>
                        {rombelOptions.map((r) => {
                          const label = [r.lembaga_nama || r.lembaga_id, r.kelas, r.kel].filter(Boolean).join(' - ')
                          return (
                            <option key={r.id} value={r.id}>
                              {label || r.id}
                            </option>
                          )
                        })}
                      </select>
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
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {useManualInput
                        ? (
                          <>
                            Input manual untuk kolom <span className="font-medium">{fieldLabels[selectedField]}</span>. Biarkan kosong untuk menghapus.
                          </>
                        )
                        : (
                          <>
                            Pilih nilai baru untuk kolom <span className="font-medium">{fieldLabels[selectedField]}</span>
                          </>
                        )
                      }
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
                    {progress.currentSantri && (
                      <p className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                        Memproses: {progress.currentSantri}
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
}

export default BulkEditOffcanvas
