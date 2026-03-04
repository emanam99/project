import { useState } from 'react'
import { pendaftaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'
import { compressImage } from '../../../../utils/imageCompression'

/**
 * Custom hook untuk mengelola state dan operasi berkas (upload, delete, preview, replace)
 * @param {string} localId - ID santri (7 digit)
 * @returns {object} State dan functions untuk berkas management
 */
export const useBerkasManagement = (localId) => {
  const { showNotification } = useNotification()
  
  // State untuk berkas
  const [berkasList, setBerkasList] = useState([])
  const [loadingBerkas, setLoadingBerkas] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [berkasToDelete, setBerkasToDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [replacingId, setReplacingId] = useState(null)
  const [replacingFile, setReplacingFile] = useState(null)
  const [replacingKeterangan, setReplacingKeterangan] = useState('')
  const [uploading, setUploading] = useState(false)
  const [isBerkasOffcanvasOpen, setIsBerkasOffcanvasOpen] = useState(false)
  const [selectedJenisBerkas, setSelectedJenisBerkas] = useState(null)

  // Fetch list berkas
  const fetchBerkasList = async (idSantri) => {
    if (!idSantri || !/^\d{7}$/.test(idSantri)) {
      setBerkasList([])
      return
    }

    setLoadingBerkas(true)
    try {
      const result = await pendaftaranAPI.getBerkasList(idSantri)
      if (result.success && result.data) {
        setBerkasList(result.data)
      } else {
        setBerkasList([])
      }
    } catch (err) {
      console.error('Error loading berkas list:', err)
      setBerkasList([])
    } finally {
      setLoadingBerkas(false)
    }
  }

  // Handle preview
  const handlePreviewBerkas = (berkas) => {
    setPreviewFile(berkas)
  }

  // Handle close preview
  const handleClosePreviewBerkas = () => {
    setPreviewFile(null)
  }

  // Download function untuk preview component
  const downloadForPreview = async (idBerkas, namaFile) => {
    return await pendaftaranAPI.downloadBerkas(idBerkas)
  }

  // Handle ganti click
  const handleGantiClickBerkas = (berkas) => {
    setReplacingId(berkas.id)
    setReplacingFile(null)
    setReplacingKeterangan(berkas.keterangan || '')
  }

  // Handle update/ganti file
  const handleUpdateBerkas = async (e) => {
    e.preventDefault()
    
    if (!replacingFile || !replacingId) {
      showNotification('Pilih file terlebih dahulu', 'error')
      return
    }

    setUploading(true)
    try {
      // Cek apakah file adalah gambar yang bisa dikompresi
      const compressibleImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
      const fileExtension = replacingFile.name.split('.').pop()?.toLowerCase()
      const compressibleExtensions = ['jpg', 'jpeg', 'png', 'webp']
      const isCompressibleImage = 
        (compressibleImageTypes.includes(replacingFile.type) || compressibleExtensions.includes(fileExtension)) &&
        replacingFile.size > 1024 * 1024 // Hanya kompres jika lebih dari 1 MB
      
      let fileToUpload = replacingFile
      
      // Kompres gambar jika memenuhi syarat
      if (isCompressibleImage) {
        try {
          showNotification('Mengompresi gambar...', 'info')
          fileToUpload = await compressImage(replacingFile, 1) // Max 1 MB
          const originalSizeKB = (replacingFile.size / 1024).toFixed(0)
          const compressedSizeKB = (fileToUpload.size / 1024).toFixed(0)
          const savedSizeKB = ((replacingFile.size - fileToUpload.size) / 1024).toFixed(0)
          showNotification(`Gambar dikompresi: ${originalSizeKB} KB → ${compressedSizeKB} KB (hemat ${savedSizeKB} KB)`, 'success')
        } catch (err) {
          console.error('Error compressing image:', err)
          showNotification('Gagal mengompresi gambar, menggunakan file asli', 'warning')
          fileToUpload = replacingFile
        }
      }

      const formData = new FormData()
      formData.append('id', replacingId)
      formData.append('file', fileToUpload)
      if (replacingKeterangan) {
        formData.append('keterangan', replacingKeterangan)
      }

      const result = await pendaftaranAPI.updateBerkas(formData)
      if (result.success) {
        showNotification('Berkas berhasil diganti', 'success')
        setReplacingId(null)
        setReplacingFile(null)
        setReplacingKeterangan('')
        if (localId && /^\d{7}$/.test(localId)) {
          fetchBerkasList(localId)
        }
      } else {
        showNotification(result.message || 'Gagal mengganti berkas', 'error')
      }
    } catch (err) {
      console.error('Error updating berkas:', err)
      showNotification('Gagal mengganti berkas', 'error')
    } finally {
      setUploading(false)
    }
  }

  // Handle delete click
  const handleDeleteClickBerkas = (berkas) => {
    setBerkasToDelete(berkas)
    setShowDeleteModal(true)
  }

  // Handle delete confirm
  const handleDeleteConfirmBerkas = async () => {
    if (!berkasToDelete) return

    setDeletingId(berkasToDelete.id)
    try {
      const result = await pendaftaranAPI.deleteBerkas(berkasToDelete.id)
      if (result.success) {
        showNotification('Berkas berhasil dihapus', 'success')
        if (localId && /^\d{7}$/.test(localId)) {
          fetchBerkasList(localId)
        }
        setShowDeleteModal(false)
        setBerkasToDelete(null)
      } else {
        showNotification(result.message || 'Gagal menghapus berkas', 'error')
      }
    } catch (err) {
      console.error('Error deleting berkas:', err)
      showNotification('Gagal menghapus berkas', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // Handle close delete modal
  const handleCloseDeleteModalBerkas = () => {
    if (deletingId) return // Jangan tutup saat sedang menghapus
    setShowDeleteModal(false)
    setBerkasToDelete(null)
  }

  return {
    // State
    berkasList,
    loadingBerkas,
    previewFile,
    showDeleteModal,
    berkasToDelete,
    deletingId,
    replacingId,
    replacingFile,
    replacingKeterangan,
    uploading,
    isBerkasOffcanvasOpen,
    selectedJenisBerkas,
    
    // Setters
    setBerkasList,
    setPreviewFile,
    setShowDeleteModal,
    setBerkasToDelete,
    setDeletingId,
    setReplacingId,
    setReplacingFile,
    setReplacingKeterangan,
    setUploading,
    setIsBerkasOffcanvasOpen,
    setSelectedJenisBerkas,
    
    // Functions
    fetchBerkasList,
    handlePreviewBerkas,
    handleClosePreviewBerkas,
    downloadForPreview,
    handleGantiClickBerkas,
    handleUpdateBerkas,
    handleDeleteClickBerkas,
    handleDeleteConfirmBerkas,
    handleCloseDeleteModalBerkas
  }
}

