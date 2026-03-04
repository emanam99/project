import { useState } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'

export const useBerkasManagement = (localId) => {
  const { showNotification } = useNotification()
  const [berkasList, setBerkasList] = useState([])
  const [loadingBerkas, setLoadingBerkas] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [berkasToDelete, setBerkasToDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [isBerkasOffcanvasOpen, setIsBerkasOffcanvasOpen] = useState(false)
  const [selectedJenisBerkas, setSelectedJenisBerkas] = useState(null)
  const [existingBerkasToReplace, setExistingBerkasToReplace] = useState(null)

  const fetchBerkasList = async (idSantri) => {
    if (!idSantri) {
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

  const handlePreviewBerkas = (berkas) => {
    setPreviewFile(berkas)
  }

  const handleClosePreviewBerkas = () => {
    setPreviewFile(null)
  }

  const downloadForPreview = async (idBerkas, namaFile) => {
    return await pendaftaranAPI.downloadBerkas(idBerkas)
  }

  const handleGantiClickBerkas = (berkas) => {
    setExistingBerkasToReplace(berkas)
    setIsBerkasOffcanvasOpen(true)
  }

  const handleDeleteClickBerkas = (berkas) => {
    setBerkasToDelete(berkas)
    setShowDeleteModal(true)
  }

  const handleDeleteConfirmBerkas = async () => {
    if (!berkasToDelete) return

    setDeletingId(berkasToDelete.id)
    try {
      const result = await pendaftaranAPI.deleteBerkas(berkasToDelete.id)
      if (result.success) {
        showNotification('Berkas berhasil dihapus', 'success')
        if (localId) {
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

  const handleCloseDeleteModalBerkas = () => {
    if (deletingId) return
    setShowDeleteModal(false)
    setBerkasToDelete(null)
  }

  const handleUploadSuccess = () => {
    if (localId) {
      fetchBerkasList(localId)
    }
    setExistingBerkasToReplace(null)
  }

  return {
    berkasList,
    loadingBerkas,
    previewFile,
    showDeleteModal,
    berkasToDelete,
    deletingId,
    isBerkasOffcanvasOpen,
    selectedJenisBerkas,
    existingBerkasToReplace,
    setBerkasList,
    setPreviewFile,
    setShowDeleteModal,
    setBerkasToDelete,
    setDeletingId,
    setIsBerkasOffcanvasOpen,
    setSelectedJenisBerkas,
    setExistingBerkasToReplace,
    fetchBerkasList,
    handlePreviewBerkas,
    handleClosePreviewBerkas,
    downloadForPreview,
    handleGantiClickBerkas,
    handleDeleteClickBerkas,
    handleDeleteConfirmBerkas,
    handleCloseDeleteModalBerkas,
    handleUploadSuccess
  }
}
