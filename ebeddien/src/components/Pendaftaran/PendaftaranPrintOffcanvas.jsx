import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { checkWhatsAppNumber } from '../../utils/whatsappCheck'
import { getSlimApiUrl, waAPI, chatAPI } from '../../services/api'
import PrintPendaftaran from '../../pages/Pendaftaran/print/PrintPendaftaran'
import '../Payment/PrintOffcanvas.css'

function PendaftaranPrintOffcanvas({ isOpen, onClose, santriId }) {
  const [printKwitansi, setPrintKwitansi] = useState(true)
  const [printBiodataForm, setPrintBiodataForm] = useState(true)
  const [printRaporTes, setPrintRaporTes] = useState(false)
  const [printUrl, setPrintUrl] = useState('')
  const [waNumber, setWaNumber] = useState('')
  const [waStatus, setWaStatus] = useState({ text: '', type: '', visible: false }) // type: 'success', 'error', 'checking'
  const [isCheckingWA, setIsCheckingWA] = useState(false)
  const [isSendingWA, setIsSendingWA] = useState(false)
  const [waRegistered, setWaRegistered] = useState(false)
  const [pendaftaranData, setPendaftaranData] = useState(null)
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const { tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()

  // Load data untuk WA
  useEffect(() => {
    if (isOpen && santriId && /^\d{7}$/.test(santriId)) {
      loadPendaftaranDataForWA()
    }
  }, [isOpen, santriId])

  // Set URL dan user data
  useEffect(() => {
    if (isOpen && santriId && /^\d{7}$/.test(santriId)) {
      // Generate URL untuk PrintPendaftaran.jsx (React component)
      // Gunakan route /print-pendaftaran dengan query parameter id + tahun ajaran
      const baseUrl = window.location.origin

      const params = new URLSearchParams()
      params.set('id', santriId)
      params.set('page', 'pendaftaran')

      // Sertakan tahun ajaran hijriyah & masehi agar link spesifik per tahun ajaran
      if (tahunAjaran) {
        params.set('tahun_hijriyah', tahunAjaran)
      }
      if (tahunAjaranMasehi) {
        params.set('tahun_masehi', tahunAjaranMasehi)
      }

      // Tambahkan timestamp untuk force reload jika diperlukan
      params.set('_t', Date.now().toString())

      const url = `${baseUrl}/print-pendaftaran?${params.toString()}`
      setPrintUrl(url)
    }
  }, [isOpen, santriId, user, tahunAjaran, tahunAjaranMasehi])

  useEffect(() => {
    if (isOpen) {
      setPrintKwitansi(true)
      setPrintBiodataForm(true)
      setPrintRaporTes(false)
    }
  }, [isOpen, santriId])

  // Tambahkan class ke body ketika offcanvas terbuka untuk deteksi print
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('print-offcanvas-open')
    } else {
      document.body.classList.remove('print-offcanvas-open')
    }
    
    return () => {
      document.body.classList.remove('print-offcanvas-open')
    }
  }, [isOpen])

  const loadPendaftaranDataForWA = async () => {
    try {
      // Gunakan getSlimApiUrl untuk mendapatkan API URL yang benar (support subdomain api.alutsmani.id di production)
      const apiUrl = getSlimApiUrl()

      const params = new URLSearchParams()
      params.set('id_santri', encodeURIComponent(santriId))
      params.set('page', 'pendaftaran')

      // Sertakan tahun ajaran hijriyah & masehi agar data registrasi yang diambil spesifik tahun ajaran
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
      
      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setPendaftaranData(data)
          // Auto-fill nomor WA dari biodata
          if (data.biodata) {
            const nomorTelepon = data.biodata.whatsapp || data.biodata.no_telpon || data.biodata.no_telp || data.biodata.telepon || ''
            if (nomorTelepon) {
              setWaNumber(nomorTelepon.trim())
              // Auto-cek nomor setelah diisi
              setTimeout(() => {
                handleCheckWA()
              }, 500)
            }
          }
        }
      }
    } catch (e) {
      console.error('Error loading pendaftaran data for WA:', e)
    }
  }

  const handleCopyUrl = () => {
    if (printUrl) {
      // printUrl sudah menggunakan path absolut, jadi langsung gunakan
      navigator.clipboard.writeText(printUrl).then(() => {
        showNotification('Link berhasil disalin!', 'success')
      }).catch(err => {
        console.error('Failed to copy URL:', err)
        showNotification('Gagal menyalin link', 'error')
      })
    }
  }

  const handleCheckWA = async () => {
    const nomorTelepon = waNumber.trim()
    
    if (!nomorTelepon || nomorTelepon === '') {
      setWaStatus({ text: 'Masukkan nomor terlebih dahulu', type: 'error', visible: true })
      setWaRegistered(false)
      return
    }
    
    setIsCheckingWA(true)
    setWaStatus({ text: 'Sedang mengecek...', type: 'checking', visible: true })
    setWaRegistered(false)
    
    try {
      const result = await checkWhatsAppNumber(nomorTelepon)
      
      if (result.success && result.isRegistered) {
        setWaStatus({ text: 'Nomor terdaftar di WhatsApp', type: 'success', visible: true })
        setWaRegistered(true)
      } else {
        setWaStatus({ text: result.message || 'Nomor tidak terdaftar di WhatsApp', type: 'error', visible: true })
        setWaRegistered(false)
      }
    } catch (error) {
      console.error('Error checking WhatsApp number:', error)
      setWaStatus({ text: 'Error: ' + (error.message || 'Gagal mengecek nomor'), type: 'error', visible: true })
      setWaRegistered(false)
    } finally {
      setIsCheckingWA(false)
    }
  }

  const handleSendWA = async () => {
    if (!pendaftaranData || !pendaftaranData.biodata) {
      showNotification('Data santri belum dimuat. Silakan tunggu sebentar.', 'error')
      return
    }

    const nomorTelepon = waNumber.trim()
    
    if (!nomorTelepon || nomorTelepon === '') {
      showNotification('Nomor WhatsApp tidak ditemukan.\n\nSilakan masukkan nomor terlebih dahulu dan pastikan nomor terdaftar di WhatsApp.', 'error')
      return
    }
    
    if (!waRegistered) {
      showNotification('Nomor WhatsApp belum terdaftar atau belum dicek.\n\nSilakan klik tombol "Cek Nomor" terlebih dahulu.', 'error')
      return
    }

    const biodata = pendaftaranData.biodata
    const namaSantri = biodata.nama || biodata.id || 'Santri'

    // Buat pesan yang akan dikirim
    const urlRiwayat = printUrl
    
    const totalWajib = pendaftaranData.tunggakan ? pendaftaranData.tunggakan.reduce((sum, t) => {
      return sum + Number(t.total || 0)
    }, 0) : 0
    const totalBayar = pendaftaranData.pembayaran ? pendaftaranData.pembayaran.reduce((sum, p) => {
      return sum + Number(p.nominal || 0)
    }, 0) : 0
    const kurang = Math.max(totalWajib - totalBayar, 0)

    const message = `Assalamu'alaikum Warahmatullahi Wabarakatuh

*Riwayat Pembayaran Pendaftaran*
*Pesantren Salafiyah Al-Utsmani*

Nama: ${namaSantri}
NIS: ${biodata.nis ?? biodata.id ?? '-'}

*Ringkasan:*
Total Wajib: Rp ${totalWajib.toLocaleString('id-ID')}
Total Bayar: Rp ${totalBayar.toLocaleString('id-ID')}
Kurang: Rp ${kurang.toLocaleString('id-ID')}

*Detail lengkap:*
${urlRiwayat}

> Simpan nomor ini agar link di atas bisa diklik.

Barakallahu fiikum.`

    setIsSendingWA(true)
    let nomorFormatted = nomorTelepon.replace(/\D/g, '')
    if (nomorFormatted.startsWith('0')) nomorFormatted = '62' + nomorFormatted.slice(1)
    else if (!nomorFormatted.startsWith('62')) nomorFormatted = '62' + nomorFormatted

    try {
      const result = await waAPI.send(nomorFormatted, message, 'uwaba1')
      const ok = result && (result.success === true || (result.success !== false && !result.message))
      if (ok) {
        try {
          const nomorPengirim = result?.senderPhoneNumber ?? result?.data?.senderPhoneNumber
          await chatAPI.saveChat({
            id_santri: (biodata?.nis != null && biodata.nis !== '') ? biodata.nis : (santriId || biodata?.id),
            nomor_tujuan: nomorFormatted,
            pesan: message,
            page: 'pendaftaran',
            source: 'template',
            status_pengiriman: 'berhasil',
            nomor_aktif: true,
            id_pengurus: user?.id ?? null,
            nomor_uwaba: nomorPengirim || null,
            via_wa: nomorPengirim ? `WA ${nomorPengirim}` : 'WA 1'
          })
        } catch (e) {
          console.error('Error saving chat log:', e)
        }
        showNotification('Pesan WhatsApp berhasil dikirim!', 'success')
      } else {
        throw new Error(result?.message || 'Gagal mengirim pesan')
      }
    } catch (error) {
      console.error('Error sending WhatsApp:', error)
      showNotification(error.response?.data?.message || error.message || 'Gagal mengirim pesan', 'error')
    } finally {
      setIsSendingWA(false)
    }
  }

  const handlePrintClick = () => {
    if (!printKwitansi && !printBiodataForm && !printRaporTes) {
      showNotification('Centang minimal satu: Kwitansi, Biodata, atau Rapor tes.', 'error')
      return
    }
    window.print()
  }

  if (!isOpen) return null

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="no-print fixed inset-0 bg-black bg-opacity-50 z-40"
          />

          {/* Offcanvas */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'tween', ease: [0.25, 0.1, 0.25, 1], duration: 0.35 }}
            className="print-offcanvas-wrapper fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] z-50 overflow-hidden flex flex-col"
            style={{ maxHeight: '90vh' }}
          >
            {/* Header */}
            <div className="no-print flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-xl font-semibold text-teal-600 dark:text-teal-400">Print Pendaftaran</h2>
              <button
                onClick={onClose}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            {/* URL Input Section */}
            <div className="no-print p-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/20 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={printUrl || ''}
                  readOnly
                  className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Link akan muncul di sini..."
                />
                <button
                  onClick={handleCopyUrl}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors font-medium text-xs whitespace-nowrap"
                  title="Salin link"
                >
                  <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Salin
                </button>
              </div>

              {/* WhatsApp Section */}
              <div>
                <div className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={waNumber}
                      onChange={(e) => setWaNumber(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full px-2 py-1.5 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    {waStatus.visible && (
                      <div 
                        className={`absolute right-2 top-1/2 -translate-y-1/2 text-lg cursor-pointer flex items-center ${
                          waStatus.type === 'success' ? 'text-green-600' : 
                          waStatus.type === 'error' ? 'text-red-600' : 
                          'text-blue-600'
                        }`}
                        title={waStatus.text}
                        onClick={() => {
                          if (waStatus.text) {
                            showNotification(waStatus.text, waStatus.type === 'success' ? 'success' : waStatus.type === 'error' ? 'error' : 'info')
                          }
                        }}
                      >
                        {waStatus.type === 'success' ? '✓' : waStatus.type === 'error' ? '✗' : '⏳'}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleCheckWA}
                    disabled={isCheckingWA}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCheckingWA ? (
                      <span className="flex items-center">
                        <span className="mr-1 text-xs">⏳</span>
                        <span className="text-xs">Cek</span>
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                        <span className="text-xs">Cek</span>
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handleSendWA}
                    disabled={!waRegistered || isSendingWA}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingWA ? (
                      <span className="flex items-center">
                        <span className="mr-1 text-xs">⏳</span>
                        <span className="text-xs">Kirim</span>
                      </span>
                    ) : (
                      <span className="flex items-center">
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        <span className="text-xs">Kirim</span>
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handlePrintClick}
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-xs whitespace-nowrap"
                    title="Print"
                  >
                    <span className="flex items-center">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                      </svg>
                      <span className="text-xs">Print</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Pilihan bagian yang dicetak */}
            <div className="no-print px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-x-4 gap-y-2 bg-white dark:bg-gray-800 flex-shrink-0">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Cetak:</span>
              <label className="flex items-center gap-2 text-xs text-gray-800 dark:text-gray-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  checked={printKwitansi}
                  onChange={(e) => setPrintKwitansi(e.target.checked)}
                />
                Kwitansi &amp; riwayat pembayaran
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-800 dark:text-gray-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  checked={printBiodataForm}
                  onChange={(e) => setPrintBiodataForm(e.target.checked)}
                />
                Biodata (formulir pendaftaran)
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-800 dark:text-gray-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                  checked={printRaporTes}
                  onChange={(e) => setPrintRaporTes(e.target.checked)}
                />
                Rapor tes Madrasah Diniyah
              </label>
            </div>

            {/* PrintPendaftaran Component Container */}
            <div className="flex-1 overflow-auto" style={{ position: 'relative' }}>
              {santriId ? (
                <div style={{ height: '100%', overflow: 'auto', position: 'relative' }}>
                  <PrintPendaftaran
                    santriId={santriId}
                    inOffcanvas={true}
                    printKwitansi={printKwitansi}
                    printBiodataForm={printBiodataForm}
                    printRaporTes={printRaporTes}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <p>NIS tidak ditemukan</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )

  return createPortal(offcanvasContent, document.body)
}

export default PendaftaranPrintOffcanvas

