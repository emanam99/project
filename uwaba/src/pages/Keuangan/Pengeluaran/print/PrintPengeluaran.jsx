import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../../../store/authStore'
import { pengeluaranAPI } from '../../../../services/api'
import { getGambarUrl } from '../../../../config/images'
import './PrintPengeluaran.css'

function PrintPengeluaran({ pengeluaranId, inOffcanvas = false }) {
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const [layoutMode, setLayoutMode] = useState('portrait')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pengeluaranData, setPengeluaranData] = useState(null)
  const pageStyleRef = useRef(null)
  const printPageRef = useRef(null)

  // Check if user is logged in
  const isLoggedIn = () => {
    if (user && user.id) return true
    try {
      const userName = localStorage.getItem('user_name')
      const userId = localStorage.getItem('user_id')
      if (userName && userId) return true
    } catch (e) {
      // Ignore localStorage errors
    }
    return false
  }

  // Apply layout changes
  useEffect(() => {
    if (printPageRef.current) {
      printPageRef.current.classList.remove('page-portrait', 'page-landscape')
      printPageRef.current.classList.add(layoutMode === 'portrait' ? 'page-portrait' : 'page-landscape')
    }

    if (!pageStyleRef.current) {
      pageStyleRef.current = document.createElement('style')
      pageStyleRef.current.id = 'page-style-pengeluaran'
      document.head.appendChild(pageStyleRef.current)
    }

    if (layoutMode === 'portrait') {
      pageStyleRef.current.innerHTML = `@page { size: A4 portrait; margin: 15mm; }`
    } else {
      pageStyleRef.current.innerHTML = `@page { size: A4 landscape; margin: 10mm; }`
    }

    return () => {
      if (pageStyleRef.current && pageStyleRef.current.parentNode) {
        pageStyleRef.current.parentNode.removeChild(pageStyleRef.current)
      }
    }
  }, [layoutMode])

  const handlePrint = () => {
    window.print()
  }

  const handleLayoutModeChange = (e) => {
    setLayoutMode(e.target.value)
  }

  // Load data when pengeluaranId is provided
  useEffect(() => {
    const idToLoad = pengeluaranId || searchParams.get('id')
    if (!idToLoad) {
      setError('ID pengeluaran tidak ditemukan')
      setLoading(false)
      return
    }

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await pengeluaranAPI.getPengeluaranDetail(idToLoad)
        if (response.success) {
          setPengeluaranData(response.data)
        } else {
          throw new Error(response.message || 'Gagal mengambil data pengeluaran')
        }
      } catch (e) {
        console.error('Error loading pengeluaran data:', e)
        setError(e.response?.data?.message || e.message || 'Gagal mengambil data pengeluaran')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [pengeluaranId, searchParams])

  // Helper functions
  const formatRupiah = (num) => {
    return 'Rp ' + Number(num).toLocaleString('id-ID')
  }

  const formatTanggal = (tgl) => {
    if (!tgl) return '-'
    const d = new Date(tgl)
    return d.toLocaleDateString('id-ID', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatTanggalShort = (tgl) => {
    if (!tgl) return '-'
    const d = new Date(tgl)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  if (loading) {
    return (
      <div className="print-page print-pengeluaran">
        <div className="print-container-wrapper">
          <div className="print-container">
            <div className="loading">Memuat data pengeluaran...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="print-page print-pengeluaran">
        <div className="print-container-wrapper">
          <div className="print-container">
            <div className="error">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  if (!pengeluaranData) {
    return (
      <div className="print-page print-pengeluaran">
        <div className="print-container-wrapper">
          <div className="print-container">
            <div className="error">Data pengeluaran tidak ditemukan</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={printPageRef} className={`print-page print-pengeluaran ${inOffcanvas ? 'print-pengeluaran-in-offcanvas' : ''}`}>
      {/* Ribbon Controls */}
      <div className="top-right-controls no-print">
        <div className="ribbon-row">
          <div className="ribbon-section right">
            {isLoggedIn() && (
              <div className="control-group">
                <label htmlFor="layoutModePengeluaran">Orientasi:</label>
                <select id="layoutModePengeluaran" value={layoutMode} onChange={handleLayoutModeChange}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            )}
            <button className="btn-print" onClick={handlePrint}>
              🖨️ Print
            </button>
          </div>
        </div>
      </div>

      {/* Print Container */}
      <div className="print-container-wrapper">
        <div className="print-container" id="printArea">
          {/* Header */}
          <div className="report-header">
            <div className="header-top">
              <div className="header-logo-left">
                <img src={getGambarUrl('/kop.png')} alt="Logo Pesantren" className="header-logo-pesantren" />
              </div>
              <div className="header-text">
                <h1>LAPORAN PENGELUARAN</h1>
                <p className="header-info">Pondok Pesantren Al-Utsmani</p>
                <p className="header-address">Beddian Jambesari, Jambesari Darus Sholah, Bondowoso</p>
              </div>
              <div className="header-logo-right">
                <img src={getGambarUrl('/uwaba-4.png')} alt="Logo UWABA" className="header-logo-uwaba" />
              </div>
            </div>
          </div>

          {/* Informasi Pengeluaran */}
          <div className="info-section">
            <div className="info-row">
              <div className="info-item">
                <span className="info-label">ID Pengeluaran:</span>
                <span className="info-value">{pengeluaranData.id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Tanggal:</span>
                <span className="info-value">{formatTanggalShort(pengeluaranData.tanggal_dibuat)}</span>
              </div>
            </div>
            {pengeluaranData.hijriyah && (
              <div className="info-row">
                <div className="info-item">
                  <span className="info-label">Tanggal Hijriyah:</span>
                  <span className="info-value">{pengeluaranData.hijriyah}</span>
                </div>
              </div>
            )}
            <div className="info-row">
              <div className="info-item">
                <span className="info-label">Keterangan:</span>
                <span className="info-value">{pengeluaranData.keterangan || 'Tanpa Keterangan'}</span>
              </div>
            </div>
            <div className="info-row">
              {pengeluaranData.kategori && (
                <div className="info-item">
                  <span className="info-label">Kategori:</span>
                  <span className="info-value">{pengeluaranData.kategori}</span>
                </div>
              )}
              {pengeluaranData.lembaga && (
                <div className="info-item">
                  <span className="info-label">Lembaga:</span>
                  <span className="info-value">{pengeluaranData.lembaga}</span>
                </div>
              )}
              {pengeluaranData.sumber_uang && (
                <div className="info-item">
                  <span className="info-label">Sumber Uang:</span>
                  <span className="info-value">{pengeluaranData.sumber_uang}</span>
                </div>
              )}
            </div>
          </div>

          {/* Detail Items */}
          {pengeluaranData.details && pengeluaranData.details.length > 0 && (
            <div className="detail-section">
              <h2 className="section-title">Detail Item Pengeluaran</h2>
              <table className="detail-table">
                <thead>
                  <tr>
                    <th className="col-no">No</th>
                    <th className="col-item">Item</th>
                    <th className="col-harga">Harga</th>
                    <th className="col-jumlah">Jumlah</th>
                    <th className="col-nominal">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {pengeluaranData.details
                    .filter(detail => !detail.rejected)
                    .map((detail, index) => (
                    <tr key={index}>
                      <td className="text-center">{index + 1}</td>
                      <td>{detail.item}</td>
                      <td className="text-right">{formatRupiah(detail.harga || 0)}</td>
                      <td className="text-center">{detail.jumlah || 1}</td>
                      <td className="text-right font-bold">{formatRupiah(detail.nominal || 0)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan="4" className="text-right font-bold">TOTAL PENGELUARAN:</td>
                    <td className="text-right font-bold total-amount">{formatRupiah(pengeluaranData.nominal || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Footer Information */}
          <div className="footer-section">
            <div className="footer-row">
              <div className="footer-item">
                <span className="footer-label">Dibuat Oleh:</span>
                <span className="footer-value">{pengeluaranData.admin_nama || '-'}</span>
              </div>
              {pengeluaranData.admin_approve_nama && (
                <div className="footer-item">
                  <span className="footer-label">Di-approve Oleh:</span>
                  <span className="footer-value">{pengeluaranData.admin_approve_nama}</span>
                </div>
              )}
              {pengeluaranData.penerima_nama && (
                <div className="footer-item">
                  <span className="footer-label">Penerima:</span>
                  <span className="footer-value">{pengeluaranData.penerima_nama}</span>
                </div>
              )}
            </div>
            <div className="footer-row">
              <div className="footer-item">
                <span className="footer-label">Tanggal Dibuat:</span>
                <span className="footer-value">{formatTanggal(pengeluaranData.tanggal_dibuat)}</span>
              </div>
            </div>
          </div>

          {/* Tanda Tangan */}
          <div className="ttd-section">
            <div className="ttd-box">
              <div className="ttd-space"></div>
              <div className="ttd-label">Mengetahui,</div>
              <div className="ttd-name">{pengeluaranData.admin_approve_nama || '-'}</div>
              <div className="ttd-role">Admin</div>
            </div>
            {pengeluaranData.penerima_nama && (
              <div className="ttd-box">
                <div className="ttd-space"></div>
                <div className="ttd-label">Penerima,</div>
                <div className="ttd-name">{pengeluaranData.penerima_nama}</div>
                <div className="ttd-role">Penerima</div>
              </div>
            )}
          </div>
        </div>

        {/* Lampiran - Halaman Kedua */}
        {((pengeluaranData.rejected_details && pengeluaranData.rejected_details.length > 0) || 
          (pengeluaranData.edit_history && Object.keys(pengeluaranData.edit_history).some(item => 
            Array.isArray(pengeluaranData.edit_history[item]) && pengeluaranData.edit_history[item].length > 1
          ))) && (
          <div className="print-container lampiran-container">
            {/* Header Lampiran */}
            <div className="report-header">
              <div className="header-top">
                <div className="header-logo-left">
                  <img src={getGambarUrl('/kop.png')} alt="Logo Pesantren" className="header-logo-pesantren" />
                </div>
                <div className="header-text">
                  <h1>LAMPIRAN LAPORAN PENGELUARAN</h1>
                  <p className="header-info">Pondok Pesantren Al-Utsmani</p>
                  <p className="header-address">Beddian Jambesari, Jambesari Darus Sholah, Bondowoso</p>
                </div>
                <div className="header-logo-right">
                  <img src={getGambarUrl('/uwaba-4.png')} alt="Logo UWABA" className="header-logo-uwaba" />
                </div>
              </div>
            </div>

            {/* Item yang Ditolak */}
            {pengeluaranData.rejected_details && pengeluaranData.rejected_details.length > 0 && (
              <div className="detail-section">
                <h2 className="section-title">Item yang Ditolak</h2>
                <table className="detail-table rejected-table">
                  <thead>
                    <tr>
                      <th className="col-no">No</th>
                      <th className="col-item">Item</th>
                      <th className="col-harga">Harga</th>
                      <th className="col-jumlah">Jumlah</th>
                      <th className="col-nominal">Nominal</th>
                      <th className="col-alasan">Alasan Penolakan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pengeluaranData.rejected_details.map((detail, index) => (
                      <tr key={index} className="rejected-row">
                        <td className="text-center">{index + 1}</td>
                        <td>{detail.item}</td>
                        <td className="text-right">{formatRupiah(detail.harga || 0)}</td>
                        <td className="text-center">{detail.jumlah || 1}</td>
                        <td className="text-right">{formatRupiah(detail.nominal || 0)}</td>
                        <td className="text-left rejected-reason">{detail.alasan_penolakan || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* History Perubahan Item */}
            {pengeluaranData.edit_history && Object.keys(pengeluaranData.edit_history).length > 0 && (
              <div className="detail-section">
                <h2 className="section-title">History Perubahan Item</h2>
                {Object.entries(pengeluaranData.edit_history)
                  .filter(([item, history]) => Array.isArray(history) && history.length > 1)
                  .map(([item, history], itemIndex) => (
                    <div key={itemIndex} className="history-item-section">
                      <h3 className="history-item-title">{item}</h3>
                      <table className="detail-table history-table">
                        <thead>
                          <tr>
                            <th className="col-versi">Versi</th>
                            <th className="col-harga">Harga</th>
                            <th className="col-jumlah">Jumlah</th>
                            <th className="col-nominal">Nominal</th>
                            <th className="col-admin">Diubah Oleh</th>
                            <th className="col-tanggal">Tanggal</th>
                            <th className="col-status">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((hist, histIndex) => (
                            <tr key={histIndex} className={hist.rejected ? 'rejected-row' : ''}>
                              <td className="text-center">{hist.versi || '-'}</td>
                              <td className="text-right">{formatRupiah(hist.harga || 0)}</td>
                              <td className="text-center">{hist.jumlah || 1}</td>
                              <td className="text-right">{formatRupiah(hist.nominal || 0)}</td>
                              <td className="text-left">{hist.admin_nama || '-'}</td>
                              <td className="text-left">{formatTanggalShort(hist.tanggal_dibuat)}</td>
                              <td className="text-center">
                                {hist.rejected ? (
                                  <span className="status-badge rejected">Ditolak</span>
                                ) : (
                                  <span className="status-badge approved">Disetujui</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PrintPengeluaran
