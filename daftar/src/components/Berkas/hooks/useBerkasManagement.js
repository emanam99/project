import { useState, useLayoutEffect, useRef } from 'react'
import { pendaftaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import {
  getBerkasListCacheKey,
  readBerkasListCache,
  writeBerkasListCache,
  berkasListCacheMatchesUser,
} from '../../../utils/daftarPagesLocalCache'

/**
 * @param {string} localId id santri (PK)
 * @param {{ cacheNik?: string|null, onAfterMutation?: () => void }} [options]
 */
export const useBerkasManagement = (localId, options = {}) => {
  const { cacheNik, onAfterMutation } = options
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
  const hydratedFromCacheRef = useRef(false)
  const onAfterMutationRef = useRef(onAfterMutation)
  onAfterMutationRef.current = onAfterMutation

  useLayoutEffect(() => {
    hydratedFromCacheRef.current = false
    if (!localId) {
      setBerkasList([])
      setLoadingBerkas(false)
      return
    }
    const sessionNik =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
    const key = getBerkasListCacheKey(cacheNik || sessionNik, localId)
    const pack = readBerkasListCache(key)
    const pseudoUser = { id: localId, nik: cacheNik || '' }
    if (pack && berkasListCacheMatchesUser(pack.meta, pseudoUser, sessionNik)) {
      setBerkasList(pack.berkasList)
      hydratedFromCacheRef.current = true
      setLoadingBerkas(false)
    } else {
      setLoadingBerkas(true)
    }
  }, [localId, cacheNik])

  const fetchBerkasList = async (idSantri) => {
    if (!idSantri) {
      setBerkasList([])
      return
    }

    if (!hydratedFromCacheRef.current) {
      setLoadingBerkas(true)
    }
    try {
      const result = await pendaftaranAPI.getBerkasList(idSantri)
      const list = result.success && result.data ? result.data : []
      setBerkasList(list)
      const sessionNik =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
      const key = getBerkasListCacheKey(cacheNik || sessionNik, idSantri)
      writeBerkasListCache(key, list, {
        id_santri: String(idSantri),
        nik_snapshot: String(cacheNik || sessionNik || '').trim(),
      })
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
          await fetchBerkasList(localId)
          onAfterMutationRef.current?.()
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

  const handleUploadSuccess = async () => {
    if (localId) {
      await fetchBerkasList(localId)
      onAfterMutationRef.current?.()
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
    handleUploadSuccess,
  }
}
