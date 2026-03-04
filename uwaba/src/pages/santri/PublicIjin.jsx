import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSlimApiUrl } from '../../services/api'
import { useDarkMode } from './PublicLayout'
import './PublicSantri.css'

function PublicIjin() {
  const [searchParams] = useSearchParams()
  const idSantri = searchParams.get('id')
  const [santri, setSantri] = useState(null)
  const [ijinList, setIjinList] = useState([])
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
        const apiBaseUrl = getSlimApiUrl()
        
        // Load data santri
        const santriResponse = await fetch(`${apiBaseUrl}/public/santri?id=${idSantri}`)
        const santriData = await santriResponse.json()
        
        if (!santriData.success) {
          throw new Error(santriData.message || 'Gagal mengambil data santri')
        }

        setSantri(santriData.data)

        // Load data ijin
        const ijinResponse = await fetch(`${apiBaseUrl}/public/ijin?id_santri=${idSantri}`)
        const ijinData = await ijinResponse.json()
        
        if (ijinData.success) {
          setIjinList(ijinData.data || [])
        }
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
            <h1>Data Ijin</h1>
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

  if (error) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Data Ijin</h1>
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
            <h1>Data Ijin</h1>
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
          <h1>Data Ijin</h1>
          <p className="subtitle">{santri.nama || 'Santri'}</p>
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
        <div className="biodata-section">
          <h2>Data Ijin</h2>
          {ijinList.length === 0 ? (
            <div className="biodata-card">
              <div className="biodata-card-content">
                <div className="biodata-field">
                  <span className="field-value text-gray-500 dark:text-gray-400">Tidak ada data ijin</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {ijinList.map((ijin, index) => (
                <div key={ijin.id || index} className="biodata-card">
                  {/* Header dengan Alasan sebagai Sub Judul dan Tahun Ajaran di kanan */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-gray-300 dark:border-gray-600">
                    <h3 className="biodata-card-title self-center" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0, lineHeight: '1.5' }}>{ijin.alasan || '-'}</h3>
                    {ijin.tahun_ajaran && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium self-center">{ijin.tahun_ajaran}</span>
                    )}
                  </div>
                  
                  <div className="biodata-card-content">
                    {/* Dari dan Sampai */}
                    {(ijin.dari || ijin.sampai) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ijin.dari && (
                          <div className="biodata-field">
                            <span className="field-label">Dari</span>
                            <span className="field-value">{ijin.dari}</span>
                          </div>
                        )}
                        {ijin.sampai && (
                          <div className="biodata-field">
                            <span className="field-label">Sampai</span>
                            <span className="field-value">{ijin.sampai}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Lama dan Perpanjang */}
                    {(ijin.lama || ijin.perpanjang) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {ijin.lama && (
                          <div className="biodata-field">
                            <span className="field-label">Lama</span>
                            <span className="field-value">{ijin.lama}</span>
                          </div>
                        )}
                        {ijin.perpanjang && (
                          <div className="biodata-field">
                            <span className="field-label">Perpanjang</span>
                            <span className="field-value">{ijin.perpanjang}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default PublicIjin
