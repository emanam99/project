import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { compressImage } from '../../../utils/imageCompression'
import { formatFileSize } from './utils/fileUtils'
import BerkasSection from './sections/BerkasSection'
import BerkasOffcanvas from './BerkasOffcanvas'
import FilePreviewOffcanvas from '../../../components/FilePreview/FilePreviewOffcanvas'
import CameraScanner from '../../../components/CameraScanner/CameraScanner'
import Modal from '../../../components/Modal/Modal'
import { useBerkasManagement } from './hooks/useBerkasManagement'

/**
 * Panel tab Berkas (kotak tersendiri). Dipakai di halaman Pendaftaran dengan tab Biodata | Berkas | Pembayaran (HP)
 * atau tab Berkas | Pembayaran di kolom kanan (PC).
 */
function BerkasTabPanel({ santriId, pendingFileFromEditor = null, onConsumePendingFile }) {
  const { showNotification } = useNotification()
  const navigate = useNavigate()
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
    setBerkasList,
    handlePreviewBerkas,
    handleClosePreviewBerkas,
    downloadForPreview,
    handleGantiClickBerkas,
    handleUpdateBerkas,
    handleDeleteClickBerkas,
    handleDeleteConfirmBerkas,
    handleCloseDeleteModalBerkas
  } = berkasManagement

  const [existingBerkasToReplace, setExistingBerkasToReplace] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [showCameraScanner, setShowCameraScanner] = useState(false)

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
          await fetchBerkasList(localId)
          showNotification(`"${jenisBerkas}" ditandai sebagai tersedia`, 'info')
        } else showNotification(result.message || 'Gagal menghapus tanda tidak ada', 'error')
      } else {
        const result = await pendaftaranAPI.markTidakAda(localId, jenisBerkas)
        if (result.success) {
          await fetchBerkasList(localId)
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

  // Pending file from editor: buka offcanvas dan pertahankan jenis berkas dari sessionStorage
  useEffect(() => {
    if (pendingFileFromEditor && localId) {
      const savedJenis = sessionStorage.getItem('uploadingBerkasJenis')
      if (savedJenis) setSelectedJenisBerkas(savedJenis)
      setSelectedFile(pendingFileFromEditor)
      setIsBerkasOffcanvasOpen(true)
      onConsumePendingFile?.()
    }
  }, [pendingFileFromEditor, localId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGantiClickAndOpen = (berkas) => {
    handleGantiClickBerkas(berkas)
    setExistingBerkasToReplace(berkas)
    setIsBerkasOffcanvasOpen(true)
  }

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
      const returnPath = localId ? `/pendaftaran?nis=${localId}` : '/pendaftaran'
      sessionStorage.setItem('editorReturnPage', returnPath)
      setShowCameraScanner(false)
      navigate('/pendaftaran/editor', { state: { file: fileToUse } })
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
