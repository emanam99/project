import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { umrohJamaahAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'

function JamaahForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { showNotification } = useNotification()
  const isEdit = !!id
  
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nama_lengkap: '',
    gelar_awal: '',
    gelar_akhir: '',
    nik: '',
    no_kk: '',
    tempat_lahir: '',
    tanggal_lahir: '',
    gender: '',
    status_nikah: '',
    email: '',
    no_telpon: '',
    whatsapp: '',
    alamat: '',
    dusun: '',
    rt: '',
    rw: '',
    desa: '',
    kecamatan: '',
    kabupaten: '',
    provinsi: '',
    kode_pos: '',
    paket_umroh: '',
    target_tabungan: '',
    status: 'Aktif',
    status_keberangkatan: 'Belum Berangkat',
    status_pembayaran: 'Belum Lunas'
  })

  // Load data jika edit
  useEffect(() => {
    if (isEdit) {
      loadJamaahData()
    }
  }, [id])

  const loadJamaahData = async () => {
    try {
      setLoading(true)
      const response = await umrohJamaahAPI.getById(id)
      if (response.success && response.data) {
        setFormData(response.data)
      }
    } catch (error) {
      console.error('Error loading jamaah:', error)
      showNotification('Gagal memuat data jamaah', 'error')
      navigate('/umroh/jamaah')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    try {
      setLoading(true)
      let response
      
      if (isEdit) {
        response = await umrohJamaahAPI.update(id, formData)
      } else {
        response = await umrohJamaahAPI.create(formData)
      }
      
      if (response.success) {
        showNotification(
          isEdit ? 'Jamaah berhasil diupdate' : 'Jamaah berhasil dibuat',
          'success'
        )
        navigate('/umroh/jamaah')
      }
    } catch (error) {
      console.error('Error saving jamaah:', error)
      showNotification('Gagal menyimpan data jamaah', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (loading && isEdit) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Memuat data...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/umroh/jamaah')}
            className="mb-4 text-teal-600 hover:text-teal-700 dark:text-teal-400 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            Kembali
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Jamaah' : 'Tambah Jamaah Baru'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {isEdit ? 'Ubah data jamaah umroh' : 'Tambahkan jamaah umroh baru'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 pb-6">
        {/* Data Pribadi */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Data Pribadi
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nama Lengkap <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="nama_lengkap"
                value={formData.nama_lengkap}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Gelar Awal
              </label>
              <input
                type="text"
                name="gelar_awal"
                value={formData.gelar_awal}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Gelar Akhir
              </label>
              <input
                type="text"
                name="gelar_akhir"
                value={formData.gelar_akhir}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                NIK
              </label>
              <input
                type="text"
                name="nik"
                value={formData.nik}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                No. KK
              </label>
              <input
                type="text"
                name="no_kk"
                value={formData.no_kk}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tempat Lahir
              </label>
              <input
                type="text"
                name="tempat_lahir"
                value={formData.tempat_lahir}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tanggal Lahir
              </label>
              <input
                type="date"
                name="tanggal_lahir"
                value={formData.tanggal_lahir}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Jenis Kelamin
              </label>
              <select
                name="gender"
                value={formData.gender}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="">Pilih</option>
                <option value="Laki-laki">Laki-laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status Nikah
              </label>
              <select
                name="status_nikah"
                value={formData.status_nikah}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="">Pilih</option>
                <option value="Menikah">Menikah</option>
                <option value="Belum Menikah">Belum Menikah</option>
                <option value="Cerai">Cerai</option>
                <option value="Janda">Janda</option>
                <option value="Duda">Duda</option>
              </select>
            </div>
          </div>
        </div>

        {/* Kontak */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Kontak
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                No. Telepon
              </label>
              <input
                type="text"
                name="no_telpon"
                value={formData.no_telpon}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                WhatsApp
              </label>
              <input
                type="text"
                name="whatsapp"
                value={formData.whatsapp}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Alamat */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Alamat
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Alamat Lengkap
              </label>
              <textarea
                name="alamat"
                value={formData.alamat}
                onChange={handleChange}
                rows="3"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Dusun
                </label>
                <input
                  type="text"
                  name="dusun"
                  value={formData.dusun}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  RT
                </label>
                <input
                  type="text"
                  name="rt"
                  value={formData.rt}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  RW
                </label>
                <input
                  type="text"
                  name="rw"
                  value={formData.rw}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Kode Pos
                </label>
                <input
                  type="text"
                  name="kode_pos"
                  value={formData.kode_pos}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Desa
                </label>
                <input
                  type="text"
                  name="desa"
                  value={formData.desa}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Kecamatan
                </label>
                <input
                  type="text"
                  name="kecamatan"
                  value={formData.kecamatan}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Kabupaten
                </label>
                <input
                  type="text"
                  name="kabupaten"
                  value={formData.kabupaten}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Provinsi
                </label>
                <input
                  type="text"
                  name="provinsi"
                  value={formData.provinsi}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Data Umroh */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Data Umroh
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Paket Umroh
              </label>
              <input
                type="text"
                name="paket_umroh"
                value={formData.paket_umroh}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Tabungan
              </label>
              <input
                type="number"
                name="target_tabungan"
                value={formData.target_tabungan}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
                <option value="Selesai">Selesai</option>
                <option value="Batal">Batal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status Keberangkatan
              </label>
              <select
                name="status_keberangkatan"
                value={formData.status_keberangkatan}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="Belum Berangkat">Belum Berangkat</option>
                <option value="Sudah Berangkat">Sudah Berangkat</option>
                <option value="Sudah Pulang">Sudah Pulang</option>
                <option value="Batal">Batal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Status Pembayaran
              </label>
              <select
                name="status_pembayaran"
                value={formData.status_pembayaran}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
              >
                <option value="Belum Lunas">Belum Lunas</option>
                <option value="Lunas">Lunas</option>
                <option value="Kredit">Kredit</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/umroh/jamaah')}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Menyimpan...' : (isEdit ? 'Update' : 'Simpan')}
          </button>
        </div>
      </form>
      </div>
    </div>
  )
}

export default JamaahForm

