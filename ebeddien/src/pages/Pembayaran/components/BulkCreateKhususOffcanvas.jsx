import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { paymentAPI, lembagaAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useAuthStore } from '../../../store/authStore'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'

function BulkCreateKhususOffcanvas({ isOpen, onClose, selectedDataList, onSuccess }) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const { tahunAjaran, tahunAjaranMasehi, options, optionsMasehi } = useTahunAjaranStore()

  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, currentItem: null })
  const [lembagaOptions, setLembagaOptions] = useState([])
  const [loadingLembaga, setLoadingLembaga] = useState(false)
  const [formData, setFormData] = useState({
    tahun_ajaran: '',
    lembaga: '',
    keterangan_1: '',
    keterangan_2: '',
    total: ''
  })

  const khususOptions = ['UJBA', 'Guru Tugas', 'KKN', 'PLP/PPL', 'Skripsi', 'Wisuda', 'Ujian Kelulusan']
  const lembagaFormal = ['PAUD', 'SMP', 'MTs', 'SMAI', 'STAI']

  // Daftar santri unik (by id) dari selectedDataList
  const uniqueSantriList = selectedDataList?.length
    ? Array.from(
        selectedDataList.reduce((acc, item) => {
          const id = item.id ?? item.nis
          if (id && !acc.has(id)) acc.set(id, { id: item.id, nis: item.nis ?? item.id, nama: item.nama })
          return acc
        }, new Map()).values()
      )
    : []

  useEffect(() => {
    if (isOpen) {
      setFormData({
        tahun_ajaran: tahunAjaran,
        lembaga: '',
        keterangan_1: '',
        keterangan_2: '',
        total: ''
      })
      setProgress({ current: 0, total: 0, currentItem: null })
    }
  }, [isOpen, tahunAjaran])

  useEffect(() => {
    const fetchLembaga = async () => {
      setLoadingLembaga(true)
      try {
        const result = await lembagaAPI.getAll()
        if (result.success && result.data) {
          setLembagaOptions(result.data.map(l => ({
            id: l.id,
            nama: l.nama || l.id,
            kategori: l.kategori || ''
          })))
        } else {
          setLembagaOptions([
            { id: 'PSA', nama: 'PSA', kategori: '' },
            { id: "Isti'dadiyah", nama: "Isti'dadiyah", kategori: '' },
            { id: 'Ula', nama: 'Ula', kategori: '' },
            { id: 'Wustha', nama: 'Wustha', kategori: '' },
            { id: 'Ulya', nama: 'Ulya', kategori: '' },
            { id: 'PAUD', nama: 'PAUD', kategori: 'Formal' },
            { id: 'SMP', nama: 'SMP', kategori: 'Formal' },
            { id: 'MTs', nama: 'MTs', kategori: 'Formal' },
            { id: 'SMAI', nama: 'SMAI', kategori: 'Formal' },
            { id: 'STAI', nama: 'STAI', kategori: 'Formal' },
            { id: 'LTTQ', nama: 'LTTQ', kategori: '' },
            { id: 'LPBA', nama: 'LPBA', kategori: '' }
          ])
        }
      } catch (err) {
        console.error('Error fetching lembaga:', err)
        setLembagaOptions([
          { id: 'PSA', nama: 'PSA', kategori: '' },
          { id: "Isti'dadiyah", nama: "Isti'dadiyah", kategori: '' },
          { id: 'Ula', nama: 'Ula', kategori: '' },
          { id: 'Wustha', nama: 'Wustha', kategori: '' },
          { id: 'Ulya', nama: 'Ulya', kategori: '' },
          { id: 'PAUD', nama: 'PAUD', kategori: 'Formal' },
          { id: 'SMP', nama: 'SMP', kategori: 'Formal' },
          { id: 'MTs', nama: 'MTs', kategori: 'Formal' },
          { id: 'SMAI', nama: 'SMAI', kategori: 'Formal' },
          { id: 'STAI', nama: 'STAI', kategori: 'Formal' },
          { id: 'LTTQ', nama: 'LTTQ', kategori: '' },
          { id: 'LPBA', nama: 'LPBA', kategori: '' }
        ])
      } finally {
        setLoadingLembaga(false)
      }
    }
    if (isOpen) fetchLembaga()
  }, [isOpen])

  const getTahunAjaranOptions = () => {
    if (!formData.lembaga) return options
    const selectedLembaga = lembagaOptions.find(l => l.id === formData.lembaga)
    const isFormal = selectedLembaga?.kategori === 'Formal' || lembagaFormal.includes(formData.lembaga)
    return isFormal ? optionsMasehi : options
  }

  useEffect(() => {
    if (isOpen && formData.lembaga) {
      const selectedLembaga = lembagaOptions.find(l => l.id === formData.lembaga)
      const isFormal = selectedLembaga?.kategori === 'Formal' || lembagaFormal.includes(formData.lembaga)
      const defaultTA = isFormal ? tahunAjaranMasehi : tahunAjaran
      if (formData.tahun_ajaran !== defaultTA) {
        setFormData(prev => ({ ...prev, tahun_ajaran: defaultTA }))
      }
    }
  }, [formData.lembaga, isOpen, lembagaOptions, tahunAjaran, tahunAjaranMasehi])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.lembaga) {
      showNotification('Lembaga wajib diisi', 'error')
      return
    }
    if (!formData.keterangan_1) {
      showNotification('Keterangan 1 (khusus) wajib diisi', 'error')
      return
    }
    const totalNum = parseFloat(formData.total)
    if (!formData.total || isNaN(totalNum) || totalNum <= 0) {
      showNotification('Total wajib diisi dan harus lebih dari 0', 'error')
      return
    }
    if (!uniqueSantriList.length) {
      showNotification('Tidak ada santri yang dipilih', 'error')
      return
    }

    let idAdmin = user?.id ?? '0000000'
    if (typeof idAdmin === 'string' && idAdmin.startsWith('ID')) {
      idAdmin = idAdmin.replace(/^ID/, '')
    }

    setLoading(true)
    setProgress({ current: 0, total: uniqueSantriList.length, currentItem: null })

    let successCount = 0
    let failCount = 0
    const errors = []

    try {
      for (let i = 0; i < uniqueSantriList.length; i++) {
        const santri = uniqueSantriList[i]
        setProgress({ current: i + 1, total: uniqueSantriList.length, currentItem: santri.nama })

        try {
          const payload = {
            id_santri: santri.nis ?? santri.id,
            keterangan_1: formData.keterangan_1,
            keterangan_2: formData.keterangan_2 || null,
            total: totalNum,
            tahun_ajaran: formData.tahun_ajaran || null,
            lembaga: formData.lembaga,
            admin: user?.nama || 'Admin',
            id_admin: idAdmin
          }
          const result = await paymentAPI.insertTunggakanKhusus(payload, 'khusus')
          if (result.success) {
            successCount++
          } else {
            failCount++
            errors.push(`${santri.nama}: ${result.message || 'Gagal'}`)
          }
        } catch (err) {
          failCount++
          errors.push(`${santri.nama}: ${err.message || 'Error'}`)
        }
      }

      if (successCount > 0) {
        showNotification(
          `Berhasil menambah ${successCount} kewajiban khusus${failCount > 0 ? `, ${failCount} gagal` : ''}`,
          failCount > 0 ? 'warning' : 'success'
        )
        if (onSuccess) onSuccess()
        onClose()
      } else {
        showNotification(`Gagal menambah. ${errors.slice(0, 2).join('; ')}`, 'error')
      }
    } catch (err) {
      console.error('Bulk create khusus error:', err)
      showNotification('Terjadi kesalahan saat menambah data', 'error')
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 flex flex-col"
          >
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Buat Khusus Massal
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
                  Menambah kewajiban khusus untuk <span className="font-semibold text-gray-900 dark:text-gray-100">{uniqueSantriList.length}</span> santri
                </p>
                {uniqueSantriList.length > 0 && uniqueSantriList.length <= 10 && (
                  <ul className="mt-2 text-xs text-gray-500 dark:text-gray-400 list-disc list-inside">
                    {uniqueSantriList.map(s => (
                      <li key={s.id}>{s.nama} ({s.nis})</li>
                    ))}
                  </ul>
                )}
                {uniqueSantriList.length > 10 && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    dan {uniqueSantriList.length - 10} santri lainnya
                  </p>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lembaga *</label>
                  <select
                    value={formData.lembaga}
                    onChange={(e) => handleChange('lembaga', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                    disabled={loadingLembaga || loading}
                  >
                    <option value="">Pilih Lembaga</option>
                    {lembagaOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.nama}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tahun Ajaran</label>
                  <select
                    value={formData.tahun_ajaran}
                    onChange={(e) => handleChange('tahun_ajaran', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    disabled={loading}
                  >
                    {getTahunAjaranOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keterangan 1 *</label>
                  <select
                    value={formData.keterangan_1}
                    onChange={(e) => handleChange('keterangan_1', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                    disabled={loading}
                  >
                    <option value="">Pilih Keterangan Khusus</option>
                    {khususOptions.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keterangan 2</label>
                  <input
                    type="text"
                    value={formData.keterangan_2}
                    onChange={(e) => handleChange('keterangan_2', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="Opsional"
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Total Wajib *</label>
                  <input
                    type="number"
                    value={formData.total}
                    onChange={(e) => handleChange('total', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    required
                    min="1"
                    step="1"
                    disabled={loading}
                  />
                </div>

                {loading && (
                  <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Memproses...</span>
                      <span className="text-sm text-purple-600 dark:text-purple-400">
                        {progress.current} / {progress.total}
                      </span>
                    </div>
                    <div className="w-full bg-purple-200 dark:bg-purple-800 rounded-full h-2">
                      <div
                        className="bg-purple-600 dark:bg-purple-400 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
                      />
                    </div>
                    {progress.currentItem && (
                      <p className="mt-2 text-xs text-purple-600 dark:text-purple-400">
                        Memproses: {progress.currentItem}
                      </p>
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
                    disabled={loading || !formData.lembaga || !formData.keterangan_1 || !formData.total || parseFloat(formData.total) <= 0}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Memproses...' : 'Buat Massal'}
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

export default BulkCreateKhususOffcanvas
