import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage } from '../../../utils/imageCompression'
import { formatFileSize } from './utils/fileUtils'
import { getGambarUrl } from '../../../config/images'
import ImageEditorModal from '../../../components/ImageEditor/ImageEditorModal'

/**
 * Offcanvas upload berkas — mengikuti aplikasi daftar:
 * - Muncul dari bawah (mobile), tengah layar (desktop)
 * - File gambar > 1MB → kompres lalu modal editor (tanpa ganti route / reload halaman)
 * - Maks. 1MB untuk upload langsung
 * - Styling dan pengaturan sama dengan daftar
 */
function BerkasOffcanvas({
  isOpen,
  onClose,
  idSantri,
  defaultJenisBerkas = null,
  existingBerkas = null,
  defaultFile = null,
  onUploadSuccess,
  showCameraScanner = false,
  setShowCameraScanner = null,
  /** Z-index untuk overlay/panel (agar tampil di atas offcanvas lain, mis. 10002) */
  overlayZIndex = 100
}) {
  const backdropZ = overlayZIndex
  const panelZ = overlayZIndex + 1
  const editorModalZ = overlayZIndex + 80
  const { showNotification } = useNotification()

  const closeImageEditor = useCallback(() => {
    setImageEditorOpen(false)
    setImageFileForEditor(null)
  }, [])

  const applyCompressIfNeeded = useCallback(async (editedFile) => {
    const compressibleImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const fileExtension = editedFile.name.split('.').pop()?.toLowerCase()
    const compressibleExtensions = ['jpg', 'jpeg', 'png', 'webp']
    const isCompressibleImage =
      (compressibleImageTypes.includes(editedFile.type) || compressibleExtensions.includes(fileExtension)) &&
      editedFile.size > 1024 * 1024
    if (!isCompressibleImage) return editedFile
    try {
      return await compressImage(editedFile, 1)
    } catch (err) {
      console.error('Error compressing edited image:', err)
      return editedFile
    }
  }, [])

  const handleImageEditorSave = useCallback(
    async (editedFile) => {
      const fileToUse = await applyCompressIfNeeded(editedFile)
      setSelectedFile(fileToUse)
    },
    [applyCompressIfNeeded]
  )
  const [uploading, setUploading] = useState(false)
  const [jenisBerkas, setJenisBerkas] = useState('Ijazah SD Sederajat')
  const [imageEditorOpen, setImageEditorOpen] = useState(false)
  const [imageFileForEditor, setImageFileForEditor] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [keterangan, setKeterangan] = useState('')
  const [previewUrl, setPreviewUrl] = useState(null)

  useEffect(() => {
    if (selectedFile?.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(selectedFile?.name || '')) {
      const url = URL.createObjectURL(selectedFile)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
    setPreviewUrl(null)
  }, [selectedFile])

  useEffect(() => {
    if (defaultFile && isOpen) setSelectedFile(defaultFile)
  }, [defaultFile, isOpen])

  useEffect(() => {
    if (isOpen && idSantri) {
      // Utamakan file dari parent (kembali dari editor); jangan kosongkan bila defaultFile belum ter-prop satu siklus
      if (defaultFile != null) setSelectedFile(defaultFile)
      else if (!existingBerkas) setSelectedFile(null)
      if (existingBerkas) {
        setJenisBerkas(existingBerkas.jenis_berkas)
        setKeterangan(existingBerkas.keterangan || '')
      } else {
        const dariEditor = sessionStorage.getItem('uploadingBerkasJenis')
        setJenisBerkas(dariEditor || defaultJenisBerkas || 'Ijazah SD Sederajat')
        setKeterangan('')
      }
    } else if (!isOpen && !defaultFile) {
      setSelectedFile(null)
      setPreviewUrl(null)
    }
  }, [isOpen, idSantri, defaultJenisBerkas, existingBerkas, defaultFile])

  useEffect(() => {
    if (isOpen && defaultFile) setSelectedFile(defaultFile)
  }, [defaultFile, isOpen])

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const maxSizeBytes = 1024 * 1024 // 1MB
    const isImage = /\.(jpg|jpeg|png|webp)$/i.test(file.name) || file.type?.startsWith('image/')
    if (isImage && file.size > maxSizeBytes) {
      try {
        const compressed = await compressImage(file, 1)
        sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas)
        setImageFileForEditor(compressed)
        setImageEditorOpen(true)
      } catch (err) {
        showNotification('Gagal mengompresi gambar.', 'error')
      }
      return
    }
    if (!isImage && file.size > maxSizeBytes) {
      showNotification(`Maksimal 1MB. File: ${formatFileSize(file.size)}`, 'warning')
      return
    }
    setSelectedFile(file)
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (!selectedFile) {
      showNotification('Pilih file terlebih dahulu', 'warning')
      return
    }
    if (selectedFile.size > 1024 * 1024) {
      showNotification('Maksimal 1MB. Silakan compress terlebih dahulu.', 'warning')
      return
    }
    setUploading(true)
    try {
      let result
      if (existingBerkas) {
        const formData = new FormData()
        formData.append('id', existingBerkas.id)
        formData.append('file', selectedFile)
        if (keterangan) formData.append('keterangan', keterangan)
        result = await pendaftaranAPI.updateBerkas(formData)
      } else {
        result = await pendaftaranAPI.uploadBerkas(idSantri, jenisBerkas, selectedFile, keterangan || null)
      }
      if (result.success) {
        showNotification(existingBerkas ? 'Berkas diganti' : 'Berkas terupload', 'success')
        setSelectedFile(null)
        setKeterangan('')
        onUploadSuccess?.()
        setTimeout(() => onClose?.(), 400)
      } else {
        showNotification(result.message || 'Gagal upload', 'error')
      }
    } catch (err) {
      showNotification(existingBerkas ? 'Gagal mengganti berkas' : 'Gagal upload', 'error')
    } finally {
      setUploading(false)
    }
  }

  const openCamera = () => {
    sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas)
    setShowCameraScanner?.(true)
    onClose?.()
  }

  const fileReady = selectedFile && selectedFile.size <= 1024 * 1024

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  return (
    <>
      {createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="berkas-offcanvas-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
          style={{ zIndex: backdropZ }}
        />
      )}
      {isOpen && (
        <motion.div
          key="berkas-offcanvas-panel"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={offcanvasTransition}
          className="fixed inset-0 flex flex-col justify-end md:justify-center md:items-center md:p-4 pointer-events-none"
          style={{ zIndex: panelZ, willChange: 'transform' }}
        >
          <div
            className="w-full md:max-w-4xl md:max-h-[85vh] md:w-full flex flex-col bg-white dark:bg-gray-900 rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] pointer-events-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
          >
          <div className="flex flex-1 min-h-0 md:grid md:grid-cols-2">
            {/* Kolom kiri: Gambar / Logo / Preview (hanya di desktop) */}
            <div className="hidden md:flex flex-col bg-gray-50 dark:bg-gray-800/50 border-r border-gray-100 dark:border-gray-800 overflow-hidden">
              {previewUrl ? (
                <div className="flex-1 flex items-center justify-center p-6 min-h-0">
                  <img
                    src={previewUrl}
                    alt="Preview berkas"
                    className="max-w-full max-h-full object-contain rounded-xl shadow-inner"
                  />
                </div>
              ) : (
                <div className="flex-1 relative flex items-center justify-center p-8 min-h-0">
                  <img
                    src={getGambarUrl('/icon-2.png')}
                    alt=""
                    className="w-full h-full object-cover object-center opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-teal-900/40 via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6 text-white text-sm font-medium opacity-90">
                    {existingBerkas ? 'Ganti berkas' : 'Upload berkas santri'}
                  </div>
                </div>
              )}
            </div>

            {/* Kolom kanan: Form */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
                <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">
                  {existingBerkas ? 'Ganti Berkas' : 'Upload Berkas'}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 -m-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content form */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-5">
                  {false && (
                    <button
                      type="button"
                      onClick={() => {}}
                      className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-teal-400 hover:text-teal-600 dark:hover:border-teal-500 dark:hover:text-teal-400 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      Upload berkas
                    </button>
                  )}

                  <motion.form
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onSubmit={handleUpload}
                      className="space-y-5"
                    >
                      {/* Jenis Berkas: label saja (sesuai yang diklik di list) */}
                      <div>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Jenis Berkas</p>
                        <p className="text-sm font-medium text-teal-600 dark:text-teal-400 truncate">{jenisBerkas}</p>
                        {existingBerkas && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">Mengganti: {existingBerkas.nama_file}</p>
                        )}
                      </div>

                      {/* File */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          File (maks. 1MB)
                        </label>
                        <div className="flex gap-2">
                          <label className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                            </svg>
                            Pilih file
                            <input type="file" className="hidden" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf" onChange={handleFileSelect} key={selectedFile?.name || 'input'} />
                          </label>
                          {setShowCameraScanner && (
                            <button
                              type="button"
                              onClick={openCamera}
                              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              </svg>
                              Kamera
                            </button>
                          )}
                        </div>

                        {selectedFile && (
                          <div className={`mt-3 p-3 rounded-xl flex items-center gap-3 ${fileReady ? 'bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800'}`}>
                            {previewUrl && (
                              <img src={previewUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{selectedFile.name}</p>
                              <p className={`text-xs ${fileReady ? 'text-teal-600 dark:text-teal-400' : 'text-red-600 dark:text-red-400'}`}>
                                {formatFileSize(selectedFile.size)}
                                {!fileReady && ' · Perlu compress'}
                              </p>
                            </div>
                            {previewUrl && (
                              <button
                                type="button"
                                onClick={() => {
                                  sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas)
                                  setImageFileForEditor(selectedFile)
                                  setImageEditorOpen(true)
                                }}
                                className="text-xs text-teal-600 dark:text-teal-400 hover:underline"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedFile(null)}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                              aria-label="Hapus file"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Keterangan */}
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          Keterangan (opsional)
                        </label>
                        <textarea
                          value={keterangan}
                          onChange={(e) => setKeterangan(e.target.value)}
                          rows={2}
                          placeholder="Catatan tambahan..."
                          className="w-full px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-none"
                        />
                      </div>

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={uploading || !fileReady}
                        className="w-full py-3 rounded-xl font-medium text-sm text-white bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400 transition-colors flex items-center justify-center gap-2"
                      >
                        {uploading ? (
                          <>
                            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Mengupload...
                          </>
                        ) : (
                          existingBerkas ? 'Ganti Berkas' : 'Upload'
                        )}
                      </button>
                    </motion.form>
                </div>
              </div>
            </div>
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
      )}
      <ImageEditorModal
        isOpen={imageEditorOpen}
        imageFile={imageFileForEditor}
        onClose={closeImageEditor}
        onSave={handleImageEditorSave}
        zIndex={editorModalZ}
      />
    </>
  )
}

export default BerkasOffcanvas
