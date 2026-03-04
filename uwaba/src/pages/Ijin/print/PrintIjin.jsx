import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { santriAPI, ijinAPI } from '../../../services/api'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getGambarUrl } from '../../../config/images'
import './PrintIjin.css'

function PrintIjin({ santriId, ijinId, inOffcanvas = false }) {
  const [searchParams] = useSearchParams()
  const { tahunAjaran: tahunAjaranFromStore } = useTahunAjaranStore()
  const tahunAjaran = searchParams.get('tahun_ajaran') || tahunAjaranFromStore
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [ijinData, setIjinData] = useState(null)
  const [santriData, setSantriData] = useState(null)

  // Load data ijin dan santri
  useEffect(() => {
    const idToLoad = santriId || searchParams.get('id_santri')
    const ijinIdToLoad = ijinId || searchParams.get('ijin_id')
    
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

        // Load data ijin
        const ijinResult = await ijinAPI.get(idToLoad, tahunAjaran)
        if (!ijinResult.success) {
          throw new Error(ijinResult.message || 'Gagal mengambil data ijin')
        }

        // Jika ada ijinId, filter hanya ijin tersebut
        if (ijinIdToLoad && ijinResult.data) {
          const selectedIjin = ijinResult.data.find(i => i.id === ijinIdToLoad)
          setIjinData(selectedIjin ? [selectedIjin] : ijinResult.data)
        } else {
          setIjinData(ijinResult.data || [])
        }
      } catch (e) {
        console.error('Error loading ijin data:', e)
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [santriId, ijinId, searchParams, tahunAjaran])

  const formatTanggal = (tgl) => {
    if (!tgl) return '-'
    // Format tanggal dari string seperti "Sabtu, 02 Muharram 1447 - 28/06/2025"
    return tgl
  }

  const getCurrentDate = () => {
    const now = new Date()
    const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
    
    return `${hari[now.getDay()]}, ${String(now.getDate()).padStart(2, '0')} ${bulan[now.getMonth()]} ${now.getFullYear()}`
  }

  if (loading) {
    return (
      <div className="print-ijin-container">
        <div className="loading">Memuat data surat ijin...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="print-ijin-container">
        <div className="error">{error}</div>
      </div>
    )
  }

  if (!santriData || !ijinData || ijinData.length === 0) {
    return (
      <div className="print-ijin-container">
        <div className="error">Data tidak ditemukan</div>
      </div>
    )
  }

  return (
    <div className={`print-ijin-page ${inOffcanvas ? 'print-ijin-in-offcanvas' : ''}`}>
      <div className="print-ijin-container">
        {ijinData.map((ijin, index) => (
          <div key={ijin.id || index} className="surat-ijin">
            {/* Header dengan Logo */}
            <div className="surat-header">
              <div className="header-left">
                <img src={getGambarUrl('/logo.png')} alt="Logo Pesantren" className="logo" />
              </div>
              <div className="header-right">
                <h1 className="judul-surat">Perijinan Pesantren Salafiyah Al-Utsmani</h1>
                <p className="alamat-pesantren">Beddian Jambesari Darus Sholah</p>
              </div>
            </div>

            {/* Garis Pembatas */}
            <div className="garis-pembatas"></div>

            {/* Nomor Surat */}
            <div className="nomor-surat">
              <p>Nomor: {ijin.id || '-'}</p>
            </div>

            {/* Isi Surat */}
            <div className="isi-surat">
              <p className="paragraf">
                Yang bertanda tangan di bawah ini, Kepala Pesantren Salafiyah Al-Utsmani, memberikan izin kepada:
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
                      <td className="label">Kelas</td>
                      <td className="separator">:</td>
                      <td className="value">
                        {[
                          santriData.kelas_diniyah,
                          santriData.kelas_formal
                        ].filter(Boolean).join(' / ') || '-'}
                      </td>
                    </tr>
                    {ijin.alasan && (
                      <tr>
                        <td className="label">Alasan</td>
                        <td className="separator">:</td>
                        <td className="value">{ijin.alasan}</td>
                      </tr>
                    )}
                    {ijin.dari && (
                      <tr>
                        <td className="label">Dari</td>
                        <td className="separator">:</td>
                        <td className="value">{ijin.dari}</td>
                      </tr>
                    )}
                    {ijin.sampai && (
                      <tr>
                        <td className="label">Sampai</td>
                        <td className="separator">:</td>
                        <td className="value">{ijin.sampai}</td>
                      </tr>
                    )}
                    {ijin.lama && (
                      <tr>
                        <td className="label">Lama</td>
                        <td className="separator">:</td>
                        <td className="value">{ijin.lama}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="paragraf">
                Demikian surat ijin ini dibuat untuk dapat dipergunakan sebagaimana mestinya.
              </p>
            </div>

            {/* Tanda Tangan */}
            <div className="ttd-section">
              <div className="ttd-left">
                <p>Mengetahui,</p>
                <p>Orang Tua/Wali</p>
                <div className="ttd-space"></div>
                <p className="ttd-name">({santriData.ayah || santriData.wali || 'Orang Tua/Wali'})</p>
              </div>
              <div className="ttd-right">
                <p>Beddian, {getCurrentDate()}</p>
                <p>Kepala Pesantren</p>
                <div className="ttd-space"></div>
                <p className="ttd-name">Kepala Pesantren</p>
              </div>
            </div>

            {/* Footer */}
            {ijin.perpanjang && (
              <div className="footer-note">
                <p><strong>Catatan:</strong> {ijin.perpanjang}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PrintIjin
