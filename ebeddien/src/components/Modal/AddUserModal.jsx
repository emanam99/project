import { useState } from 'react'
import { motion } from 'framer-motion'
import Modal from './Modal'
import { manageUsersAPI } from '../../services/api'

function AddUserModal({ isOpen, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    nip: '',
    nama: '',
    status: 'active',
    grup: 1,
    email: '',
    whatsapp: '',
    gender: '',
    tahun_hijriyah: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: name === 'grup' ? parseInt(value) || 1 : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validate form
      if (!formData.nama.trim()) {
        setError('Nama tidak boleh kosong')
        setLoading(false)
        return
      }

      const nipStr = (formData.nip || '').replace(/\D/g, '').slice(0, 7)
      const useAutoNip = nipStr.length === 0

      if (useAutoNip) {
        if (!formData.gender || !formData.tahun_hijriyah?.trim()) {
          setError('Untuk NIP otomatis, pilih Gender dan isi Tahun Ajaran Hijriyah (contoh: 1447-1448)')
          setLoading(false)
          return
        }
      } else {
        if (nipStr.length === 0) {
          setError('NIP harus angka, maksimal 7 digit')
          setLoading(false)
          return
        }
      }

      // Prepare data - password tidak dikirim, akan NULL di database
      const submitData = {
        nama: formData.nama.trim(),
        status: formData.status,
        grup: formData.grup
      }
      if (useAutoNip) {
        submitData.gender = formData.gender
        submitData.tahun_hijriyah = formData.tahun_hijriyah.trim()
      } else {
        submitData.nip = nipStr
      }

      // Add optional fields
      if (formData.email.trim()) {
        submitData.email = formData.email.trim()
      }

      if (formData.whatsapp.trim()) {
        submitData.whatsapp = formData.whatsapp.trim()
      }

      const response = await manageUsersAPI.create(submitData)

      if (response.success) {
        // Reset form
        setFormData({
          nip: '',
          nama: '',
          status: 'active',
          grup: 1,
          email: '',
          whatsapp: '',
          gender: '',
          tahun_hijriyah: ''
        })
        setError('')
        
        if (onSuccess) {
          onSuccess(response.data)
        }
        onClose()
      } else {
        setError(response.message || 'Gagal membuat user')
      }
    } catch (err) {
      console.error('Error creating user:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat membuat user')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setFormData({
        nip: '',
        nama: '',
        status: 'active',
        grup: 1,
        email: '',
        whatsapp: '',
        gender: '',
        tahun_hijriyah: ''
      })
      setError('')
      onClose()
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Tambah User Baru"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div>
          <label htmlFor="nip" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            NIP Pengurus
          </label>
          <input
            type="text"
            id="nip"
            name="nip"
            value={formData.nip}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 7)
              setFormData(prev => ({ ...prev, nip: v }))
            }}
            placeholder="Kosongkan untuk generate otomatis (7 digit)"
            maxLength={7}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-100"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Jika dikosongkan, isi Gender dan Tahun Ajaran Hijriyah di bawah untuk generate NIP (format sama dengan NIS: 3=Laki-laki, 4=Perempuan + tahun + urutan).
          </p>
        </div>

        <div>
          <label htmlFor="gender" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Gender (untuk NIP otomatis)
          </label>
          <select
            id="gender"
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="">— Pilih jika NIP otomatis —</option>
            <option value="L">Laki-laki (digit NIP: 3)</option>
            <option value="P">Perempuan (digit NIP: 4)</option>
          </select>
        </div>

        <div>
          <label htmlFor="tahun_hijriyah" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tahun Ajaran Hijriyah (untuk NIP otomatis)
          </label>
          <input
            type="text"
            id="tahun_hijriyah"
            name="tahun_hijriyah"
            value={formData.tahun_hijriyah}
            onChange={handleChange}
            placeholder="Contoh: 1447-1448 atau 1447"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
          />
        </div>

        <div>
          <label htmlFor="nama" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Nama <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="nama"
            name="nama"
            value={formData.nama}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            placeholder="Masukkan nama user"
          />
        </div>

        <div>
          <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Status <span className="text-red-500">*</span>
          </label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            required
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="active">Aktif</option>
            <option value="inactive">Tidak Aktif</option>
            <option value="pending">Pending</option>
          </select>
        </div>

        <div>
          <label htmlFor="grup" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Grup <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="grup"
            name="grup"
            value={formData.grup}
            onChange={handleChange}
            required
            min="1"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            placeholder="Masukkan grup"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            ID dibuat otomatis. NIP bisa manual atau di-generate (sama seperti NIS santri). Password terisi saat pertama login.
          </p>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            placeholder="Masukkan email (opsional)"
          />
        </div>

        <div>
          <label htmlFor="whatsapp" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            WhatsApp
          </label>
          <input
            type="text"
            id="whatsapp"
            name="whatsapp"
            value={formData.whatsapp}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
            placeholder="Masukkan nomor WhatsApp (opsional)"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Menyimpan...</span>
              </>
            ) : (
              'Simpan'
            )}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default AddUserModal

