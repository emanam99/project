import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { santriAPI } from '../../../services/api'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { getSantriQrCode } from '../../../utils/qrCodeCache'
import './PrintShofifahSantri.css'

function PrintShohifahSantri({ santriId, inOffcanvas = false, qrCodeOverride = null }) {
  const [searchParams] = useSearchParams()
  const { tahunAjaran: tahunAjaranFromStore } = useTahunAjaranStore()
  const tahunAjaran = searchParams.get('tahun_ajaran') || tahunAjaranFromStore
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [santriData, setSantriData] = useState(null)

  // Load data santri
  useEffect(() => {
    const idToLoad = santriId || searchParams.get('id_santri')
    
    if (!idToLoad) return

    const loadData = async () => {
      setLoading(true)
      setError(null)
      try {
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

  if (loading) {
    return (
      <div className="print-shohifah-container">
        <div className="loading">Memuat data Shohifah Santri...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="print-shohifah-container">
        <div className="error">{error}</div>
      </div>
    )
  }

  if (!santriData) {
    return (
      <div className="print-shohifah-container">
        <div className="error">Data tidak ditemukan</div>
      </div>
    )
  }

  const qrUrl = santriData?.id ? `${window.location.origin}/public/shohifah?id=${santriData.id}` : ''
  // Gunakan qrCodeOverride jika ada (dari cache), jika tidak generate baru dengan cache
  const qrCodeImageUrl = qrCodeOverride || (santriData?.id ? getSantriQrCode(santriData.id, 'shohifah', 120) : '')

  return (
    <div className={`print-shohifah-page ${inOffcanvas ? 'print-shohifah-in-offcanvas' : ''}`}>
      <div className="print-shohifah-container">
        <div className="shohifah-layout">
          {/* Bagian Kiri - Dibagi 2 */}
          <div className="shohifah-left">
            {/* Atas: Judul dan QR */}
            <div className="shohifah-left-top">
              <h1 className="shohifah-title">Shohifah Santri</h1>
              {qrCodeImageUrl && (
                <div className="shohifah-qr-container">
                  <img 
                    src={qrCodeImageUrl} 
                    alt="QR Code" 
                    className="shohifah-qr-image" 
                  />
                  <div className="shohifah-qr-instruction">Silahkan Scan Untuk mengisi Shohifah Online</div>
                  <div className="shohifah-qr-id">ID: {santriData.id}</div>
                </div>
              )}
            </div>
            
            {/* Bawah: Biodata */}
            <div className="shohifah-left-bottom">
              <h2 className="shohifah-section-title">Biodata Santri</h2>
              <div className="shohifah-biodata">
                <div className="biodata-row">
                  <span className="biodata-label">Nama:</span>
                  <span className="biodata-value">{santriData.nama || '-'}</span>
                </div>
                <div className="biodata-row">
                  <span className="biodata-label">NIS:</span>
                  <span className="biodata-value">{santriData.id || '-'}</span>
                </div>
                <div className="biodata-row">
                  <span className="biodata-label">Ayah:</span>
                  <span className="biodata-value">{santriData.ayah || '-'}</span>
                </div>
                <div className="biodata-row">
                  <span className="biodata-label">Ibu:</span>
                  <span className="biodata-value">{santriData.ibu || '-'}</span>
                </div>
                <div className="biodata-row">
                  <span className="biodata-label">Alamat:</span>
                  <span className="biodata-value">
                    {[
                      santriData.dusun,
                      santriData.rt ? `RT ${santriData.rt}` : '',
                      santriData.rw ? `RW ${santriData.rw}` : '',
                      santriData.desa,
                      santriData.kecamatan,
                      santriData.kabupaten
                    ].filter(Boolean).join(', ') || '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bagian Kanan: Form Wali */}
          <div className="shohifah-right">
            <div className="shohifah-form-wrapper">
              <h2 className="shohifah-form-title">Catatan Wali Santri</h2>
              <div className="shohifah-form">
                {/* 1. Sholat Jamaah 5 Waktu */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">1. Sholat Jamaah 5 Waktu:</label>
                    <div className="option-group">
                      <span className="option-item">(Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Sama Sekali)</span>
                    </div>
                  </div>
                </div>

                {/* 2. Sholat Sunnah */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">2. Sholat Sunnah:</label>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">A. Tarawih:</label>
                    <div className="option-group">
                      <span className="option-item">(Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Sama Sekali)</span>
                    </div>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">B. Witir:</label>
                    <div className="option-group">
                      <span className="option-item">(Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Sama Sekali)</span>
                    </div>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">C. Tahajjud:</label>
                    <div className="option-group">
                      <span className="option-item">(Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Sama Sekali)</span>
                    </div>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">D. Dhuha:</label>
                    <div className="option-group">
                      <span className="option-item">(Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Aktif</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Sama Sekali)</span>
                    </div>
                  </div>
                </div>

                {/* 3. Puasa Ramadhan */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">3. Puasa Ramadhan:</label>
                    <div className="option-group">
                      <span className="option-item">(Tamam</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak karena</span>
                      <div className="form-input-inline"></div>
                      <span className="option-item">)</span>
                    </div>
                  </div>
                </div>

                {/* 4. Khatam Al-Quran */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">4. Khatam Al-Quran:</label>
                    <div className="option-group">
                      <div className="form-input-inline"></div>
                      <span className="option-item">X, Tanggal:</span>
                      <div className="form-input-inline"></div>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Khatam)</span>
                    </div>
                  </div>
                </div>

                {/* 5. Kitab / Pelajaran yang dimutolaah */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">5. Kitab / Pelajaran yang dimutolaah:</label>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">A.</label>
                    <div className="form-input-inline"></div>
                    <span className="option-item">:</span>
                    <div className="option-group">
                      <span className="option-item">(Khatam</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak)</span>
                    </div>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">B.</label>
                    <div className="form-input-inline"></div>
                    <span className="option-item">:</span>
                    <div className="option-group">
                      <span className="option-item">(Khatam</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak)</span>
                    </div>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">C.</label>
                    <div className="form-input-inline"></div>
                    <span className="option-item">:</span>
                    <div className="option-group">
                      <span className="option-item">(Khatam</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak)</span>
                    </div>
                  </div>
                </div>

                {/* 6. Berbakti pada orang tua */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">6. Berbakti pada orang tua:</label>
                    <div className="option-group">
                      <span className="option-item">(Baik</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Kurang Baik</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Baik)</span>
                    </div>
                  </div>
                </div>

                {/* 7. Akhlaq & Pergaulan sehari2 */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">7. Akhlaq & Pergaulan sehari2:</label>
                    <div className="option-group">
                      <span className="option-item">(Baik</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Kurang Baik</span>
                      <span className="option-item">|</span>
                      <span className="option-item">Tidak Baik)</span>
                    </div>
                  </div>
                </div>

                {/* 8. Bulan Syawal kembali ke pondok */}
                <div className="form-section-box">
                  <div className="form-field-row">
                    <label className="form-label">8. Bulan Syawal kembali ke pondok pada:</label>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">Hari:</label>
                    <div className="form-input-inline"></div>
                  </div>
                  <div className="form-sub-item">
                    <label className="form-label">Tanggal:</label>
                    <div className="form-input-inline"></div>
                  </div>
                </div>

                {/* Tanda Tangan Orang Tua */}
                <div className="form-signature-box">
                  <div className="signature-title">Tanda Tangan Orang Tua</div>
                  <div className="signature-row">
                    <div className="signature-item">
                      <div className="signature-name-field">{santriData.ayah || ''}</div>
                      <label className="signature-label">Ayah</label>
                    </div>
                    <div className="signature-item">
                      <div className="signature-name-field">{santriData.ibu || ''}</div>
                      <label className="signature-label">Ibu</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrintShohifahSantri
