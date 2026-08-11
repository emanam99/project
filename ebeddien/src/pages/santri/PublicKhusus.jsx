import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { appendPublicPaymentTokenQuery, getSlimApiUrl } from '../../services/api'
import { useDarkMode } from './PublicLayout'
import PaymentHistoryOffcanvas from './PaymentHistoryOffcanvas'
import './PublicSantri.css'

function groupRincianByTahunAjaran(rows) {
  const keys = []
  const map = new Map()
  for (const row of rows) {
    const key =
      row.tahun_ajaran != null && String(row.tahun_ajaran).trim() !== ''
        ? String(row.tahun_ajaran).trim()
        : '—'
    if (!map.has(key)) {
      keys.push(key)
      map.set(key, [])
    }
    map.get(key).push(row)
  }
  return keys.map((k) => [k, map.get(k)])
}

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
        const rincianResponse = await fetch(
          appendPublicPaymentTokenQuery(`${apiBaseUrl}/public/pembayaran/khusus?id_santri=${idSantri}`)
        )
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

  const rincianByTahun = useMemo(() => groupRincianByTahunAjaran(rincian), [rincian])

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
        {total.bayar > 0 ? (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowHistoryOffcanvas(true)}
              className="text-sm px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors"
            >
              Lihat riwayat pembayaran
            </button>
          </div>
        ) : null}

        {/* Rincian List */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 mb-4 border-b-3 border-teal-500 dark:border-teal-400 pb-2">Rincian</h2>
          {rincian.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 text-center py-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              Tidak ada data pembayaran Khusus
            </div>
          ) : (
            rincianByTahun.map(([tahunLabel, items]) => (
              <div key={tahunLabel} className="mb-8 last:mb-4">
                <h3 className="text-sm font-semibold text-teal-700 dark:text-teal-300 mb-2">
                  Tahun ajaran {tahunLabel}
                </h3>
                <div className="biodata-card">
                  <div className="biodata-card-content">
                    <div className="flex items-center gap-3 sm:gap-4 py-2 border-b-2 border-gray-300 dark:border-gray-600 mb-2">
                      <div className="flex-shrink-0 w-24 sm:w-32">
                        <span className="field-label text-xs sm:text-sm">Item</span>
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
                    {items.map((item, index) => {
                      const bayar = item.bayar || 0
                      const kurang = item.kurang || 0
                      const isLunas = kurang <= 0 && bayar > 0
                      const isBelum = bayar === 0 || bayar === null || bayar === undefined
                      return (
                        <div key={item.id || `${tahunLabel}-${index}`} className="flex items-center gap-3 sm:gap-4 py-2 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                          <div className="flex-shrink-0 w-24 sm:w-32">
                            <span className="field-value text-sm sm:text-base font-bold">{item.keterangan_1 || item.bulan || '-'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="field-value text-xs sm:text-sm break-words">{formatCurrency(item.wajib)}</span>
                          </div>
                          <div className="flex-1 min-w-0 text-center">
                            <span className="field-value text-xs sm:text-sm text-green-600 dark:text-green-400 break-words">{formatCurrency(bayar)}</span>
                          </div>
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
              </div>
            ))
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
