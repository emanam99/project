import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI, tahunAjaranAPI } from '../../../../services/api'

const offcanvasBottomTransition = { type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }
// Margin kiri-kanan (1rem) agar di tablet tidak terpotong; lebar = sisa layar, max 28rem
const offcanvasBottomPanelClass = 'fixed bottom-0 left-4 right-4 z-[10211] flex flex-col max-h-[85vh] min-w-0 max-w-md mx-auto rounded-t-2xl bg-white dark:bg-gray-800 shadow-xl border-t border-gray-200 dark:border-gray-700'

const inputClass = 'w-full px-3 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5'

function TambahPengurusOffcanvas({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    nama: '',
    status: 'active',
    email: '',
    whatsapp: '',
    gender: '',
    tahun_hijriyah: ''
  })
  const [tahunAjaranOptions, setTahunAjaranOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    tahunAjaranAPI.getAll({ kategori: 'hijriyah' }).then((r) => {
      if (r.success && Array.isArray(r.data)) {
        setTahunAjaranOptions(r.data.map((row) => ({ value: row.tahun_ajaran || row.tahun, label: row.tahun_ajaran || row.tahun })))
      } else {
        setTahunAjaranOptions([])
      }
    }).catch(() => setTahunAjaranOptions([]))
  }, [isOpen])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!formData.nama.trim()) {
        setError('Nama tidak boleh kosong')
        setLoading(false)
        return
      }
      if (!formData.gender || !formData.tahun_hijriyah?.trim()) {
        setError('Pilih Gender dan Tahun Ajaran Hijriyah (NIP dibuat otomatis)')
        setLoading(false)
        return
      }

      const submitData = {
        nama: formData.nama.trim(),
        status: formData.status,
        grup: 1,
        gender: formData.gender,
        tahun_hijriyah: formData.tahun_hijriyah.trim()
      }
      if (formData.email?.trim()) submitData.email = formData.email.trim()
      if (formData.whatsapp?.trim()) submitData.whatsapp = formData.whatsapp.trim()

      const response = await manageUsersAPI.create(submitData)

      if (response.success) {
        setFormData({
          nama: '',
          status: 'active',
          email: '',
          whatsapp: '',
          gender: '',
          tahun_hijriyah: ''
        })
        setError('')
        onSuccess?.(response.data)
        onClose()
      } else {
        setError(response.message || 'Gagal membuat pengurus')
      }
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat membuat pengurus')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setFormData({
      nama: '',
      status: 'active',
      email: '',
      whatsapp: '',
      gender: '',
      tahun_hijriyah: ''
    })
    setError('')
    onClose()
  }

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="tambah-pengurus-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[10210]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            key="tambah-pengurus-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={offcanvasBottomTransition}
            className={offcanvasBottomPanelClass}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tambah-pengurus-title"
          >
        <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
          <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
        </div>
        <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
          <h2 id="tambah-pengurus-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            Tambah Pengurus Baru
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
            aria-label="Tutup"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6 sm:pb-4">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="tambah-gender" className={labelClass}>Gender <span className="text-red-500">*</span></label>
              <select
                id="tambah-gender"
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                required
                className={inputClass}
              >
                <option value="">— Pilih Gender —</option>
                <option value="L">Laki-laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>

            <div>
              <label htmlFor="tambah-tahun_hijriyah" className={labelClass}>Tahun Ajaran Hijriyah <span className="text-red-500">*</span></label>
              <select
                id="tambah-tahun_hijriyah"
                name="tahun_hijriyah"
                value={formData.tahun_hijriyah}
                onChange={handleChange}
                required
                className={inputClass}
              >
                <option value="">— Pilih Tahun Ajaran —</option>
                {tahunAjaranOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">NIP dibuat otomatis oleh sistem.</p>
            </div>

            <div>
              <label htmlFor="tambah-nama" className={labelClass}>Nama <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="tambah-nama"
                name="nama"
                value={formData.nama}
                onChange={handleChange}
                required
                className={inputClass}
                placeholder="Nama lengkap"
              />
            </div>

            <div>
              <label htmlFor="tambah-status" className={labelClass}>Status <span className="text-red-500">*</span></label>
              <select
                id="tambah-status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                required
                className={inputClass}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Tidak Aktif</option>
                <option value="pending">Pending</option>
              </select>
            </div>

            <div>
              <label htmlFor="tambah-email" className={labelClass}>Email</label>
              <input
                type="email"
                id="tambah-email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={inputClass}
                placeholder="Opsional"
              />
            </div>

            <div>
              <label htmlFor="tambah-whatsapp" className={labelClass}>WhatsApp</label>
              <input
                type="text"
                id="tambah-whatsapp"
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleChange}
                className={inputClass}
                placeholder="Opsional"
              />
            </div>
          </div>
          <div className="flex-shrink-0 p-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3 bg-white dark:bg-gray-800 rounded-b-2xl">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 text-sm font-medium bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Menyimpan...
                </>
              ) : (
                'Simpan'
              )}
            </button>
          </div>
        </form>
      </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(content, document.body)
}

export default TambahPengurusOffcanvas
