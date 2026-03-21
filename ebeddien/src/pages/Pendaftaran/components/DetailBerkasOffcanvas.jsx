import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import FilePreviewOffcanvas from '../../../components/FilePreview/FilePreviewOffcanvas'
import BerkasOffcanvas from './BerkasOffcanvas'
import { formatFileSize, getFileTypeLabel } from './utils/fileUtils'

/**
 * Offcanvas kanan: list berkas pendaftar dengan preview, upload, ganti, hapus.
 * Dipakai dari halaman Data Pendaftar (detail pendaftar → Cek detail berkas).
 */
function DetailBerkasOffcanvas({ isOpen, onClose, idSantri, namaPendaftar, onSuccess }) {
  const { showNotification } = useNotification()
  const [berkasList, setBerkasList] = useState([])
  const [loading, setLoading] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [berkasToDelete, setBerkasToDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [uploadOffcanvasOpen, setUploadOffcanvasOpen] = useState(false)
  const [berkasToReplace, setBerkasToReplace] = useState(null)
  const [defaultJenisForUpload, setDefaultJenisForUpload] = useState(null)
  const [togglingTidakAdaId, setTogglingTidakAdaId] = useState(null) // jenisBerkas string saat toggle

  const JENIS_BERKAS_OPTIONS = [
    'Ijazah SD Sederajat',
    'Ijazah SMP Sederajat',
    'Ijazah SMA Sederajat',
    'SKL',
    'KTP Santri',
    'KTP Ayah',
    'KTP Ibu',
    'KTP Wali',
    'KK Santri',
    'KK Ayah',
    'KK Ibu',
    'KK Wali',
    'Akta Lahir',
    'KIP',
    'PKH',
    'KKS',
    'Kartu Bantuan Lain',
    'Surat Pindah',
    'Surat Perjanjian Kapdar',
    'Pakta Integritas'
  ]

  const fetchList = () => {
    if (!idSantri) {
      setBerkasList([])
      return
    }
    setLoading(true)
    pendaftaranAPI
      .getBerkasList(idSantri)
      .then((res) => {
        const list = res?.success && Array.isArray(res?.data) ? res.data : []
        setBerkasList(list)
      })
      .catch(() => setBerkasList([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (isOpen && idSantri) fetchList()
    else {
      setBerkasList([])
      setPreviewFile(null)
      setUploadOffcanvasOpen(false)
      setShowDeleteModal(false)
      setBerkasToDelete(null)
      setBerkasToReplace(null)
    }
  }, [isOpen, idSantri])

  const handlePreview = (berkas) => setPreviewFile(berkas)
  const handleClosePreview = () => setPreviewFile(null)
  const handleDownloadForPreview = (idBerkas) => pendaftaranAPI.downloadBerkas(idBerkas)

  const openUpload = (jenisBerkas = null) => {
    setBerkasToReplace(null)
    setDefaultJenisForUpload(jenisBerkas)
    setUploadOffcanvasOpen(true)
  }
  const openReplace = (berkas) => {
    setBerkasToReplace(berkas)
    setDefaultJenisForUpload(null)
    setUploadOffcanvasOpen(true)
  }
  const handleUploadSuccess = () => {
    fetchList()
    onSuccess?.()
    setUploadOffcanvasOpen(false)
    setBerkasToReplace(null)
    setDefaultJenisForUpload(null)
  }

  const handleDeleteClick = (berkas) => {
    setBerkasToDelete(berkas)
    setShowDeleteModal(true)
  }
  const handleDeleteConfirm = async () => {
    if (!berkasToDelete) return
    setDeletingId(berkasToDelete.id)
    try {
      const result = await pendaftaranAPI.deleteBerkas(berkasToDelete.id)
      if (result?.success) {
        showNotification('Berkas berhasil dihapus', 'success')
        setShowDeleteModal(false)
        setBerkasToDelete(null)
        fetchList()
        onSuccess?.()
      } else {
        showNotification(result?.message || 'Gagal menghapus berkas', 'error')
      }
    } catch (err) {
      showNotification('Gagal menghapus berkas', 'error')
    } finally {
      setDeletingId(null)
    }
  }
  const handleCloseDeleteModal = () => {
    if (!deletingId) {
      setShowDeleteModal(false)
      setBerkasToDelete(null)
    }
  }

  /** Update lokal status tidak ada tanpa refetch list (ringan, tidak load ulang) */
  const updateBerkasTidakAdaLocal = (jenisBerkas, statusTidakAda) => {
    setBerkasList((prev) => {
      const idx = prev.findIndex((b) => b.jenis_berkas === jenisBerkas)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], status_tidak_ada: statusTidakAda ? 1 : 0 }
        return next
      }
      if (statusTidakAda) {
        return [...prev, { jenis_berkas: jenisBerkas, status_tidak_ada: 1 }]
      }
      return prev
    })
  }

  const toggleBerkasTidakAda = async (jenisBerkas, existingBerkas) => {
    if (!jenisBerkas || !idSantri) return
    const isCurrentlyNotAvailable = existingBerkas?.status_tidak_ada == 1
    if (!isCurrentlyNotAvailable && existingBerkas?.id && existingBerkas?.status_tidak_ada != 1) {
      if (!window.confirm(`Berkas "${jenisBerkas}" sudah diupload. Hapus berkas dan tandai sebagai "Tidak Ada"?`)) {
        return
      }
    }
    setTogglingTidakAdaId(jenisBerkas)
    try {
      if (isCurrentlyNotAvailable) {
        const result = await pendaftaranAPI.unmarkTidakAda(idSantri, jenisBerkas)
        if (result?.success) {
          updateBerkasTidakAdaLocal(jenisBerkas, false)
          onSuccess?.()
          showNotification(`"${jenisBerkas}" ditandai sebagai tersedia`, 'info')
        } else {
          showNotification(result?.message || 'Gagal menghapus tanda tidak ada', 'error')
        }
      } else {
        const result = await pendaftaranAPI.markTidakAda(idSantri, jenisBerkas)
        if (result?.success) {
          updateBerkasTidakAdaLocal(jenisBerkas, true)
          onSuccess?.()
          showNotification(`"${jenisBerkas}" ditandai sebagai tidak ada`, 'info')
        } else {
          showNotification(result?.message || 'Gagal menandai berkas', 'error')
        }
      }
    } catch (err) {
      showNotification('Gagal mengubah status berkas', 'error')
    } finally {
      setTogglingTidakAdaId(null)
    }
  }

  const getFileTypeColor = (tipeFile, namaFile) => {
    if (!tipeFile && !namaFile) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
    const ext = namaFile?.split('.').pop()?.toLowerCase() || ''
    if (tipeFile?.startsWith('image/')) {
      if (['jpg', 'jpeg'].includes(ext)) return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      if (ext === 'png') return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      if (ext === 'gif') return 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300'
      if (ext === 'webp') return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300'
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
    }
    if (tipeFile === 'application/pdf' || ext === 'pdf') return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  }

  const berkasMap = new Map()
  berkasList.forEach((b) => berkasMap.set(b.jenis_berkas, b))

  const content = (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
        <motion.div
          key="detail-berkas-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-[9999]"
          onClick={onClose}
          aria-hidden="true"
        />
        <motion.div
          key="detail-berkas-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.25 }}
          className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[10000] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate min-w-0">
              Detail Berkas {namaPendaftar ? `— ${namaPendaftar}` : ''}
            </h3>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => openUpload()}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Tambah berkas
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">ID: {idSantri ?? '—'}</p>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Daftar Berkas</h4>
                {JENIS_BERKAS_OPTIONS.map((jenisBerkas) => {
                  const existingBerkas = berkasMap.get(jenisBerkas)
                  const isNotAvailable = existingBerkas?.status_tidak_ada == 1
                  return (
                    <div key={jenisBerkas}>
                      <div
                        className={`p-3 rounded-lg flex items-center justify-between transition-all ${
                          isNotAvailable
                            ? 'bg-gray-100 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 opacity-50'
                            : existingBerkas
                            ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600'
                            : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                        }`}
                        onClick={existingBerkas && !isNotAvailable ? () => handlePreview(existingBerkas) : undefined}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleBerkasTidakAda(jenisBerkas, existingBerkas)
                              }}
                              disabled={togglingTidakAdaId === jenisBerkas}
                              className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all disabled:opacity-50 ${
                                isNotAvailable
                                  ? 'bg-orange-500 border-orange-500'
                                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500'
                              }`}
                              title={
                                isNotAvailable
                                  ? 'Klik untuk tandai sebagai tersedia'
                                  : existingBerkas
                                  ? 'Klik untuk hapus berkas dan tandai tidak ada'
                                  : 'Tandai sebagai tidak ada'
                              }
                            >
                              {isNotAvailable && (
                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              )}
                            </button>
                            <p className={`text-sm font-medium ${
                              isNotAvailable
                                ? 'text-gray-400 dark:text-gray-600 line-through'
                                : existingBerkas
                                ? 'text-gray-900 dark:text-gray-100'
                                : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              {jenisBerkas}
                            </p>
                            {isNotAvailable && (
                              <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded">
                                Tidak Ada
                              </span>
                            )}
                          </div>
                          {!isNotAvailable && existingBerkas ? (
                            <div className="flex items-center gap-2 flex-wrap mt-1 ml-7">
                              {existingBerkas.tipe_file && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getFileTypeColor(existingBerkas.tipe_file, existingBerkas.nama_file)}`}>
                                  {getFileTypeLabel(existingBerkas.tipe_file, existingBerkas.nama_file)}
                                </span>
                              )}
                              {existingBerkas.ukuran_file != null && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatFileSize(existingBerkas.ukuran_file)}
                                </span>
                              )}
                            </div>
                          ) : !isNotAvailable ? (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-7">Belum diupload</p>
                          ) : null}
                          {existingBerkas?.keterangan && !isNotAvailable && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1 ml-7">
                              {existingBerkas.keterangan}
                            </p>
                          )}
                        </div>
                        {!isNotAvailable && (
                          <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                            {existingBerkas ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openReplace(existingBerkas)}
                                  className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900 rounded transition-colors"
                                  title="Ganti"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteClick(existingBerkas)}
                                  disabled={deletingId === existingBerkas.id}
                                  className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded transition-colors disabled:opacity-50"
                                  title="Hapus"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openUpload(jenisBerkas)}
                                className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900 rounded transition-colors"
                                title="Upload"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Preview */}
      <FilePreviewOffcanvas
        file={previewFile}
        onClose={handleClosePreview}
        onDownload={handleDownloadForPreview}
        onReplace={previewFile ? () => { handleClosePreview(); openReplace(previewFile); } : undefined}
        formatFileSize={formatFileSize}
      />

      {/* Upload / Ganti */}
      <BerkasOffcanvas
        isOpen={uploadOffcanvasOpen}
        onClose={() => {
          setUploadOffcanvasOpen(false)
          setBerkasToReplace(null)
          setDefaultJenisForUpload(null)
        }}
        idSantri={idSantri}
        defaultJenisBerkas={defaultJenisForUpload}
        existingBerkas={berkasToReplace}
        onUploadSuccess={handleUploadSuccess}
        overlayZIndex={10002}
      />

      {/* Delete confirm modal */}
      {showDeleteModal && berkasToDelete && (
        <div className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4" onClick={handleCloseDeleteModal}>
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
              Hapus berkas &quot;{berkasToDelete.jenis_berkas || berkasToDelete.keterangan || 'Berkas'}&quot;?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCloseDeleteModal}
                disabled={!!deletingId}
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={!!deletingId}
                className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
              >
                {deletingId ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )

  return createPortal(content, document.body)
}

export default DetailBerkasOffcanvas
