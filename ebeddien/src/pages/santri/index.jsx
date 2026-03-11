import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSlimApiUrl } from '../../services/api'
import { useDarkMode } from './PublicLayout'
import './PublicSantri.css'

function PublicSantri() {
  const [searchParams] = useSearchParams()
  const idSantri = searchParams.get('id')
  const [santri, setSantri] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const darkModeContext = useDarkMode()
  const { darkMode, setDarkMode } = darkModeContext || { darkMode: false, setDarkMode: () => {} }

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
        // Load data santri
        const apiBaseUrl = getSlimApiUrl()
        const santriResponse = await fetch(`${apiBaseUrl}/public/santri?id=${idSantri}`)
        const santriData = await santriResponse.json()
        
        if (!santriData.success) {
          throw new Error(santriData.message || 'Gagal mengambil data santri')
        }

        setSantri(santriData.data)
      } catch (e) {
        console.error('Error loading data:', e)
        setError(e.message || 'Gagal memuat data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [idSantri])

  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
  }

  if (loading) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Biodata Santri</h1>
            <p className="subtitle">Pesantren Salafiyah Al-Utsmani</p>
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

  if (error) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Biodata Santri</h1>
            <p className="subtitle">Pesantren Salafiyah Al-Utsmani</p>
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
            <h1>Biodata Santri</h1>
            <p className="subtitle">Pesantren Salafiyah Al-Utsmani</p>
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
      {/* Header dengan Dark Mode Toggle - Full Width */}
      <div className="public-header">
        <div className="header-content">
          <h1>Biodata Santri</h1>
          <p className="subtitle">Pesantren Salafiyah Al-Utsmani</p>
        </div>
        <button 
          className="dark-mode-toggle"
          onClick={toggleDarkMode}
          aria-label="Toggle dark mode"
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Scrollable Content Wrapper */}
      <div className="public-content-wrapper">

        {/* Biodata Section */}
        <div className="biodata-section">
          <h2>Biodata</h2>
          
          {/* Kotak Data Santri */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">Data Santri</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <span className="field-label">Nama</span>
                <span className="field-value">{santri.nama || '-'}</span>
              </div>
              <div className="biodata-field">
                <span className="field-label">NIS</span>
                <span className="field-value">{santri.id || '-'}</span>
              </div>
              <div className="biodata-field">
                <span className="field-label">NIK</span>
                <span className="field-value">{santri.nik || '-'}</span>
              </div>
              <div className="biodata-field">
                <span className="field-label">Tempat, Tanggal Lahir</span>
                <span className="field-value">
                  {[santri.tempat_lahir, santri.tanggal_lahir].filter(Boolean).join(', ') || '-'}
                </span>
              </div>
              <div className="biodata-field">
                <span className="field-label">Jenis Kelamin</span>
                <span className="field-value">{santri.gender || '-'}</span>
              </div>
              <div className="biodata-field">
                <span className="field-label">Alamat</span>
                <span className="field-value">
                  {[
                    santri.dusun,
                    santri.rt ? `RT ${santri.rt}` : '',
                    santri.rw ? `RW ${santri.rw}` : '',
                    santri.desa,
                    santri.kecamatan,
                    santri.kabupaten,
                    santri.provinsi,
                    santri.kode_pos ? `Kode Pos: ${santri.kode_pos}` : ''
                  ].filter(Boolean).join(', ') || '-'}
                </span>
              </div>
              <div className="biodata-field">
                <span className="field-label">Kategori</span>
                <span className="field-value">{santri.kategori || '-'}</span>
              </div>
              <div className="biodata-field">
                <span className="field-label">Status Santri</span>
                <span className="field-value">{santri.status_santri || '-'}</span>
              </div>
              <div className="biodata-field">
                <span className="field-label">Asrama</span>
                <span className="field-value">
                  {[santri.daerah, santri.kamar].filter(Boolean).join(' - ') || '-'}
                </span>
              </div>
              {santri.diniyah && (
                <div className="biodata-field">
                  <span className="field-label">Diniyah</span>
                  <span className="field-value">
                    {[santri.diniyah, santri.kelas_diniyah, santri.kel_diniyah].filter(Boolean).join(' / ') || '-'}
                  </span>
                </div>
              )}
              {santri.formal && (
                <div className="biodata-field">
                  <span className="field-label">Formal</span>
                  <span className="field-value">
                    {[santri.formal, santri.kelas_formal, santri.kel_formal].filter(Boolean).join(' / ') || '-'}
                  </span>
                </div>
              )}
              {santri.lttq && (
                <div className="biodata-field">
                  <span className="field-label">LTTQ</span>
                  <span className="field-value">
                    {[santri.lttq, santri.kelas_lttq, santri.kel_lttq].filter(Boolean).join(' / ') || '-'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Kotak Ayah */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">Ayah</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <span className="field-label">Nama</span>
                <span className="field-value">{santri.ayah || '-'}</span>
              </div>
              {santri.nik_ayah && (
                <div className="biodata-field">
                  <span className="field-label">NIK</span>
                  <span className="field-value">{santri.nik_ayah}</span>
                </div>
              )}
              {santri.status_ayah && (
                <div className="biodata-field">
                  <span className="field-label">Status</span>
                  <span className="field-value">{santri.status_ayah}</span>
                </div>
              )}
              {(santri.tempat_lahir_ayah || santri.tanggal_lahir_ayah) && (
                <div className="biodata-field">
                  <span className="field-label">Tempat, Tanggal Lahir</span>
                  <span className="field-value">
                    {[santri.tempat_lahir_ayah, santri.tanggal_lahir_ayah].filter(Boolean).join(', ') || '-'}
                  </span>
                </div>
              )}
              {santri.pekerjaan_ayah && (
                <div className="biodata-field">
                  <span className="field-label">Pekerjaan</span>
                  <span className="field-value">{santri.pekerjaan_ayah}</span>
                </div>
              )}
              {santri.pendidikan_ayah && (
                <div className="biodata-field">
                  <span className="field-label">Pendidikan</span>
                  <span className="field-value">{santri.pendidikan_ayah}</span>
                </div>
              )}
              {santri.penghasilan_ayah && (
                <div className="biodata-field">
                  <span className="field-label">Penghasilan</span>
                  <span className="field-value">{santri.penghasilan_ayah}</span>
                </div>
              )}
            </div>
          </div>

          {/* Kotak Ibu */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">Ibu</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <span className="field-label">Nama</span>
                <span className="field-value">{santri.ibu || '-'}</span>
              </div>
              {santri.nik_ibu && (
                <div className="biodata-field">
                  <span className="field-label">NIK</span>
                  <span className="field-value">{santri.nik_ibu}</span>
                </div>
              )}
              {santri.status_ibu && (
                <div className="biodata-field">
                  <span className="field-label">Status</span>
                  <span className="field-value">{santri.status_ibu}</span>
                </div>
              )}
              {(santri.tempat_lahir_ibu || santri.tanggal_lahir_ibu) && (
                <div className="biodata-field">
                  <span className="field-label">Tempat, Tanggal Lahir</span>
                  <span className="field-value">
                    {[santri.tempat_lahir_ibu, santri.tanggal_lahir_ibu].filter(Boolean).join(', ') || '-'}
                  </span>
                </div>
              )}
              {santri.pekerjaan_ibu && (
                <div className="biodata-field">
                  <span className="field-label">Pekerjaan</span>
                  <span className="field-value">{santri.pekerjaan_ibu}</span>
                </div>
              )}
              {santri.pendidikan_ibu && (
                <div className="biodata-field">
                  <span className="field-label">Pendidikan</span>
                  <span className="field-value">{santri.pendidikan_ibu}</span>
                </div>
              )}
              {santri.penghasilan_ibu && (
                <div className="biodata-field">
                  <span className="field-label">Penghasilan</span>
                  <span className="field-value">{santri.penghasilan_ibu}</span>
                </div>
              )}
            </div>
          </div>

          {/* Kotak Wali (jika ada) */}
          {santri.wali && (
            <div className="biodata-card">
              <h3 className="biodata-card-title">Wali</h3>
              <div className="biodata-card-content">
                <div className="biodata-field">
                  <span className="field-label">Nama</span>
                  <span className="field-value">{santri.wali}</span>
                </div>
                {santri.hubungan_wali && (
                  <div className="biodata-field">
                    <span className="field-label">Hubungan</span>
                    <span className="field-value">{santri.hubungan_wali}</span>
                  </div>
                )}
                {santri.nik_wali && (
                  <div className="biodata-field">
                    <span className="field-label">NIK</span>
                    <span className="field-value">{santri.nik_wali}</span>
                  </div>
                )}
                {(santri.tempat_lahir_wali || santri.tanggal_lahir_wali) && (
                  <div className="biodata-field">
                    <span className="field-label">Tempat, Tanggal Lahir</span>
                    <span className="field-value">
                      {[santri.tempat_lahir_wali, santri.tanggal_lahir_wali].filter(Boolean).join(', ') || '-'}
                    </span>
                  </div>
                )}
                {santri.pekerjaan_wali && (
                  <div className="biodata-field">
                    <span className="field-label">Pekerjaan</span>
                    <span className="field-value">{santri.pekerjaan_wali}</span>
                  </div>
                )}
                {santri.pendidikan_wali && (
                  <div className="biodata-field">
                    <span className="field-label">Pendidikan</span>
                    <span className="field-value">{santri.pendidikan_wali}</span>
                  </div>
                )}
                {santri.penghasilan_wali && (
                  <div className="biodata-field">
                    <span className="field-label">Penghasilan</span>
                    <span className="field-value">{santri.penghasilan_wali}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Kotak Kontak */}
          <div className="biodata-card">
            <h3 className="biodata-card-title">Kontak</h3>
            <div className="biodata-card-content">
              <div className="biodata-field">
                <span className="field-label">No. Telepon Santri</span>
                <span className="field-value">{santri.no_telpon || '-'}</span>
              </div>
              {santri.no_wa_santri && (
                <div className="biodata-field">
                  <span className="field-label">No. WA Santri</span>
                  <span className="field-value">{santri.no_wa_santri}</span>
                </div>
              )}
              <div className="biodata-field">
                <span className="field-label">Email</span>
                <span className="field-value">{santri.email || '-'}</span>
              </div>
              <div className="biodata-field">
                <span className="field-label">No. Telepon Wali</span>
                <span className="field-value">{santri.no_telpon_wali || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default PublicSantri
