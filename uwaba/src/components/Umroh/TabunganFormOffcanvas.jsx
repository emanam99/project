import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { umrohTabunganAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { useNotification } from '../../contexts/NotificationContext'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import { getGambarUrl } from '../../config/images'

function TabunganFormOffcanvas({ 
  isOpen, 
  onClose, 
  jamaahId,
  jamaahData,
  onSuccess 
}) {
  const { user } = useAuthStore()
  const { showNotification } = useNotification()
  const [formData, setFormData] = useState({
    jenis: 'Setoran',
    nominal: '',
    metode_pembayaran: 'Cash',
    bank: '',
    no_rekening: '',
    keterangan: '',
    hijriyah: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [saldoSaatIni, setSaldoSaatIni] = useState(0)

  // Load saldo saat ini dan hijriyah
  useEffect(() => {
    if (isOpen && jamaahId) {
      loadSaldoSaatIni()
      loadHijriyah()
      // Reset form
      setFormData({
        jenis: 'Setoran',
        nominal: '',
        metode_pembayaran: 'Cash',
        bank: '',
        no_rekening: '',
        keterangan: '',
        hijriyah: ''
      })
      setError(null)
    }
  }, [isOpen, jamaahId])

  const loadSaldoSaatIni = async () => {
    try {
      const response = await umrohTabunganAPI.getByJamaahId(jamaahId)
      if (response.success) {
        // Backend mengembalikan data langsung sebagai array di response.data
        // Bisa juga berupa object dengan pagination
        let list = []
        if (Array.isArray(response.data)) {
          list = response.data
        } else if (response.data && Array.isArray(response.data.data)) {
          list = response.data.data
        } else if (response.data && response.data.list) {
          list = response.data.list
        }
        
        // Hitung saldo dari data terakhir (data sudah diurutkan DESC)
        if (list.length > 0) {
          const lastItem = list[0] // Transaksi terbaru
          setSaldoSaatIni(parseFloat(lastItem.saldo_sesudah || 0))
        } else {
          // Jika tidak ada transaksi, coba ambil dari jamaahData atau set 0
          if (jamaahData?.total_tabungan !== undefined) {
            setSaldoSaatIni(parseFloat(jamaahData.total_tabungan || 0))
          } else {
            setSaldoSaatIni(0)
          }
        }
      } else {
        // Fallback: coba ambil dari jamaahData
        if (jamaahData?.total_tabungan !== undefined) {
          setSaldoSaatIni(parseFloat(jamaahData.total_tabungan || 0))
        } else {
          setSaldoSaatIni(0)
        }
      }
    } catch (error) {
      console.error('Error loading saldo:', error)
      // Fallback: coba ambil dari jamaahData
      if (jamaahData?.total_tabungan !== undefined) {
        setSaldoSaatIni(parseFloat(jamaahData.total_tabungan || 0))
      } else {
        setSaldoSaatIni(0)
      }
    }
  }

  const loadHijriyah = async () => {
    try {
      const { hijriyah } = await getTanggalFromAPI()
      setFormData(prev => ({ ...prev, hijriyah: hijriyah || '' }))
    } catch (error) {
      console.error('Error loading hijriyah:', error)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
    
    // Reset bank dan no_rekening jika bukan transfer
    if (field === 'metode_pembayaran' && value !== 'Transfer') {
      setFormData(prev => ({ ...prev, bank: '', no_rekening: '' }))
    }
  }

  // Format currency input
  const handleNominalInput = (e) => {
    let value = e.target.value.replace(/\D/g, '')
    const formatted = new Intl.NumberFormat('id-ID').format(value)
    setFormData(prev => ({ ...prev, nominal: formatted }))
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Validasi
    if (!jamaahId) {
      setError('Jamaah belum dipilih')
      return
    }

    const nominal = parseFloat(formData.nominal.replace(/\./g, '')) || 0

    if (!nominal || nominal <= 0) {
      setError('Nominal wajib diisi dan harus lebih dari 0')
      return
    }

    // Validasi penarikan
    if (formData.jenis === 'Penarikan' && nominal > saldoSaatIni) {
      setError(`Saldo tidak mencukupi. Saldo saat ini: Rp ${saldoSaatIni.toLocaleString('id-ID')}`)
      return
    }

    // Validasi transfer
    if (formData.metode_pembayaran === 'Transfer') {
      if (!formData.bank) {
        setError('Nama bank wajib diisi untuk metode transfer')
        return
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
        id_jamaah: jamaahId,
        jenis: formData.jenis,
        nominal: nominal,
        metode_pembayaran: formData.metode_pembayaran,
        bank: formData.metode_pembayaran === 'Transfer' ? formData.bank : null,
        no_rekening: formData.metode_pembayaran === 'Transfer' ? formData.no_rekening : null,
        keterangan: formData.keterangan || null,
        hijriyah: formData.hijriyah || null
      }

      const result = await umrohTabunganAPI.create(payload)

      if (result.success) {
        showNotification(result.message || 'Tabungan berhasil ditambahkan', 'success')
        if (onSuccess) onSuccess()
        onClose()
      } else {
        setError(result.message || 'Gagal menyimpan data')
      }
    } catch (err) {
      console.error('Error saving tabungan:', err)
      setError(err.response?.data?.message || 'Gagal menyimpan data')
    } finally {
      setLoading(false)
    }
  }

  // Calculate saldo setelah transaksi
  const nominalValue = parseFloat(formData.nominal.replace(/\./g, '')) || 0
  const saldoSetelah = formData.jenis === 'Setoran' 
    ? saldoSaatIni + nominalValue
    : formData.jenis === 'Penarikan'
    ? saldoSaatIni - nominalValue
    : nominalValue // Koreksi langsung set ke nominal

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
          />

          {/* Offcanvas */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ 
              type: 'tween', 
              ease: [0.4, 0, 0.2, 1],
              duration: 0.4 
            }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] overflow-hidden"
            style={{ 
              zIndex: 101,
              paddingBottom: 'env(safe-area-inset-bottom, 0)'
            }}
          >
            <div className="md:grid md:grid-cols-2 overflow-hidden" style={{ height: 'calc(100vh - 8rem)', maxHeight: '90vh' }}>
              {/* Kolom Gambar (hanya tampil di layar medium ke atas) */}
              <div className="hidden md:block relative overflow-hidden" style={{ height: '100%' }}>
                <img src={getGambarUrl('/icon-2.png')} alt="Gedung Pesantren" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-teal-800 bg-opacity-50"></div>
              </div>

              {/* Kolom Konten Form */}
              <div className="p-6 flex flex-col overflow-hidden" style={{ height: '100%', minHeight: 0 }}>
                {/* Header */}
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-3 flex-shrink-0">
                  <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">
                    Tambah Tabungan
                  </h2>
                  <button
                    onClick={onClose}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>

                {/* Area Scroll - Konten Form */}
                <div className="flex-1 overflow-y-auto pr-2" style={{ minHeight: 0, flexShrink: 1, overflowY: 'scroll' }}>
                  {/* Info Jamaah */}
                  {jamaahData && (
                    <div className="mb-4 p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800">
                      <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
                        {jamaahData.nama_lengkap || jamaahData.kode_jamaah}
                      </p>
                      <p className="text-xs text-teal-600 dark:text-teal-400">
                        Saldo Saat Ini: <strong>Rp {saldoSaatIni.toLocaleString('id-ID')}</strong>
                      </p>
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                      {error}
                    </div>
                  )}

                  {/* Form */}
                  <form onSubmit={handleSubmit} className="space-y-4" id="tabungan-form">
                {/* Jenis Transaksi */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Jenis Transaksi *
                  </label>
                  <select
                    value={formData.jenis}
                    onChange={(e) => handleChange('jenis', e.target.value)}
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    required
                  >
                    <option value="Setoran">Setoran</option>
                    <option value="Penarikan">Penarikan</option>
                    <option value="Koreksi">Koreksi</option>
                  </select>
                </div>

                {/* Nominal */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Nominal *
                  </label>
                  <input
                    type="text"
                    value={formData.nominal}
                    onChange={handleNominalInput}
                    placeholder="0"
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 text-right font-mono"
                    required
                  />
                </div>

                {/* Preview Saldo Setelah */}
                {formData.nominal && (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-blue-700 dark:text-blue-300">Saldo Setelah Transaksi:</span>
                      <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        Rp {saldoSetelah.toLocaleString('id-ID')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Metode Pembayaran */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Metode Pembayaran *
                  </label>
                  <select
                    value={formData.metode_pembayaran}
                    onChange={(e) => handleChange('metode_pembayaran', e.target.value)}
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                    required
                  >
                    <option value="Cash">Cash</option>
                    <option value="Transfer">Transfer</option>
                    <option value="QRIS">QRIS</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                {/* Bank (jika Transfer) */}
                {formData.metode_pembayaran === 'Transfer' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Nama Bank *
                      </label>
                      <input
                        type="text"
                        value={formData.bank}
                        onChange={(e) => handleChange('bank', e.target.value)}
                        placeholder="Contoh: BCA, BRI, Mandiri"
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                        required={formData.metode_pembayaran === 'Transfer'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        No. Rekening
                      </label>
                      <input
                        type="text"
                        value={formData.no_rekening}
                        onChange={(e) => handleChange('no_rekening', e.target.value)}
                        placeholder="Nomor rekening"
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </>
                )}

                {/* Keterangan */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Keterangan
                  </label>
                  <textarea
                    value={formData.keterangan}
                    onChange={(e) => handleChange('keterangan', e.target.value)}
                    rows="3"
                    placeholder="Keterangan transaksi (opsional)"
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100 resize-none"
                  />
                </div>

                {/* Hijriyah */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tanggal Hijriyah
                  </label>
                  <input
                    type="text"
                    value={formData.hijriyah}
                    onChange={(e) => handleChange('hijriyah', e.target.value)}
                    placeholder="Tanggal hijriyah"
                    className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                  />
                  </div>
                  </form>
                </div>

                {/* Buttons - Di luar area scroll */}
                <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0" style={{ flexShrink: 0 }}>
                  <button
                    type="submit"
                    form="tabungan-form"
                    disabled={loading}
                    className="flex-1 bg-teal-500 hover:bg-teal-600 text-white px-4 py-3 rounded-lg font-semibold disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-lg font-semibold hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                  >
                    Batal
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default TabunganFormOffcanvas

