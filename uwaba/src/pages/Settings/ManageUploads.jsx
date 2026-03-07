import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { uploadsManagerAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import FilePreviewOffcanvas from '../../components/FilePreview/FilePreviewOffcanvas'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i]
}

/** Infer MIME dari ekstensi nama file (untuk FilePreviewOffcanvas) */
function getMimeFromFileName(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase() || ''
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf'
  }
  return map[ext] || 'application/octet-stream'
}

/** Map file dari list API ke bentuk yang dipakai FilePreviewOffcanvas */
function toPreviewFile(file) {
  return {
    id: file.path,
    nama_file: file.name,
    ukuran_file: file.size,
    tipe_file: getMimeFromFileName(file.name)
  }
}

function ManageUploads() {
  const { showNotification } = useNotification()
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingPath, setDeletingPath] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ open: false, file: null })
  const [expandedFolder, setExpandedFolder] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const closePreviewOffcanvas = useOffcanvasBackClose(!!previewFile, () => setPreviewFile(null))
  const [legacyInfo, setLegacyInfo] = useState(null)
  const [legacyRencanaInfo, setLegacyRencanaInfo] = useState(null)
  const [migrating, setMigrating] = useState(false)
  const [migratingRencana, setMigratingRencana] = useState(false)

  const loadList = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await uploadsManagerAPI.list()
      if (response.success && response.data?.folders) {
        setFolders(response.data.folders)
      } else {
        setError(response.message || 'Gagal memuat daftar file')
      }
    } catch (err) {
      console.error('Error loading uploads:', err)
      setError('Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
    }
  }

  const loadLegacyCheck = async () => {
    try {
      const response = await uploadsManagerAPI.checkLegacySantri()
      if (response.success && response.data?.hasLegacyFiles) {
        setLegacyInfo(response.data)
      } else {
        setLegacyInfo(null)
      }
    } catch (err) {
      setLegacyInfo(null)
    }
  }

  const loadLegacyRencanaCheck = async () => {
    try {
      const response = await uploadsManagerAPI.checkLegacyRencana()
      if (response.success && response.data?.hasLegacyFiles) {
        setLegacyRencanaInfo(response.data)
      } else {
        setLegacyRencanaInfo(null)
      }
    } catch (err) {
      setLegacyRencanaInfo(null)
    }
  }

  const handleMigrate = async () => {
    try {
      setMigrating(true)
      const response = await uploadsManagerAPI.migrateSantriFromLegacy()
      if (response.success && response.data) {
        const { migrated, skipped, failed, message } = response.data
        showNotification(message, 'success')
        setLegacyInfo(null)
        loadLegacyCheck()
        loadList()
        if (failed?.length > 0) {
          showNotification(`${failed.length} file gagal dipindahkan`, 'error')
        }
      } else {
        showNotification(response.message || 'Gagal memindahkan file', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memindahkan file', 'error')
    } finally {
      setMigrating(false)
    }
  }

  const handleMigrateRencana = async () => {
    try {
      setMigratingRencana(true)
      const response = await uploadsManagerAPI.migrateRencanaFromLegacy()
      if (response.success && response.data) {
        const { migrated, skipped, failed, message } = response.data
        showNotification(message, 'success')
        setLegacyRencanaInfo(null)
        loadLegacyRencanaCheck()
        loadList()
        if (failed?.length > 0) {
          showNotification(`${failed.length} file gagal dipindahkan`, 'error')
        }
      } else {
        showNotification(response.message || 'Gagal memindahkan file rencana', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memindahkan file', 'error')
    } finally {
      setMigratingRencana(false)
    }
  }

  useEffect(() => {
    loadList()
    loadLegacyCheck()
    loadLegacyRencanaCheck()
  }, [])

  const handleDeleteClick = (file) => {
    setDeleteModal({ open: true, file })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteModal.file) return
    const path = deleteModal.file.path
    setDeletingPath(path)
    try {
      const response = await uploadsManagerAPI.deleteFile(path)
      if (response.success) {
        showNotification('File berhasil dihapus', 'success')
        setDeleteModal({ open: false, file: null })
        loadList()
      } else {
        showNotification(response.message || 'Gagal menghapus file', 'error')
      }
    } catch (err) {
      console.error('Error deleting file:', err)
      showNotification(err.response?.data?.message || 'Gagal menghapus file', 'error')
    } finally {
      setDeletingPath(null)
    }
  }

  const toggleFolder = (name) => {
    setExpandedFolder(prev => prev === name ? null : name)
  }

  const handlePreviewFile = (file) => {
    setPreviewFile(toPreviewFile(file))
  }

  const handleDownloadForPreview = async (path) => {
    const blob = await uploadsManagerAPI.serveBlob(path)
    return blob
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Kelola File Upload
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            File yang tersimpan di folder uploads (santri, pengaturan, rencana-pengeluaran). Hanya Super Admin yang dapat mengakses.
          </p>
        </div>

        {legacyInfo?.hasLegacyFiles && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Ada <strong>{legacyInfo.count}</strong> file berkas santri di lokasi lama yang perlu dipindahkan.
              </p>
              <button
                type="button"
                onClick={handleMigrate}
                disabled={migrating}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {migrating ? 'Memindahkan...' : 'Pindahkan Santri'}
              </button>
            </div>
          </motion.div>
        )}

        {legacyRencanaInfo?.hasLegacyFiles && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Ada <strong>{legacyRencanaInfo.count}</strong> file rencana pengeluaran di lokasi lama yang perlu dipindahkan.
              </p>
              <button
                type="button"
                onClick={handleMigrateRencana}
                disabled={migratingRencana}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {migratingRencana ? 'Memindahkan...' : 'Pindahkan Rencana Pengeluaran'}
              </button>
            </div>
          </motion.div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && folders.length === 0 && (
          <div className="rounded-lg bg-white dark:bg-gray-800 shadow p-8 text-center text-gray-500 dark:text-gray-400">
            Belum ada folder atau file di uploads.
          </div>
        )}

        {!loading && !error && folders.length > 0 && (
          <div className="space-y-4">
            {folders.map((folder) => (
              <motion.div
                key={folder.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-white dark:bg-gray-800 shadow overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleFolder(folder.name)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 dark:text-gray-400">
                      {expandedFolder === folder.name ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-white">{folder.name}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {folder.fileCount} file · {formatBytes(folder.totalSize)}
                    </span>
                  </div>
                </button>

                <AnimatePresence>
                  {expandedFolder === folder.name && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-gray-200 dark:border-gray-700 overflow-hidden"
                    >
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Nama File</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ukuran</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Diubah</th>
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {folder.files.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                                  Tidak ada file
                                </td>
                              </tr>
                            ) : (
                              folder.files.map((file) => (
                                <tr key={file.path} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                  <td
                                    className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100 font-mono truncate max-w-xs cursor-pointer hover:text-teal-600 dark:hover:text-teal-400 hover:underline"
                                    title={`Klik untuk preview: ${file.path}`}
                                    onClick={() => handlePreviewFile(file)}
                                  >
                                    {file.name}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    {formatBytes(file.size)}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                                    {file.modified || '-'}
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeleteClick(file)
                                      }}
                                      disabled={deletingPath === file.path}
                                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 text-sm font-medium"
                                    >
                                      {deletingPath === file.path ? 'Menghapus...' : 'Hapus'}
                                    </button>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Offcanvas preview file (kanan) */}
      <FilePreviewOffcanvas
        file={previewFile}
        onClose={closePreviewOffcanvas}
        onDownload={handleDownloadForPreview}
        formatFileSize={formatBytes}
      />

      {/* Modal konfirmasi hapus */}
      <AnimatePresence>
        {deleteModal.open && deleteModal.file && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => !deletingPath && setDeleteModal({ open: false, file: null })}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Hapus file?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 break-all">
                {deleteModal.file.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                Path: {deleteModal.file.path}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => !deletingPath && setDeleteModal({ open: false, file: null })}
                  disabled={deletingPath}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deletingPath}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {deletingPath ? 'Menghapus...' : 'Hapus'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default ManageUploads
