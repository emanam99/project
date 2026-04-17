import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../../store/authStore'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { calculateWajibFromBiodata, mergeBiodataForUwabaPricing, bulanHijriyah } from '../../../utils/uwabaCalculator'
import { getSlimApiUrl } from '../../../services/api'
import { getGambarUrl } from '../../../config/images'
import './PrintUwaba.css'

const PRINT_UWABA_SETTINGS_KEY = 'print-uwaba-settings'

function loadPrintUwabaSettings() {
  try {
    const raw = localStorage.getItem(PRINT_UWABA_SETTINGS_KEY)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o.layoutMode === 'string' && typeof o.columnCount === 'string' && typeof o.useColor === 'boolean') {
        const layoutMode = ['portrait', 'landscape'].includes(o.layoutMode) ? o.layoutMode : 'portrait'
        const columnCount = ['1', '2'].includes(o.columnCount) ? o.columnCount : '1'
        return { layoutMode, columnCount, useColor: o.useColor }
      }
    }
  } catch (e) {
    // ignore
  }
  return null
}

function savePrintUwabaSettings(settings) {
  try {
    localStorage.setItem(PRINT_UWABA_SETTINGS_KEY, JSON.stringify(settings))
  } catch (e) {
    // ignore
  }
}

function PrintUwaba({ santriId, inOffcanvas = false }) {
  const [searchParams] = useSearchParams()
  const { user } = useAuthStore()
  const { tahunAjaran: tahunAjaranFromStore } = useTahunAjaranStore()
  const tahunAjaran = searchParams.get('tahun_ajaran') || tahunAjaranFromStore

  const saved = loadPrintUwabaSettings()
  const defaultsNotLoggedIn = { layoutMode: 'portrait', columnCount: '1', useColor: false }
  const defaultsLoggedIn = { layoutMode: 'portrait', columnCount: '2', useColor: true }
  const getInitial = () => saved || defaultsNotLoggedIn

  const [layoutMode, setLayoutMode] = useState(() => getInitial().layoutMode)
  const [columnCount, setColumnCount] = useState(() => getInitial().columnCount)
  const [useColor, setUseColor] = useState(() => getInitial().useColor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [uwabaData, setUwabaData] = useState(null)
  const pageStyleRef = useRef(null)
  const initialLoadDone = useRef(false)

  const isLoggedIn = () => {
    if (user && user.id) return true
    try {
      const userName = localStorage.getItem('user_name')
      const userId = localStorage.getItem('user_id')
      if (userName && userId) return true
    } catch (e) {}
    return false
  }

  // Sekali saja saat mount: jika belum ada simpanan di localStorage dan user login, pakai default login
  useEffect(() => {
    if (initialLoadDone.current) return
    initialLoadDone.current = true
    if (!localStorage.getItem(PRINT_UWABA_SETTINGS_KEY) && isLoggedIn()) {
      setLayoutMode(defaultsLoggedIn.layoutMode)
      setColumnCount(defaultsLoggedIn.columnCount)
      setUseColor(defaultsLoggedIn.useColor)
    }
  }, [])

  // Simpan ke localStorage setiap kali pengaturan berubah
  useEffect(() => {
    savePrintUwabaSettings({ layoutMode, columnCount, useColor })
  }, [layoutMode, columnCount, useColor])

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
      pageStyleRef.current.innerHTML = `@page { size: A4 portrait; margin: 3mm; }`
    } else {
      pageStyleRef.current.innerHTML = `@page { size: A4 landscape; margin: 2mm; }`
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

  // Link QR: arahkan ke halaman public santri (UWABA) agar saat scan langsung ke data santri tersebut
  const getCurrentUrlWithParams = () => {
    const id = santriId || searchParams.get('id')
    const baseUrl = window.location.origin + '/public/uwaba'
    let url = `${baseUrl}?id=${encodeURIComponent(id)}`
    const tahunAjaranToUse = searchParams.get('tahun_ajaran') || tahunAjaranFromStore
    if (tahunAjaranToUse) {
      url += `&tahun_ajaran=${encodeURIComponent(tahunAjaranToUse)}`
    }
    return url
  }

  // Load data when santriId is provided
  useEffect(() => {
    const idToLoad = santriId || searchParams.get('id')
    if (!idToLoad) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Gunakan getSlimApiUrl untuk mendapatkan API URL yang benar (support subdomain api.alutsmani.id di production)
        const apiUrl = getSlimApiUrl()
        
        // Tambahkan tahun_ajaran ke URL jika tersedia
        let url = `${apiUrl}/print?id_santri=${encodeURIComponent(idToLoad)}&page=uwaba`
        const tahunAjaranToUse = searchParams.get('tahun_ajaran') || tahunAjaranFromStore
        if (tahunAjaranToUse) {
          url += `&tahun_ajaran=${encodeURIComponent(tahunAjaranToUse)}`
        }
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
        
        setUwabaData(data)
      } catch (e) {
        console.error('Error loading uwaba data:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [santriId, searchParams, tahunAjaranFromStore])

  return (
    <div ref={printPageRef} className={`print-page print-uwaba ${inOffcanvas ? 'print-uwaba-in-offcanvas' : ''}`}>
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
          <div className="loading">Memuat data riwayat uwaba...</div>
        )}
        {error && (
          <div className="error">{error}</div>
        )}
        {!loading && !error && uwabaData && (
          <div id="content" className="layout-two-columns">
            {/* 1 kolom: satu receipt, layout sama dengan 2 kolom. 2 kolom: dua receipt. */}
            <div className={`receipt-instance ${useColor ? 'receipt-blue' : ''}`}>
              {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
              <ReceiptContentTwoColumns data={uwabaData} formatRupiah={formatRupiah} formatTanggal={formatTanggal} getCurrentUrlWithParams={getCurrentUrlWithParams} user={user} tahunAjaran={tahunAjaran} />
            </div>
            {columnCount === '2' && (
              <div className={`receipt-instance ${useColor ? 'receipt-green' : ''}`}>
                {useColor && <div className="top-border-line" style={{borderTop: '1pt solid #87CEEB', width: '100%', marginTop: '0', marginBottom: '12px'}}></div>}
                <ReceiptContentTwoColumns data={uwabaData} formatRupiah={formatRupiah} formatTanggal={formatTanggal} getCurrentUrlWithParams={getCurrentUrlWithParams} user={user} tahunAjaran={tahunAjaran} />
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

// Komponen untuk render konten receipt 1 kolom (tidak dipakai saat ini; layout 1 = sama dengan 2, satu receipt)
function ReceiptContent({ data, formatRupiah, formatTanggal, getCurrentUrlWithParams, user, tahunAjaran }) {
  const { biodata, tunggakan, pembayaran, uwaba_prices } = data
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

  // Bulan order dan names
  const bulanOrder = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8]
  const bulanNames = ["Dzul Qo'dah", 'Dzul Hijjah', 'Muharram', 'Shafar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Ula', 'Jumadil Akhir', 'Rajab', "Sya'ban"]
  const byId = {}
  ;(tunggakan || []).forEach(t => { byId[t.id_bulan] = t })
  
  let totalWajib = 0
  const bulanRows = bulanOrder.map((idBulan, idx) => {
    const indexNama = bulanOrder.indexOf(idBulan)
    const defaultNama = bulanNames[indexNama] || ('Bulan ' + idBulan)
    const t = byId[idBulan] || { keterangan_1: defaultNama, total: 0, bayar: 0, kurang: 0, status: 'Belum', is_disabled: 0 }
    
    if (Number(t.is_disabled) === 1) {
      return (
        <tr key={idBulan}>
          <td>{idx+1}</td>
          <td className="keterangan-1-col">{(t.keterangan_1 || defaultNama).replace(/<[^>]*>/g, '')}</td>
          <td colSpan={3} style={{textAlign: 'center', color: '#6b7280', fontStyle: 'italic'}}>Tidak Termasuk</td>
        </tr>
      )
    }
    
    // Hitung wajib
    let finalWajibValue = 0
    // Prioritas: wajib > total (total adalah alias dari wajib untuk uwaba)
    if (t.wajib && t.wajib > 0) {
      finalWajibValue = t.wajib
    } else if (t.total && t.total > 0) {
      finalWajibValue = t.total
    } else if (t.json && typeof t.json === 'string' && uwaba_prices) {
      try {
        const jsonData = JSON.parse(t.json)
        const merged = mergeBiodataForUwabaPricing(jsonData, biodata)
        if (merged && (merged.status_santri || merged.kategori)) {
          finalWajibValue = calculateWajibFromBiodata(merged, uwaba_prices)
        } else {
          finalWajibValue = calculateWajibFromBiodata(biodata, uwaba_prices)
        }
      } catch (e) {
        finalWajibValue = calculateWajibFromBiodata(biodata, uwaba_prices)
      }
    } else if (uwaba_prices) {
      finalWajibValue = calculateWajibFromBiodata(biodata, uwaba_prices)
    }
    
    const bayarValue = t.bayar || 0
    const kurangValue = Math.max(finalWajibValue - bayarValue, 0)
    
    let statusText = ''
    let statusClass = ''
    if (bayarValue >= finalWajibValue && finalWajibValue > 0) {
      statusText = 'Lunas'
      statusClass = 'Lunas'
    } else if (bayarValue > 0) {
      statusText = `Kurang ${formatRupiah(kurangValue)}`
      statusClass = 'Kurang'
    } else {
      statusText = 'Belum'
      statusClass = 'BelumBayar'
    }
    
    totalWajib += finalWajibValue
    
    return (
      <tr key={idBulan}>
        <td>{idx+1}</td>
        <td className="keterangan-1-col">{(t.keterangan_1 || defaultNama).replace(/<[^>]*>/g, '')}</td>
        <td className="wajib-col">{formatRupiah(finalWajibValue)}</td>
        <td className="bayar-col">{formatRupiah(bayarValue)}</td>
        <td className="status-col"><span className={`status ${statusClass}`}>{statusText}</span></td>
      </tr>
    )
  })

  const totalBayar = pembayaran ? pembayaran.reduce((sum, p) => sum + Number(p.nominal), 0) : 0
  const totalKurang = Math.max(totalWajib - totalBayar, 0)

  return (
    <>
      {/* Garis horizontal biru langit di atas header */}
      <div style={{borderTop: '1pt solid #87CEEB', width: '100%', marginBottom: '0'}}></div>
      <div className="header">
        <div style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
          <img src={getGambarUrl('/kop.png')} alt="Logo" className="header-logo" />
          <img src={getGambarUrl('/uwaba-4.png')} alt="Logo UWABA" className="header-logo" style={{maxWidth: '70px', height: 'auto'}} />
        </div>
        <div className="header-text" style={{textAlign: 'center', flex: 1}}>
          <h1>Riwayat Pembayaran Uwaba</h1>
          <p>Pesantren Salafiyah Al-Utsmani</p>
        </div>
        <div className="header-id" style={{fontSize: '1rem', fontWeight: 600, color: '#319795', textAlign: 'right'}}>
          {biodata.nis ?? biodata.id}
          {tahunAjaran && (
            <div style={{fontSize: '0.65rem', fontWeight: 400, color: '#64748b', marginTop: '4px'}}>
              {tahunAjaran}
            </div>
          )}
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
          </tbody>
        </table>
        <div className="qr-code-container">
          <a href={getCurrentUrlWithParams()} target="_blank" rel="noopener noreferrer" className="qr-code-link" title="Klik untuk membuka halaman UWABA santri">
            <img src={qrUrl} alt="QR Code" className="qr-code-image" />
          </a>
        </div>
      </div>
      <div className="section-title">Rincian Uwaba Per Bulan</div>
      <table className="tabel-normal">
        <thead>
          <tr>
            <th>No</th>
            <th>Bulan</th>
            <th>Wajib</th>
            <th>Bayar</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {bulanRows}
          <tr className="total-row">
            <td colSpan={3}><b>Total Wajib:</b> {formatRupiah(totalWajib)}</td>
            <td colSpan={2}><b>Kurang:</b> {formatRupiah(totalKurang)}</td>
          </tr>
        </tbody>
      </table>
      <div className="section-title">Riwayat Pembayaran Uwaba</div>
      <table className="tabel-normal">
        <thead>
          <tr>
            <th>No</th>
            <th>Jumlah</th>
            <th className="via-col">Via</th>
            <th>Tanggal</th>
            <th>Admin</th>
          </tr>
        </thead>
        <tbody>
          {(!pembayaran || pembayaran.length === 0) ? (
            <tr>
              <td colSpan={5} style={{textAlign: 'center', color: '#aaa', fontStyle: 'italic'}}>Tidak ada pembayaran uwaba.</td>
            </tr>
          ) : (
            <>
              {pembayaran.map((p, i) => {
                // Parse tanggal dengan benar: backend mengirim 'Y-m-d H:i:s' dalam timezone Asia/Jakarta
                let d
                if (p.tanggal_dibuat) {
                  const dateStr = p.tanggal_dibuat
                  if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+'))) {
                    d = new Date(dateStr)
                  } else {
                    // Format 'Y-m-d H:i:s' tanpa timezone, anggap sebagai waktu lokal (WIB)
                    const [datePart, timePart] = dateStr.split(' ')
                    const [year, month, day] = datePart.split('-').map(Number)
                    const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number)
                    d = new Date(year, month - 1, day, hour, minute, second || 0)
                  }
                } else {
                  d = new Date()
                }
                const tanggalMasehi = d.toLocaleDateString('id-ID', { weekday: 'long' }) + ' ' + d.toISOString().slice(0,10)
                const jam = String(d.getHours()).padStart(2, '0')
                const menit = String(d.getMinutes()).padStart(2, '0')
                const detik = String(d.getSeconds()).padStart(2, '0')
                const waktu = `${p.hijriyah || '-'} [${jam}.${menit}.${detik}]`
                
                return (
                  <tr key={i}>
                    <td>{i+1}</td>
                    <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{formatRupiah(p.nominal)}</td>
                    <td className="via-col" style={{textAlign: 'center', verticalAlign: 'middle'}}>{p.via || '-'}</td>
                    <td style={{textAlign: 'center', verticalAlign: 'middle'}}>
                      <span style={{fontSize: '7px', color: '#64748b'}}>{tanggalMasehi}</span><br />
                      <span style={{fontSize: '7px', color: '#64748b', display: 'block'}}>{waktu}</span>
                    </td>
                    <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{p.admin}</td>
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
      <div className="ttd-footer">
        <div className="ttd-box">
          <div className="ttd-label">Tanggal Cetak:</div>
          <div className="ttd-space"></div>
          <div className="ttd-nama">{formatTanggal(new Date())}</div>
        </div>
        <div className="ttd-box">
          <div className="ttd-label">Admin:</div>
          <div className="ttd-space"></div>
          <div className="ttd-nama">{petugas}</div>
        </div>
      </div>
    </>
  )
}

// Komponen untuk render konten receipt 2 kolom
function ReceiptContentTwoColumns({ data, formatRupiah, formatTanggal, getCurrentUrlWithParams, user, tahunAjaran }) {
  const { biodata, tunggakan, pembayaran, uwaba_prices } = data
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

  // Bulan order dan names
  const bulanOrder = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8]
  const bulanNames = ["Dzul Qo'dah", 'Dzul Hijjah', 'Muharram', 'Shafar', 'Rabiul Awal', 'Rabiul Akhir', 'Jumadil Ula', 'Jumadil Akhir', 'Rajab', "Sya'ban"]
  const byId = {}
  ;(tunggakan || []).forEach(t => { byId[t.id_bulan] = t })
  
  let totalWajib = 0
  const bulanRows = bulanOrder.map((idBulan, idx) => {
    const indexNama = bulanOrder.indexOf(idBulan)
    const defaultNama = bulanNames[indexNama] || ('Bulan ' + idBulan)
    const t = byId[idBulan] || { keterangan_1: defaultNama, total: 0, bayar: 0, kurang: 0, status: 'Belum', is_disabled: 0 }
    
    if (Number(t.is_disabled) === 1) {
      return (
        <tr key={idBulan}>
          <td>{idx+1}</td>
          <td className="keterangan-1-col">{(t.keterangan_1 || defaultNama).replace(/<[^>]*>/g, '')}</td>
          <td colSpan={3} style={{textAlign: 'center', color: '#6b7280', fontStyle: 'italic'}}>Tidak Termasuk</td>
        </tr>
      )
    }
    
    // Hitung wajib
    let finalWajibValue = 0
    // Prioritas: wajib > total (total adalah alias dari wajib untuk uwaba)
    if (t.wajib && t.wajib > 0) {
      finalWajibValue = t.wajib
    } else if (t.total && t.total > 0) {
      finalWajibValue = t.total
    } else if (t.json && typeof t.json === 'string' && uwaba_prices) {
      try {
        const jsonData = JSON.parse(t.json)
        const merged = mergeBiodataForUwabaPricing(jsonData, biodata)
        if (merged && (merged.status_santri || merged.kategori)) {
          finalWajibValue = calculateWajibFromBiodata(merged, uwaba_prices)
        } else {
          finalWajibValue = calculateWajibFromBiodata(biodata, uwaba_prices)
        }
      } catch (e) {
        finalWajibValue = calculateWajibFromBiodata(biodata, uwaba_prices)
      }
    } else if (uwaba_prices) {
      finalWajibValue = calculateWajibFromBiodata(biodata, uwaba_prices)
    }
    
    const bayarValue = t.bayar || 0
    const kurangValue = Math.max(finalWajibValue - bayarValue, 0)
    
    let statusText = ''
    let statusClass = ''
    if (bayarValue >= finalWajibValue && finalWajibValue > 0) {
      statusText = 'Lunas'
      statusClass = 'Lunas'
    } else if (bayarValue > 0) {
      statusText = `Kurang ${formatRupiah(kurangValue)}`
      statusClass = 'Kurang'
    } else {
      statusText = 'Belum'
      statusClass = 'BelumBayar'
    }
    
    totalWajib += finalWajibValue
    
    return (
      <tr key={idBulan}>
        <td>{idx+1}</td>
        <td className="keterangan-1-col">{(t.keterangan_1 || defaultNama).replace(/<[^>]*>/g, '')}</td>
        <td className="wajib-col">{formatRupiah(finalWajibValue)}</td>
        <td className="bayar-col">{formatRupiah(bayarValue)}</td>
        <td className="status-col"><span className={`status ${statusClass}`}>{statusText}</span></td>
      </tr>
    )
  })

  const totalBayar = pembayaran ? pembayaran.reduce((sum, p) => sum + Number(p.nominal), 0) : 0
  const totalKurang = Math.max(totalWajib - totalBayar, 0)

  return (
    <>
      <div className="header" style={{marginTop: '0'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '24px'}}>
          <img src={getGambarUrl('/kop.png')} alt="Logo" className="header-logo" />
          <img src={getGambarUrl('/uwaba-4.png')} alt="Logo UWABA" className="header-logo" style={{maxWidth: '70px', height: 'auto'}} />
        </div>
        <div className="header-text" style={{textAlign: 'center', flex: 1}}>
          <h1>Riwayat Pembayaran Uwaba</h1>
          <p>Pesantren Salafiyah Al-Utsmani</p>
        </div>
        <div className="header-id" style={{fontSize: '1rem', fontWeight: 600, color: '#319795', textAlign: 'right'}}>
          {biodata.nis ?? biodata.id}
          {tahunAjaran && (
            <div style={{fontSize: '0.65rem', fontWeight: 400, color: '#64748b', marginTop: '4px'}}>
              {tahunAjaran}
            </div>
          )}
        </div>
      </div>
      
      <div className="two-column-layout">
        {/* Kolom Kiri: Biodata dan Rincian Per Bulan */}
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
          
          <div className="section-title">Rincian Uwaba Per Bulan</div>
          <table className="tabel-normal">
            <thead>
              <tr>
                <th>No</th>
                <th>Bulan</th>
                <th>Wajib</th>
                <th>Bayar</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bulanRows}
              <tr className="total-row">
                <td colSpan={3}><b>Total Wajib:</b> {formatRupiah(totalWajib)}</td>
                <td colSpan={2}><b>Kurang:</b> {formatRupiah(totalKurang)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        {/* Garis Tengah Vertikal */}
        <div className="vertical-divider"></div>
        
        {/* Kolom Kanan: Riwayat Pembayaran, QR, dan Admin */}
        <div className="right-column">
          <div className="payment-info-section">
            <div className="qr-admin-row">
              <div className="qr-code-container">
                <a href={getCurrentUrlWithParams()} target="_blank" rel="noopener noreferrer" className="qr-code-link" title="Klik untuk membuka halaman UWABA santri">
                  <img src={qrUrl} alt="QR Code" className="qr-code-image" />
                </a>
              </div>
              <div className="admin-info">
                <div className="admin-label">Tanggal Cetak:</div>
                <div className="admin-name">{formatTanggal(new Date())}</div>
                <div className="admin-label" style={{marginTop: '10px'}}>Admin:</div>
                <div className="admin-name">{petugas}</div>
              </div>
            </div>
          </div>
          
          <div className="section-title">Riwayat Pembayaran Uwaba</div>
          <table className="tabel-normal">
            <thead>
              <tr>
                <th>No</th>
                <th>Jumlah</th>
                <th className="via-col">Via</th>
                <th>Tanggal</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {(!pembayaran || pembayaran.length === 0) ? (
                <tr>
                  <td colSpan={5} style={{textAlign: 'center', color: '#aaa', fontStyle: 'italic'}}>Tidak ada pembayaran uwaba.</td>
                </tr>
              ) : (
                <>
                  {pembayaran.map((p, i) => {
                    // Parse tanggal dengan benar: backend mengirim 'Y-m-d H:i:s' dalam timezone Asia/Jakarta
                    let d
                    if (p.tanggal_dibuat) {
                      const dateStr = p.tanggal_dibuat
                      if (dateStr.includes('T') && (dateStr.includes('Z') || dateStr.includes('+'))) {
                        d = new Date(dateStr)
                      } else {
                        // Format 'Y-m-d H:i:s' tanpa timezone, anggap sebagai waktu lokal (WIB)
                        const [datePart, timePart] = dateStr.split(' ')
                        const [year, month, day] = datePart.split('-').map(Number)
                        const [hour, minute, second] = (timePart || '00:00:00').split(':').map(Number)
                        d = new Date(year, month - 1, day, hour, minute, second || 0)
                      }
                    } else {
                      d = new Date()
                    }
                    const tanggalMasehi = d.toLocaleDateString('id-ID', { weekday: 'long' }) + ' ' + d.toISOString().slice(0,10)
                    const jam = String(d.getHours()).padStart(2, '0')
                    const menit = String(d.getMinutes()).padStart(2, '0')
                    const detik = String(d.getSeconds()).padStart(2, '0')
                    const waktu = `${p.hijriyah || '-'} [${jam}.${menit}.${detik}]`
                    
                    return (
                      <tr key={i}>
                        <td>{i+1}</td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{formatRupiah(p.nominal)}</td>
                        <td className="via-col" style={{textAlign: 'center', verticalAlign: 'middle'}}>{p.via || '-'}</td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle'}}>
                          <span style={{fontSize: '7px', color: '#64748b'}}>{tanggalMasehi}</span><br />
                          <span style={{fontSize: '7px', color: '#64748b', display: 'block'}}>{waktu}</span>
                        </td>
                        <td style={{textAlign: 'center', verticalAlign: 'middle'}}>{p.admin}</td>
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

export default PrintUwaba

