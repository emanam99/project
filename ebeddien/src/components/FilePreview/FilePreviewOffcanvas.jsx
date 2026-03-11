import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'

/**
 * Komponen reusable untuk preview file (gambar dan PDF)
 * @param {Object} props
 * @param {Object|null} props.file - Data file yang akan di-preview (harus memiliki: id, nama_file, tipe_file, ukuran_file, jenis_berkas)
 * @param {Function} props.onClose - Callback saat preview ditutup
 * @param {Function} props.onDownload - Function untuk download file (async, menerima fileId dan fileName, return blob)
 * @param {Function} props.onReplace - Function untuk membuka offcanvas ganti file (optional)
 * @param {Function} props.formatFileSize - Function untuk format ukuran file (optional, default: bytes)
 */
function FilePreviewOffcanvas({ file, onClose, onDownload, onReplace, formatFileSize }) {
  const [previewFileUrl, setPreviewFileUrl] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  // Format file size default
  const defaultFormatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatSize = formatFileSize || defaultFormatFileSize

  // Get file icon berdasarkan tipe
  const getFileIcon = (fileType, fileName) => {
    const extension = fileName?.split('.').pop()?.toLowerCase() || ''
    
    if (fileType?.startsWith('image/')) {
      return (
        <div className="w-10 h-10 bg-teal-100 dark:bg-teal-900 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )
    } else if (fileType === 'application/pdf' || extension === 'pdf') {
      return (
        <div className="w-10 h-10 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
      )
    } else {
      return (
        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
      )
    }
  }

  // Load file untuk preview
  useEffect(() => {
    if (file && onDownload) {
      const loadPreview = async () => {
        try {
          setLoadingPreview(true)
          const blob = await onDownload(file.id, file.nama_file)
          const url = window.URL.createObjectURL(blob)
          setPreviewFileUrl(url)
        } catch (err) {
          console.error('Error loading file for preview:', err)
          setPreviewFileUrl(null)
        } finally {
          setLoadingPreview(false)
        }
      }
      loadPreview()
    } else {
      setPreviewFileUrl(null)
    }

    // Cleanup URL saat component unmount atau file berubah
    return () => {
      if (previewFileUrl) {
        window.URL.revokeObjectURL(previewFileUrl)
      }
    }
  }, [file])

  // Cleanup saat close
  const handleClose = () => {
    if (previewFileUrl) {
      window.URL.revokeObjectURL(previewFileUrl)
    }
    setPreviewFileUrl(null)
    if (onClose) {
      onClose()
    }
  }

  // Handle download
  const handleDownload = async () => {
    if (file && onDownload) {
      try {
        const blob = await onDownload(file.id, file.nama_file)
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.nama_file
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } catch (err) {
        console.error('Error downloading file:', err)
      }
    }
  }

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  return createPortal(
    <AnimatePresence>
      {file && (
        <motion.div
          key="file-preview-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
          className="fixed inset-0 bg-black bg-opacity-60 z-[100000]"
        />
      )}
      {file && (
        <motion.div
          key="file-preview-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed inset-y-0 right-0 w-full sm:w-[600px] lg:w-[800px] bg-white dark:bg-gray-800 shadow-2xl flex flex-col z-[100001]"
          onClick={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {getFileIcon(file.tipe_file, file.nama_file)}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                    {file.nama_file}
                  </h3>
                  {file.ukuran_file && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatSize(file.ukuran_file)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {onDownload && (
                  <button
                    onClick={handleDownload}
                    className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                )}
                {onReplace && (
                  <button
                    onClick={() => {
                      if (onReplace) {
                        onReplace(file)
                        handleClose()
                      }
                    }}
                    className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                    title="Ganti File"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden bg-gray-100 dark:bg-gray-900">
              {loadingPreview ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                </div>
              ) : previewFileUrl ? (
                <div className="h-full w-full overflow-auto">
                  {file.tipe_file?.startsWith('image/') ? (
                    <img
                      src={previewFileUrl}
                      alt={file.nama_file}
                      className="w-full h-auto object-contain"
                      style={{ maxHeight: '100%' }}
                    />
                  ) : file.tipe_file === 'application/pdf' ? (
                    <iframe
                      src={previewFileUrl}
                      className="w-full h-full border-0"
                      title={file.nama_file}
                      style={{ minHeight: '600px' }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full p-8">
                      <div className="text-center">
                        {getFileIcon(file.tipe_file, file.nama_file)}
                        <p className="text-gray-600 dark:text-gray-400 mb-2 mt-4">
                          Preview tidak tersedia untuk tipe file ini
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                          Silakan download file untuk membuka dengan aplikasi yang sesuai
                        </p>
                        {onDownload && (
                          <button
                            onClick={handleDownload}
                            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                          >
                            Download File
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-gray-600 dark:text-gray-400">
                      Gagal memuat preview
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export default FilePreviewOffcanvas

