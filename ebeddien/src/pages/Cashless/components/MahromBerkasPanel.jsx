import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { mahromAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage } from '../../../utils/imageCompression'
import { createTypedObjectUrl } from '../../../utils/filePreviewMedia'
import BerkasSection from '../../Pendaftaran/components/sections/BerkasSection'
import BerkasOffcanvas from '../../Pendaftaran/components/BerkasOffcanvas'
import FilePreviewOffcanvas from '../../../components/FilePreview/FilePreviewOffcanvas'
import CameraScanner from '../../../components/CameraScanner/CameraScanner'
import ImageEditorModal from '../../../components/ImageEditor/ImageEditorModal'
import Modal from '../../../components/Modal/Modal'
import { useBerkasManagement } from '../../Pendaftaran/components/hooks/useBerkasManagement'
import { formatFileSize } from '../../Pendaftaran/components/utils/fileUtils'

const MAHROM_JENIS_BERKAS = ['KTP', 'KK']

/**
 * Panel upload KTP & KK mahrom — reuse komponen berkas pendaftaran.
 */
export default function MahromBerkasPanel({ mahromId, overlayZIndex = 210 }) {
  const { showNotification } = useNotification()
  const entityId = mahromId && Number(mahromId) > 0 ? String(mahromId) : ''
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

  const {
    berkasList,
    loadingBerkas,
    previewFile,
    showDeleteModal,
    berkasToDelete,
    deletingId,
    isBerkasOffcanvasOpen,
    selectedJenisBerkas,
    setIsBerkasOffcanvasOpen,
    setSelectedJenisBerkas,
    fetchBerkasList,
    handlePreviewBerkas,
    handleClosePreviewBerkas,
    downloadForPreview: downloadForPreviewBase,
    handleGantiClickBerkas,
    handleDeleteClickBerkas,
    handleDeleteConfirmBerkas,
    handleCloseDeleteModalBerkas,
  } = useBerkasManagement(entityId, {
    api: mahromAPI,
    isValidId: (id) => Number(id) > 0,
  })

  useEffect(() => {
    if (entityId) fetchBerkasList(entityId)
  }, [entityId]) // eslint-disable-line react-hooks/exhaustive-deps

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
        const blob = await mahromAPI.downloadBerkas(idBerkas)
        previewBlobCacheRef.current.set(idBerkas, blob)

        if (isImageBerkas(berkas) && !thumbnailObjectUrlRef.current.has(idBerkas)) {
          const { url: objectUrl } = createTypedObjectUrl(blob, berkas.tipe_file, berkas.nama_file)
          if (objectUrl) {
            thumbnailObjectUrlRef.current.set(idBerkas, objectUrl)
            setThumbnailUrlById((prev) => ({ ...prev, [idBerkas]: objectUrl }))
          }
        }

        return blob
      } catch {
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

      const blob = await downloadForPreviewBase(idBerkas)
      previewBlobCacheRef.current.set(idBerkas, blob)
      return blob
    },
    [berkasList, cacheBerkasBlob, downloadForPreviewBase]
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
    imageBerkas.forEach((berkas) => {
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

  const handleGantiClickAndOpen = (berkas) => {
    handleGantiClickBerkas(berkas)
    setExistingBerkasToReplace(berkas)
    setSelectedFile(null)
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
    } catch {
      return editedFile
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
      sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas || 'KTP')
      setShowCameraScanner(false)
      setCameraImageFileForEditor(fileToUse)
      setCameraImageEditorOpen(true)
    } catch {
      showNotification('Gagal memproses file dari kamera. Silakan coba lagi.', 'error')
    }
  }

  if (!entityId) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-white/80 dark:bg-gray-800/50 px-3 py-3 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Klik <strong>Simpan mahrom</strong> di bawah, lalu tombol unggah KTP & KK akan muncul di sini.
        </p>
      </div>
    )
  }

  return (
    <>
      <ImageEditorModal
        isOpen={cameraImageEditorOpen}
        imageFile={cameraImageFileForEditor}
        onClose={() => {
          setCameraImageEditorOpen(false)
          setCameraImageFileForEditor(null)
        }}
        onSave={handleCameraImageEditorSave}
        zIndex={overlayZIndex + 80}
      />

      <BerkasSection
        sectionRef={{ current: null }}
        standalone
        localId={entityId}
        localIdKind="mahrom"
        berkasList={berkasList}
        loadingBerkas={loadingBerkas}
        handlePreviewBerkas={handlePreviewBerkas}
        handleDeleteClickBerkas={handleDeleteClickBerkas}
        handleGantiClickBerkas={handleGantiClickAndOpen}
        deletingId={deletingId}
        setIsBerkasOffcanvasOpen={setIsBerkasOffcanvasOpen}
        setSelectedJenisBerkas={setSelectedJenisBerkas}
        jenisBerkasOptions={MAHROM_JENIS_BERKAS}
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
          if (entityId) fetchBerkasList(entityId)
        }}
        idSantri={entityId}
        berkasTarget="mahrom"
        defaultJenisBerkas={selectedJenisBerkas}
        existingBerkas={existingBerkasToReplace}
        defaultFile={selectedFile}
        onUploadSuccess={() => {
          if (entityId) fetchBerkasList(entityId)
          setSelectedFile(null)
        }}
        showCameraScanner={showCameraScanner}
        setShowCameraScanner={setShowCameraScanner}
        overlayZIndex={overlayZIndex}
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
            setSelectedFile(null)
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
          <p className="text-gray-700 dark:text-gray-300 mb-4">Apakah Anda yakin ingin menghapus berkas ini?</p>
          {berkasToDelete && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
              <p className="font-medium text-gray-800 dark:text-gray-200">{berkasToDelete.jenis_berkas}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{berkasToDelete.nama_file}</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCloseDeleteModalBerkas}
              disabled={deletingId}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirmBerkas}
              disabled={deletingId}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {deletingId ? 'Menghapus...' : 'Hapus'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
