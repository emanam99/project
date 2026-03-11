import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getSlimApiUrl } from '../../../services/api'
import { getGambarUrl } from '../../../config/images'
import './PrintKwitansi.css'

function PrintKwitansi({ santriId, inOffcanvas = false, mode = 'tunggakan' }) {
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { tahunAjaran } = useTahunAjaranStore()
  const [layoutMode, setLayoutMode] = useState('portrait')
  const [columnCount, setColumnCount] = useState('1')
  const [useColor, setUseColor] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [kwitansiData, setKwitansiData] = useState(null)
  const pageStyleRef = useRef(null)

  // Determine current mode from props or URL
  const currentMode = mode || searchParams.get('page') || 'tunggakan'

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

  // Setup initial values based on user login (default portrait seperti UWABA)
  useEffect(() => {
    const loggedIn = isLoggedIn()
    if (loggedIn) {
      // Jika sudah login: default portrait, 2 kolom (atas-bawah), berwarna
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

    // Hapus style lama jika ada
    const existingStyle = document.getElementById('page-style')
    if (existingStyle) {
      existingStyle.remove()
    }

    // Create or update @page style for actual printing
    pageStyleRef.current = document.createElement('style')
    pageStyleRef.current.id = 'page-style'

    // Apply margin based on layout mode
    if (layoutMode === 'portrait') {
      pageStyleRef.current.innerHTML = `@page { size: A4 portrait; margin: 8mm; }`
    } else {
      pageStyleRef.current.innerHTML = `@page { size: A4 landscape; margin: 8mm; }`
    }

    document.head.appendChild(pageStyleRef.current)

    return () => {
      // Cleanup on unmount
      if (pageStyleRef.current && pageStyleRef.current.parentNode) {
        pageStyleRef.current.parentNode.removeChild(pageStyleRef.current)
      }
    }
  }, [layoutMode])

  const handlePrint = () => {
    // Pastikan @page style ter-update sebelum print
    // Hapus style lama jika ada
    const existingStyle = document.getElementById('page-style')
    if (existingStyle) {
      existingStyle.remove()
    }
    
    // Buat style baru
    pageStyleRef.current = document.createElement('style')
    pageStyleRef.current.id = 'page-style'
    
    // Update @page style berdasarkan layoutMode saat ini
    if (layoutMode === 'portrait') {
      pageStyleRef.current.innerHTML = `@page { size: A4 portrait; margin: 8mm; }`
    } else {
      pageStyleRef.current.innerHTML = `@page { size: A4 landscape; margin: 8mm; }`
    }
    
    document.head.appendChild(pageStyleRef.current)
    
    // Tunggu sebentar untuk memastikan style ter-apply sebelum print
    requestAnimationFrame(() => {
      setTimeout(() => {
        window.print()
      }, 50)
    })
  }

  const handleLayoutModeChange = (e) => {
    setLayoutMode(e.target.value)
  }

  const handleColumnCountChange = (e) => {
    setColumnCount(e.target.value)
    // Tetap portrait; 2 kolom ditampilkan atas-bawah (flex-direction: column di CSS)
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

  // Link QR: arahkan ke halaman public santri (tunggakan/khusus) agar saat scan langsung ke data santri tersebut
  const getCurrentUrlWithParams = () => {
    const id = santriId || searchParams.get('id')
    const baseUrl = window.location.origin + '/public/' + currentMode
    let url = `${baseUrl}?id=${encodeURIComponent(id)}`
    const tahunAjaranFromUrl = searchParams.get('tahun_ajaran') || tahunAjaran
    if (tahunAjaranFromUrl) {
      url += `&tahun_ajaran=${encodeURIComponent(tahunAjaranFromUrl)}`
    }
    return url
  }

  // Group pembayaran per 6
  const groupPembayaran = (pembayaran) => {
    if (!pembayaran || pembayaran.length === 0) return []
    
    const groups = []
    const n = pembayaran.length
    const fullGroups = Math.floor(n / 6)
    
    // Kelompokkan per 6 pembayaran penuh
    for (let g = 0; g < fullGroups; g++) {
      const start = g * 6
      const group = pembayaran.slice(start, start + 6)
      const noAwal = start + 1
      const noAkhir = start + 6
      const nominal = group.reduce((sum, p) => sum + Number(p.nominal), 0)
      const tanggal = group[5].tanggal_dibuat
      const admin = group[5].admin || '-'
      const via = group[5].via || '-'
      const hijriyah = group[5].hijriyah || '-'
      const keterangan_1 = group[5].keterangan_1 || '-'
      groups.push({
        no: `${noAwal} - ${noAkhir}`,
        tanggal,
        nominal,
        admin,
        via,
        hijriyah,
        keterangan_1
      })
    }
    
    // Sisa pembayaran di akhir (kurang dari 6)
    for (let i = fullGroups * 6; i < n; i++) {
      const p = pembayaran[i]
      groups.push({
        no: (i+1).toString(),
        tanggal: p.tanggal_dibuat,
        nominal: Number(p.nominal),
        admin: p.admin || '-',
        via: p.via || '-',
        hijriyah: p.hijriyah || '-',
        keterangan_1: p.keterangan_1 || '-'
      })
    }
    
    return groups
  }

  // Ambil tahun ajaran dari URL params atau store
  const tahunAjaranToUse = searchParams.get('tahun_ajaran') || tahunAjaran

  // Load data
  useEffect(() => {
    const loadData = async () => {
      const id = santriId || searchParams.get('id')
      if (!id) {
        setError('ID santri tidak ditemukan di URL.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        // Gunakan getSlimApiUrl untuk mendapatkan API URL yang benar (support subdomain api.alutsmani.id di production)
        const apiUrl = getSlimApiUrl()
        
        // Untuk mode tunggakan/khusus tidak perlu filter tahun_ajaran (load semua data)
        // Tahun ajaran hanya diperlukan untuk mode uwaba
        let url = `${apiUrl}/print?id_santri=${encodeURIComponent(id)}&page=${currentMode}`
        // Tidak perlu tambahkan tahun_ajaran untuk mode tunggakan/khusus
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
        
        setKwitansiData(data)
      } catch (e) {
        console.error('Error loading kwitansi data:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [santriId, searchParams, currentMode, tahunAjaran])

  const judulRincian = currentMode === 'khusus' ? 'Rincian Khusus' : 'Rincian Tunggakan'

  return (
    <div ref={printPageRef} className={`print-page print-kwitansi ${inOffcanvas ? 'print-kwitansi-in-offcanvas' : ''}`}>
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
          <div className="loading">Memuat data kwitansi...</div>
        )}
        {error && (
          <div className="error">{error}</div>
        )}
        {!loading && !error && kwitansiData && (
          <div id="content" className={columnCount === '2' ? 'layout-two-columns' : ''}>
            {columnCount === '2' ? (
              <>
                {/* First receipt instance */}
                <div className={`receipt-instance ${useColor ? 'receipt-blue' : ''}`}>
                  {/* Garis horizontal biru langit di atas header */}
                  {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
                  <ReceiptContent 
                    data={kwitansiData} 
                    formatRupiah={formatRupiah} 
                    formatTanggal={formatTanggal} 
                    getCurrentUrlWithParams={getCurrentUrlWithParams} 
                    user={user}
                    judulRincian={judulRincian}
                    groupPembayaran={groupPembayaran}
                    tahunAjaran={tahunAjaranToUse}
                    currentMode={currentMode}
                  />
                </div>
                {/* Second receipt instance */}
                <div className={`receipt-instance ${useColor ? 'receipt-green' : ''}`}>
                  {/* Garis horizontal biru langit di atas header */}
                  {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
                  <ReceiptContent 
                    data={kwitansiData} 
                    formatRupiah={formatRupiah} 
                    formatTanggal={formatTanggal} 
                    getCurrentUrlWithParams={getCurrentUrlWithParams} 
                    user={user}
                    judulRincian={judulRincian}
                    groupPembayaran={groupPembayaran}
                    tahunAjaran={tahunAjaranToUse}
                    currentMode={currentMode}
                  />
                </div>
              </>
            ) : (
              <div className={`receipt-instance ${useColor ? 'receipt-blue' : ''}`}>
                {/* Garis horizontal biru langit di atas header */}
                {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
                <ReceiptContent 
                  data={kwitansiData} 
                  formatRupiah={formatRupiah} 
                  formatTanggal={formatTanggal} 
                  getCurrentUrlWithParams={getCurrentUrlWithParams} 
                  user={user}
                  judulRincian={judulRincian}
                  groupPembayaran={groupPembayaran}
                  currentMode={currentMode}
                />
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

// Komponen untuk render konten receipt
function ReceiptContent({ data, formatRupiah, formatTanggal, getCurrentUrlWithParams, user, judulRincian, groupPembayaran, tahunAjaran, currentMode }) {
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
  
  const pembayaranGroups = groupPembayaran(pembayaran || [])
  const totalTunggakan = tunggakan ? tunggakan.reduce((sum, t) => sum + Number(t.wajib ?? t.total ?? 0), 0) : 0
  const totalBayar = pembayaran ? pembayaran.reduce((sum, p) => sum + Number(p.nominal || 0), 0) : 0

  return (
    <>
      <div className="header">
        <div style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
          <img src={getGambarUrl('/kop.png')} alt="Logo" className="header-logo" />
          <img src={getGambarUrl('/uwaba-4.png')} alt="Logo UWABA" className="header-logo" style={{maxWidth: '70px', height: 'auto'}} />
        </div>
        <div className="header-text">
          <h1>Kwitansi Pembayaran</h1>
          <p>Pesantren Salafiyah Al-Utsmani</p>
        </div>
      </div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px'}}>
        <table className="biodata-table" style={{flex: 1}}>
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
            <tr>
              <td className="biodata-label">NIM Formal</td>
              <td>: {biodata.nim_formal || '-'}</td>
            </tr>
          </tbody>
        </table>
        <div className="qr-code-container" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'}}>
          <a href={getCurrentUrlWithParams()} target="_blank" rel="noopener noreferrer" className="qr-code-link" title={currentMode ? `Klik untuk membuka halaman ${currentMode === 'khusus' ? 'Khusus' : 'Tunggakan'} santri` : 'Klik untuk membuka halaman santri'}>
            <img src={qrUrl} alt="QR Code" className="qr-code-image" />
          </a>
          <div style={{fontSize: '12px', fontWeight: 600, color: '#319795', textAlign: 'center'}}>
            {biodata.nis ?? biodata.id}
          </div>
        </div>
      </div>
      <div className="section-title">{judulRincian}</div>
      <table className="tabel-normal">
        <thead>
          <tr>
            <th>No</th>
            <th>Keterangan 1</th>
            <th>Tahun Ajaran</th>
            <th>Wajib</th>
            <th>Bayar</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(!tunggakan || tunggakan.length === 0) ? (
            <tr>
              <td colSpan="6" style={{textAlign: 'center', color: '#aaa', fontStyle: 'italic'}}>Tidak ada data.</td>
            </tr>
          ) : (
            <>
              {tunggakan.map((t, i) => {
                // Hitung kurang untuk status
                const wajib = t.wajib ?? t.total ?? 0
                const bayar = t.bayar || 0
                const kurang = Math.max(wajib - bayar, 0)
                
                // Format status text seperti di UWABA print
                let statusText = ''
                let statusClass = ''
                if (t.status === 'Lunas' || kurang <= 0) {
                  statusText = 'Lunas'
                  statusClass = 'Lunas'
                } else if (t.status === 'Kurang' || bayar > 0) {
                  statusText = `Kurang ${formatRupiah(kurang)}`
                  statusClass = 'Kurang'
                } else {
                  statusText = 'Belum Bayar'
                  statusClass = 'BelumBayar'
                }
                
                return (
                  <tr key={i}>
                    <td>{i+1}</td>
                    <td className="keterangan-1-col">{t.keterangan_1 || '-'}</td>
                    <td>{t.tahun_ajaran || '-'}</td>
                    <td>{formatRupiah(wajib)}</td>
                    <td>{formatRupiah(bayar)}</td>
                    <td>
                      <span className={`status ${statusClass}`}>
                        {statusText}
                      </span>
                    </td>
                  </tr>
                )
              })}
              <tr className="total-row">
                <td colSpan="3">Total</td>
                <td colSpan="3">{formatRupiah(totalTunggakan)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <div className="section-title">Riwayat Pembayaran</div>
      <table className="tabel-normal">
        <thead>
          <tr>
            <th>No</th>
            <th>Keterangan 1</th>
            <th>Jumlah</th>
            <th className="via-col">Via</th>
            <th>Tanggal</th>
            <th>Admin</th>
          </tr>
        </thead>
        <tbody>
          {(!pembayaran || pembayaran.length === 0) ? (
            <tr>
              <td colSpan="6" style={{textAlign: 'center', color: '#aaa', fontStyle: 'italic'}}>Tidak ada pembayaran.</td>
            </tr>
          ) : (
            <>
              {pembayaranGroups.map((g, i) => {
                // Parse tanggal dengan benar: backend mengirim 'Y-m-d H:i:s' dalam timezone Asia/Jakarta
                let tanggalDate
                if (g.tanggal) {
                  const dateStr = g.tanggal
                  if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+'))) {
                    tanggalDate = new Date(dateStr)
                  } else {
                    // Format 'Y-m-d H:i:s' tanpa timezone, anggap sebagai waktu lokal (WIB)
                    const [datePart, timePart] = dateStr.split(' ')
                    const [year, month, day] = datePart.split('-').map(Number)
                    const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number)
                    tanggalDate = new Date(year, month - 1, day, hour, minute, second || 0)
                  }
                } else {
                  tanggalDate = new Date()
                }
                const tanggalMasehi = tanggalDate.toISOString().slice(0, 10)
                
                return (
                  <tr key={i}>
                    <td>{g.no}</td>
                    <td className="keterangan-1-col" style={{textAlign: 'left', verticalAlign: 'middle'}}>
                      {g.keterangan_1 || '-'}
                    </td>
                    <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{formatRupiah(g.nominal)}</td>
                    <td className="via-col" style={{textAlign: 'center', verticalAlign: 'middle'}}>{g.via || '-'}</td>
                    <td style={{textAlign: 'center', verticalAlign: 'middle'}}>
                      <span style={{fontSize: '9px'}}>{tanggalMasehi}</span><br />
                      <span style={{fontSize: '9px', color: '#64748b', display: 'block'}}>{g.hijriyah || '-'}</span>
                    </td>
                    <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{g.admin}</td>
                  </tr>
                )
              })}
              <tr className="total-row">
                <td colSpan="4">Total Pembayaran</td>
                <td colSpan="2">{formatRupiah(totalBayar)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <div className="ttd-footer">
        <div className="ttd-box">
          <div className="ttd-space"></div>
          <div className="ttd-tanggal" style={{fontSize: '11px', color: '#64748b', marginBottom: '8px'}}>
            {formatTanggal(new Date())}
          </div>
          <div className="ttd-nama">{petugas}</div>
        </div>
      </div>
    </>
  )
}

export default PrintKwitansi

