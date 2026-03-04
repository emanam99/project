import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { pengeluaranAPI, lembagaAPI, pemasukanAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useAuthStore } from '../../store/authStore'
import { useRencanaKomentarNotification } from '../../hooks/useRencanaKomentarNotification'
import Modal from '../Modal/Modal'
import PrintPengeluaranOffcanvas from '../../pages/Keuangan/Pengeluaran/components/PrintPengeluaranOffcanvas'

function DetailOffcanvas({
  isOpen,
  onClose,
  title,
  detailData,
  loading,
  type = 'pengeluaran', // 'pemasukan', 'pengeluaran', atau 'rencana'
  formatCurrency,
  formatDate,
  formatHijriyahDate,
  activeTab = 'masehi', // untuk format tanggal hijriyah
  // Props untuk rencana
  onEdit = null,
  onApprove = null,
  onReject = null,
  canEdit = false,
  canApprove = false,
  // Props untuk notifikasi admin (rencana)
  listAdmins = [],
  selectedAdmins = [],
  onToggleAdmin = null,
  loadingAdmins = false,
  onSendNotification = null,
  getStatusBadge = null
}) {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()
  const { sendKomentarNotification } = useRencanaKomentarNotification()
  const [komentar, setKomentar] = useState([])
  const [viewers, setViewers] = useState([])
  const [files, setFiles] = useState([])
  const [loadingKomentar, setLoadingKomentar] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewFileUrl, setPreviewFileUrl] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [newKomentar, setNewKomentar] = useState('')
  const [submittingKomentar, setSubmittingKomentar] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [komentarToDelete, setKomentarToDelete] = useState(null)
  const [deletingKomentar, setDeletingKomentar] = useState(false)
  // State untuk accordion (default tertutup)
  const [isRejectedOpen, setIsRejectedOpen] = useState(false)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  // State untuk accordion komentar (default tertutup)
  const [openKomentarAccordions, setOpenKomentarAccordions] = useState({})
  // State untuk penerima (hanya untuk type pengeluaran)
  const [pengurusList, setPengurusList] = useState([])
  const [loadingPengurus, setLoadingPengurus] = useState(false)
  const [selectedPenerima, setSelectedPenerima] = useState(null)
  const [updatingPenerima, setUpdatingPenerima] = useState(false)
  // State untuk edit mode (untuk type pengeluaran dan pemasukan)
  const [isEditMode, setIsEditMode] = useState(false)
  const [editFormData, setEditFormData] = useState({
    kategori: '',
    lembaga: '',
    sumber_uang: 'Cash',
    status: 'Cash' // untuk pemasukan
  })
  const [loadingLembaga, setLoadingLembaga] = useState(false)
  const [listLembaga, setListLembaga] = useState([])
  const [savingEdit, setSavingEdit] = useState(false)
  // State untuk print offcanvas (hanya untuk type pengeluaran)
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  // State untuk delete pengeluaran (hanya super_admin)
  const [showDeletePengeluaranModal, setShowDeletePengeluaranModal] = useState(false)
  const [deleteWithRencana, setDeleteWithRencana] = useState(false)
  const [deletingPengeluaran, setDeletingPengeluaran] = useState(false)

  // Prevent body scroll when offcanvas is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
      // Reset accordion state ketika offcanvas ditutup
      setIsRejectedOpen(false)
      setIsViewerOpen(false)
      setIsHistoryOpen(false)
      setIsEditMode(false)
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  // Load komentar dan viewer saat detail data berubah
  useEffect(() => {
    const loadKomentarAndViewer = async () => {
      if (!isOpen || !detailData) {
        setKomentar([])
        setViewers([])
        setPengurusList([])
        setSelectedPenerima(null)
        return
      }

      // Reset edit mode saat detail data berubah
      setIsEditMode(false)
      setEditFormData({
        kategori: detailData?.kategori || '',
        lembaga: detailData?.lembaga || '',
        sumber_uang: detailData?.sumber_uang || 'Cash',
        status: detailData?.status || detailData?.sumber_uang || 'Cash' // untuk pemasukan
      })

      // Load pengurus list untuk pengeluaran
      if (type === 'pengeluaran' && detailData?.id) {
        try {
          setLoadingPengurus(true)
          const response = await pengeluaranAPI.getPengurusByLembaga(detailData.id)
          if (response.success) {
            setPengurusList(response.data || [])
          }
          // Set selected penerima dari detailData
          setSelectedPenerima(detailData.id_penerima || null)
        } catch (error) {
          console.error('Error loading pengurus:', error)
          showNotification('Gagal memuat daftar pengurus', 'error')
          setPengurusList([])
        } finally {
          setLoadingPengurus(false)
        }
      }

      // Get id_rencana berdasarkan type
      let idRencana = null
      if (type === 'pengeluaran' && detailData?.id_rencana) {
        idRencana = detailData.id_rencana
      } else if (type === 'rencana' && detailData?.id) {
        idRencana = detailData.id
      } else {
        idRencana = detailData?.id_rencana || detailData?.id
      }

      if (!idRencana) {
        console.log('DetailOffcanvas: No idRencana found', { type, detailData })
        setKomentar([])
        setViewers([])
        return
      }

      try {
        setLoadingKomentar(true)
        setLoadingFiles(true)

        // Selalu fetch dari API untuk memastikan data terbaru (terutama viewer yang auto-track)
        console.log('DetailOffcanvas: Fetching komentar/viewer/files from API', { idRencana, type, detailDataId: detailData.id, detailDataIdRencana: detailData.id_rencana })
        const [komentarResponse, viewerResponse, filesResponse] = await Promise.all([
          pengeluaranAPI.getKomentar(idRencana),
          pengeluaranAPI.getViewer(idRencana),
          (type === 'rencana' || type === 'pengeluaran') ? pengeluaranAPI.getFiles(idRencana) : Promise.resolve({ success: true, data: [] })
        ])

        console.log('DetailOffcanvas: API responses', {
          komentarSuccess: komentarResponse.success,
          komentarCount: komentarResponse.data?.length || 0,
          komentarData: komentarResponse.data,
          viewerSuccess: viewerResponse.success,
          viewerCount: viewerResponse.data?.length || 0,
          viewerData: viewerResponse.data
        })

        if (komentarResponse.success) {
          const komentarData = komentarResponse.data || []
          console.log('DetailOffcanvas: Setting komentar state', { count: komentarData.length, data: komentarData })
          setKomentar(komentarData)
        } else {
          console.error('Failed to load komentar:', komentarResponse)
          setKomentar([])
        }

        if (viewerResponse.success) {
          const viewersData = viewerResponse.data || []
          console.log('DetailOffcanvas: Setting viewers state', { count: viewersData.length, data: viewersData })
          setViewers(viewersData)
        } else {
          console.error('Failed to load viewers:', viewerResponse)
          setViewers([])
        }

        if (filesResponse.success && (type === 'rencana' || type === 'pengeluaran')) {
          setFiles(filesResponse.data || [])
        } else {
          setFiles([])
        }
      } catch (error) {
        console.error('Error loading komentar/viewer:', error)
        // Fallback ke data dari detailData jika ada
        if (detailData?.komentar) {
          setKomentar(detailData.komentar || [])
        } else {
          setKomentar([])
        }
        if (detailData?.viewers) {
          setViewers(detailData.viewers || [])
        } else {
          setViewers([])
        }
        setFiles([])
      } finally {
        setLoadingKomentar(false)
        setLoadingFiles(false)
      }
    }

    loadKomentarAndViewer()
  }, [isOpen, detailData?.id, detailData?.id_rencana, type])

  // Load lembaga saat edit mode aktif
  useEffect(() => {
    const loadLembaga = async () => {
      if (type === 'pengeluaran' && isEditMode && listLembaga.length === 0) {
        try {
          setLoadingLembaga(true)
          const response = await lembagaAPI.getAll()
          if (response.success) {
            setListLembaga(response.data || [])
          }
        } catch (error) {
          console.error('Error loading lembaga:', error)
          showNotification('Gagal memuat daftar lembaga', 'error')
        } finally {
          setLoadingLembaga(false)
        }
      }
    }

    loadLembaga()
  }, [isEditMode, type, listLembaga.length, showNotification])

  // Handler untuk save edit pengeluaran atau pemasukan
  const handleSaveEdit = async () => {
    if (!detailData?.id) return

    try {
      setSavingEdit(true)

      if (type === 'pemasukan') {
        const response = await pemasukanAPI.update(detailData.id, {
          kategori: editFormData.kategori || null,
          status: editFormData.status || 'Cash'
        })

        if (response.success) {
          showNotification('Pemasukan berhasil diupdate', 'success')
          setIsEditMode(false)

          // Reload detail data dari API untuk memastikan konsistensi
          try {
            const detailResponse = await pemasukanAPI.getDetail(detailData.id)
            if (detailResponse.success && detailResponse.data) {
              // Update detailData lokal dengan data terbaru
              Object.assign(detailData, detailResponse.data)
              // Update form data dengan data terbaru
              setEditFormData({
                kategori: detailResponse.data.kategori || '',
                lembaga: '',
                sumber_uang: 'Cash',
                status: detailResponse.data.status || detailResponse.data.sumber_uang || 'Cash'
              })
            }
          } catch (reloadError) {
            console.error('Error reloading detail:', reloadError)
            // Fallback: update lokal saja
            if (detailData) {
              detailData.kategori = editFormData.kategori || null
              detailData.status = editFormData.status || 'Cash'
              detailData.sumber_uang = editFormData.status || 'Cash'
            }
          }
        } else {
          showNotification(response.message || 'Gagal mengupdate pemasukan', 'error')
        }
      } else if (type === 'pengeluaran') {
        const response = await pengeluaranAPI.updatePengeluaran(detailData.id, {
          kategori: editFormData.kategori || null,
          lembaga: editFormData.lembaga || null,
          sumber_uang: editFormData.sumber_uang || 'Cash'
        })

        if (response.success) {
          showNotification('Pengeluaran berhasil diupdate', 'success')
          setIsEditMode(false)

          // Reload detail data dari API untuk memastikan konsistensi
          try {
            const oldLembaga = detailData.lembaga
            const detailResponse = await pengeluaranAPI.getPengeluaranDetail(detailData.id)
            if (detailResponse.success && detailResponse.data) {
              // Update detailData lokal dengan data terbaru
              Object.assign(detailData, detailResponse.data)
              // Update form data dengan data terbaru
              setEditFormData({
                kategori: detailResponse.data.kategori || '',
                lembaga: detailResponse.data.lembaga || '',
                sumber_uang: detailResponse.data.sumber_uang || 'Cash',
                status: 'Cash'
              })
              // Reload pengurus jika lembaga berubah
              if (detailResponse.data.lembaga && detailResponse.data.lembaga !== oldLembaga) {
                const pengurusResponse = await pengeluaranAPI.getPengurusByLembaga(detailData.id)
                if (pengurusResponse.success) {
                  setPengurusList(pengurusResponse.data || [])
                }
              }
            }
          } catch (reloadError) {
            console.error('Error reloading detail:', reloadError)
            // Fallback: update lokal saja
            if (detailData) {
              detailData.kategori = editFormData.kategori || null
              detailData.lembaga = editFormData.lembaga || null
              detailData.sumber_uang = editFormData.sumber_uang || 'Cash'
            }
          }
        } else {
          showNotification(response.message || 'Gagal mengupdate pengeluaran', 'error')
        }
      }
    } catch (error) {
      console.error('Error saving edit:', error)
      const errorMessage = type === 'pemasukan' ? 'Gagal mengupdate pemasukan' : 'Gagal mengupdate pengeluaran'
      showNotification(error.response?.data?.message || errorMessage, 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  // Handler untuk cancel edit
  const handleCancelEdit = () => {
    setIsEditMode(false)
    setEditFormData({
      kategori: detailData?.kategori || '',
      lembaga: detailData?.lembaga || '',
      sumber_uang: detailData?.sumber_uang || 'Cash',
      status: detailData?.status || detailData?.sumber_uang || 'Cash' // untuk pemasukan
    })
  }

  // Get id_rencana - untuk pengeluaran yang sudah di-approve, ambil dari id_rencana
  const getIdRencana = () => {
    if (type === 'pengeluaran' && detailData?.id_rencana) {
      return detailData.id_rencana
    }
    // Untuk rencana, langsung pakai id
    if (type === 'rencana' && detailData?.id) {
      return detailData.id
    }
    // Fallback: coba id_rencana jika ada
    return detailData?.id_rencana || detailData?.id
  }

  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const getFileIcon = (fileType, fileName = '') => {
    // Cek berdasarkan ekstensi file juga sebagai fallback
    const fileExtension = fileName?.toLowerCase().split('.').pop() || ''

    if (fileType?.startsWith('image/')) {
      // Image: Cyan/Teal
      return (
        <svg className="w-5 h-5 text-cyan-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    } else if (fileType === 'application/pdf' || fileExtension === 'pdf') {
      // PDF: Merah
      return (
        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    } else if (fileType?.includes('word') || fileType === 'application/msword' || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileExtension === 'doc' || fileExtension === 'docx') {
      // Word: Biru
      return (
        <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    } else if (fileType?.includes('excel') || fileType === 'application/vnd.ms-excel' || fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileExtension === 'xls' || fileExtension === 'xlsx') {
      // Excel: Hijau
      return (
        <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    } else {
      // File lain: Orange
      return (
        <svg className="w-5 h-5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    }
  }

  const isPreviewable = (fileType) => {
    return fileType?.startsWith('image/') || fileType === 'application/pdf'
  }

  const getFileTypeLabel = (fileType, fileName = '') => {
    const fileExtension = fileName?.toLowerCase().split('.').pop() || ''

    if (fileType?.startsWith('image/')) {
      return { label: 'Gambar', color: 'text-cyan-500' }
    } else if (fileType === 'application/pdf' || fileExtension === 'pdf') {
      return { label: 'PDF', color: 'text-red-500' }
    } else if (fileType?.includes('word') || fileType === 'application/msword' || fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileExtension === 'doc' || fileExtension === 'docx') {
      return { label: 'Word', color: 'text-blue-500' }
    } else if (fileType?.includes('excel') || fileType === 'application/vnd.ms-excel' || fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileExtension === 'xls' || fileExtension === 'xlsx') {
      return { label: 'Excel', color: 'text-green-500' }
    } else {
      return { label: 'File', color: 'text-orange-500' }
    }
  }

  const handleDownloadFile = async (fileId, fileName) => {
    try {
      const blob = await pengeluaranAPI.downloadFile(fileId)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error downloading file:', err)
      showNotification('Gagal mengunduh file', 'error')
    }
  }

  const handlePreviewFile = async (file) => {
    try {
      setLoadingPreview(true)
      setPreviewFile(file)
      const blob = await pengeluaranAPI.downloadFile(file.id)
      const url = window.URL.createObjectURL(blob)
      setPreviewFileUrl(url)
    } catch (err) {
      console.error('Error loading file for preview:', err)
      showNotification('Gagal memuat file untuk preview', 'error')
      setPreviewFile(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleClosePreview = () => {
    if (previewFileUrl) {
      window.URL.revokeObjectURL(previewFileUrl)
    }
    setPreviewFile(null)
    setPreviewFileUrl(null)
  }

  // Cek apakah bisa tambah komentar (tidak bisa jika sudah di-approve dan jadi pengeluaran)
  const canAddKomentar = () => {
    if (type === 'pengeluaran') {
      // Pengeluaran yang sudah di-approve tidak bisa tambah komentar
      return false
    }
    // Rencana bisa tambah komentar selama belum di-approve
    return detailData?.ket !== 'di approve'
  }

  const handleSubmitKomentar = async (e) => {
    e.preventDefault()
    const idRencana = getIdRencana()
    if (!newKomentar.trim() || !idRencana || !canAddKomentar()) return

    try {
      setSubmittingKomentar(true)
      const response = await pengeluaranAPI.createKomentar(idRencana, newKomentar.trim())
      if (response.success) {
        // Refresh komentar dari API untuk mendapatkan data lengkap
        const komentarResponse = await pengeluaranAPI.getKomentar(idRencana)
        if (komentarResponse.success) {
          setKomentar(komentarResponse.data || [])
        } else {
          // Fallback: tambahkan komentar baru ke list
          setKomentar([response.data, ...(komentar || [])])
        }
        setNewKomentar('')
        showNotification('Komentar berhasil ditambahkan', 'success')

        // Kirim notifikasi PWA ke super_admin dan admin_uwaba
        // Hanya untuk type 'rencana' (bukan pengeluaran atau pemasukan)
        if (type === 'rencana' && detailData) {
          try {
            await sendKomentarNotification({
              rencanaId: idRencana,
              rencanaKeterangan: detailData.keterangan || 'Rencana Pengeluaran',
              komentar: newKomentar.trim(),
              komentarAuthor: user?.nama || 'Admin'
            })
          } catch (notifError) {
            // Jangan ganggu flow utama jika notifikasi gagal
            console.error('Error sending PWA notification:', notifError)
          }
        }
      } else {
        showNotification(response.message || 'Gagal menambahkan komentar', 'error')
      }
    } catch (error) {
      console.error('Error submitting komentar:', error)
      showNotification('Gagal menambahkan komentar', 'error')
    } finally {
      setSubmittingKomentar(false)
    }
  }

  const handleDeleteKomentarClick = (item) => {
    setKomentarToDelete(item)
    setShowDeleteModal(true)
  }

  const handleConfirmDeleteKomentar = async () => {
    if (!komentarToDelete) return
    const idRencana = getIdRencana()
    if (!idRencana) return

    try {
      setDeletingKomentar(true)
      const response = await pengeluaranAPI.deleteKomentar(idRencana, komentarToDelete.id)
      if (response.success) {
        // Refresh komentar dari API untuk memastikan data terbaru
        const komentarResponse = await pengeluaranAPI.getKomentar(idRencana)
        if (komentarResponse.success) {
          setKomentar(komentarResponse.data || [])
        } else {
          // Fallback: hapus dari list lokal
          setKomentar((komentar || []).filter(k => k.id !== komentarToDelete.id))
        }
        setShowDeleteModal(false)
        setKomentarToDelete(null)
        showNotification('Komentar berhasil dihapus', 'success')
      } else {
        showNotification(response.message || 'Gagal menghapus komentar', 'error')
      }
    } catch (error) {
      console.error('Error deleting komentar:', error)
      showNotification('Gagal menghapus komentar', 'error')
    } finally {
      setDeletingKomentar(false)
    }
  }

  // Cek apakah bisa hapus komentar (hanya author atau super admin)
  const canDeleteKomentar = (item) => {
    if (!item || !user) return false
    const userId = user?.id || user?.user_id
    const userLevel = user?.level || user?.role
    // Bisa hapus jika user adalah author atau super admin
    return item.id_admin == userId || userLevel === 'super_admin'
  }

  const isSuperAdmin = user?.all_roles?.includes('super_admin') || user?.role_key === 'super_admin'

  const handleDeletePengeluaran = async () => {
    if (!detailData?.id) return

    try {
      setDeletingPengeluaran(true)
      const response = await pengeluaranAPI.deletePengeluaran(detailData.id, deleteWithRencana)

      if (response.success) {
        showNotification('Pengeluaran berhasil dihapus', 'success')
        setShowDeletePengeluaranModal(false)
        onClose()
        // Trigger refresh parent component if needed (usually handled by parent checking isOpen)
        // Need to reload window or trigger callback if available
        window.location.reload() // Simple solution for now, ideally passed callback
      } else {
        showNotification(response.message || 'Gagal menghapus pengeluaran', 'error')
      }
    } catch (error) {
      console.error('Error deleting pengeluaran:', error)
      showNotification(error.response?.data?.message || 'Gagal menghapus pengeluaran', 'error')
    } finally {
      setDeletingPengeluaran(false)
    }
  }

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="detail-offcanvas-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black bg-opacity-40"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99998
            }}
            onClick={onClose}
          />
        )}
        {isOpen && (
          <motion.div
            key="detail-offcanvas-panel"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={offcanvasTransition}
            className="bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl flex flex-col"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              width: '100%',
              maxHeight: '90vh',
              minHeight: '300px',
              zIndex: 99999,
              overflow: 'hidden'
            }}
          >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-bold dark:text-gray-200 truncate pr-2">
                  {detailData?.keterangan || title || (type === 'rencana' ? 'Detail Rencana Pengeluaran' : type === 'pemasukan' ? 'Detail Pemasukan' : 'Detail Pengeluaran')}
                </h2>
                <div className="flex items-center gap-2">
                  {/* DELETE BUTTON - Only for Pengeluaran & Super Admin */}
                  {type === 'pengeluaran' && isSuperAdmin && (
                    <button
                      onClick={() => {
                        setDeleteWithRencana(false)
                        setShowDeletePengeluaranModal(true)
                      }}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Hapus Pengeluaran"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors p-2"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-4 py-4 lg:overflow-hidden lg:flex lg:flex-col">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
                  </div>
                ) : detailData ? (
                  type === 'pemasukan' ? (
                    /* Detail Pemasukan */
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Informasi Umum
                          </h3>
                          {type === 'pemasukan' && !isEditMode && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditFormData({
                                    kategori: detailData?.kategori || '',
                                    lembaga: '',
                                    sumber_uang: 'Cash',
                                    status: detailData?.status || detailData?.sumber_uang || 'Cash'
                                  })
                                  setIsEditMode(true)
                                }}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Keterangan:</span>
                            <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.keterangan || 'Tanpa Keterangan'}</span>
                          </div>
                          {isEditMode ? (
                            <>
                              <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1">Kategori:</label>
                                <select
                                  value={editFormData.kategori}
                                  onChange={(e) => setEditFormData(prev => ({ ...prev, kategori: e.target.value }))}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                                >
                                  <option value="">Pilih Kategori</option>
                                  <option value="UWABA">UWABA</option>
                                  <option value="Tunggakan">Tunggakan</option>
                                  <option value="Khusus">Khusus</option>
                                  <option value="PSB">PSB</option>
                                  <option value="Beasiswa">Beasiswa</option>
                                  <option value="Lembaga">Lembaga</option>
                                  <option value="Cashback">Cashback</option>
                                  <option value="BOS">BOS</option>
                                  <option value="Lainnya">Lainnya</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1">Status:</label>
                                <select
                                  value={editFormData.status}
                                  onChange={(e) => setEditFormData(prev => ({ ...prev, status: e.target.value }))}
                                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                                >
                                  <option value="Cash">Cash</option>
                                  <option value="TF">Transfer</option>
                                </select>
                              </div>
                              <div className="flex gap-2 pt-2">
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={savingEdit}
                                  className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                >
                                  {savingEdit ? (
                                    <>
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                      <span>Menyimpan...</span>
                                    </>
                                  ) : (
                                    <>
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                      </svg>
                                      <span>Simpan</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={savingEdit}
                                  className="flex-1 px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Batal
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              {detailData.kategori && (
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Kategori:</span>
                                  <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.kategori}</span>
                                </div>
                              )}
                              {(detailData.sumber_uang || detailData.status) && (
                                <div className="flex justify-between">
                                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                    Status:
                                  </span>
                                  <span className={`text-sm font-medium ${(detailData.sumber_uang || detailData.status) === 'Cash'
                                    ? 'text-green-600 dark:text-green-400'
                                    : 'text-orange-600 dark:text-orange-400'
                                    }`}>
                                    {detailData.sumber_uang || detailData.status}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Nominal:</span>
                            <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
                              {formatCurrency(parseFloat(detailData.nominal || 0))}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Dibuat Oleh:</span>
                            <span className="text-sm text-gray-800 dark:text-gray-200">
                              {detailData.admin_nama || 'Unknown'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Tanggal Dibuat:</span>
                            <span className="text-sm text-gray-800 dark:text-gray-200">
                              {activeTab === 'hijriyah' && detailData.hijriyah
                                ? formatHijriyahDate ? formatHijriyahDate(detailData.hijriyah) : detailData.hijriyah
                                : formatDate ? formatDate(detailData.tanggal_dibuat) : new Date(detailData.tanggal_dibuat).toLocaleString('id-ID')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : type === 'rencana' ? (
                    /* Detail Rencana */
                    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:h-full lg:min-h-0">
                      {/* Kolom Kiri: Informasi Umum dan Detail Items */}
                      <div className="space-y-6 lg:overflow-y-auto lg:pr-2 lg:h-full">
                        {/* Informasi Umum */}
                        <div>
                          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3">
                            Informasi Umum
                          </h3>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Keterangan:</span>
                              <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.keterangan || 'Tanpa Keterangan'}</span>
                            </div>
                            {detailData.kategori && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Kategori:</span>
                                <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.kategori}</span>
                              </div>
                            )}
                            {detailData.lembaga && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Lembaga:</span>
                                <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.lembaga}</span>
                              </div>
                            )}
                            {detailData.sumber_uang && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sumber Uang:</span>
                                <span className={`text-sm font-medium ${detailData.sumber_uang === 'Cash'
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-orange-600 dark:text-orange-400'
                                  }`}>
                                  {detailData.sumber_uang}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Nominal:</span>
                              <span className="text-lg font-bold text-teal-600 dark:text-teal-400">
                                {formatCurrency(parseFloat(detailData.nominal || 0))}
                              </span>
                            </div>
                            {detailData.ket && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Status:</span>
                                <span>{getStatusBadge ? getStatusBadge(detailData.ket) : detailData.ket}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Dibuat Oleh:</span>
                              <span className="text-sm text-gray-800 dark:text-gray-200">
                                {detailData.admin_nama || 'Unknown'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Tanggal Dibuat:</span>
                              <span className="text-sm text-gray-800 dark:text-gray-200">
                                {formatDate ? formatDate(detailData.tanggal_dibuat) : new Date(detailData.tanggal_dibuat).toLocaleString('id-ID')}
                              </span>
                            </div>
                            {detailData.hijriyah && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Hijriyah:</span>
                                <span className="text-sm text-gray-800 dark:text-gray-200">
                                  {detailData.hijriyah}
                                </span>
                              </div>
                            )}
                            {detailData.tahun_ajaran && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Tahun Ajaran:</span>
                                <span className="text-sm text-gray-800 dark:text-gray-200">
                                  {detailData.tahun_ajaran}
                                </span>
                              </div>
                            )}
                            {detailData.ket === 'di approve' && detailData.admin_approve_nama && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Di-approve Oleh:</span>
                                <span className="text-sm text-gray-800 dark:text-gray-200">
                                  {detailData.admin_approve_nama}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Detail Items dengan Status */}
                        {detailData.details && detailData.details.length > 0 && (
                          <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                              Detail Items
                            </h3>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="bg-gray-100 dark:bg-gray-700">
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Item
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Harga
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Jumlah
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Nominal
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Oleh
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Versi
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailData.details.map((detail, index) => (
                                    <tr key={index} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${detail.rejected ? 'bg-red-50 dark:bg-red-900/20' : ''
                                      }`}>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {detail.item}
                                      </td>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-right text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {formatCurrency(parseFloat(detail.harga || 0))}
                                      </td>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-right text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {detail.jumlah}
                                      </td>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-right font-medium text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {formatCurrency(parseFloat(detail.nominal || 0))}
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
                                        {detail.admin_nama || 'Unknown'}
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-center text-gray-800 dark:text-gray-200">
                                        {detail.versi || '-'}
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs">
                                        {detail.rejected ? (
                                          <div>
                                            <span className="text-red-600 dark:text-red-400 font-medium">Ditolak</span>
                                            {detail.alasan_penolakan && (
                                              <div className="mt-1 text-xs text-red-500 dark:text-red-400 italic">
                                                {detail.alasan_penolakan}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-green-600 dark:text-green-400 font-medium">Disetujui</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* File Lampiran */}
                        {type === 'rencana' && (
                          <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              File Lampiran
                            </h3>
                            {loadingFiles ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                              </div>
                            ) : files.length > 0 ? (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                                {files.map((file) => (
                                  <div
                                    key={file.id}
                                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600"
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      {getFileIcon(file.tipe_file, file.nama_file)}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                          {file.nama_file}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          <span className={getFileTypeLabel(file.tipe_file, file.nama_file).color}>
                                            {getFileTypeLabel(file.tipe_file, file.nama_file).label}
                                          </span>
                                          {' • '}
                                          {formatFileSize(file.ukuran_file)}
                                          {' • '}
                                          {file.admin_nama || 'Unknown'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3">
                                      {isPreviewable(file.tipe_file) && (
                                        <button
                                          onClick={() => handlePreviewFile(file)}
                                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                          title="Preview"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDownloadFile(file.id, file.nama_file)}
                                        className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors"
                                        title="Download"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Belum ada file yang di-upload
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Kolom Kanan: Item yang Ditolak, Komentar, Viewer, History Edit, Notifikasi */}
                      <div className="space-y-6 lg:overflow-y-auto lg:pl-2 lg:max-h-full">
                        {/* Item yang Ditolak dengan Alasan - Accordion */}
                        {detailData.rejected_details && detailData.rejected_details.length > 0 && (
                          <div className="mt-4">
                            <button
                              onClick={() => setIsRejectedOpen(!isRejectedOpen)}
                              className="w-full flex items-center justify-between text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>Item yang Ditolak ({detailData.rejected_details.length})</span>
                              </div>
                              <motion.svg
                                animate={{ rotate: isRejectedOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                            <AnimatePresence>
                              {isRejectedOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                                    <div className="space-y-3">
                                      {detailData.rejected_details.map((detail, index) => (
                                        <div key={index} className="flex items-start justify-between text-sm border-l-2 border-red-500 pl-3 py-2">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="font-medium text-red-600 dark:text-red-400 line-through">
                                                {detail.item}
                                              </span>
                                              {detail.admin_nama && (
                                                <span className="text-gray-600 dark:text-gray-400 text-xs">
                                                  (Ditolak oleh: <span className="font-medium">{detail.admin_nama}</span>)
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-gray-600 dark:text-gray-400 line-through mb-1">
                                              {formatCurrency(parseFloat(detail.harga || 0))} × {detail.jumlah} = <span className="font-medium">{formatCurrency(parseFloat(detail.nominal || 0))}</span>
                                            </div>
                                            {detail.alasan_penolakan && (
                                              <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-800 dark:text-red-300">
                                                <span className="font-medium">Alasan:</span> {detail.alasan_penolakan}
                                              </div>
                                            )}
                                          </div>
                                          <span className="text-gray-500 dark:text-gray-500 text-xs ml-4">
                                            {new Date(detail.tanggal_dibuat).toLocaleString('id-ID')}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Viewer Info - untuk rencana - Accordion */}
                        {type === 'rencana' && (
                          <div className="mt-4">
                            <button
                              onClick={() => setIsViewerOpen(!isViewerOpen)}
                              className="w-full flex items-center justify-between text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>Sudah Dilihat ({Array.isArray(viewers) ? viewers.length : 0})</span>
                              </div>
                              <motion.svg
                                animate={{ rotate: isViewerOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                            <AnimatePresence>
                              {isViewerOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                                    {loadingKomentar ? (
                                      <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                                        Memuat...
                                      </div>
                                    ) : Array.isArray(viewers) && viewers.length > 0 ? (
                                      <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {viewers.map((viewer) => (
                                          <div key={viewer.id} className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                              </div>
                                              <div>
                                                <p className="font-medium text-gray-800 dark:text-gray-200 text-xs">
                                                  {viewer.admin_nama || 'Unknown'}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                  {new Date(viewer.tanggal_dilihat).toLocaleString('id-ID')}
                                                  {viewer.jumlah_view > 1 && ` • ${viewer.jumlah_view}x dilihat`}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                                        Belum ada yang melihat
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Komentar Section - untuk rencana */}
                        {type === 'rencana' && (
                          <div className="mt-4">
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              Komentar ({Array.isArray(komentar) ? komentar.length : 0})
                            </h3>

                            {/* Form Tambah Komentar - Hanya tampil jika bisa tambah komentar */}
                            {canAddKomentar() && (
                              <form onSubmit={handleSubmitKomentar} className="mb-4">
                                <div className="flex gap-2">
                                  <input
                                    id="komentar-input"
                                    type="text"
                                    value={newKomentar}
                                    onChange={(e) => setNewKomentar(e.target.value)}
                                    placeholder="Tulis komentar..."
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    disabled={submittingKomentar}
                                  />
                                  <button
                                    type="submit"
                                    disabled={!newKomentar.trim() || submittingKomentar}
                                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                                  >
                                    {submittingKomentar ? 'Mengirim...' : 'Kirim'}
                                  </button>
                                </div>
                              </form>
                            )}

                            {/* List Komentar */}
                            {loadingKomentar ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                              </div>
                            ) : Array.isArray(komentar) && komentar.length > 0 ? (
                              <div className="space-y-3 max-h-96 overflow-y-auto">
                                {komentar.map((item) => {
                                  const isAdminUwaba = item.admin_role && item.admin_role.toLowerCase().includes('admin uwaba');
                                  return (
                                    <div key={item.id} className={`rounded-lg p-3 border relative ${isAdminUwaba
                                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                      : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                                      }`}>
                                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-2">
                                        {item.komentar}
                                      </p>
                                      <div className="flex items-center justify-between mt-2">
                                        <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                                          {item.admin_nama || 'Unknown'}
                                        </span>
                                        <button
                                          onClick={() => setOpenKomentarAccordions(prev => ({
                                            ...prev,
                                            [item.id]: !prev[item.id]
                                          }))}
                                          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                                        >
                                          <span>Detail</span>
                                          <motion.svg
                                            animate={{ rotate: (openKomentarAccordions[item.id] || false) ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="w-3 h-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                          </motion.svg>
                                        </button>
                                      </div>
                                      <AnimatePresence>
                                        {(openKomentarAccordions[item.id] || false) && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden mt-2 pt-2 border-t border-gray-200 dark:border-gray-600"
                                          >
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                {item.admin_role && (
                                                  <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded">
                                                    {item.admin_role}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-3">
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                  {new Date(item.tanggal_dibuat).toLocaleString('id-ID')}
                                                </span>
                                                {canDeleteKomentar(item) && (
                                                  <button
                                                    onClick={() => handleDeleteKomentarClick(item)}
                                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors p-1"
                                                    title="Hapus komentar"
                                                  >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-600">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Belum ada komentar
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* List Admin untuk Notifikasi - hanya untuk rencana */}
                        {type === 'rencana' && listAdmins && (
                          <div>
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                Notifikasi
                              </h3>
                              {detailData && onSendNotification && (
                                <button
                                  onClick={() => onSendNotification && onSendNotification()}
                                  disabled={!selectedAdmins || selectedAdmins.length === 0}
                                  className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                                >
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0112.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                                  </svg>
                                  kirim ulang
                                </button>
                              )}
                            </div>
                            {loadingAdmins ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                              </div>
                            ) : listAdmins.length > 0 ? (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                  {listAdmins.map((admin) => (
                                    <div
                                      key={admin.id}
                                      className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedAdmins.includes(admin.id)}
                                        onChange={() => onToggleAdmin && onToggleAdmin(admin.id)}
                                        className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                                      />
                                      <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                          {admin.nama || 'Unknown'}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          {admin.whatsapp}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Tidak ada admin tersedia
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* History Edit - untuk rencana - Accordion */}
                        {detailData.edit_history && Object.keys(detailData.edit_history).length > 0 && (
                          <div className="mt-4">
                            <button
                              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                              className="w-full flex items-center justify-between text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <span>History Edit</span>
                              <motion.svg
                                animate={{ rotate: isHistoryOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                            <AnimatePresence>
                              {isHistoryOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="space-y-4">
                                    {Object.entries(detailData.edit_history).map(([item, history]) => (
                                      <div key={item} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                        <div className="px-4 py-2.5 border-b bg-gradient-to-r from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/30 border-teal-200 dark:border-teal-800">
                                          <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">
                                            <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            {item}
                                          </h4>
                                        </div>
                                        <div className="p-4">
                                          <div className="relative">
                                            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-teal-200 dark:bg-teal-800"></div>
                                            <div className="space-y-3">
                                              {history.map((hist, idx) => (
                                                <div key={idx} className="relative pl-8">
                                                  <div className="absolute left-0 top-1.5 w-6 h-6 bg-teal-500 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center">
                                                    <span className="text-[10px] font-bold text-white">{hist.versi}</span>
                                                  </div>
                                                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 relative">
                                                    <div className="space-y-2 pr-20 sm:pr-24">
                                                      <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 rounded text-xs font-medium">
                                                          Versi {hist.versi}
                                                        </span>
                                                        {hist.admin_nama && (
                                                          <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                            </svg>
                                                            {hist.admin_nama}
                                                          </span>
                                                        )}
                                                      </div>
                                                      <div className="absolute top-3 right-3 bg-teal-50 dark:bg-teal-900/20 rounded px-2 py-1 border border-teal-200 dark:border-teal-800">
                                                        <div className="text-teal-600 dark:text-teal-400 text-[9px] sm:text-[10px] font-medium mb-0.5">Total</div>
                                                        <div className="font-bold text-teal-700 dark:text-teal-300 text-xs sm:text-sm">
                                                          {formatCurrency(parseFloat(hist.nominal || 0))}
                                                        </div>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                          </svg>
                                                          {new Date(hist.tanggal_dibuat).toLocaleString('id-ID', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                          })}
                                                        </span>
                                                      </div>
                                                      <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-gray-600 dark:text-gray-400">Harga:</span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                          {formatCurrency(parseFloat(hist.harga || 0))}
                                                        </span>
                                                        <span className="text-gray-400 dark:text-gray-500">×</span>
                                                        <span className="text-gray-600 dark:text-gray-400">Jumlah:</span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                          {hist.jumlah}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div >
                    </div >
                  ) : (
                    /* Detail Pengeluaran */
                    <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0 lg:h-full lg:min-h-0">
                      {/* Kolom Kiri: Informasi Umum dan Detail Items */}
                      <div className="space-y-6 lg:overflow-y-auto lg:pr-2 lg:h-full">
                        {/* Informasi Umum */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                              Informasi Umum
                            </h3>
                            {type === 'pengeluaran' && !isEditMode && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setShowPrintOffcanvas(true)}
                                  className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                  </svg>
                                  <span>Print</span>
                                </button>
                                <button
                                  onClick={() => setIsEditMode(true)}
                                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                  <span>Edit</span>
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Keterangan:</span>
                              <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.keterangan || 'Tanpa Keterangan'}</span>
                            </div>
                            {isEditMode ? (
                              <>
                                <div>
                                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1">Kategori:</label>
                                  <select
                                    value={editFormData.kategori}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, kategori: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                                  >
                                    <option value="">Pilih Kategori</option>
                                    <option value="Bisyaroh">Bisyaroh</option>
                                    <option value="Acara">Acara</option>
                                    <option value="Pengadaan">Pengadaan</option>
                                    <option value="Perbaikan">Perbaikan</option>
                                    <option value="ATK">ATK</option>
                                    <option value="Listrik">Listrik</option>
                                    <option value="Wifi">Wifi</option>
                                    <option value="Langganan">Langganan</option>
                                    <option value="lainnya">Lainnya</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1">Lembaga:</label>
                                  {loadingLembaga ? (
                                    <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center">
                                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600 mr-2"></div>
                                      <span className="text-xs text-gray-500 dark:text-gray-400">Memuat lembaga...</span>
                                    </div>
                                  ) : (
                                    <select
                                      value={editFormData.lembaga}
                                      onChange={(e) => setEditFormData(prev => ({ ...prev, lembaga: e.target.value }))}
                                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                                    >
                                      <option value="">Pilih Lembaga</option>
                                      {listLembaga.map((lembaga) => (
                                        <option key={lembaga.id} value={lembaga.id}>
                                          {lembaga.id}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                                <div>
                                  <label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1">Sumber Uang:</label>
                                  <select
                                    value={editFormData.sumber_uang}
                                    onChange={(e) => setEditFormData(prev => ({ ...prev, sumber_uang: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                                  >
                                    <option value="Cash">Cash</option>
                                    <option value="TF">Transfer</option>
                                  </select>
                                </div>
                                <div className="flex gap-2 pt-2">
                                  <button
                                    onClick={handleSaveEdit}
                                    disabled={savingEdit}
                                    className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                                  >
                                    {savingEdit ? (
                                      <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                        <span>Menyimpan...</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                        <span>Simpan</span>
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={handleCancelEdit}
                                    disabled={savingEdit}
                                    className="flex-1 px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    Batal
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                {detailData.kategori && (
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Kategori:</span>
                                    <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.kategori}</span>
                                  </div>
                                )}
                                {detailData.lembaga && (
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Lembaga:</span>
                                    <span className="text-sm text-gray-800 dark:text-gray-200">{detailData.lembaga}</span>
                                  </div>
                                )}
                                {detailData.sumber_uang && (
                                  <div className="flex justify-between">
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Sumber Uang:</span>
                                    <span className={`text-sm font-medium ${detailData.sumber_uang === 'Cash'
                                      ? 'text-green-600 dark:text-green-400'
                                      : 'text-orange-600 dark:text-orange-400'
                                      }`}>
                                      {detailData.sumber_uang}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Nominal:</span>
                              <span className="text-lg font-bold text-primary-600 dark:text-primary-400">
                                {formatCurrency(parseFloat(detailData.nominal || 0))}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Dibuat Oleh:</span>
                              <span className="text-sm text-gray-800 dark:text-gray-200">
                                {detailData.admin_nama || 'Unknown'}
                              </span>
                            </div>
                            {detailData.admin_approve_nama && (
                              <div className="flex justify-between">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Di-approve Oleh:</span>
                                <span className="text-sm text-gray-800 dark:text-gray-200">
                                  {detailData.admin_approve_nama}
                                </span>
                              </div>
                            )}
                            {/* Select Penerima - hanya untuk type pengeluaran */}
                            {type === 'pengeluaran' && (
                              <div className="flex flex-col gap-2">
                                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Penerima:</span>
                                <select
                                  value={selectedPenerima || ''}
                                  onChange={async (e) => {
                                    const newPenerimaId = e.target.value ? parseInt(e.target.value) : null
                                    setSelectedPenerima(newPenerimaId)

                                    // Update ke backend
                                    try {
                                      setUpdatingPenerima(true)
                                      const response = await pengeluaranAPI.updatePengeluaran(detailData.id, {
                                        id_penerima: newPenerimaId
                                      })
                                      if (response.success) {
                                        showNotification('Penerima berhasil diupdate', 'success')
                                        // Update detailData untuk refresh
                                        if (detailData) {
                                          const selectedPengurus = pengurusList.find(p => p.id === newPenerimaId)
                                          detailData.id_penerima = newPenerimaId
                                          detailData.penerima_nama = selectedPengurus?.nama_lengkap || selectedPengurus?.nama || null
                                        }
                                      } else {
                                        showNotification(response.message || 'Gagal mengupdate penerima', 'error')
                                        // Revert selection
                                        setSelectedPenerima(detailData?.id_penerima || null)
                                      }
                                    } catch (error) {
                                      console.error('Error updating penerima:', error)
                                      showNotification(error.response?.data?.message || 'Gagal mengupdate penerima', 'error')
                                      // Revert selection
                                      setSelectedPenerima(detailData?.id_penerima || null)
                                    } finally {
                                      setUpdatingPenerima(false)
                                    }
                                  }}
                                  disabled={loadingPengurus || updatingPenerima}
                                  className="text-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <option value="">-- Pilih Penerima --</option>
                                  {loadingPengurus ? (
                                    <option value="" disabled>Memuat daftar pengurus...</option>
                                  ) : pengurusList.length > 0 ? (
                                    pengurusList.map((pengurus) => (
                                      <option key={pengurus.id} value={pengurus.id}>
                                        {pengurus.nama_lengkap || pengurus.nama} {pengurus.roles ? `(${pengurus.roles})` : ''}
                                      </option>
                                    ))
                                  ) : (
                                    <option value="" disabled>Tidak ada pengurus untuk lembaga ini</option>
                                  )}
                                </select>
                                {selectedPenerima && (() => {
                                  const selectedPengurus = pengurusList.find(p => p.id === selectedPenerima)
                                  const penerimaName = selectedPengurus?.nama_lengkap || selectedPengurus?.nama || detailData.penerima_nama || ''
                                  return penerimaName ? (
                                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      Saat ini: {penerimaName}
                                    </span>
                                  ) : null
                                })()}
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Tanggal Dibuat:</span>
                              <span className="text-sm text-gray-800 dark:text-gray-200">
                                {activeTab === 'hijriyah' && detailData.hijriyah
                                  ? formatHijriyahDate ? formatHijriyahDate(detailData.hijriyah) : detailData.hijriyah
                                  : formatDate ? formatDate(detailData.tanggal_dibuat) : new Date(detailData.tanggal_dibuat).toLocaleString('id-ID')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Detail Items */}
                        {detailData.details && detailData.details.length > 0 && (
                          <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                              Detail Items
                            </h3>
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse text-sm">
                                <thead>
                                  <tr className="bg-gray-100 dark:bg-gray-700">
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Item
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Harga
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Jumlah
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Nominal
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Oleh
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-center text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Versi
                                    </th>
                                    <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {detailData.details.map((detail, index) => (
                                    <tr key={index} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${detail.rejected ? 'bg-red-50 dark:bg-red-900/20' : ''
                                      }`}>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {detail.item}
                                      </td>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-right text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {formatCurrency(parseFloat(detail.harga || 0))}
                                      </td>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-right text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {detail.jumlah}
                                      </td>
                                      <td className={`border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-right font-medium text-gray-800 dark:text-gray-200 ${detail.rejected ? 'line-through' : ''
                                        }`}>
                                        {formatCurrency(parseFloat(detail.nominal || 0))}
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
                                        {detail.admin_nama || 'Unknown'}
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs text-center text-gray-800 dark:text-gray-200">
                                        {detail.versi || '-'}
                                      </td>
                                      <td className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs">
                                        {detail.rejected ? (
                                          <div>
                                            <span className="text-red-600 dark:text-red-400 font-medium">Ditolak</span>
                                            {detail.alasan_penolakan && (
                                              <div className="mt-1 text-xs text-red-500 dark:text-red-400 italic">
                                                {detail.alasan_penolakan}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-green-600 dark:text-green-400 font-medium">Disetujui</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* File Lampiran */}
                        {type === 'pengeluaran' && (
                          <div>
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              File Lampiran
                            </h3>
                            {loadingFiles ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                              </div>
                            ) : files.length > 0 ? (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                                {files.map((file) => (
                                  <div
                                    key={file.id}
                                    className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600"
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      {getFileIcon(file.tipe_file, file.nama_file)}
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                          {file.nama_file}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          <span className={getFileTypeLabel(file.tipe_file, file.nama_file).color}>
                                            {getFileTypeLabel(file.tipe_file, file.nama_file).label}
                                          </span>
                                          {' • '}
                                          {formatFileSize(file.ukuran_file)}
                                          {' • '}
                                          {file.admin_nama || 'Unknown'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 ml-3">
                                      {isPreviewable(file.tipe_file) && (
                                        <button
                                          onClick={() => handlePreviewFile(file)}
                                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                          title="Preview"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                        </button>
                                      )}
                                      <button
                                        onClick={() => handleDownloadFile(file.id, file.nama_file)}
                                        className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors"
                                        title="Download"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Belum ada file yang di-upload
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Kolom Kanan: Item yang Ditolak, Komentar, Viewer, History Edit */}
                      <div className="space-y-6 lg:overflow-y-auto lg:pl-2 lg:h-full">
                        {/* List Item yang Ditolak - Accordion */}
                        {detailData.rejected_details && detailData.rejected_details.length > 0 && (
                          <div className="mt-4">
                            <button
                              onClick={() => setIsRejectedOpen(!isRejectedOpen)}
                              className="w-full flex items-center justify-between text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span>Item yang Ditolak ({detailData.rejected_details.length})</span>
                              </div>
                              <motion.svg
                                animate={{ rotate: isRejectedOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                            <AnimatePresence>
                              {isRejectedOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                                    <div className="space-y-3">
                                      {detailData.rejected_details.map((detail, index) => (
                                        <div key={index} className="flex items-start justify-between text-sm border-l-2 border-red-500 pl-3 py-2">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <span className="font-medium text-red-600 dark:text-red-400 line-through">
                                                {detail.item}
                                              </span>
                                              {detail.admin_nama && (
                                                <span className="text-gray-600 dark:text-gray-400 text-xs">
                                                  (Ditolak oleh: <span className="font-medium">{detail.admin_nama}</span>)
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-gray-600 dark:text-gray-400 line-through mb-1">
                                              {formatCurrency(parseFloat(detail.harga || 0))} × {detail.jumlah} = <span className="font-medium">{formatCurrency(parseFloat(detail.nominal || 0))}</span>
                                            </div>
                                            {detail.alasan_penolakan && (
                                              <div className="mt-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-xs text-red-800 dark:text-red-300">
                                                <span className="font-medium">Alasan:</span> {detail.alasan_penolakan}
                                              </div>
                                            )}
                                          </div>
                                          <span className="text-gray-500 dark:text-gray-500 text-xs ml-4">
                                            {new Date(detail.tanggal_dibuat).toLocaleString('id-ID')}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Viewer Info - untuk pengeluaran (read-only) - Accordion */}
                        {type === 'pengeluaran' && (
                          <div className="mt-4">
                            <button
                              onClick={() => setIsViewerOpen(!isViewerOpen)}
                              className="w-full flex items-center justify-between text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>Sudah Dilihat ({Array.isArray(viewers) ? viewers.length : 0})</span>
                              </div>
                              <motion.svg
                                animate={{ rotate: isViewerOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                            <AnimatePresence>
                              {isViewerOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                                    {loadingKomentar ? (
                                      <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                                        Memuat...
                                      </div>
                                    ) : Array.isArray(viewers) && viewers.length > 0 ? (
                                      <div className="space-y-2 max-h-48 overflow-y-auto">
                                        {viewers.map((viewer) => (
                                          <div key={viewer.id} className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                                            <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                                                <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                              </div>
                                              <div>
                                                <p className="font-medium text-gray-800 dark:text-gray-200 text-xs">
                                                  {viewer.admin_nama || 'Unknown'}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                  {new Date(viewer.tanggal_dilihat).toLocaleString('id-ID')}
                                                  {viewer.jumlah_view > 1 && ` • ${viewer.jumlah_view}x dilihat`}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                                        Belum ada yang melihat
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Komentar Section - untuk pengeluaran (read-only) */}
                        {type === 'pengeluaran' && (
                          <div className="mt-4">
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <svg className="w-5 h-5 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              Komentar ({Array.isArray(komentar) ? komentar.length : 0})
                            </h3>
                            {loadingKomentar ? (
                              <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                              </div>
                            ) : Array.isArray(komentar) && komentar.length > 0 ? (
                              <div className="space-y-3 max-h-96 overflow-y-auto">
                                {komentar.map((item) => {
                                  const isAdminUwaba = item.admin_role && item.admin_role.toLowerCase().includes('admin uwaba');
                                  return (
                                    <div key={item.id} className={`rounded-lg p-3 border ${isAdminUwaba
                                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                      : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                                      }`}>
                                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-2">
                                        {item.komentar}
                                      </p>
                                      <div className="flex items-center justify-between mt-2">
                                        <span className="text-xs font-medium text-teal-600 dark:text-teal-400">
                                          {item.admin_nama || 'Unknown'}
                                        </span>
                                        <button
                                          onClick={() => setOpenKomentarAccordions(prev => ({
                                            ...prev,
                                            [item.id]: !prev[item.id]
                                          }))}
                                          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                                        >
                                          <span>Detail</span>
                                          <motion.svg
                                            animate={{ rotate: (openKomentarAccordions[item.id] || false) ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="w-3 h-3"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                          </motion.svg>
                                        </button>
                                      </div>
                                      <AnimatePresence>
                                        {(openKomentarAccordions[item.id] || false) && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden mt-2 pt-2 border-t border-gray-200 dark:border-gray-600"
                                          >
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                {item.admin_role && (
                                                  <span className="text-[10px] px-1.5 py-0.5 bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 rounded">
                                                    {item.admin_role}
                                                  </span>
                                                )}
                                              </div>
                                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {new Date(item.tanggal_dibuat).toLocaleString('id-ID')}
                                              </span>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  )
                                })}
                              </div>
                            ) : (
                              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-600">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  Belum ada komentar
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* History Edit - dipindahkan ke paling bawah - Accordion */}
                        {detailData.edit_history && Object.keys(detailData.edit_history).length > 0 && (
                          <div className="mt-4">
                            <button
                              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                              className="w-full flex items-center justify-between text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <span>History Edit</span>
                              <motion.svg
                                animate={{ rotate: isHistoryOpen ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                                className="w-5 h-5 text-gray-600 dark:text-gray-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </motion.svg>
                            </button>
                            <AnimatePresence>
                              {isHistoryOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="space-y-4">
                                    {Object.entries(detailData.edit_history).map(([item, history]) => (
                                      <div key={item} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                                        <div className={`px-4 py-2.5 border-b ${type === 'rencana'
                                          ? 'bg-gradient-to-r from-teal-50 to-teal-100 dark:from-teal-900/30 dark:to-teal-800/30 border-teal-200 dark:border-teal-800'
                                          : 'bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30 border-primary-200 dark:border-primary-800'
                                          }`}>
                                          <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm flex items-center gap-2">
                                            <svg className={`w-4 h-4 ${type === 'rencana'
                                              ? 'text-teal-600 dark:text-teal-400'
                                              : 'text-primary-600 dark:text-primary-400'
                                              }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            {item}
                                          </h4>
                                        </div>
                                        <div className="p-4">
                                          <div className="relative">
                                            <div className={`absolute left-3 top-0 bottom-0 w-0.5 ${type === 'rencana'
                                              ? 'bg-teal-200 dark:bg-teal-800'
                                              : 'bg-primary-200 dark:bg-primary-800'
                                              }`}></div>
                                            <div className="space-y-3">
                                              {history.map((hist, idx) => (
                                                <div key={idx} className="relative pl-8">
                                                  <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center ${type === 'rencana'
                                                    ? 'bg-teal-500'
                                                    : 'bg-primary-500'
                                                    }`}>
                                                    <span className="text-[10px] font-bold text-white">{hist.versi}</span>
                                                  </div>
                                                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 relative">
                                                    <div className="space-y-2 pr-20 sm:pr-24">
                                                      <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${type === 'rencana'
                                                          ? 'bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300'
                                                          : 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300'
                                                          }`}>
                                                          Versi {hist.versi}
                                                        </span>
                                                        {hist.admin_nama && (
                                                          <span className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                            </svg>
                                                            {hist.admin_nama}
                                                          </span>
                                                        )}
                                                      </div>
                                                      <div className={`absolute top-3 right-3 rounded px-2 py-1 border ${type === 'rencana'
                                                        ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800'
                                                        : 'bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800'
                                                        }`}>
                                                        <div className={`text-[9px] sm:text-[10px] font-medium mb-0.5 ${type === 'rencana'
                                                          ? 'text-teal-600 dark:text-teal-400'
                                                          : 'text-primary-600 dark:text-primary-400'
                                                          }`}>Total</div>
                                                        <div className={`font-bold text-xs sm:text-sm ${type === 'rencana'
                                                          ? 'text-teal-700 dark:text-teal-300'
                                                          : 'text-primary-700 dark:text-primary-300'
                                                          }`}>
                                                          {formatCurrency(parseFloat(hist.nominal || 0))}
                                                        </div>
                                                      </div>
                                                      <div className="flex items-center gap-1">
                                                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                          </svg>
                                                          {new Date(hist.tanggal_dibuat).toLocaleString('id-ID', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                          })}
                                                        </span>
                                                      </div>
                                                      <div className="flex items-center gap-2 text-xs">
                                                        <span className="text-gray-600 dark:text-gray-400">Harga:</span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                          {formatCurrency(parseFloat(hist.harga || 0))}
                                                        </span>
                                                        <span className="text-gray-400 dark:text-gray-500">×</span>
                                                        <span className="text-gray-600 dark:text-gray-400">Jumlah:</span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                          {hist.jumlah}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center text-gray-500 dark:text-gray-400 py-12">
                    Gagal memuat detail.
                  </div>
                )
                }
              </div >

              {/* Footer with Action Buttons - hanya untuk rencana */}
              {
                type === 'rencana' && (canEdit || canApprove) && (
                  <div className="border-t dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 flex justify-end gap-2">
                    {canEdit && onEdit && (
                      <button
                        onClick={() => {
                          onClose()
                          onEdit()
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm flex items-center gap-1.5"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span>Edit</span>
                      </button>
                    )}
                    {canApprove && (
                      <>
                        {onApprove && (
                          <button
                            onClick={onApprove}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-xs sm:text-sm flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>Uprove</span>
                          </button>
                        )}
                        {onReject && (
                          <button
                            onClick={onReject}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs sm:text-sm flex items-center gap-1.5"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span>Tolak</span>
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              }
            </motion.div>
        )}
      </AnimatePresence>
      {/* Modal Konfirmasi Hapus Komentar */}
      < Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setKomentarToDelete(null)
        }}
        title="Konfirmasi Hapus Komentar"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            Apakah Anda yakin ingin menghapus komentar ini? Tindakan ini tidak dapat dibatalkan.
          </p>
          {komentarToDelete && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                  {komentarToDelete.admin_nama || 'Unknown'}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(komentarToDelete.tanggal_dibuat).toLocaleString('id-ID')}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {komentarToDelete.komentar}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false)
                setKomentarToDelete(null)
              }}
              disabled={deletingKomentar}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              onClick={handleConfirmDeleteKomentar}
              disabled={deletingKomentar}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deletingKomentar ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Menghapus...</span>
                </>
              ) : (
                'Hapus'
              )}
            </button>
          </div>
        </div>
      </Modal >

      {/* File Preview Offcanvas - Kanan */}
      < AnimatePresence >
        {previewFile && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={handleClosePreview}
              className="fixed inset-0 bg-black bg-opacity-60 z-[100000]"
            />

            {/* Offcanvas Content - Dari Kanan */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 w-full sm:w-[600px] lg:w-[800px] bg-white dark:bg-gray-800 shadow-2xl flex flex-col z-[100001]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getFileIcon(previewFile.tipe_file, previewFile.nama_file)}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {previewFile.nama_file}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(previewFile.ukuran_file)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => handleDownloadFile(previewFile.id, previewFile.nama_file)}
                    className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                  <button
                    onClick={handleClosePreview}
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
                    {previewFile.tipe_file?.startsWith('image/') ? (
                      <img
                        src={previewFileUrl}
                        alt={previewFile.nama_file}
                        className="w-full h-auto object-contain"
                        style={{ maxHeight: '100%' }}
                      />
                    ) : previewFile.tipe_file === 'application/pdf' ? (
                      <iframe
                        src={previewFileUrl}
                        className="w-full h-full border-0"
                        title={previewFile.nama_file}
                        style={{ minHeight: '600px' }}
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full p-8">
                        <div className="text-center">
                          {getFileIcon(previewFile.tipe_file, previewFile.nama_file)}
                          <p className="text-gray-600 dark:text-gray-400 mb-2 mt-4">
                            Preview tidak tersedia untuk tipe file ini
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                            Silakan download file untuk membuka dengan aplikasi yang sesuai
                          </p>
                          <button
                            onClick={() => handleDownloadFile(previewFile.id, previewFile.nama_file)}
                            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
                          >
                            Download File
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
                {/* Footer Buttons */}
                <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-4 sm:px-6 bg-white dark:bg-gray-800 z-20">


                  <button
                    onClick={onClose}
                    className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500"
                  >
                    Tutup
                  </button>
                </div>
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delete Pengeluaran Confirmation Modal */}
      < Modal
        isOpen={showDeletePengeluaranModal}
        onClose={() => setShowDeletePengeluaranModal(false)}
        title="Hapus Pengeluaran"
        size="sm"
      >
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-3 text-red-600 bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium">Konfirmasi Penghapusan</p>
              <p className="mt-1">Apakah Anda yakin ingin menghapus data pengeluaran ini? Data yang dihapus tidak dapat dikembalikan.</p>
            </div>
          </div>

          <div className="flex items-start gap-2 pt-2">
            <input
              type="checkbox"
              id="deleteWithRencana"
              checked={deleteWithRencana}
              onChange={(e) => setDeleteWithRencana(e.target.checked)}
              className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
            />
            <label htmlFor="deleteWithRencana" className="text-sm text-gray-700 dark:text-gray-300 select-none">
              <span className="font-medium block">Hapus juga rencana pengeluaran</span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">Centang opsi ini jika Anda ingin menghapus data rencana, komentar, viewer, dan semua file yang terkait dengan pengeluaran ini.</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setShowDeletePengeluaranModal(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              disabled={deletingPengeluaran}
            >
              Batal
            </button>
            <button
              onClick={handleDeletePengeluaran}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 flex items-center gap-2"
              disabled={deletingPengeluaran}
            >
              {deletingPengeluaran ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Menghapus...
                </>
              ) : (
                'Ya, Hapus'
              )}
            </button>
          </div>
        </div>
      </Modal >

      {/* Print Offcanvas untuk Pengeluaran */}
      {
        type === 'pengeluaran' && detailData?.id && (
          <PrintPengeluaranOffcanvas
            isOpen={showPrintOffcanvas}
            onClose={() => setShowPrintOffcanvas(false)}
            pengeluaranId={detailData.id}
          />
        )
      }
    </>, document.body)
}

export default DetailOffcanvas

