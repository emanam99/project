import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSlimApiUrl } from '../../services/api'
import { useDarkMode } from './PublicLayout'
import './PublicSantri.css'

function PublicShohifah() {
  const [searchParams] = useSearchParams()
  const idSantri = searchParams.get('id')
  const [santri, setSantri] = useState(null)
  const [shohifahData, setShohifahData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const darkModeContext = useDarkMode()
  const { darkMode, setDarkMode } = darkModeContext || { darkMode: false, setDarkMode: () => {} }

  // Get tahun ajaran dari localStorage atau default
  const getTahunAjaran = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tahun_ajaran') || localStorage.getItem('tahunAjaran') || '1446-1447'
    }
    return '1446-1447'
  }

  const [tahunAjaran] = useState(getTahunAjaran())

  // Form state
  const [formData, setFormData] = useState({
    sholat_jamaah_5_waktu: '',
    sholat_tarawih: '',
    sholat_witir: '',
    sholat_tahajjud: '',
    sholat_dhuha: '',
    puasa_ramadhan_status: '',
    puasa_ramadhan_alasan: '',
    khatam_alquran_status: '',
    khatam_alquran_jumlah: '',
    khatam_alquran_tanggal: '',
    kitab_a_nama: '',
    kitab_a_status: '',
    kitab_b_nama: '',
    kitab_b_status: '',
    kitab_c_nama: '',
    kitab_c_status: '',
    berbakti_orang_tua: '',
    akhlaq_pergaulan: '',
    syawal_kembali_hari: '',
    syawal_kembali_tanggal: ''
  })

  useEffect(() => {
    if (!idSantri) {
      setError('NIS tidak ditemukan')
      setLoading(false)
      return
    }

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const apiBaseUrl = getSlimApiUrl()
        
        // Load data santri
        const santriResponse = await fetch(`${apiBaseUrl}/public/santri?id=${idSantri}`)
        const santriData = await santriResponse.json()
        
        if (!santriData.success) {
          throw new Error(santriData.message || 'Gagal mengambil data santri')
        }

        setSantri(santriData.data)

        // Load data shohifah
        const shohifahResponse = await fetch(`${apiBaseUrl}/public/shohifah?id_santri=${idSantri}&tahun_ajaran=${tahunAjaran}`)
        const shohifahDataResult = await shohifahResponse.json()
        
        if (shohifahDataResult.success && shohifahDataResult.data) {
          setShohifahData(shohifahDataResult.data)
          // Populate form dengan data yang ada
          setFormData({
            sholat_jamaah_5_waktu: shohifahDataResult.data.sholat_jamaah_5_waktu || '',
            sholat_tarawih: shohifahDataResult.data.sholat_tarawih || '',
            sholat_witir: shohifahDataResult.data.sholat_witir || '',
            sholat_tahajjud: shohifahDataResult.data.sholat_tahajjud || '',
            sholat_dhuha: shohifahDataResult.data.sholat_dhuha || '',
            puasa_ramadhan_status: shohifahDataResult.data.puasa_ramadhan_status || '',
            puasa_ramadhan_alasan: shohifahDataResult.data.puasa_ramadhan_alasan || '',
            khatam_alquran_status: shohifahDataResult.data.khatam_alquran_status || '',
            khatam_alquran_jumlah: shohifahDataResult.data.khatam_alquran_jumlah || '',
            khatam_alquran_tanggal: shohifahDataResult.data.khatam_alquran_tanggal || '',
            kitab_a_nama: shohifahDataResult.data.kitab_a_nama || '',
            kitab_a_status: shohifahDataResult.data.kitab_a_status || '',
            kitab_b_nama: shohifahDataResult.data.kitab_b_nama || '',
            kitab_b_status: shohifahDataResult.data.kitab_b_status || '',
            kitab_c_nama: shohifahDataResult.data.kitab_c_nama || '',
            kitab_c_status: shohifahDataResult.data.kitab_c_status || '',
            berbakti_orang_tua: shohifahDataResult.data.berbakti_orang_tua || '',
            akhlaq_pergaulan: shohifahDataResult.data.akhlaq_pergaulan || '',
            syawal_kembali_hari: shohifahDataResult.data.syawal_kembali_hari || '',
            syawal_kembali_tanggal: shohifahDataResult.data.syawal_kembali_tanggal || ''
          })
        }
      } catch (e) {
        console.error('Error loading data:', e)
        setError(e.message || 'Gagal memuat data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [idSantri, tahunAjaran])

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setSuccess(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const apiBaseUrl = getSlimApiUrl()
      const response = await fetch(`${apiBaseUrl}/public/shohifah`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id_santri: parseInt(idSantri),
          tahun_ajaran: tahunAjaran,
          ...formData
        })
      })

      const result = await response.json()
      
      if (result.success) {
        setSuccess(true)
        setShohifahData(result.data)
        // Scroll ke atas untuk melihat pesan sukses
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        throw new Error(result.message || 'Gagal menyimpan data')
      }
    } catch (e) {
      console.error('Error saving data:', e)
      setError(e.message || 'Gagal menyimpan data')
    } finally {
      setSaving(false)
    }
  }

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  if (loading) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Shohifah</h1>
            <p className="subtitle">Memuat data...</p>
          </div>
          <button 
            className="dark-mode-toggle"
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="public-content-wrapper">
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Memuat data...</p>
          </div>
        </div>
      </>
    )
  }

  if (error && !santri) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Shohifah</h1>
            <p className="subtitle">Error</p>
          </div>
          <button 
            className="dark-mode-toggle"
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="public-content-wrapper">
          <div className="error-container">
            <h1>Error</h1>
            <p>{error}</p>
          </div>
        </div>
      </>
    )
  }

  if (!santri) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Shohifah</h1>
            <p className="subtitle">Data Tidak Ditemukan</p>
          </div>
          <button 
            className="dark-mode-toggle"
            onClick={toggleDarkMode}
            aria-label="Toggle dark mode"
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="public-content-wrapper">
          <div className="error-container">
            <h1>Data Tidak Ditemukan</h1>
            <p>Santri dengan ID tersebut tidak ditemukan.</p>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="public-header">
        <div className="header-content">
          <h1>Shohifah</h1>
          <p className="subtitle">{santri.nama || 'Santri'} - {tahunAjaran}</p>
        </div>
        <button 
          className="dark-mode-toggle"
          onClick={toggleDarkMode}
          aria-label="Toggle dark mode"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="public-content-wrapper">
        <form onSubmit={handleSubmit} className="biodata-section">
          <h2>Catatan Wali Santri</h2>

          {/* 1. Sholat Jamaah 5 Waktu */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">1. Sholat Jamaah 5 Waktu</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">Status</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.sholat_jamaah_5_waktu}
                  onChange={(e) => handleInputChange('sholat_jamaah_5_waktu', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Tidak Aktif">Tidak Aktif</option>
                  <option value="Tidak Sama Sekali">Tidak Sama Sekali</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Sholat Sunnah */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">2. Sholat Sunnah</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">A. Tarawih</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.sholat_tarawih}
                  onChange={(e) => handleInputChange('sholat_tarawih', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Tidak Aktif">Tidak Aktif</option>
                  <option value="Tidak Sama Sekali">Tidak Sama Sekali</option>
                </select>
              </div>
              <div className="biodata-field">
                <label className="field-label">B. Witir</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.sholat_witir}
                  onChange={(e) => handleInputChange('sholat_witir', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Tidak Aktif">Tidak Aktif</option>
                  <option value="Tidak Sama Sekali">Tidak Sama Sekali</option>
                </select>
              </div>
              <div className="biodata-field">
                <label className="field-label">C. Tahajjud</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.sholat_tahajjud}
                  onChange={(e) => handleInputChange('sholat_tahajjud', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Tidak Aktif">Tidak Aktif</option>
                  <option value="Tidak Sama Sekali">Tidak Sama Sekali</option>
                </select>
              </div>
              <div className="biodata-field">
                <label className="field-label">D. Dhuha</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.sholat_dhuha}
                  onChange={(e) => handleInputChange('sholat_dhuha', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Aktif">Aktif</option>
                  <option value="Tidak Aktif">Tidak Aktif</option>
                  <option value="Tidak Sama Sekali">Tidak Sama Sekali</option>
                </select>
              </div>
            </div>
          </div>

          {/* 3. Puasa Ramadhan */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">3. Puasa Ramadhan</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">Status</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.puasa_ramadhan_status}
                  onChange={(e) => handleInputChange('puasa_ramadhan_status', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Tamam">Tamam</option>
                  <option value="Tidak">Tidak</option>
                </select>
              </div>
              {formData.puasa_ramadhan_status === 'Tidak' && (
                <div className="biodata-field">
                  <label className="field-label">Alasan Tidak Puasa</label>
                  <input
                    type="text"
                    className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={formData.puasa_ramadhan_alasan}
                    onChange={(e) => handleInputChange('puasa_ramadhan_alasan', e.target.value)}
                    placeholder="Masukkan alasan..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* 4. Khatam Al-Quran */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">4. Khatam Al-Quran</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">Status</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.khatam_alquran_status}
                  onChange={(e) => handleInputChange('khatam_alquran_status', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Khatam">Khatam</option>
                  <option value="Tidak Khatam">Tidak Khatam</option>
                </select>
              </div>
              {formData.khatam_alquran_status === 'Khatam' && (
                <>
                  <div className="biodata-field">
                    <label className="field-label">Jumlah Khatam (X)</label>
                    <input
                      type="number"
                      className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      value={formData.khatam_alquran_jumlah}
                      onChange={(e) => handleInputChange('khatam_alquran_jumlah', e.target.value)}
                      placeholder="Masukkan jumlah..."
                    />
                  </div>
                  <div className="biodata-field">
                    <label className="field-label">Tanggal Khatam</label>
                    <input
                      type="date"
                      className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      value={formData.khatam_alquran_tanggal}
                      onChange={(e) => handleInputChange('khatam_alquran_tanggal', e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 5. Kitab / Pelajaran yang dimutolaah */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">5. Kitab / Pelajaran yang dimutolaah</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">A. Nama Kitab</label>
                <input
                  type="text"
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.kitab_a_nama}
                  onChange={(e) => handleInputChange('kitab_a_nama', e.target.value)}
                  placeholder="Masukkan nama kitab..."
                />
              </div>
              {formData.kitab_a_nama && (
                <div className="biodata-field">
                  <label className="field-label">Status</label>
                  <select
                    className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={formData.kitab_a_status}
                    onChange={(e) => handleInputChange('kitab_a_status', e.target.value)}
                  >
                    <option value="">Pilih...</option>
                    <option value="Khatam">Khatam</option>
                    <option value="Tidak">Tidak</option>
                  </select>
                </div>
              )}
              <div className="biodata-field">
                <label className="field-label">B. Nama Kitab</label>
                <input
                  type="text"
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.kitab_b_nama}
                  onChange={(e) => handleInputChange('kitab_b_nama', e.target.value)}
                  placeholder="Masukkan nama kitab..."
                />
              </div>
              {formData.kitab_b_nama && (
                <div className="biodata-field">
                  <label className="field-label">Status</label>
                  <select
                    className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={formData.kitab_b_status}
                    onChange={(e) => handleInputChange('kitab_b_status', e.target.value)}
                  >
                    <option value="">Pilih...</option>
                    <option value="Khatam">Khatam</option>
                    <option value="Tidak">Tidak</option>
                  </select>
                </div>
              )}
              <div className="biodata-field">
                <label className="field-label">C. Nama Kitab</label>
                <input
                  type="text"
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.kitab_c_nama}
                  onChange={(e) => handleInputChange('kitab_c_nama', e.target.value)}
                  placeholder="Masukkan nama kitab..."
                />
              </div>
              {formData.kitab_c_nama && (
                <div className="biodata-field">
                  <label className="field-label">Status</label>
                  <select
                    className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    value={formData.kitab_c_status}
                    onChange={(e) => handleInputChange('kitab_c_status', e.target.value)}
                  >
                    <option value="">Pilih...</option>
                    <option value="Khatam">Khatam</option>
                    <option value="Tidak">Tidak</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* 6. Berbakti pada orang tua */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">6. Berbakti pada orang tua</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">Status</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.berbakti_orang_tua}
                  onChange={(e) => handleInputChange('berbakti_orang_tua', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Baik">Baik</option>
                  <option value="Kurang Baik">Kurang Baik</option>
                  <option value="Tidak Baik">Tidak Baik</option>
                </select>
              </div>
            </div>
          </div>

          {/* 7. Akhlaq & Pergaulan sehari2 */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">7. Akhlaq & Pergaulan sehari2</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">Status</label>
                <select
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.akhlaq_pergaulan}
                  onChange={(e) => handleInputChange('akhlaq_pergaulan', e.target.value)}
                >
                  <option value="">Pilih...</option>
                  <option value="Baik">Baik</option>
                  <option value="Kurang Baik">Kurang Baik</option>
                  <option value="Tidak Baik">Tidak Baik</option>
                </select>
              </div>
            </div>
          </div>

          {/* 8. Bulan Syawal kembali ke pondok */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">8. Bulan Syawal kembali ke pondok pada</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <label className="field-label">Hari</label>
                <input
                  type="text"
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.syawal_kembali_hari}
                  onChange={(e) => handleInputChange('syawal_kembali_hari', e.target.value)}
                  placeholder="Masukkan hari..."
                />
              </div>
              <div className="biodata-field">
                <label className="field-label">Tanggal</label>
                <input
                  type="date"
                  className="field-value w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value={formData.syawal_kembali_tanggal}
                  onChange={(e) => handleInputChange('syawal_kembali_tanggal', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="mb-4 p-4 bg-green-100 dark:bg-green-900 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-200 rounded-lg">
              <p className="font-semibold">✓ Data berhasil disimpan!</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 rounded-lg">
              <p className="font-semibold">✗ {error}</p>
            </div>
          )}

          {/* Submit Button */}
          <div className="mt-6 mb-8">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-semibold rounded-lg shadow-md transition-colors duration-200"
            >
              {saving ? 'Menyimpan...' : 'Simpan Data'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

export default PublicShohifah
