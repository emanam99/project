import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getSlimApiUrl } from '../../../services/api'
import { getGambarUrl } from '../../../config/images'
import './PrintPendaftaran.css'

function PrintPendaftaran({ santriId, inOffcanvas = false }) {
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const [layoutMode, setLayoutMode] = useState('portrait')
  const [columnCount, setColumnCount] = useState('1')
  const [useColor, setUseColor] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [pendaftaranData, setPendaftaranData] = useState(null)
  const pageStyleRef = useRef(null)

  // Check if user is logged in (from store or localStorage for QR access)
  const isLoggedIn = () => {
    // Check from auth store first
    if (user && user.id) return true
    
    // Check localStorage (for QR access compatibility)
    try {
      const userName = localStorage.getItem('user_name')
      const userId = localStorage.getItem('user_id')
      if (userName && userId) return true
    } catch (e) {
      // Ignore localStorage errors
    }
    
    return false
  }

  // Setup initial values based on user login
  useEffect(() => {
    const loggedIn = isLoggedIn()
    if (loggedIn) {
      // Jika sudah login: default 2 kolom, berwarna
      setLayoutMode('portrait')
      setColumnCount('2')
      setUseColor(true)
    } else {
      // Default untuk akses dari QR (tanpa login): 1 kolom, tidak berwarna, hanya bisa print
      setLayoutMode('portrait')
      setColumnCount('1')
      setUseColor(false)
    }
  }, [user])

  const printPageRef = useRef(null)
  const printAreaRef = useRef(null)

  // Apply layout changes
  useEffect(() => {
    // Update print-page class for page orientation
    if (printPageRef.current) {
      printPageRef.current.classList.remove('page-portrait', 'page-landscape')
      printPageRef.current.classList.add(layoutMode === 'portrait' ? 'page-portrait' : 'page-landscape')
    }

    // Create or update @page style for actual printing
    if (!pageStyleRef.current) {
      pageStyleRef.current = document.createElement('style')
      pageStyleRef.current.id = 'page-style'
      document.head.appendChild(pageStyleRef.current)
    }

    // Apply margin based on layout mode
    if (layoutMode === 'portrait') {
      pageStyleRef.current.innerHTML = `@page { size: A4 portrait; margin: 0; }`
    } else {
      pageStyleRef.current.innerHTML = `@page { size: A4 landscape; margin: 0; }`
    }

    return () => {
      // Cleanup on unmount
      if (pageStyleRef.current && pageStyleRef.current.parentNode) {
        pageStyleRef.current.parentNode.removeChild(pageStyleRef.current)
      }
    }
  }, [layoutMode])

  const handlePrint = () => {
    // Gunakan window.print() langsung dengan CSS @media print
    // Ini lebih sederhana dan andal
    window.print()
  }

  const handleLayoutModeChange = (e) => {
    setLayoutMode(e.target.value)
  }

  const handleColumnCountChange = (e) => {
    setColumnCount(e.target.value)
  }

  const handleColorToggle = (e) => {
    setUseColor(e.target.checked)
  }

  // Helper functions
  const formatRupiah = (num) => {
    return 'Rp ' + Number(num).toLocaleString('id-ID')
  }

  const formatTanggal = (tgl) => {
    const d = new Date(tgl)
    // Tidak perlu tambah 7 jam karena:
    // 1. new Date() sudah dalam timezone lokal browser (WIB)
    // 2. Data dari backend sudah dalam timezone Asia/Jakarta
    const tanggal = d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const jam = String(d.getHours()).padStart(2, '0')
    const menit = String(d.getMinutes()).padStart(2, '0')
    const detik = String(d.getSeconds()).padStart(2, '0')
    return `${tanggal} [${jam}.${menit}.${detik}]`
  }

  const getCurrentUrlWithParams = () => {
    const id = santriId || searchParams.get('nis') || searchParams.get('id')
    const page = 'pendaftaran'
    // Selalu gunakan /print-pendaftaran sebagai path
    const baseUrl = window.location.origin + '/print-pendaftaran'

    const params = new URLSearchParams()
    params.set('id', id)
    params.set('page', page)

    // Sertakan tahun ajaran hijriyah & masehi agar link/QR spesifik per tahun ajaran
    if (tahunAjaran) {
      params.set('tahun_hijriyah', tahunAjaran)
    }
    if (tahunAjaranMasehi) {
      params.set('tahun_masehi', tahunAjaranMasehi)
    }

    return `${baseUrl}?${params.toString()}`
  }

  // Load data when santriId is provided
  useEffect(() => {
    const idToLoad = santriId || searchParams.get('nis') || searchParams.get('id')
    if (!idToLoad) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Gunakan getSlimApiUrl untuk mendapatkan API URL yang benar (support subdomain api.alutsmani.id di production)
        const apiUrl = getSlimApiUrl()

        const params = new URLSearchParams()
        params.set('id_santri', idToLoad)
        params.set('page', 'pendaftaran')

        // Sertakan tahun ajaran hijriyah & masehi untuk memastikan data registrasi spesifik tahun ajaran
        if (tahunAjaran) {
          params.set('tahun_hijriyah', tahunAjaran)
        }
        if (tahunAjaranMasehi) {
          params.set('tahun_masehi', tahunAjaranMasehi)
        }

        const url = `${apiUrl}/print?${params.toString()}`
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        })
        
        if (!res.ok) {
          const errorText = await res.text()
          let errorData
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { message: errorText || `HTTP ${res.status}` }
          }
          throw new Error(errorData.message || 'Gagal mengambil data')
        }
        
        const data = await res.json()
        if (!data.success) {
          throw new Error(data.message || 'Gagal mengambil data')
        }
        
        setPendaftaranData(data)
      } catch (e) {
        console.error('Error loading pendaftaran data:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [santriId, searchParams])

  return (
    <div ref={printPageRef} className={`print-page print-pendaftaran ${inOffcanvas ? 'print-pendaftaran-in-offcanvas' : ''}`}>
      {/* Ribbon Controls */}
      <div className="top-right-controls no-print">
        {/* Baris 1 */}
        <div className="ribbon-row">
          <div className="ribbon-section right">
            {/* Tampilkan kontrol warna hanya jika sudah login */}
            {isLoggedIn() && (
              <div className="control-group">
                <input
                  type="checkbox"
                  id="colorToggle"
                  checked={useColor}
                  onChange={handleColorToggle}
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="colorToggle" style={{ cursor: 'pointer' }}>
                  Warna Latar
                </label>
              </div>
            )}
            <button className="btn-print" onClick={handlePrint}>
              🖨️ Print
            </button>
          </div>
        </div>

        {/* Baris 2 - Tampilkan kontrol layout hanya jika sudah login */}
        {isLoggedIn() && (
          <div className="ribbon-row" id="ribbonRow2">
            <div className="ribbon-section right">
              <div className="control-group">
                <label htmlFor="layoutMode">Orientasi:</label>
                <select id="layoutMode" value={layoutMode} onChange={handleLayoutModeChange}>
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
              <div className="control-group">
                <label htmlFor="columnCount">Kolom:</label>
                <select id="columnCount" value={columnCount} onChange={handleColumnCountChange}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print Container - A4 sized box */}
      <div className="print-container-wrapper">
        <div ref={printAreaRef} className="print-container" id="printArea">
        {loading && (
          <div className="loading">Memuat data riwayat pendaftaran...</div>
        )}
        {error && (
          <div className="error">{error}</div>
        )}
        {!loading && !error && pendaftaranData && (
          <div id="content" className={columnCount === '2' ? 'layout-two-columns' : ''}>
            {columnCount === '2' ? (
              <>
                {/* First receipt instance */}
                <div className={`receipt-instance ${useColor ? 'receipt-blue' : ''}`}>
                  {/* Garis horizontal biru langit di atas header */}
                  {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
                  <ReceiptContentTwoColumns data={pendaftaranData} formatRupiah={formatRupiah} formatTanggal={formatTanggal} getCurrentUrlWithParams={getCurrentUrlWithParams} user={user} />
                </div>
                {/* Second receipt instance */}
                <div className={`receipt-instance ${useColor ? 'receipt-green' : ''}`}>
                  {/* Garis horizontal biru langit di atas header */}
                  {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
                  <ReceiptContentTwoColumns data={pendaftaranData} formatRupiah={formatRupiah} formatTanggal={formatTanggal} getCurrentUrlWithParams={getCurrentUrlWithParams} user={user} />
                </div>
              </>
            ) : (
              <div className={`receipt-instance ${useColor ? 'receipt-blue' : ''}`}>
                {/* Garis horizontal biru langit di atas header */}
                {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
                <ReceiptContent data={pendaftaranData} formatRupiah={formatRupiah} formatTanggal={formatTanggal} getCurrentUrlWithParams={getCurrentUrlWithParams} user={user} />
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

// Komponen untuk render konten receipt 1 kolom
function ReceiptContent({ data, formatRupiah, formatTanggal, getCurrentUrlWithParams, user }) {
  const { biodata, tunggakan, pembayaran } = data
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(getCurrentUrlWithParams())
  const petugas = user?.nama || '-'
  
  // Format alamat
  const alamat = [
    biodata.dusun || '',
    biodata.rt || '',
    biodata.rw || '',
    biodata.desa || '',
    biodata.kecamatan || '',
    biodata.kabupaten || '',
    biodata.kode_pos || ''
  ].filter(item => item).join(', ')
  
  // Format domisili
  const domisili = [
    biodata.daerah || '',
    biodata.kamar || ''
  ].filter(item => item).join('.')

  // Kelompokkan item berdasarkan kategori
  const groupedByKategori = {}
  let totalWajib = 0
  
  ;(tunggakan || []).forEach((item) => {
    const kategori = item.kategori || 'Lainnya'
    if (!groupedByKategori[kategori]) {
      groupedByKategori[kategori] = []
    }
    groupedByKategori[kategori].push(item)
    totalWajib += Number(item.total || 0)
  })

  // Buat tabel untuk setiap kategori
  const kategoriTables = Object.keys(groupedByKategori).map((kategori, kategoriIdx) => {
    const items = groupedByKategori[kategori]
    let kategoriTotal = 0
    
    const itemRows = items.map((item, idx) => {
      const total = Number(item.total || 0)
      const bayar = Number(item.bayar || 0)
      const kurang = Math.max(total - bayar, 0)
      
      let statusText = ''
      let statusClass = ''
      if (bayar >= total && total > 0) {
        statusText = 'Lunas'
        statusClass = 'Lunas'
      } else if (bayar > 0) {
        statusText = `Kurang ${formatRupiah(kurang)}`
        statusClass = 'Kurang'
      } else {
        statusText = 'Belum'
        statusClass = 'BelumBayar'
      }
      
      kategoriTotal += total
      
      const sudahAmbil = item.status_ambil === 'sudah_ambil'
      
      return (
        <tr key={item.id || idx}>
          <td>{idx+1}</td>
          <td className="keterangan-1-col" style={{width: 'auto', minWidth: '150px'}}>{(item.keterangan_1 || '-').replace(/<[^>]*>/g, '')}</td>
          <td className="wajib-col">{formatRupiah(total)}</td>
          <td className="status-col"><span className={`status ${statusClass}`}>{statusText}</span></td>
          <td className="ambil-col" style={{textAlign: 'center', verticalAlign: 'middle', width: '20px', minWidth: '20px', maxWidth: '20px', padding: '2px'}}>
            {sudahAmbil ? (
              <span style={{color: '#22c55e', fontSize: '12px', fontWeight: 'bold'}}>✓</span>
            ) : (
              <span style={{color: '#ef4444', fontSize: '12px', fontWeight: 'bold'}}>✗</span>
            )}
          </td>
        </tr>
      )
    })
    
    return (
      <div key={kategori} style={{marginBottom: kategoriIdx < Object.keys(groupedByKategori).length - 1 ? '12px' : '0'}}>
        <table className="tabel-pendaftaran tabel-kecil">
          <thead>
            <tr>
              <th>No</th>
              <th>Item</th>
              <th>Harga</th>
              <th>Status</th>
              <th>Abl</th>
            </tr>
          </thead>
          <tbody>
            {itemRows}
            <tr className="total-row">
              <td colSpan={2}><b>Subtotal {kategori}:</b></td>
              <td><b>{formatRupiah(kategoriTotal)}</b></td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  })

  const totalBayar = pembayaran ? pembayaran.reduce((sum, p) => sum + Number(p.nominal || 0), 0) : 0
  const totalKurang = Math.max(totalWajib - totalBayar, 0)

  return (
    <>
      <div className="header" style={{marginTop: '0'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
          <img src={getGambarUrl('/kop.png')} alt="Logo" className="header-logo" />
          <img src={getGambarUrl('/uwaba-4.png')} alt="Logo UWABA" className="header-logo" style={{maxWidth: '70px', height: 'auto'}} />
        </div>
        <div className="header-text" style={{textAlign: 'center', flex: 1}}>
          <h1>Riwayat Pembayaran Pendaftaran</h1>
          <p>Pesantren Salafiyah Al-Utsmani</p>
        </div>
        <div className="header-id" style={{fontSize: '1rem', fontWeight: 600, color: '#319795'}}>
          {biodata.nis ?? biodata.id}
        </div>
      </div>
      
      <div className="two-column-layout">
        {/* Kolom Kiri: Biodata dan Rincian Item */}
        <div className="left-column">
          <div className="biodata-section">
            <table className="biodata-table">
              <tbody>
                <tr>
                  <td className="biodata-label">Nama</td>
                  <td colSpan={4}>: {biodata.nama}</td>
                </tr>
                <tr className="biodata-alamat-row">
                  <td className="biodata-label">Alamat</td>
                  <td colSpan={4}>: {alamat || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Status</td>
                  <td>: {biodata.status_santri || '-'}</td>
                  <td style={{width: '20px'}}></td>
                  <td className="biodata-label">Diniyah</td>
                  <td>: {biodata.diniyah || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Kategori</td>
                  <td>: {biodata.kategori || '-'}</td>
                  <td></td>
                  <td className="biodata-label">Formal</td>
                  <td>: {biodata.formal || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Domisili</td>
                  <td>: {domisili || '-'}</td>
                  <td></td>
                  <td className="biodata-label">LTTQ</td>
                  <td>: {biodata.lttq || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Saudara</td>
                  <td colSpan={4}>: {biodata.saudara_di_pesantren || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="section-title">Rincian Item Pendaftaran</div>
          {kategoriTables}
          <div style={{marginTop: '8px', textAlign: 'right', fontSize: '10px'}}>
            <b>Total Harga: {formatRupiah(totalWajib)}</b> | <b>Kurang: {formatRupiah(totalKurang)}</b>
          </div>
        </div>
        
        {/* Garis Tengah Vertikal */}
        <div className="vertical-divider"></div>
        
        {/* Kolom Kanan: Riwayat Pembayaran, QR, dan Admin */}
        <div className="right-column">
          <div className="payment-info-section">
            <div className="qr-admin-row">
              <div className="qr-code-container">
                <img src={qrUrl} alt="QR Code" className="qr-code-image" />
              </div>
              <div className="admin-info">
                <div className="admin-label">Tanggal Cetak:</div>
                <div className="admin-name">{formatTanggal(new Date())}</div>
                <div className="admin-label" style={{marginTop: '10px'}}>Admin:</div>
                <div className="admin-name">{petugas}</div>
              </div>
            </div>
          </div>
          
          <div className="section-title">Riwayat Pembayaran Pendaftaran</div>
          <table className="tabel-pendaftaran tabel-pembayaran">
            <thead>
              <tr>
                <th>No</th>
                <th>Nominal</th>
                <th>Tanggal</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {(!pembayaran || pembayaran.length === 0) ? (
                <tr>
                  <td colSpan={4} style={{textAlign: 'center', color: '#aaa', fontStyle: 'italic'}}>Tidak ada pembayaran pendaftaran.</td>
                </tr>
              ) : (
                <>
                  {pembayaran.map((p, i) => {
                    let d
                    if (p.tanggal_dibuat) {
                      const dateStr = p.tanggal_dibuat
                      if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+'))) {
                        d = new Date(dateStr)
                      } else {
                        const [datePart, timePart] = dateStr.split(' ')
                        const [year, month, day] = datePart.split('-').map(Number)
                        const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number)
                        d = new Date(year, month - 1, day, hour, minute, second || 0)
                      }
                    } else {
                      d = new Date()
                    }
                    
                    const tanggalMasehi = d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    const jam = String(d.getHours()).padStart(2, '0')
                    const menit = String(d.getMinutes()).padStart(2, '0')
                    const detik = String(d.getSeconds()).padStart(2, '0')
                    const waktu = `${p.hijriyah || '-'} [${jam}.${menit}.${detik}]`
                    
                    return (
                      <tr key={i}>
                        <td>{i+1}</td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', position: 'relative', padding: '8px'}}>
                          <span style={{whiteSpace: 'nowrap', fontWeight: 'bold'}}>{formatRupiah(p.nominal)}</span>
                          {p.via && (
                            <span className="via-badge" style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              display: 'inline-block',
                              padding: '2px 4px',
                              borderRadius: '3px',
                              fontSize: '0.65em',
                              fontWeight: '600',
                              backgroundColor: '#e0f2fe',
                              color: '#0369a1',
                              border: '1px solid #bae6fd',
                              whiteSpace: 'nowrap',
                              lineHeight: '1.2'
                            }}>
                              {p.via}
                            </span>
                          )}
                        </td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle'}}>
                          <span style={{fontSize: '7px', color: '#64748b'}}>{tanggalMasehi}</span><br />
                          <span style={{fontSize: '7px', color: '#64748b', display: 'block'}}>{waktu}</span>
                        </td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{p.admin || '-'}</td>
                      </tr>
                    )
                  })}
                  <tr className="total-row">
                    <td colSpan={3}>Total Pembayaran</td>
                    <td colSpan={2}>{formatRupiah(totalBayar)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// Komponen untuk render konten receipt 2 kolom
function ReceiptContentTwoColumns({ data, formatRupiah, formatTanggal, getCurrentUrlWithParams, user }) {
  const { biodata, tunggakan, pembayaran } = data
  const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=' + encodeURIComponent(getCurrentUrlWithParams())
  const petugas = user?.nama || '-'
  
  // Format alamat
  const alamat = [
    biodata.dusun || '',
    biodata.rt || '',
    biodata.rw || '',
    biodata.desa || '',
    biodata.kecamatan || '',
    biodata.kabupaten || '',
    biodata.kode_pos || ''
  ].filter(item => item).join(', ')
  
  // Format domisili
  const domisili = [
    biodata.daerah || '',
    biodata.kamar || ''
  ].filter(item => item).join('.')

  // Kelompokkan item berdasarkan kategori
  const groupedByKategori = {}
  let totalWajib = 0
  
  ;(tunggakan || []).forEach((item) => {
    const kategori = item.kategori || 'Lainnya'
    if (!groupedByKategori[kategori]) {
      groupedByKategori[kategori] = []
    }
    groupedByKategori[kategori].push(item)
    totalWajib += Number(item.total || 0)
  })

  // Buat tabel untuk setiap kategori
  const kategoriTables = Object.keys(groupedByKategori).map((kategori, kategoriIdx) => {
    const items = groupedByKategori[kategori]
    let kategoriTotal = 0
    
    const itemRows = items.map((item, idx) => {
      const total = Number(item.total || 0)
      const bayar = Number(item.bayar || 0)
      const kurang = Math.max(total - bayar, 0)
      
      let statusText = ''
      let statusClass = ''
      if (bayar >= total && total > 0) {
        statusText = 'Lunas'
        statusClass = 'Lunas'
      } else if (bayar > 0) {
        statusText = `Kurang ${formatRupiah(kurang)}`
        statusClass = 'Kurang'
      } else {
        statusText = 'Belum'
        statusClass = 'BelumBayar'
      }
      
      kategoriTotal += total
      
      const sudahAmbil = item.status_ambil === 'sudah_ambil'
      
      return (
        <tr key={item.id || idx}>
          <td>{idx+1}</td>
          <td className="keterangan-1-col" style={{width: 'auto', minWidth: '150px'}}>{(item.keterangan_1 || '-').replace(/<[^>]*>/g, '')}</td>
          <td className="wajib-col">{formatRupiah(total)}</td>
          <td className="status-col"><span className={`status ${statusClass}`}>{statusText}</span></td>
          <td className="ambil-col" style={{textAlign: 'center', verticalAlign: 'middle', width: '20px', minWidth: '20px', maxWidth: '20px', padding: '2px'}}>
            {sudahAmbil ? (
              <span style={{color: '#22c55e', fontSize: '12px', fontWeight: 'bold'}}>✓</span>
            ) : (
              <span style={{color: '#ef4444', fontSize: '12px', fontWeight: 'bold'}}>✗</span>
            )}
          </td>
        </tr>
      )
    })
    
    return (
      <div key={kategori} style={{marginBottom: kategoriIdx < Object.keys(groupedByKategori).length - 1 ? '12px' : '0'}}>
        <table className="tabel-pendaftaran tabel-kecil">
          <thead>
            <tr>
              <th>No</th>
              <th>Item</th>
              <th>Harga</th>
              <th>Status</th>
              <th>Abl</th>
            </tr>
          </thead>
          <tbody>
            {itemRows}
            <tr className="total-row">
              <td colSpan={2}><b>Subtotal {kategori}:</b></td>
              <td><b>{formatRupiah(kategoriTotal)}</b></td>
              <td colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  })

  const totalBayar = pembayaran ? pembayaran.reduce((sum, p) => sum + Number(p.nominal || 0), 0) : 0
  const totalKurang = Math.max(totalWajib - totalBayar, 0)

  return (
    <>
      <div className="header" style={{marginTop: '0'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
          <img src={getGambarUrl('/kop.png')} alt="Logo" className="header-logo" />
          <img src={getGambarUrl('/uwaba-4.png')} alt="Logo UWABA" className="header-logo" style={{maxWidth: '70px', height: 'auto'}} />
        </div>
        <div className="header-text" style={{textAlign: 'center', flex: 1}}>
          <h1>Riwayat Pembayaran Pendaftaran</h1>
          <p>Pesantren Salafiyah Al-Utsmani</p>
        </div>
        <div className="header-id" style={{fontSize: '1rem', fontWeight: 600, color: '#319795'}}>
          {biodata.nis ?? biodata.id}
        </div>
      </div>
      
      <div className="two-column-layout">
        {/* Kolom Kiri: Biodata dan Rincian Item */}
        <div className="left-column">
          <div className="biodata-section">
            <table className="biodata-table">
              <tbody>
                <tr>
                  <td className="biodata-label">Nama</td>
                  <td colSpan={4}>: {biodata.nama}</td>
                </tr>
                <tr className="biodata-alamat-row">
                  <td className="biodata-label">Alamat</td>
                  <td colSpan={4}>: {alamat || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Status</td>
                  <td>: {biodata.status_santri || '-'}</td>
                  <td style={{width: '20px'}}></td>
                  <td className="biodata-label">Diniyah</td>
                  <td>: {biodata.diniyah || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Kategori</td>
                  <td>: {biodata.kategori || '-'}</td>
                  <td></td>
                  <td className="biodata-label">Formal</td>
                  <td>: {biodata.formal || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Domisili</td>
                  <td>: {domisili || '-'}</td>
                  <td></td>
                  <td className="biodata-label">LTTQ</td>
                  <td>: {biodata.lttq || '-'}</td>
                </tr>
                <tr>
                  <td className="biodata-label">Saudara</td>
                  <td colSpan={4}>: {biodata.saudara_di_pesantren || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="section-title">Rincian Item Pendaftaran</div>
          {kategoriTables}
          <div style={{marginTop: '8px', textAlign: 'right', fontSize: '10px'}}>
            <b>Total Harga: {formatRupiah(totalWajib)}</b> | <b>Kurang: {formatRupiah(totalKurang)}</b>
          </div>
        </div>
        
        {/* Garis Tengah Vertikal */}
        <div className="vertical-divider"></div>
        
        {/* Kolom Kanan: Riwayat Pembayaran, QR, dan Admin */}
        <div className="right-column">
          <div className="payment-info-section">
            <div className="qr-admin-row">
              <div className="qr-code-container">
                <img src={qrUrl} alt="QR Code" className="qr-code-image" />
              </div>
              <div className="admin-info">
                <div className="admin-label">Tanggal Cetak:</div>
                <div className="admin-name">{formatTanggal(new Date())}</div>
                <div className="admin-label" style={{marginTop: '10px'}}>Admin:</div>
                <div className="admin-name">{petugas}</div>
              </div>
            </div>
          </div>
          
          <div className="section-title">Riwayat Pembayaran Pendaftaran</div>
          <table className="tabel-pendaftaran tabel-pembayaran">
            <thead>
              <tr>
                <th>No</th>
                <th>Nominal</th>
                <th>Tanggal</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {(!pembayaran || pembayaran.length === 0) ? (
                <tr>
                  <td colSpan={4} style={{textAlign: 'center', color: '#aaa', fontStyle: 'italic'}}>Tidak ada pembayaran pendaftaran.</td>
                </tr>
              ) : (
                <>
                  {pembayaran.map((p, i) => {
                    let d
                    if (p.tanggal_dibuat) {
                      const dateStr = p.tanggal_dibuat
                      if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+'))) {
                        d = new Date(dateStr)
                      } else {
                        const [datePart, timePart] = dateStr.split(' ')
                        const [year, month, day] = datePart.split('-').map(Number)
                        const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number)
                        d = new Date(year, month - 1, day, hour, minute, second || 0)
                      }
                    } else {
                      d = new Date()
                    }
                    
                    const tanggalMasehi = d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                    const jam = String(d.getHours()).padStart(2, '0')
                    const menit = String(d.getMinutes()).padStart(2, '0')
                    const detik = String(d.getSeconds()).padStart(2, '0')
                    const waktu = `${p.hijriyah || '-'} [${jam}.${menit}.${detik}]`
                    
                    return (
                      <tr key={i}>
                        <td>{i+1}</td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap', position: 'relative', padding: '8px'}}>
                          <span style={{whiteSpace: 'nowrap', fontWeight: 'bold'}}>{formatRupiah(p.nominal)}</span>
                          {p.via && (
                            <span className="via-badge" style={{
                              position: 'absolute',
                              top: '2px',
                              right: '2px',
                              display: 'inline-block',
                              padding: '2px 4px',
                              borderRadius: '3px',
                              fontSize: '0.65em',
                              fontWeight: '600',
                              backgroundColor: '#e0f2fe',
                              color: '#0369a1',
                              border: '1px solid #bae6fd',
                              whiteSpace: 'nowrap',
                              lineHeight: '1.2'
                            }}>
                              {p.via}
                            </span>
                          )}
                        </td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle'}}>
                          <span style={{fontSize: '7px', color: '#64748b'}}>{tanggalMasehi}</span><br />
                          <span style={{fontSize: '7px', color: '#64748b', display: 'block'}}>{waktu}</span>
                        </td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{p.admin || '-'}</td>
                      </tr>
                    )
                  })}
                  <tr className="total-row">
                    <td colSpan={3}>Total Pembayaran</td>
                    <td colSpan={2}>{formatRupiah(totalBayar)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default PrintPendaftaran

