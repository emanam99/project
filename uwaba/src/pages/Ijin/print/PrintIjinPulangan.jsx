import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { santriAPI } from '../../../services/api'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getSantriQrCode } from '../../../utils/qrCodeCache'
import { getGambarUrl } from '../../../config/images'
import './PrintIjinPulangan.css'

function PrintIjinPulangan({ santriId, inOffcanvas = false }) {
  const [searchParams] = useSearchParams()
  const { tahunAjaran: tahunAjaranFromStore } = useTahunAjaranStore()
  const tahunAjaran = searchParams.get('tahun_ajaran') || tahunAjaranFromStore
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [santriData, setSantriData] = useState(null)
  const [liburRamadhanData, setLiburRamadhanData] = useState(null)

  // Load data libur ramadhan dari JSON
  useEffect(() => {
    const loadLiburRamadhan = async () => {
      try {
        const response = await fetch('/js/ijin/libur-ramadhan.json')
        if (response.ok) {
          const data = await response.json()
          setLiburRamadhanData(data)
        } else {
          console.warn('File libur-ramadhan.json tidak ditemukan')
        }
      } catch (e) {
        console.error('Error loading libur ramadhan data:', e)
      }
    }

    loadLiburRamadhan()
  }, [])

  // Load data santri
  useEffect(() => {
    const idToLoad = santriId || searchParams.get('id_santri')
    
    if (!idToLoad) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
        // Load data santri menggunakan santriAPI
        const santriResult = await santriAPI.getById(idToLoad)
        
        if (!santriResult.success) {
          throw new Error(santriResult.message || 'Gagal mengambil data santri')
        }
        
        setSantriData(santriResult.data)
      } catch (e) {
        console.error('Error loading santri data:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [santriId, searchParams])

  const getCurrentDate = () => {
    const now = new Date()
    const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    
    return `${hari[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')} ${bulan[now.getMonth()]} ${now.getFullYear()}`
  }

  // Tentukan kategori santri untuk libur ramadhan
  const getKategoriLiburRamadhan = (santri) => {
    if (!santri) return null

    const kategori = santri.kategori || ''
    const diniyah = santri.diniyah || ''
    const kelasDiniyah = santri.kelas_diniyah || ''
    
    // Cek apakah 3 Ulya (diniyah = "Ulya" atau kelas_diniyah mengandung "3" atau "Ulya")
    const is3Ulya = diniyah === 'Ulya' || 
                    kelasDiniyah.includes('3') || 
                    kelasDiniyah.includes('Ulya') ||
                    kelasDiniyah.includes('ulya')

    if (is3Ulya) {
      if (kategori === 'Banin') {
        return '3_ulya_banin'
      } else if (kategori === 'Banat') {
        return '3_ulya_banat'
      }
    } else {
      if (kategori === 'Banin') {
        return 'banin'
      } else if (kategori === 'Banat') {
        return 'banat'
      }
    }

    // Fallback: berdasarkan gender jika kategori tidak jelas
    const gender = (santri.gender || '').toLowerCase()
    if (gender.includes('laki') || gender === 'l') {
      return is3Ulya ? '3_ulya_banin' : 'banin'
    } else if (gender.includes('perempuan') || gender === 'p') {
      return is3Ulya ? '3_ulya_banat' : 'banat'
    }

    return null
  }

  // Ambil tanggal dari JSON berdasarkan kategori
  const getTanggalLiburRamadhan = () => {
    if (!liburRamadhanData || !santriData) {
      return { dari: '', sampai: '' }
    }

    const kategoriKey = getKategoriLiburRamadhan(santriData)
    if (!kategoriKey || !liburRamadhanData.kategori[kategoriKey]) {
      return { dari: '', sampai: '' }
    }

    return {
      dari: liburRamadhanData.kategori[kategoriKey].dari || '',
      sampai: liburRamadhanData.kategori[kategoriKey].sampai || ''
    }
  }

  if (loading) {
    return (
      <div className="print-ijin-pulangan-container">
        <div className="loading">Memuat data surat ijin pulangan...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="print-ijin-pulangan-container">
        <div className="error">{error}</div>
      </div>
    )
  }

  if (!santriData) {
    return (
      <div className="print-ijin-pulangan-container">
        <div className="error">Data tidak ditemukan</div>
      </div>
    )
  }

  return (
    <div className={`print-ijin-pulangan-page ${inOffcanvas ? 'print-ijin-pulangan-in-offcanvas' : ''}`}>
      <div className="print-ijin-pulangan-container">
        <div
          className="surat-ijin-pulangan"
          style={{ '--bg-image': `url(${getGambarUrl('/bg/bg.webp')})` }}
        >
          {/* Header dengan Logo */}
          <div className="surat-header">
            <div className="header-left">
              <img src={getGambarUrl('/logo.png')} alt="Logo Pesantren" className="logo" />
            </div>
            <div className="header-right">
              <h1 className="judul-surat">Surat Ijin Libur Ramadhan</h1>
              <h2 className="sub-judul-surat">Pesantren Salafiyah Al-Utsmani</h2>
              <p className="alamat-pesantren">Beddian RT 29 RW 06 Jambesari Jambesari DS</p>
            </div>
          </div>

          {/* Isi Surat */}
          <div className="isi-surat">
            <p className="paragraf paragraf-intro">
              Yang bertanda tangan di bawah ini, pengurus Pesantren Salafiyah Al-Utsmani Beddian bagian Keamanan dan Ketertiban memberikan ijin kepada:
            </p>

            <div className="data-santri">
              <table className="table-data">
                <tbody>
                  <tr>
                    <td className="label">Nama</td>
                    <td className="separator">:</td>
                    <td className="value">{santriData.nama || '-'}</td>
                  </tr>
                  <tr>
                    <td className="label">NIS</td>
                    <td className="separator">:</td>
                    <td className="value">{santriData.id || '-'}</td>
                  </tr>
                  <tr>
                    <td className="label">Ayah</td>
                    <td className="separator">:</td>
                    <td className="value">{santriData.ayah || '-'}</td>
                  </tr>
                  <tr>
                    <td className="label">Ibu</td>
                    <td className="separator">:</td>
                    <td className="value">{santriData.ibu || '-'}</td>
                  </tr>
                  <tr>
                    <td className="label">Alamat</td>
                    <td className="separator">:</td>
                    <td className="value">
                      {[
                        santriData.dusun,
                        santriData.rt ? `RT ${santriData.rt}` : '',
                        santriData.rw ? `RW ${santriData.rw}` : '',
                        santriData.desa,
                        santriData.kecamatan,
                        santriData.kabupaten
                      ].filter(Boolean).join(', ') || '-'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="paragraf">
              Untuk pulang dan berlibur di rumahnya selama bulan Ramadhan tahun ajaran <strong>{tahunAjaran || '-'}</strong>:
            </p>

            {(() => {
              const tanggalLibur = getTanggalLiburRamadhan()
              if (tanggalLibur.dari || tanggalLibur.sampai) {
                return (
                  <div className="tanggal-libur-section">
                    <table className="table-data">
                      <tbody>
                        {tanggalLibur.dari && (
                          <tr>
                            <td className="label">Dari</td>
                            <td className="separator">:</td>
                            <td className="value"><strong>{tanggalLibur.dari}</strong></td>
                          </tr>
                        )}
                        {tanggalLibur.sampai && (
                          <tr>
                            <td className="label">Sampai</td>
                            <td className="separator">:</td>
                            <td className="value"><strong>{tanggalLibur.sampai}</strong></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              }
              return null
            })()}

            <p className="paragraf">
              Paling akhir jam <strong>05.00 Istiwa'</strong> harus sudah berada di pesantren.
            </p>

            <p className="paragraf">
              Demikian Surat ijin ini diberikan, untuk digunakan sebagaimana mestinya.
            </p>
          </div>

          {/* Tanda Tangan */}
          <div className="ttd-section">
            <div className="ttd-left">
              {santriData?.id && (() => {
                const qrUrl = `${window.location.origin}/public/santri?id=${santriData.id}`
                const qrCodeUrl = getSantriQrCode(santriData.id, 'santri', 100)
                return (
                  <div className="qr-code-container">
                    <a 
                      href={qrUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="qr-code-link"
                      title="Klik untuk membuka biodata santri"
                    >
                      <img 
                        src={qrCodeUrl} 
                        alt="QR Code" 
                        className="qr-code-image" 
                      />
                    </a>
                    <div className="qr-code-id">
                      ID: {santriData.id}
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="ttd-right">
              <p>Beddian, 10 Sya'ban 1447</p>
              <p>Ketua Keamanan & Ketertiban</p>
              <div className="ttd-image-container">
                <img src={getGambarUrl('/ttd-ra-faqih.png')} alt="Tanda Tangan" className="ttd-image" />
              </div>
              <p className="ttd-name">KH. Ahmad Faqih Subhan</p>
            </div>
          </div>

          {/* Keterangan */}
          <div className="keterangan-section">
            <p className="keterangan-title">Keterangan:</p>
            <ol className="keterangan-list">
              <li>Semua santri harus menjaga nama baik PPS. Al-Utsman dan muru'ah sebagai seorang santri.</li>
              <li>Sesudah kembali ke PPS. Al-Utsmani, surat ini wajib diserahkan pada Kepala Daerah.</li>
              <li>Terlambat dari ketentuan jam kembali, harus diantar oleh wali untuk memper-tanggungjawabkan pada Kepala Daerah.</li>
              <li>Terlambat 15 hari dari ketentuan tanpa keterangan dianggap boyong / berhenti.</li>
            </ol>
          </div>

          {/* Garis Penanda Bawah */}
          <div className="garis-penanda-bawah"></div>
        </div>
      </div>
    </div>
  )
}

export default PrintIjinPulangan
