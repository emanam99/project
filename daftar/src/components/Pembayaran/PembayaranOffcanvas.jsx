import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { useNavigate, Link } from 'react-router-dom'
import { pendaftaranAPI } from '../../services/api'
import { compressImage } from '../../utils/imageCompression'
import { formatFileSize } from '../../utils/fileUtils'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { getGambarUrl } from '../../config/images'

function PembayaranOffcanvas({ 
  isOpen, 
  onClose, 
  idSantri,
  defaultFile = null,
  nomorBukti = 1,
  onUploadSuccess,
  showCameraScanner = false,
  setShowCameraScanner = null
}) {
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const { tahunHijriyah, tahunMasehi } = useTahunAjaranStore()
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [keterangan, setKeterangan] = useState('')
  const [showQRISModal, setShowQRISModal] = useState(false)
  const [previewUrl, setPreviewUrl] = useState(null)

  const nomorRekening = '154060001234'
  const atasNama = 'Pendaftaran Al-Utsmani'
  // Selalu gunakan nomor untuk konsistensi (termasuk bukti pertama)
  // Sertakan tahun ajaran hijriyah & masehi agar bukti pembayaran terikat dengan tahun ajaran
  const baseJenisBerkas = `Bukti Pembayaran ${nomorBukti}`
  let jenisBerkas = baseJenisBerkas
  if (tahunHijriyah || tahunMasehi) {
    const tahunParts = []
    if (tahunHijriyah) tahunParts.push(tahunHijriyah)
    if (tahunMasehi) tahunParts.push(tahunMasehi)
    jenisBerkas = `${baseJenisBerkas} (${tahunParts.join(' / ')})`
  }

  // Generate preview URL dari file
  useEffect(() => {
    let url = null
    
    if (selectedFile) {
      // Cek apakah file adalah gambar
      const isImage = selectedFile.type?.startsWith('image/') || 
                     /\.(jpg|jpeg|png|gif|webp)$/i.test(selectedFile.name)
      
      if (isImage) {
        url = URL.createObjectURL(selectedFile)
        setPreviewUrl(url)
      } else {
        setPreviewUrl(null)
      }
    } else {
      setPreviewUrl(null)
    }
    
    // Cleanup function
    return () => {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }
  }, [selectedFile])

  // Set default file jika ada
  useEffect(() => {
    if (defaultFile && isOpen) {
      setSelectedFile(defaultFile)
    }
  }, [defaultFile, isOpen])

  useEffect(() => {
    if (isOpen && idSantri) {
      // Set file jika ada defaultFile (dari editor) dengan prioritas tinggi
      if (defaultFile) {
        console.log('Setting file from defaultFile prop:', defaultFile.name, defaultFile.size, 'bytes')
        setSelectedFile(defaultFile)
      } else {
        setSelectedFile(null)
      }
    } else if (!isOpen) {
      // Reset saat offcanvas ditutup (kecuali ada defaultFile yang akan digunakan)
      if (!defaultFile) {
        setSelectedFile(null)
        setKeterangan('')
        // Cleanup preview URL
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl)
          setPreviewUrl(null)
        }
      }
    }
  }, [isOpen, idSantri, defaultFile])

  // Separate effect untuk update file saat defaultFile berubah saat offcanvas sudah terbuka
  useEffect(() => {
    if (isOpen && defaultFile) {
      console.log('defaultFile changed while offcanvas is open:', defaultFile.name, defaultFile.size, 'bytes', defaultFile instanceof File)
      setSelectedFile(defaultFile)
    }
  }, [defaultFile, isOpen])

  const handleCopyRekening = () => {
    navigator.clipboard.writeText(nomorRekening).then(() => {
      showNotification('Nomor rekening berhasil disalin', 'success')
    }).catch(() => {
      showNotification('Gagal menyalin nomor rekening', 'error')
    })
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const maxSizeBytes = 1024 * 1024 // 1MB

    // Cek apakah file adalah gambar
    const compressibleImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const compressibleExtensions = ['jpg', 'jpeg', 'png', 'webp']
    const isImage = 
      compressibleImageTypes.includes(file.type) || compressibleExtensions.includes(fileExtension)

    // Jika gambar
    if (isImage) {
      let fileToUse = file
      
      // Jika ukuran > 1MB, compress otomatis tanpa notifikasi
      if (file.size > maxSizeBytes) {
        try {
          console.log('Auto-compressing image:', file.size, 'bytes')
          const compressedFile = await compressImage(file, 1) // 1MB
          console.log('Compressed:', file.size, 'bytes →', compressedFile.size, 'bytes')
          fileToUse = compressedFile
        } catch (err) {
          console.error('Error compressing image:', err)
          showNotification('Gagal mengompresi gambar. Silakan coba lagi.', 'error')
          return
        }
      }
      
      // Simpan jenisBerkas dan halaman asal sebelum navigate ke editor
      sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas)
      sessionStorage.setItem('editorReturnPage', '/pembayaran')
      console.log('Saved jenisBerkas and return page to sessionStorage:', jenisBerkas, '/pembayaran')
      
      // Redirect ke editor dengan file (sudah dikompres jika perlu)
      navigate('/editor', { state: { file: fileToUse } })
    } else {
      // Jika bukan gambar (misal PDF)
      if (file.size > maxSizeBytes) {
        showNotification(`Ukuran file terlalu besar. Maksimal 1MB. File Anda: ${formatFileSize(file.size)}`, 'warning')
        return
      }
      // Langsung set jika ukuran OK
      setSelectedFile(file)
    }
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    
    if (!selectedFile) {
      showNotification('Pilih file bukti pembayaran terlebih dahulu', 'warning')
      return
    }

    // Double check ukuran file sebelum upload
    const maxSizeBytes = 1024 * 1024 // 1MB
    if (selectedFile.size > maxSizeBytes) {
      showNotification(
        `Ukuran file terlalu besar (${formatFileSize(selectedFile.size)}). Maksimal 1MB. Silakan compress file terlebih dahulu.`, 
        'warning'
      )
      return
    }

    setUploading(true)
    try {
      const result = await pendaftaranAPI.uploadBerkas(
        idSantri, 
        jenisBerkas, 
        selectedFile, 
        keterangan || `Bukti transfer ke Bank JATIM ${nomorRekening}`
      )
      
      if (result.success) {
        showNotification(`Bukti TF ${nomorBukti} berhasil di-upload`, 'success')
        setSelectedFile(null)
        setKeterangan('')
        
        // Sinkronkan keterangan_status di backend (jika ada pembayaran → Belum Diverifikasi)
        try {
          if (idSantri && tahunHijriyah && tahunMasehi) {
            await pendaftaranAPI.syncKeteranganStatus({
              id_santri: idSantri,
              tahun_hijriyah: tahunHijriyah,
              tahun_masehi: tahunMasehi
            })
          }
        } catch (error) {
          console.error('Error sync keterangan_status:', error)
        }
        
        if (onUploadSuccess) {
          onUploadSuccess()
        }
        if (onClose) {
          setTimeout(() => {
            onClose()
          }, 500)
        }
      } else {
        showNotification(
          result.message || 'Gagal meng-upload bukti pembayaran', 
          'error'
        )
      }
    } catch (err) {
      console.error('Error uploading bukti pembayaran:', err)
      showNotification('Gagal meng-upload bukti pembayaran', 'error')
    } finally {
      setUploading(false)
    }
  }

  const offcanvasContent = !isOpen ? null : createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black bg-opacity-50"
            style={{ zIndex: 100 }}
          />
          
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl overflow-hidden"
            style={{ 
              zIndex: 101,
              maxHeight: 'calc(100vh - 64px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0)'
            }}
          >
            <div className="md:grid md:grid-cols-2" style={{ height: 'calc(100vh - 64px)', maxHeight: 'calc(100vh - 64px)' }}>
              {/* Kolom Gambar (hanya tampil di layar medium ke atas) */}
              <div className="hidden md:block relative overflow-hidden" style={{ height: '100%' }}>
                {previewUrl ? (
                  <img 
                    src={previewUrl} 
                    alt="Preview Bukti TF" 
                    className="w-full h-full object-contain bg-gray-100 dark:bg-gray-900" 
                  />
                ) : (
                  <>
                    <img 
                      src={getGambarUrl('/icon-2.png')} 
                      alt="Gedung Pesantren" 
                      className="w-full h-full object-cover" 
                    />
                    <div className="absolute inset-0 bg-teal-800 bg-opacity-50"></div>
                  </>
                )}
              </div>

              {/* Kolom Konten Form */}
              <div className="flex flex-col" style={{ height: '100%', maxHeight: '100%', overflow: 'hidden' }}>
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                  <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Upload Bukti TF {nomorBukti}
                  </h2>
                  <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4">
                  {/* Preview Gambar di Mobile */}
                  {previewUrl && (
                    <div className="md:hidden mb-4 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                      <img 
                        src={previewUrl} 
                        alt="Preview Bukti TF" 
                        className="w-full h-auto max-h-64 object-contain bg-gray-100 dark:bg-gray-900" 
                      />
                    </div>
                  )}

                  {/* Informasi Transfer */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                    Transfer ke Bank JATIM
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowQRISModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 dark:bg-amber-600 text-white hover:bg-amber-600 dark:hover:bg-amber-700 transition-colors rounded-lg text-sm font-semibold shadow-md hover:shadow-lg shrink-0"
                    title="Bayar Pake QRIS"
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <span className="whitespace-nowrap">Bayar Pake QRIS</span>
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">Nomor Rekening</div>
                    <div className="flex items-center gap-2">
                      <div className="text-base font-bold text-blue-900 dark:text-blue-100">
                        {nomorRekening}
                      </div>
                      <button
                        onClick={handleCopyRekening}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                        title="Salin nomor rekening"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                        </svg>
                        Salin
                      </button>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">Atas Nama</div>
                    <div className="text-base font-semibold text-blue-900 dark:text-blue-100">
                      {atasNama}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-blue-200 dark:border-blue-700">
                    <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">Minimal Pembayaran</div>
                    <div className="text-base font-bold text-blue-900 dark:text-blue-100">
                      Rp 200.000
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Upload */}
              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Upload Bukti TF {nomorBukti}
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    Maksimal 1MB. Foto otomatis dikompres jika lebih besar.
                  </p>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        console.log('Opening camera scanner...')
                        // Simpan jenisBerkas sebelum buka kamera
                        sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas)
                        console.log('Saved jenisBerkas to sessionStorage:', jenisBerkas)
                        
                        // Buka camera scanner langsung
                        if (setShowCameraScanner) {
                          setShowCameraScanner(true)
                        } else {
                          // Fallback: jika setShowCameraScanner tidak tersedia, gunakan navigate
                          navigate('/editor', { state: { useCamera: true } })
                        }
                        
                        // Tutup offcanvas agar kamera terlihat penuh
                        onClose()
                      }}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      </svg>
                      Scan dengan Kamera
                    </button>
                    <div className="flex items-center text-gray-400">
                      <span className="text-sm">atau</span>
                    </div>
                  </div>
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    accept=".jpg,.jpeg,.png,.gif,.webp,.pdf"
                    required={!selectedFile}
                    key={selectedFile ? selectedFile.name : 'file-input'}
                  />
                  {selectedFile && (
                    <div className={`mt-2 p-3 ${
                      selectedFile.size > 1024 * 1024 
                        ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                        : 'bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800'
                    } rounded-lg`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${
                            selectedFile.size > 1024 * 1024 
                              ? 'text-red-800 dark:text-red-200' 
                              : 'text-teal-800 dark:text-teal-200'
                          }`}>
                            {selectedFile.name}
                          </p>
                          <p className={`text-xs mt-1 ${
                            selectedFile.size > 1024 * 1024 
                              ? 'text-red-600 dark:text-red-400' 
                              : 'text-teal-600 dark:text-teal-400'
                          }`}>
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            // Simpan halaman asal sebelum navigate ke editor
                            sessionStorage.setItem('editorReturnPage', '/pembayaran')
                            navigate('/editor', { state: { file: selectedFile } })
                          }}
                          className="ml-2 px-2 py-1 text-xs text-teal-600 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-800 rounded"
                        >
                          Edit
                        </button>
                      </div>
                      {selectedFile.size > 1024 * 1024 ? (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                          ⚠️ File terlalu besar! Maksimal 1MB. Silakan edit/compress terlebih dahulu.
                        </p>
                      ) : (
                        <p className="text-xs text-teal-600 dark:text-teal-400 mt-2">
                          ✓ File siap di-upload
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Keterangan (Optional)
                  </label>
                  <textarea
                    value={keterangan}
                    onChange={(e) => setKeterangan(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Keterangan tambahan (misal: tanggal transfer, jumlah transfer, dll)..."
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploading || !selectedFile || (selectedFile && selectedFile.size > 1024 * 1024)}
                  className={`w-full px-4 py-3 rounded-lg transition-colors font-medium ${
                    uploading || !selectedFile || (selectedFile && selectedFile.size > 1024 * 1024)
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                      : 'bg-teal-600 hover:bg-teal-700 text-white'
                  }`}
                >
                  {uploading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Mengupload...
                    </span>
                  ) : (
                    'Upload Bukti Pembayaran'
                  )}
                </button>
                {!selectedFile && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                    Pilih file atau scan dengan kamera terlebih dahulu
                  </p>
                )}
                {selectedFile && selectedFile.size > 1024 * 1024 && (
                  <p className="text-xs text-red-600 dark:text-red-400 text-center mt-2">
                    ⚠️ File terlalu besar ({formatFileSize(selectedFile.size)})! Maksimal 1MB. Silakan edit/compress.
                  </p>
                )}
                {selectedFile && selectedFile.size <= 1024 * 1024 && (
                  <p className="text-xs text-teal-600 dark:text-teal-400 text-center mt-2">
                    ✓ File siap di-upload: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </form>
                </div>

                {/* Footer Links - Outside scrollable area */}
                <div className="flex-shrink-0 p-4 pt-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <p className="text-xs text-gray-600 dark:text-gray-400 text-center mb-2">
                Informasi Penting:
              </p>
              <div className="flex flex-wrap gap-3 justify-center text-xs">
                <Link
                  to="/syarat-ketentuan"
                  onClick={(e) => {
                    e.preventDefault()
                    onClose()
                    setTimeout(() => navigate('/syarat-ketentuan', { state: { from: '/pembayaran' } }), 300)
                  }}
                  className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline transition-colors font-medium"
                >
                  Syarat & Ketentuan
                </Link>
                <span className="text-gray-400 dark:text-gray-500">•</span>
                <Link
                  to="/kebijakan-pengembalian-dana"
                  onClick={(e) => {
                    e.preventDefault()
                    onClose()
                    setTimeout(() => navigate('/kebijakan-pengembalian-dana', { state: { from: '/pembayaran' } }), 300)
                  }}
                  className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline transition-colors font-medium"
                >
                  Kebijakan Pengembalian Dana
                </Link>
                <span className="text-gray-400 dark:text-gray-500">•</span>
                <Link
                  to="/faq"
                  onClick={(e) => {
                    e.preventDefault()
                    onClose()
                    setTimeout(() => navigate('/faq', { state: { from: '/pembayaran' } }), 300)
                  }}
                  className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 hover:underline transition-colors font-medium"
                >
                  FAQ
                </Link>
              </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )

  // Modal QRIS
  const qrisModal = showQRISModal ? createPortal(
    <AnimatePresence>
      {showQRISModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowQRISModal(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col my-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                QRIS Pembayaran
              </h3>
              <button
                onClick={() => setShowQRISModal(false)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body - Scrollable */}
            <div className="p-4 overflow-y-auto flex-1">
              <img
                src="/images/info/QRIS.jpeg"
                alt="QRIS Pembayaran"
                className="w-full h-auto rounded-lg shadow-sm"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
              <div className="mt-4">
                <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
                  Scan QRIS di atas untuk melakukan pembayaran melalui aplikasi e-wallet atau mobile banking Anda.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end flex-shrink-0">
              <button
                onClick={() => setShowQRISModal(false)}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  ) : null

  return (
    <>
      {offcanvasContent}
      {qrisModal}
    </>
  )
}

export default PembayaranOffcanvas
