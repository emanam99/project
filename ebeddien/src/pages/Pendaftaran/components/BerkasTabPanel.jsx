import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage } from '../../../utils/imageCompression'
import { formatFileSize } from './utils/fileUtils'
import BerkasSection from './sections/BerkasSection'
import BerkasOffcanvas from './BerkasOffcanvas'
import FilePreviewOffcanvas from '../../../components/FilePreview/FilePreviewOffcanvas'
import CameraScanner from '../../../components/CameraScanner/CameraScanner'
import Modal from '../../../components/Modal/Modal'
import ImageEditorModal from '../../../components/ImageEditor/ImageEditorModal'
import { useBerkasManagement } from './hooks/useBerkasManagement'

/**
 * Panel tab Berkas (kotak tersendiri). Dipakai di halaman Pendaftaran dengan tab Biodata | Berkas | Pembayaran (HP)
 * atau tab Berkas | Pembayaran di kolom kanan (PC).
 */
function BerkasTabPanel({ santriId }) {
  const { showNotification } = useNotification()
  const localId = santriId && /^\d{7}$/.test(String(santriId).trim()) ? String(santriId).trim() : null

  const berkasManagement = useBerkasManagement(localId || '')
  const {
    berkasList,
    loadingBerkas,
    previewFile,
    showDeleteModal,
    berkasToDelete,
    deletingId,
    replacingId,
    replacingFile,
    replacingKeterangan,
    isBerkasOffcanvasOpen,
    selectedJenisBerkas,
    setReplacingId,
    setReplacingFile,
    setReplacingKeterangan,
    setIsBerkasOffcanvasOpen,
    setSelectedJenisBerkas,
    fetchBerkasList,
    updateBerkasTidakAdaLocal,
    setBerkasList,
    handlePreviewBerkas,
    handleClosePreviewBerkas,
    handleGantiClickBerkas,
    handleUpdateBerkas,
    handleDeleteClickBerkas,
    handleDeleteConfirmBerkas,
    handleCloseDeleteModalBerkas
  } = berkasManagement

  const [existingBerkasToReplace, setExistingBerkasToReplace] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [showCameraScanner, setShowCameraScanner] = useState(false)
  const [cameraImageEditorOpen, setCameraImageEditorOpen] = useState(false)
  const [cameraImageFileForEditor, setCameraImageFileForEditor] = useState(null)
  const [thumbnailUrlById, setThumbnailUrlById] = useState({})
  const [thumbnailLoadingById, setThumbnailLoadingById] = useState({})
  const previewBlobCacheRef = useRef(new Map())
  const thumbnailObjectUrlRef = useRef(new Map())
  const prefetchingIdsRef = useRef(new Set())

  // KK Sama dengan Santri & berkas not available (sama seperti BiodataPendaftaran)
  const [kkSamaDenganSantri, setKkSamaDenganSantri] = useState(() => {
    if (localId) {
      try {
        const saved = localStorage.getItem(`kkSamaDenganSantri_${localId}`)
        return saved ? JSON.parse(saved) : []
      } catch {
        return []
      }
    }
    return []
  })

  const berkasNotAvailable = useMemo(
    () => berkasList.filter((b) => b.status_tidak_ada == 1).map((b) => b.jenis_berkas),
    [berkasList]
  )

  useEffect(() => {
    if (!localId) return
    try {
      const savedKk = localStorage.getItem(`kkSamaDenganSantri_${localId}`)
      if (savedKk) setKkSamaDenganSantri(JSON.parse(savedKk))
      else setKkSamaDenganSantri([])
    } catch {
      setKkSamaDenganSantri([])
    }
  }, [localId])

  useEffect(() => {
    if (localId && berkasList.length > 0) {
      const uploaded = berkasList.filter((b) => !b.status_tidak_ada).map((b) => b.jenis_berkas)
      setKkSamaDenganSantri((prev) => prev.filter((j) => uploaded.includes(j)))
    }
  }, [berkasList, localId])

  useEffect(() => {
    if (localId) {
      localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(kkSamaDenganSantri))
    }
  }, [kkSamaDenganSantri, localId])

  const toggleBerkasNotAvailable = async (jenisBerkas, existingBerkas = null) => {
    const isCurrentlyNotAvailable = berkasNotAvailable.includes(jenisBerkas)
    if (!localId) {
      showNotification('NIS tidak valid', 'error')
      return
    }
    if (!isCurrentlyNotAvailable && existingBerkas && existingBerkas.status_tidak_ada != 1) {
      if (!window.confirm(`Berkas "${jenisBerkas}" sudah diupload. Hapus berkas dan tandai sebagai "Tidak Ada"?`)) return
    }
    try {
      if (isCurrentlyNotAvailable) {
        const result = await pendaftaranAPI.unmarkTidakAda(localId, jenisBerkas)
        if (result.success) {
          updateBerkasTidakAdaLocal(jenisBerkas, false)
          showNotification(`"${jenisBerkas}" ditandai sebagai tersedia`, 'info')
        } else showNotification(result.message || 'Gagal menghapus tanda tidak ada', 'error')
      } else {
        const result = await pendaftaranAPI.markTidakAda(localId, jenisBerkas)
        if (result.success) {
          updateBerkasTidakAdaLocal(jenisBerkas, true)
          showNotification(`"${jenisBerkas}" ditandai sebagai tidak ada`, 'info')
        } else showNotification(result.message || 'Gagal menandai berkas', 'error')
      }
    } catch (err) {
      showNotification('Gagal mengubah status berkas', 'error')
    }
  }

  const toggleKkSamaDenganSantri = async (jenisBerkas) => {
    const isCurrentlySame = kkSamaDenganSantri.includes(jenisBerkas)
    const kkSantri = berkasList.find((b) => b.jenis_berkas === 'KK Santri' && !b.status_tidak_ada)
    const existingBerkas = berkasList.find((b) => b.jenis_berkas === jenisBerkas)
    if (!kkSantri) {
      showNotification('KK Santri belum diupload. Silakan upload KK Santri terlebih dahulu.', 'warning')
      return
    }
    if (!localId) {
      showNotification('NIS tidak valid', 'error')
      return
    }
    if (!isCurrentlySame) {
      try {
        showNotification('Menghubungkan dengan KK Santri...', 'info')
        if (existingBerkas) {
          if (!window.confirm(`"${jenisBerkas}" sudah ada. Ganti dengan link ke KK Santri?`)) return
          const deleteResult = await pendaftaranAPI.deleteBerkas(existingBerkas.id)
          if (!deleteResult.success) throw new Error(deleteResult.message || 'Gagal menghapus berkas')
        }
        const result = await pendaftaranAPI.linkBerkas(localId, jenisBerkas, kkSantri.id, 'KK Santri')
        if (result.success) {
          await fetchBerkasList(localId)
          const updated = [...kkSamaDenganSantri, jenisBerkas]
          setKkSamaDenganSantri(updated)
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updated))
          showNotification(`"${jenisBerkas}" berhasil dihubungkan dengan KK Santri`, 'success')
        } else {
          showNotification(result.message || 'Gagal menghubungkan dengan KK Santri', 'error')
          if (localId) await fetchBerkasList(localId)
        }
      } catch (err) {
        showNotification('Gagal menghubungkan dengan KK Santri', 'error')
        if (localId) await fetchBerkasList(localId)
      }
    } else {
      if (existingBerkas) {
        try {
          const response = await pendaftaranAPI.deleteBerkas(existingBerkas.id)
          if (!response.success) throw new Error(response.message || 'Gagal menghapus link')
          await fetchBerkasList(localId)
          const updated = kkSamaDenganSantri.filter((item) => item !== jenisBerkas)
          setKkSamaDenganSantri(updated)
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updated))
          showNotification(`Link "${jenisBerkas}" berhasil dihapus`, 'success')
        } catch (err) {
          showNotification('Gagal menghapus link berkas', 'error')
          if (localId) await fetchBerkasList(localId)
        }
      } else {
        const updated = kkSamaDenganSantri.filter((item) => item !== jenisBerkas)
        setKkSamaDenganSantri(updated)
        localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updated))
      }
    }
  }

  // Load berkas list when santriId changes
  useEffect(() => {
    if (localId) fetchBerkasList(localId)
  }, [localId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGantiClickAndOpen = (berkas) => {
    handleGantiClickBerkas(berkas)
    setExistingBerkasToReplace(berkas)
    setIsBerkasOffcanvasOpen(true)
  }

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
      console.error(err)
      return editedFile
    }
  }, [])

  const isImageBerkas = useCallback((berkas) => {
    const tipe = berkas?.tipe_file || ''
    const nama = berkas?.nama_file || ''
    return tipe.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(nama)
  }, [])

  const cacheBerkasBlob = useCallback(
    async (berkas, { prefetch = false } = {}) => {
      const idBerkas = berkas?.id
      if (!idBerkas) return null

      const cachedBlob = previewBlobCacheRef.current.get(idBerkas)
      if (cachedBlob) return cachedBlob
      if (prefetchingIdsRef.current.has(idBerkas)) return null

      prefetchingIdsRef.current.add(idBerkas)
      if (prefetch) {
        setThumbnailLoadingById((prev) => ({ ...prev, [idBerkas]: true }))
      }

      try {
        const blob = await pendaftaranAPI.downloadBerkas(idBerkas)
        previewBlobCacheRef.current.set(idBerkas, blob)

        if (isImageBerkas(berkas) && !thumbnailObjectUrlRef.current.has(idBerkas)) {
          const objectUrl = window.URL.createObjectURL(blob)
          thumbnailObjectUrlRef.current.set(idBerkas, objectUrl)
          setThumbnailUrlById((prev) => ({ ...prev, [idBerkas]: objectUrl }))
        }

        return blob
      } catch (err) {
        if (!prefetch) {
          showNotification('Gagal memuat preview berkas', 'error')
        }
        return null
      } finally {
        prefetchingIdsRef.current.delete(idBerkas)
        if (prefetch) {
          setThumbnailLoadingById((prev) => ({ ...prev, [idBerkas]: false }))
        }
      }
    },
    [isImageBerkas, showNotification]
  )

  const prefetchBerkasPreview = useCallback(
    (berkas) => {
      if (!berkas || !isImageBerkas(berkas)) return
      void cacheBerkasBlob(berkas, { prefetch: true })
    },
    [cacheBerkasBlob, isImageBerkas]
  )

  const downloadForPreview = useCallback(
    async (idBerkas) => {
      const cachedBlob = previewBlobCacheRef.current.get(idBerkas)
      if (cachedBlob) return cachedBlob

      const berkas = berkasList.find((item) => item.id === idBerkas)
      if (berkas) {
        const result = await cacheBerkasBlob(berkas)
        if (result) return result
      }

      const blob = await pendaftaranAPI.downloadBerkas(idBerkas)
      previewBlobCacheRef.current.set(idBerkas, blob)
      return blob
    },
    [berkasList, cacheBerkasBlob]
  )

  useEffect(() => {
    const validIds = new Set(berkasList.map((b) => b.id))

    for (const [id, url] of thumbnailObjectUrlRef.current.entries()) {
      if (!validIds.has(id)) {
        window.URL.revokeObjectURL(url)
        thumbnailObjectUrlRef.current.delete(id)
        previewBlobCacheRef.current.delete(id)
      }
    }

    setThumbnailUrlById((prev) => {
      const next = {}
      Object.entries(prev).forEach(([id, url]) => {
        if (validIds.has(Number(id)) || validIds.has(id)) {
          next[id] = url
        }
      })
      return next
    })
  }, [berkasList])

  useEffect(() => {
    const imageBerkas = berkasList.filter((b) => !b.status_tidak_ada && isImageBerkas(b))
    imageBerkas.slice(0, 6).forEach((berkas) => {
      if (!thumbnailObjectUrlRef.current.has(berkas.id)) {
        void cacheBerkasBlob(berkas, { prefetch: true })
      }
    })
  }, [berkasList, cacheBerkasBlob, isImageBerkas])

  useEffect(() => {
    return () => {
      for (const url of thumbnailObjectUrlRef.current.values()) {
        window.URL.revokeObjectURL(url)
      }
      thumbnailObjectUrlRef.current.clear()
      previewBlobCacheRef.current.clear()
      prefetchingIdsRef.current.clear()
    }
  }, [])

  const handleCameraImageEditorSave = useCallback(
    async (editedFile) => {
      const fileToUse = await applyCompressIfNeeded(editedFile)
      const savedJenis = sessionStorage.getItem('uploadingBerkasJenis')
      if (savedJenis) setSelectedJenisBerkas(savedJenis)
      setSelectedFile(fileToUse)
      setIsBerkasOffcanvasOpen(true)
    },
    [applyCompressIfNeeded, setSelectedJenisBerkas, setIsBerkasOffcanvasOpen]
  )

  const handleCameraCapture = async (file) => {
    if (!file) {
      showNotification('Gagal menerima file dari kamera. Silakan coba lagi.', 'error')
      return
    }
    try {
      const maxSizeBytes = 1024 * 1024
      let fileToUse = file
      if (file.size > maxSizeBytes) {
        fileToUse = await compressImage(file, 1)
      }
      const jenisBerkas = sessionStorage.getItem('uploadingBerkasJenis')
      sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas || 'Ijazah SD Sederajat')
      setShowCameraScanner(false)
      setCameraImageFileForEditor(fileToUse)
      setCameraImageEditorOpen(true)
    } catch (err) {
      showNotification('Gagal memproses file dari kamera. Silakan coba lagi.', 'error')
    }
  }

  if (!localId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-sm">Pilih atau masukkan NIS santri untuk mengelola berkas.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto min-h-0 flex flex-col">
      <ImageEditorModal
        isOpen={cameraImageEditorOpen}
        imageFile={cameraImageFileForEditor}
        onClose={() => {
          setCameraImageEditorOpen(false)
          setCameraImageFileForEditor(null)
        }}
        onSave={handleCameraImageEditorSave}
        zIndex={10060}
      />
      <BerkasSection
        sectionRef={{ current: null }}
        standalone
        localId={localId}
        berkasList={berkasList}
        loadingBerkas={loadingBerkas}
        handlePreviewBerkas={handlePreviewBerkas}
        handleDeleteClickBerkas={handleDeleteClickBerkas}
        handleGantiClickBerkas={handleGantiClickAndOpen}
        deletingId={deletingId}
        setIsBerkasOffcanvasOpen={setIsBerkasOffcanvasOpen}
        setSelectedJenisBerkas={setSelectedJenisBerkas}
        berkasNotAvailable={berkasNotAvailable}
        toggleBerkasNotAvailable={toggleBerkasNotAvailable}
        kkSamaDenganSantri={kkSamaDenganSantri}
        toggleKkSamaDenganSantri={toggleKkSamaDenganSantri}
        thumbnailUrlById={thumbnailUrlById}
        thumbnailLoadingById={thumbnailLoadingById}
        prefetchBerkasPreview={prefetchBerkasPreview}
      />

      <BerkasOffcanvas
        isOpen={isBerkasOffcanvasOpen}
        onClose={() => {
          setIsBerkasOffcanvasOpen(false)
          setSelectedJenisBerkas(null)
          setExistingBerkasToReplace(null)
          setSelectedFile(null)
          if (localId) fetchBerkasList(localId)
        }}
        idSantri={localId}
        defaultJenisBerkas={selectedJenisBerkas}
        existingBerkas={existingBerkasToReplace}
        defaultFile={selectedFile}
        onUploadSuccess={() => {
          if (localId) fetchBerkasList(localId)
          setSelectedFile(null)
        }}
        showCameraScanner={showCameraScanner}
        setShowCameraScanner={setShowCameraScanner}
      />

      {showCameraScanner && (
        <CameraScanner
          onCapture={handleCameraCapture}
          onClose={() => setShowCameraScanner(false)}
          autoEnhance={true}
          jenisBerkas={sessionStorage.getItem('uploadingBerkasJenis')}
        />
      )}

      {createPortal(
        <FilePreviewOffcanvas
          file={previewFile}
          onClose={handleClosePreviewBerkas}
          onDownload={downloadForPreview}
          onReplace={(berkas) => {
            setExistingBerkasToReplace(berkas)
            setIsBerkasOffcanvasOpen(true)
          }}
          formatFileSize={formatFileSize}
        />,
        document.body
      )}

      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModalBerkas}
        title="Konfirmasi Hapus Berkas"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deletingId}
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">Apakah Anda yakin ingin menghapus berkas ini?</p>
            {berkasToDelete && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{berkasToDelete.jenis_berkas}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{berkasToDelete.nama_file}</p>
                    {berkasToDelete.ukuran_file && (
                      <p className="text-xs text-gray-500 mt-1">{formatFileSize(berkasToDelete.ukuran_file)}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">⚠️ Tindakan ini tidak dapat dibatalkan!</p>
          </div>
          <div className="flex items-end justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCloseDeleteModalBerkas}
              disabled={deletingId}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirmBerkas}
              disabled={deletingId}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {deletingId ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Menghapus...
                </>
              ) : (
                'Hapus'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default BerkasTabPanel
