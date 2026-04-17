import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { paymentAPI, lembagaAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'

function TunggakanFormModal({ isOpen, onClose, mode, santriId, itemData, onSuccess }) {
  const { user } = useAuthStore()
  const { tahunAjaran, tahunAjaranMasehi, options, optionsMasehi } = useTahunAjaranStore()
  const [formData, setFormData] = useState({
    tahun_ajaran: '',
    lembaga: '',
    keterangan_1: '',
    keterangan_2: '',
    total: ''
  })
  const [isKhusus, setIsKhusus] = useState(mode === 'khusus')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lembagaOptions, setLembagaOptions] = useState([])
  const [loadingLembaga, setLoadingLembaga] = useState(false)

  // Khusus options
  const khususOptions = ['UJBA', 'Guru Tugas', 'KKN', 'PLP/PPL', 'Skripsi', 'Wisuda', 'Ujian Kelulusan']
  
  // Lembaga formal (menggunakan tahun ajaran masehi)
  const lembagaFormal = ['PAUD', 'SMP', 'MTs', 'SMAI', 'STAI']
  
  // Fetch lembaga dari database
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
          // Fallback ke hardcode jika API gagal
          setLembagaOptions([
            { id: 'PSA', nama: 'PSA', kategori: '' },
            { id: 'Isti\'dadiyah', nama: 'Isti\'dadiyah', kategori: '' },
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
        // Fallback ke hardcode jika error
        setLembagaOptions([
          { id: 'PSA', nama: 'PSA', kategori: '' },
          { id: 'Isti\'dadiyah', nama: 'Isti\'dadiyah', kategori: '' },
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
    
    if (isOpen) {
      fetchLembaga()
    }
  }, [isOpen])
  
  // Get tahun ajaran options berdasarkan lembaga yang dipilih
  const getTahunAjaranOptions = () => {
    if (!formData.lembaga) {
      return options // Default hijriyah
    }
    
    const selectedLembaga = lembagaOptions.find(l => l.id === formData.lembaga)
    const isFormal = selectedLembaga?.kategori === 'Formal' || lembagaFormal.includes(formData.lembaga)
    
    return isFormal ? optionsMasehi : options
  }

  // Reset form saat modal dibuka/ditutup atau itemData berubah
  useEffect(() => {
    if (isOpen) {
      setIsKhusus(mode === 'khusus')
      if (itemData) {
        // Edit mode
        setFormData({
          tahun_ajaran: itemData.tahun_ajaran || '',
          lembaga: itemData.lembaga || '',
          keterangan_1: itemData.keterangan_1 || '',
          keterangan_2: itemData.keterangan_2 || '',
          total: itemData.wajib ?? itemData.total ?? itemData.total_wajib ?? ''
        })
      } else {
        // Add mode - set default tahun ajaran hijriyah
        setFormData({
          tahun_ajaran: tahunAjaran,
          lembaga: '',
          keterangan_1: '',
          keterangan_2: '',
          total: ''
        })
      }
      setError(null)
    }
  }, [isOpen, itemData, mode, tahunAjaran])
  
  // Update tahun ajaran saat lembaga berubah
  useEffect(() => {
    if (isOpen && formData.lembaga && !itemData) {
      // Hanya update jika add mode (bukan edit mode)
      const selectedLembaga = lembagaOptions.find(l => l.id === formData.lembaga)
      const isFormal = selectedLembaga?.kategori === 'Formal' || lembagaFormal.includes(formData.lembaga)
      const defaultTA = isFormal ? tahunAjaranMasehi : tahunAjaran
      
      if (formData.tahun_ajaran !== defaultTA) {
        setFormData(prev => ({ ...prev, tahun_ajaran: defaultTA }))
      }
    }
  }, [formData.lembaga, isOpen, itemData, lembagaOptions, tahunAjaran, tahunAjaranMasehi])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Validasi
    if (!santriId || !/^\d{7}$/.test(santriId)) {
      setError('NIS tidak valid')
      return
    }

    if (!formData.lembaga) {
      setError('Lembaga wajib diisi')
      return
    }

    if (!formData.keterangan_1) {
      setError(isKhusus ? 'Pilih keterangan khusus' : 'Keterangan 1 wajib diisi')
      return
    }

    if (!formData.total || parseFloat(formData.total) <= 0) {
      setError('Total wajib diisi dan harus lebih dari 0')
      return
    }

    // Untuk edit, cek apakah total >= total pembayaran
    if (itemData) {
      try {
        const checkResult = await paymentAPI.checkRelatedPayment(itemData.id, isKhusus ? 'khusus' : 'tunggakan')
        if (checkResult.success && checkResult.total_bayar) {
          const totalBayar = checkResult.total_bayar
          if (parseFloat(formData.total) < totalBayar) {
            setError(`Total nominal tidak boleh lebih kecil dari total pembayaran (Rp ${totalBayar.toLocaleString()})`)
            return
          }
        }
      } catch (err) {
        console.error('Error checking related payment:', err)
        // Continue anyway, validation might fail but we'll try
      }
    }

    setLoading(true)
    try {
      // Format id_admin - remove "ID" prefix if exists
      let idAdmin = user?.id || '0000000'
      if (typeof idAdmin === 'string' && idAdmin.startsWith('ID')) {
        idAdmin = idAdmin.replace(/^ID/, '')
      }

      const payload = {
        id_santri: santriId,
        keterangan_1: formData.keterangan_1,
        keterangan_2: formData.keterangan_2 || null,
        total: parseFloat(formData.total),
        tahun_ajaran: formData.tahun_ajaran || null,
        lembaga: formData.lembaga,
        admin: user?.nama || 'Admin',
        id_admin: idAdmin
      }

      let result
      if (itemData) {
        // Update
        result = await paymentAPI.updateTunggakanKhusus(
          { ...payload, id: itemData.id },
          isKhusus ? 'khusus' : 'tunggakan'
        )
      } else {
        // Insert
        result = await paymentAPI.insertTunggakanKhusus(
          payload,
          isKhusus ? 'khusus' : 'tunggakan'
        )
      }

      if (result.success) {
        if (onSuccess) onSuccess()
        onClose()
      } else {
        setError(result.message || 'Gagal menyimpan data')
      }
    } catch (err) {
      console.error('Error saving tunggakan/khusus:', err)
      setError(err.message || 'Gagal menyimpan data')
    } finally {
      setLoading(false)
    }
  }

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
            className="fixed inset-0 bg-black bg-opacity-40 z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full p-6 relative">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-2 right-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl"
              >
                &times;
              </button>

              {/* Title */}
              <h2 className="text-lg font-bold mb-4">
                {itemData 
                  ? `Edit ${isKhusus ? 'Khusus' : 'Tunggakan'}` 
                  : `Tambah ${isKhusus ? 'Khusus' : 'Tunggakan'}`}
              </h2>

              {/* Error Message */}
              {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-1">Lembaga *</label>
                  <select
                    value={formData.lembaga}
                    onChange={(e) => handleChange('lembaga', e.target.value)}
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    required
                    disabled={loadingLembaga}
                  >
                    <option value="">Pilih Lembaga</option>
                    {lembagaOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>{opt.nama}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-1">Tahun Ajaran</label>
                  <select
                    value={formData.tahun_ajaran}
                    onChange={(e) => handleChange('tahun_ajaran', e.target.value)}
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                  >
                    {getTahunAjaranOptions().map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-1">
                    Keterangan 1 *
                  </label>
                  {isKhusus ? (
                    <select
                      value={formData.keterangan_1}
                      onChange={(e) => handleChange('keterangan_1', e.target.value)}
                      className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      required
                    >
                      <option value="">Pilih Keterangan Khusus</option>
                      {khususOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formData.keterangan_1}
                      onChange={(e) => handleChange('keterangan_1', e.target.value)}
                      placeholder="Masukkan keterangan tunggakan"
                      className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      required
                    />
                  )}
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-1">Keterangan 2</label>
                  <input
                    type="text"
                    value={formData.keterangan_2}
                    onChange={(e) => handleChange('keterangan_2', e.target.value)}
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 dark:text-gray-300 mb-1">Total *</label>
                  <input
                    type="number"
                    value={formData.total}
                    onChange={(e) => handleChange('total', e.target.value)}
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    required
                    min="0"
                    step="1"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-2 mt-6">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
                  >
                    {loading ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded hover:bg-gray-400 dark:hover:bg-gray-500"
                  >
                    Batal
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

export default TunggakanFormModal

