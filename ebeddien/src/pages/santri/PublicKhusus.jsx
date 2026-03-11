import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { getSlimApiUrl } from '../../services/api'
import { useDarkMode } from './PublicLayout'
import PaymentHistoryOffcanvas from './PaymentHistoryOffcanvas'
import './PublicSantri.css'

function PublicKhusus() {
  const [searchParams] = useSearchParams()
  const idSantri = searchParams.get('id')
  const [santri, setSantri] = useState(null)
  const [rincian, setRincian] = useState([])
  const [total, setTotal] = useState({ total: 0, bayar: 0, kurang: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showHistoryOffcanvas, setShowHistoryOffcanvas] = useState(false)
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

        // Load data rincian Khusus
        const rincianResponse = await fetch(`${apiBaseUrl}/public/pembayaran/khusus?id_santri=${idSantri}`)
        const rincianData = await rincianResponse.json()
        
        if (rincianData.success) {
          setRincian(rincianData.data?.rincian || [])
          setTotal(rincianData.data?.total || { total: 0, bayar: 0, kurang: 0 })
        } else {
          setRincian([])
          setTotal({ total: 0, bayar: 0, kurang: 0 })
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

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value || 0)
  }

  if (loading) {
    return (
      <>
        <div className="public-header">
          <div className="header-content">
            <h1>Data Khusus</h1>
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
            <h1>Data Khusus</h1>
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
            <h1>Data Khusus</h1>
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
          <h1>Data Khusus</h1>
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
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-2 md:p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="text-xs md:text-sm text-gray-600 dark:text-gray-400 mb-1">Total Wajib</div>
            <div className="text-sm md:text-xl font-bold text-gray-800 dark:text-gray-200 break-words">{formatCurrency(total.total)}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-2 md:p-4 border border-green-200 dark:border-green-800 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs md:text-sm text-green-700 dark:text-green-300">Total Bayar</div>
              {total.bayar > 0 && (
                <button
                  onClick={() => setShowHistoryOffcanvas(true)}
                  className="text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 md:py-1 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                >
                  Rincian
                </button>
              )}
            </div>
            <div className="text-sm md:text-xl font-bold text-green-600 dark:text-green-400 break-words">{formatCurrency(total.bayar)}</div>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-2 md:p-4 border border-red-200 dark:border-red-800 shadow-sm col-span-2 md:col-span-1">
            <div className="text-xs md:text-sm text-red-700 dark:text-red-300 mb-1">Kurang</div>
            <div className="text-sm md:text-xl font-bold text-red-600 dark:text-red-400 break-words">{formatCurrency(total.kurang)}</div>
          </div>
        </div>

        {/* Rincian List */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4 border-b-3 border-teal-500 dark:border-teal-400 pb-2">Rincian Perbulan</h2>
          {rincian.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 text-center py-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              Tidak ada data pembayaran Khusus
            </div>
          ) : (
            <div className="biodata-card">
              <div className="biodata-card-content">
                {/* Header Kolom */}
                <div className="flex items-center gap-3 sm:gap-4 py-2 border-b-2 border-gray-300 dark:border-gray-600 mb-2">
                  <div className="flex-shrink-0 w-24 sm:w-32">
                    <span className="field-label text-xs sm:text-sm">Bulan</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="field-label text-xs sm:text-sm">Wajib</span>
                  </div>
                  <div className="flex-1 min-w-0 text-center">
                    <span className="field-label text-xs sm:text-sm">Bayar</span>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span className="field-label text-xs sm:text-sm">Status</span>
                  </div>
                </div>
                
                {/* List Bulan */}
                {rincian.map((item, index) => {
                  const bayar = item.bayar || 0
                  const kurang = item.kurang || 0
                  const isLunas = kurang <= 0 && bayar > 0
                  const isBelum = bayar === 0 || bayar === null || bayar === undefined
                  
                  return (
                    <div key={item.id || index} className="flex items-center gap-3 sm:gap-4 py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                      {/* Nama Bulan/Keterangan sebagai Label */}
                      <div className="flex-shrink-0 w-24 sm:w-32">
                        <span className="field-value text-sm sm:text-base font-bold">{item.keterangan_1 || item.bulan || '-'}</span>
                      </div>
                      
                      {/* Wajib di kiri */}
                      <div className="flex-1 min-w-0">
                        <span className="field-value text-xs sm:text-sm break-words">{formatCurrency(item.wajib)}</span>
                      </div>
                      
                      {/* Bayar di tengah */}
                      <div className="flex-1 min-w-0 text-center">
                        <span className="field-value text-xs sm:text-sm text-green-600 dark:text-green-400 break-words">{formatCurrency(bayar)}</span>
                      </div>
                      
                      {/* Status di kanan */}
                      <div className="flex-shrink-0 text-right">
                        {isBelum ? (
                          <span className="inline-block px-2 py-1 text-xs rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                            Belum
                          </span>
                        ) : isLunas ? (
                          <span className="inline-block px-2 py-1 text-xs rounded-md bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">
                            Lunas
                          </span>
                        ) : (
                          <span className="inline-flex flex-col items-end px-2 py-1 text-xs rounded-md bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 font-medium">
                            <span>Kurang</span>
                            <span className="text-[10px] font-semibold">{formatCurrency(kurang)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment History Offcanvas */}
      <PaymentHistoryOffcanvas
        isOpen={showHistoryOffcanvas}
        onClose={() => setShowHistoryOffcanvas(false)}
        idSantri={idSantri}
        mode="khusus"
      />
    </>
  )
}

export default PublicKhusus
