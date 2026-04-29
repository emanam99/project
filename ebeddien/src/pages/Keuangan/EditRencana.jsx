import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { pengeluaranAPI, userAPI, lembagaAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import { usePengeluaranFiturAccess } from '../../hooks/usePengeluaranFiturAccess'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { useNotification } from '../../contexts/NotificationContext'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import { generateRencanaWhatsAppMessage } from './Pengeluaran/utils/pengeluaranUtils'
import { compressImage } from '../../utils/imageCompression'
import { PickDateHijri, formatHijriDateDisplay } from '../../components/PickDateHijri'
import * as XLSX from 'xlsx'
import Modal from '../../components/Modal/Modal'
import WaNotifRecipientChecklist from './Pengeluaran/components/WaNotifRecipientChecklist'

function EditRencana({
  embedded = false,
  embeddedPsbRows = null,
  onEmbeddedClose,
  onEmbeddedSubmitted
} = {}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { tahunAjaran } = useTahunAjaranStore()
  const { showNotification } = useNotification()
  const pengeluaranFitur = usePengeluaranFiturAccess()
  const isCreateMode = !id || id === 'create'
  const isPsbSetorMode = useMemo(
    () =>
      Boolean(
        embedded &&
          isCreateMode &&
          Array.isArray(embeddedPsbRows) &&
          embeddedPsbRows.length > 0
      ),
    [embedded, isCreateMode, embeddedPsbRows]
  )
  const [loading, setLoading] = useState(!isCreateMode)
  const [saving, setSaving] = useState(false)
  const [rencana, setRencana] = useState(null)
  const [listAdmins, setListAdmins] = useState([])
  const [recipientGroups, setRecipientGroups] = useState(null)
  const [selectedAdmins, setSelectedAdmins] = useState([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)
  const [listLembaga, setListLembaga] = useState([])
  const [loadingLembaga, setLoadingLembaga] = useState(false)
  const [files, setFiles] = useState([])
  const [pendingFiles, setPendingFiles] = useState([]) // File yang dipilih sebelum save (untuk create mode)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadingPendingFiles, setUploadingPendingFiles] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const fileUploadRef = useRef(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewFileUrl, setPreviewFileUrl] = useState(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [fileToDelete, setFileToDelete] = useState(null)
  const [deletingFile, setDeletingFile] = useState(false)
  const [formData, setFormData] = useState({
    keterangan: '',
    kategori: '',
    lembaga: '',
    sumber_uang: 'Cash',
    hijriyah: '',
    tahun_ajaran: '',
    details: isCreateMode ? [{ item: '', harga: '', jumlah: 1, isNew: true, rejected: false, alasan_penolakan: '' }] : []
  })
  const fileInputRef = useRef(null)

  const lembagaOptions = useMemo(() => {
    const ids = pengeluaranFitur.allowedLembagaIdsRencana
    if (!ids || ids.length === 0) return listLembaga
    return listLembaga.filter((l) => ids.includes(String(l.id)))
  }, [listLembaga, pengeluaranFitur.allowedLembagaIdsRencana])

  const lembagaSelectLocked =
    pengeluaranFitur.rencanaLembagaFilterLocked && lembagaOptions.length === 1

  const allowSaveAsDraft = useMemo(() => {
    if (!pengeluaranFitur.apiHasPengeluaran) return true
    if (isCreateMode) return pengeluaranFitur.rencanaBuat && pengeluaranFitur.rencanaSimpanDraft
    if (rencana?.ket === 'draft') {
      return pengeluaranFitur.draftEdit && pengeluaranFitur.rencanaSimpanDraft
    }
    return pengeluaranFitur.rencanaEdit && pengeluaranFitur.rencanaSimpanDraft
  }, [
    pengeluaranFitur.apiHasPengeluaran,
    pengeluaranFitur.rencanaBuat,
    pengeluaranFitur.rencanaSimpanDraft,
    pengeluaranFitur.draftEdit,
    pengeluaranFitur.rencanaEdit,
    isCreateMode,
    rencana?.ket
  ])

  const allowSaveSubmit = useMemo(() => {
    if (!pengeluaranFitur.apiHasPengeluaran) return true
    if (isCreateMode) return pengeluaranFitur.rencanaBuat && pengeluaranFitur.rencanaSimpan
    if (rencana?.ket === 'draft') {
      return pengeluaranFitur.draftEdit && pengeluaranFitur.rencanaSimpan
    }
    return pengeluaranFitur.rencanaEdit
  }, [
    pengeluaranFitur.apiHasPengeluaran,
    pengeluaranFitur.rencanaBuat,
    pengeluaranFitur.rencanaSimpan,
    pengeluaranFitur.draftEdit,
    pengeluaranFitur.rencanaEdit,
    isCreateMode,
    rencana?.ket
  ])

  const submitPrimaryLabel = useMemo(() => {
    if (isCreateMode) return 'Ajukan Rencana'
    if (rencana?.ket === 'draft') return 'Ajukan Rencana'
    return 'Update'
  }, [isCreateMode, rencana?.ket])

  useEffect(() => {
    if (!isCreateMode || !lembagaOptions.length) return
    if (lembagaSelectLocked) {
      const only = String(lembagaOptions[0].id)
      setFormData((prev) => (prev.lembaga === only ? prev : { ...prev, lembaga: only }))
    }
  }, [isCreateMode, lembagaOptions, lembagaSelectLocked])

  useEffect(() => {
    if (!pengeluaranFitur.apiHasPengeluaran) return
    if (isCreateMode) {
      if (!pengeluaranFitur.rencanaBuat) {
        showNotification('Anda tidak memiliki akses membuat rencana pengeluaran', 'error')
        if (embedded) {
          onEmbeddedClose?.()
        } else {
          navigate('/pengeluaran')
        }
      }
      return
    }
    if (loading || !rencana) return
    const ok = rencana.ket === 'draft' ? pengeluaranFitur.draftEdit : pengeluaranFitur.rencanaEdit
    if (!ok) {
      showNotification('Anda tidak memiliki akses mengedit rencana ini', 'error')
      if (embedded) {
        onEmbeddedClose?.()
      } else {
        navigate('/pengeluaran')
      }
    }
  }, [
    pengeluaranFitur.apiHasPengeluaran,
    pengeluaranFitur.rencanaBuat,
    pengeluaranFitur.draftEdit,
    pengeluaranFitur.rencanaEdit,
    isCreateMode,
    loading,
    rencana,
    navigate,
    showNotification,
    embedded,
    onEmbeddedClose
  ])

  const applyEmbeddedPsbRows = useCallback(() => {
    if (!isCreateMode || !embedded || !Array.isArray(embeddedPsbRows) || embeddedPsbRows.length === 0) {
      return
    }
    const rows = embeddedPsbRows
    setFormData((prev) => ({
      ...prev,
      keterangan: `Setor item PSB (${rows.length} item)`,
      kategori: 'Setoran',
      details: rows.map((r) => {
        const cb = Number(r.count_terbayar ?? 0)
        const cs = Number(r.jumlah_setor ?? r.count_setor ?? 0)
        const sisa = Math.max(0, cb - cs)
        const jumlah = sisa > 0 ? sisa : 1
        return {
          id_psb_item: r.id,
          item: r.nama_item || r.item || '',
          harga: String(Number(r.harga_standar ?? 0)),
          jumlah,
          isNew: true,
          rejected: false,
          alasan_penolakan: ''
        }
      })
    }))
  }, [isCreateMode, embedded, embeddedPsbRows])

  useEffect(() => {
    applyEmbeddedPsbRows()
  }, [applyEmbeddedPsbRows])

  useEffect(() => {
    if (!isCreateMode) {
      loadRencanaDetail()
      loadFiles()
    } else {
      setLoading(false)
      // Auto-fill hijriyah dan tahun_ajaran saat create
      loadHijriyahAndTahunAjaran()
    }
    // Load list lembaga
    loadListLembaga()
  }, [id])

  const loadHijriyahAndTahunAjaran = async () => {
    try {
      const { hijriyah } = await getTanggalFromAPI()
      setFormData(prev => ({
        ...prev,
        hijriyah: hijriyah || '',
        tahun_ajaran: tahunAjaran || ''
      }))
    } catch (error) {
      console.error('Error getting hijriyah:', error)
    }
  }

  const loadListAdmins = async (lembagaId = null) => {
    try {
      setLoadingAdmins(true)
      const lem =
        lembagaId != null && String(lembagaId).trim() !== '' ? String(lembagaId).trim() : null
      const notifDraft = rencana?.ket === 'draft'
      const response = await userAPI.getSuperAdminAndUwaba(
        lem,
        notifDraft ? { notifContext: 'draft' } : {}
      )
      if (response.success) {
        setRecipientGroups(response.recipient_groups ?? null)
        // Backend sudah menentukan policy; frontend hanya dedupe.
        const adminUwabaMap = new Map()
        ;(response.data || []).forEach((admin) => {
          if (!adminUwabaMap.has(admin.id)) {
            adminUwabaMap.set(admin.id, admin)
          }
        })
        const adminUwabaList = Array.from(adminUwabaMap.values())

        // Hanya tampilkan admin yang memiliki nomor WhatsApp
        const adminsWithWhatsapp = adminUwabaList.filter(admin => 
          admin.whatsapp && admin.whatsapp.trim() !== ''
        )
        setListAdmins(adminsWithWhatsapp)
        // Secara default, centang semua admin yang memiliki nomor WhatsApp
        setSelectedAdmins(adminsWithWhatsapp.map(admin => admin.id))
      } else {
        showNotification(response.message || 'Gagal memuat daftar admin', 'error')
      }
    } catch (err) {
      console.error('Error loading admins:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar admin', 'error')
    } finally {
      setLoadingAdmins(false)
    }
  }

  useEffect(() => {
    const lem =
      formData.lembaga != null && String(formData.lembaga).trim() !== ''
        ? String(formData.lembaga).trim()
        : null
    loadListAdmins(lem)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- muat ulang daftar penerima saat lembaga/id berubah
  }, [formData.lembaga, id, rencana?.ket])

  const loadListLembaga = async () => {
    try {
      setLoadingLembaga(true)
      const response = await lembagaAPI.getAll()
      if (response.success) {
        setListLembaga(response.data || [])
      } else {
        showNotification(response.message || 'Gagal memuat daftar lembaga', 'error')
      }
    } catch (err) {
      console.error('Error loading lembaga:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar lembaga', 'error')
    } finally {
      setLoadingLembaga(false)
    }
  }

  const handleToggleAdmin = (adminId) => {
    setSelectedAdmins(prev => {
      if (prev.includes(adminId)) {
        return prev.filter(id => id !== adminId)
      } else {
        return [...prev, adminId]
      }
    })
  }

  const sendNotificationsToSelectedAdmins = async (rencanaId = null) => {
    const adminIds = pengeluaranFitur.rencanaKelolaPenerimaNotif
      ? selectedAdmins
      : listAdmins.map((a) => a.id)
    if (adminIds.length === 0) {
      return
    }

    const selectedAdminData = listAdmins.filter((admin) => adminIds.includes(admin.id))
    const adminsWithWhatsapp = selectedAdminData.filter(admin => admin.whatsapp)
    
    if (adminsWithWhatsapp.length === 0) {
      return // Tidak ada admin dengan WhatsApp
    }

    // Siapkan data rencana untuk template
    // Hitung total nominal dari details
    const totalNominal = formData.details
      .filter(d => !Boolean(d.rejected))
      .reduce((sum, d) => {
        const harga = parseFloat(d.harga) || 0
        const jumlah = parseInt(d.jumlah) || 1
        return sum + (harga * jumlah)
      }, 0)

    // Buat objek rencanaData sesuai format yang diharapkan template
    // Untuk "Dibuat oleh", gunakan admin_nama dari rencana yang sudah ada jika edit mode
    // Jika create mode, gunakan nama user yang sedang login
    const adminNamaPembuat = isCreateMode 
      ? (user?.nama || 'Admin')
      : (rencana?.admin_nama || user?.nama || 'Admin')
    
    const rencanaData = {
      id: rencanaId || id,
      keterangan: formData.keterangan || '',
      kategori: formData.kategori || '',
      lembaga: formData.lembaga || '',
      sumber_uang: formData.sumber_uang || '',
      nominal: totalNominal,
      details: formData.details.map(d => ({
        nominal: (parseFloat(d.harga) || 0) * (parseInt(d.jumlah) || 1),
        rejected: Boolean(d.rejected)
      })),
      admin_nama: adminNamaPembuat,
      last_edit_admin_nama: rencana?.last_edit_admin_nama ?? null,
      jumlah_komentar: rencana?.jumlah_komentar ?? 0,
      jumlah_viewer: rencana?.jumlah_viewer ?? 0
    }

    const pesan = generateRencanaWhatsAppMessage(rencanaData, 'pending', { 
      user, 
      isCreateMode 
    })

    try {
      const result = await pengeluaranAPI.sendNotifWa(
        rencanaId || id,
        pesan,
        adminsWithWhatsapp.map(a => ({ id: a.id, whatsapp: a.whatsapp }))
      )
      if (result.success) {
        if (result.data?.queued) {
          return
        }
        const successCount = result.data?.success_count ?? 0
        const failCount = result.data?.fail_count ?? 0
        showNotification(result.message || `Notifikasi berhasil dikirim ke ${successCount} admin${failCount > 0 ? `, ${failCount} gagal` : ''}`, failCount > 0 ? 'warning' : 'success')
      } else {
        showNotification(result.message || 'Gagal mengirim notifikasi ke semua admin', 'error')
      }
    } catch (error) {
      console.error('Error sending notifications:', error)
      showNotification(error.response?.data?.message || error.message || 'Gagal mengirim notifikasi', 'error')
    }
  }

  const loadRencanaDetail = async () => {
    try {
      setLoading(true)
      const response = await pengeluaranAPI.getRencanaDetail(id)
      if (response.success) {
        const data = response.data
        setRencana(data)
        setFormData({
          keterangan: data.keterangan || '',
          kategori: data.kategori || '',
          lembaga: data.lembaga || '',
          sumber_uang: data.sumber_uang || 'Cash',
          hijriyah: data.hijriyah || '',
          tahun_ajaran: data.tahun_ajaran || tahunAjaran || '',
          details: (data.details || []).map(d => ({
            ...d,
            rejected: Boolean(d.rejected) || false,
            isNew: false,
            alasan_penolakan: d.alasan_penolakan || ''
          }))
        })
      } else {
        showNotification(response.message || 'Gagal memuat detail rencana', 'error')
      }
    } catch (err) {
      console.error('Error loading rencana detail:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail rencana', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadFiles = async () => {
    if (!id || isCreateMode) return
    try {
      setLoadingFiles(true)
      const response = await pengeluaranAPI.getFiles(id)
      if (response.success) {
        setFiles(response.data || [])
      }
    } catch (err) {
      console.error('Error loading files:', err)
    } finally {
      setLoadingFiles(false)
    }
  }

  // Fungsi untuk kompresi gambar

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validasi tipe file
    const allowedTypes = [
      'image/jpeg', 
      'image/jpg', 
      'image/png', 
      'image/gif', 
      'image/webp', 
      'application/pdf',
      // Word
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      // Excel
      'application/vnd.ms-excel', // .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // .xlsx
    ]
    
    // Validasi juga berdasarkan ekstensi sebagai fallback
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx']
    
    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
      showNotification('Tipe file tidak diizinkan. Hanya foto (JPEG, PNG, GIF, WEBP), PDF, Word (.doc, .docx), dan Excel (.xls, .xlsx) yang diizinkan', 'error')
      return
    }

    // Validasi ukuran (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      showNotification('Ukuran file terlalu besar. Maksimal 10MB', 'error')
      return
    }

    // Cek apakah file adalah gambar yang bisa dikompresi
    // Hanya JPEG, PNG, dan WEBP yang didukung dengan baik oleh canvas
    const compressibleImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const compressibleExtensions = ['jpg', 'jpeg', 'png', 'webp']
    const isCompressibleImage = 
      (compressibleImageTypes.includes(file.type) || compressibleExtensions.includes(fileExtension)) &&
      file.size > 1024 * 1024 // Hanya kompres jika lebih dari 1 MB
    
    let fileToUpload = file
    
    // Kompres gambar jika memenuhi syarat
    if (isCompressibleImage) {
      try {
        // Hanya set loading jika bukan create mode (karena create mode akan set loading nanti)
        if (!isCreateMode) {
          setUploadingFile(true)
        }
        showNotification('Mengompresi gambar...', 'info')
        fileToUpload = await compressImage(file, 1) // Max 1 MB
        const originalSizeKB = (file.size / 1024).toFixed(0)
        const compressedSizeKB = (fileToUpload.size / 1024).toFixed(0)
        const savedSizeKB = ((file.size - fileToUpload.size) / 1024).toFixed(0)
        showNotification(`Gambar dikompresi: ${originalSizeKB} KB → ${compressedSizeKB} KB (hemat ${savedSizeKB} KB)`, 'success')
      } catch (err) {
        console.error('Error compressing image:', err)
        showNotification('Gagal mengompresi gambar, menggunakan file asli', 'warning')
        // Gunakan file asli jika kompresi gagal
        fileToUpload = file
      } finally {
        if (!isCreateMode) {
          setUploadingFile(false)
        }
      }
    }

    // Jika create mode, simpan di pending files
    if (isCreateMode) {
      setPendingFiles(prev => [...prev, {
        id: Date.now() + Math.random(), // Temporary ID
        file: fileToUpload,
        nama_file: fileToUpload.name,
        ukuran_file: fileToUpload.size,
        tipe_file: fileToUpload.type,
        isPending: true
      }])
      if (fileUploadRef.current) {
        fileUploadRef.current.value = ''
      }
      showNotification('File akan di-upload setelah rencana disimpan', 'info')
      return
    }

    // Jika edit mode, langsung upload
    if (!id) {
      showNotification('ID rencana tidak ditemukan', 'error')
      return
    }

    try {
      setUploadingFile(true)
      const response = await pengeluaranAPI.uploadFile(id, fileToUpload)
      if (response.success) {
        showNotification('File berhasil di-upload', 'success')
        await loadFiles()
        if (fileUploadRef.current) {
          fileUploadRef.current.value = ''
        }
      } else {
        showNotification(response.message || 'Gagal meng-upload file', 'error')
      }
    } catch (err) {
      console.error('Error uploading file:', err)
      showNotification(err.response?.data?.message || 'Gagal meng-upload file', 'error')
    } finally {
      setUploadingFile(false)
    }
  }

  // Upload semua pending files setelah rencana berhasil disimpan
  const uploadPendingFiles = async (rencanaId) => {
    if (pendingFiles.length === 0) return

    try {
      setUploadingPendingFiles(true)
      let successCount = 0
      let failCount = 0

      for (const pendingFile of pendingFiles) {
        try {
          // File sudah dikompresi saat handleFileUpload, langsung upload
          const response = await pengeluaranAPI.uploadFile(rencanaId, pendingFile.file)
          if (response.success) {
            successCount++
          } else {
            failCount++
          }
        } catch (err) {
          console.error('Error uploading pending file:', err)
          failCount++
        }
      }

      if (successCount > 0) {
        showNotification(`${successCount} file berhasil di-upload${failCount > 0 ? `, ${failCount} gagal` : ''}`, successCount === pendingFiles.length ? 'success' : 'warning')
      } else if (failCount > 0) {
        showNotification('Gagal meng-upload semua file', 'error')
      }

      // Clear pending files setelah upload
      setPendingFiles([])
    } catch (err) {
      console.error('Error uploading pending files:', err)
      showNotification('Terjadi kesalahan saat meng-upload file', 'error')
    } finally {
      setUploadingPendingFiles(false)
    }
  }

  const handleRemovePendingFile = (tempId) => {
    setPendingFiles(prev => prev.filter(f => f.id !== tempId))
  }

  const handleDeleteFile = (file) => {
    setFileToDelete(file)
    setShowDeleteModal(true)
  }

  const handleConfirmDeleteFile = async () => {
    if (!fileToDelete) return

    try {
      setDeletingFile(true)
      const response = await pengeluaranAPI.deleteFile(fileToDelete.id)
      if (response.success) {
        showNotification('File berhasil dihapus', 'success')
        await loadFiles()
        setShowDeleteModal(false)
        setFileToDelete(null)
      } else {
        showNotification(response.message || 'Gagal menghapus file', 'error')
      }
    } catch (err) {
      console.error('Error deleting file:', err)
      showNotification(err.response?.data?.message || 'Gagal menghapus file', 'error')
    } finally {
      setDeletingFile(false)
    }
  }

  const handleCloseDeleteModal = () => {
    if (!deletingFile) {
      setShowDeleteModal(false)
      setFileToDelete(null)
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

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
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

  const handleDetailChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      details: prev.details.map((detail, i) => {
        if (i === index) {
          const updated = { ...detail, [field]: value }
          // Auto calculate nominal
          if (field === 'harga' || field === 'jumlah') {
            const harga = parseFloat(field === 'harga' ? value : detail.harga) || 0
            const jumlah = parseInt(field === 'jumlah' ? value : detail.jumlah) || 1
            updated.nominal = harga * jumlah
          }
          return updated
        }
        return detail
      })
    }))
  }

  const handleToggleRejectDetail = (index) => {
    setFormData(prev => ({
      ...prev,
      details: prev.details.map((detail, i) => {
        if (i === index) {
          const newRejected = !Boolean(detail.rejected)
          return { 
            ...detail, 
            rejected: newRejected,
            alasan_penolakan: newRejected ? (detail.alasan_penolakan || '') : '' // Reset alasan jika batal tolak
          }
        }
        return detail
      })
    }))
  }

  const handleAlasanPenolakanChange = (index, value) => {
    setFormData(prev => ({
      ...prev,
      details: prev.details.map((detail, i) => {
        if (i === index) {
          return { ...detail, alasan_penolakan: value }
        }
        return detail
      })
    }))
  }

  const handleAddDetail = () => {
    setFormData(prev => ({
      ...prev,
      details: [...prev.details, { item: '', harga: '', jumlah: 1, isNew: true, rejected: false, alasan_penolakan: '' }]
    }))
  }

  const handleRemoveDetail = (index) => {
    setFormData(prev => ({
      ...prev,
      details: prev.details.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e, isDraft = false) => {
    e.preventDefault()

    // Validasi
    if (!formData.keterangan.trim()) {
      showNotification('Keterangan wajib diisi', 'error')
      return
    }

    // Filter detail yang tidak ditolak
    const activeDetails = formData.details.filter(d => !d.rejected)
    
    if (activeDetails.length === 0) {
      showNotification('Minimal harus ada 1 item detail yang tidak ditolak', 'error')
      return
    }

    // Validasi item tidak boleh duplikat (hanya yang tidak ditolak)
    const itemNames = activeDetails.map(d => d.item.trim().toLowerCase())
    const uniqueItems = new Set(itemNames)
    if (itemNames.length !== uniqueItems.size) {
      showNotification('Terdapat item dengan nama yang sama. Nama item harus unik.', 'error')
      return
    }

    // Validasi semua detail terisi
    for (const detail of activeDetails) {
      if (!detail.item.trim()) {
        showNotification('Nama item tidak boleh kosong', 'error')
        return
      }
      // Harga boleh 0 (untuk item yang tinggal ambil di kantor)
      if (detail.harga === '' || detail.harga === null || detail.harga === undefined) {
        showNotification('Harga harus diisi (boleh 0)', 'error')
        return
      }
      const hargaValue = parseFloat(detail.harga)
      if (isNaN(hargaValue) || hargaValue < 0) {
        showNotification('Harga harus berupa angka yang valid (minimal 0)', 'error')
        return
      }
      if (!detail.jumlah || parseInt(detail.jumlah) <= 0) {
        showNotification('Jumlah harus lebih dari 0', 'error')
        return
      }
    }

    // Validasi alasan penolakan untuk detail yang ditolak
    for (const detail of formData.details) {
      if (detail.rejected && !detail.alasan_penolakan?.trim()) {
        showNotification('Alasan penolakan wajib diisi untuk item yang ditolak', 'error')
        return
      }
    }

    if (isPsbSetorMode) {
      for (const detail of activeDetails) {
        if (!detail.id_psb_item) {
          showNotification('Setiap baris setor harus terhubung ke item PSB', 'error')
          return
        }
      }
    }

    if (isDraft && !allowSaveAsDraft) {
      showNotification('Anda tidak memiliki akses menyimpan sebagai draft', 'error')
      return
    }
    if (!isDraft && !allowSaveSubmit) {
      showNotification('Anda tidak memiliki akses untuk aksi simpan/kirim ini', 'error')
      return
    }

    try {
      setSaving(true)
      const currentUserId = user?.id || user?.user_id
      
      const payload = {
        keterangan: formData.keterangan.trim(),
        kategori: formData.kategori || null,
        lembaga: formData.lembaga || null,
        sumber_uang: formData.sumber_uang || 'Cash',
        hijriyah: formData.hijriyah || null,
        tahun_ajaran: formData.tahun_ajaran || null,
        status: isDraft ? 'draft' : 'pending', // Tambahkan status
        details: formData.details.map(d => ({
          item: d.item.trim(),
          harga: parseFloat(d.harga) || 0,
          jumlah: parseInt(d.jumlah) || 1,
          nominal: (parseFloat(d.harga) || 0) * (parseInt(d.jumlah) || 1),
          rejected: d.rejected || false,
          isNew: d.isNew || false,
          alasan_penolakan: d.rejected ? (d.alasan_penolakan || '') : '',
          // Untuk item baru, gunakan id_admin dari user yang sedang login
          // Untuk item yang di-edit (bukan baru), juga gunakan id_admin dari user yang sedang login
          // Ini memastikan setiap versi baru menyimpan siapa yang mengedit
          id_admin: d.isNew ? currentUserId : (d.rejected ? d.id_admin : currentUserId)
        }))
      }

      let response
      let rencanaId = null
      if (isCreateMode) {
        if (isPsbSetorMode) {
          response = await pengeluaranAPI.createRencanaFromPsbItemSetor({
            keterangan: formData.keterangan.trim(),
            kategori: formData.kategori || null,
            lembaga: formData.lembaga || null,
            sumber_uang: formData.sumber_uang || 'Cash',
            hijriyah: formData.hijriyah || null,
            tahun_ajaran: formData.tahun_ajaran || null,
            status: isDraft ? 'draft' : 'pending',
            psb_items: activeDetails.map((d) => ({
              id_psb_item: d.id_psb_item,
              harga: parseFloat(d.harga) || 0,
              jumlah: parseInt(d.jumlah, 10) || 1
            }))
          })
        } else {
          response = await pengeluaranAPI.createRencana(payload)
        }
        if (response.success) {
          rencanaId = response.data?.id || null
          if (embedded && isPsbSetorMode && rencanaId) {
            showNotification(
              isDraft ? 'Draft tersimpan. Anda tetap di halaman rekap.' : 'Rencana diajukan. Anda tetap di halaman rekap.',
              'success'
            )
          } else {
            showNotification(isDraft ? 'Draft berhasil disimpan' : 'Rencana berhasil dibuat', 'success')
          }

          if (pendingFiles.length > 0 && rencanaId) {
            await uploadPendingFiles(rencanaId)
          }

          if (!isDraft) {
            void sendNotificationsToSelectedAdmins(rencanaId).catch(() => {})
          }

          if (embedded && isPsbSetorMode && rencanaId) {
            onEmbeddedSubmitted?.()
            onEmbeddedClose?.()
          } else {
            navigate(isDraft ? '/pengeluaran?tab=draft' : '/pengeluaran')
          }
        } else {
          showNotification(response.message || 'Gagal membuat rencana', 'error')
        }
      } else {
        response = await pengeluaranAPI.updateRencana(id, payload)
        if (response.success) {
          rencanaId = id
          showNotification(isDraft ? 'Draft berhasil disimpan' : 'Rencana berhasil diupdate', 'success')
          // Reload files setelah update
          await loadFiles()
          if (!isDraft) {
            void sendNotificationsToSelectedAdmins(rencanaId).catch(() => {})
          }
          navigate(isDraft ? '/pengeluaran?tab=draft' : '/pengeluaran')
        } else {
          showNotification(response.message || 'Gagal mengupdate rencana', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving rencana:', err)
      showNotification(err.response?.data?.message || `Terjadi kesalahan saat ${isCreateMode ? 'membuat' : 'mengupdate'} rencana`, 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const calculateTotal = () => {
    return formData.details
      .filter(d => !Boolean(d.rejected))
      .reduce((sum, d) => {
        const harga = parseFloat(d.harga) || 0
        const jumlah = parseInt(d.jumlah) || 1
        return sum + (harga * jumlah)
      }, 0)
  }

  const downloadTemplate = () => {
    const templateData = [
      {
        'Item': 'Contoh Item 1',
        'Harga': 10000,
        'Jumlah': 2
      },
      {
        'Item': 'Contoh Item 2',
        'Harga': 20000,
        'Jumlah': 1
      }
    ]

    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Template')

    // Set column widths
    ws['!cols'] = [
      { wch: 30 }, // Item
      { wch: 15 }, // Harga
      { wch: 10 }  // Jumlah
    ]

    XLSX.writeFile(wb, 'Template_Pengeluaran.xlsx')
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(firstSheet)

        if (jsonData.length === 0) {
          showNotification('File Excel kosong atau tidak valid', 'error')
          return
        }

        // Validasi dan konversi data
        const importedDetails = jsonData.map((row, index) => {
          const item = row['Item'] || row['item'] || ''
          const harga = parseFloat(row['Harga'] || row['harga'] || 0)
          const jumlah = parseInt(row['Jumlah'] || row['jumlah'] || 1)

          if (!item.trim()) {
            throw new Error(`Baris ${index + 2}: Item tidak boleh kosong`)
          }
          // Harga boleh 0 (untuk item yang tinggal ambil di kantor)
          if (isNaN(harga) || harga < 0) {
            throw new Error(`Baris ${index + 2}: Harga harus berupa angka yang valid (minimal 0)`)
          }
          if (isNaN(jumlah) || jumlah <= 0) {
            throw new Error(`Baris ${index + 2}: Jumlah harus berupa angka yang lebih dari 0`)
          }

          return {
            item: item.trim(),
            harga: harga.toString(),
            jumlah: jumlah,
            isNew: true,
            rejected: false,
            alasan_penolakan: ''
          }
        })

        // Validasi duplikasi item
        const itemNames = importedDetails.map(d => d.item.toLowerCase())
        const uniqueItems = new Set(itemNames)
        if (itemNames.length !== uniqueItems.size) {
          showNotification('Terdapat item dengan nama yang sama di file Excel. Nama item harus unik.', 'error')
          return
        }

        // Validasi duplikasi dengan detail yang sudah ada
        const existingItems = formData.details
          .filter(d => !d.rejected)
          .map(d => d.item.trim().toLowerCase())
        const duplicateItems = importedDetails.filter(d => 
          existingItems.includes(d.item.toLowerCase())
        )
        if (duplicateItems.length > 0) {
          showNotification(`Item berikut sudah ada: ${duplicateItems.map(d => d.item).join(', ')}`, 'error')
          return
        }

        // Tambahkan detail yang diimport ke formData
        setFormData(prev => ({
          ...prev,
          details: [...prev.details, ...importedDetails]
        }))

        showNotification(`Berhasil mengimport ${importedDetails.length} item dari Excel`, 'success')
        
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } catch (err) {
        console.error('Error importing Excel:', err)
        showNotification(err.message || 'Terjadi kesalahan saat mengimport file Excel', 'error')
      }
    }

    reader.onerror = () => {
      showNotification('Gagal membaca file Excel', 'error')
    }

    reader.readAsArrayBuffer(file)
  }

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-6 lg:pb-8">
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="h-full overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
      {/* Total Nominal - Fixed di atas, tidak bisa di-scroll */}
      <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/30 dark:to-emerald-900/30 rounded-lg shadow-sm border border-teal-200 dark:border-teal-800">
            <div className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-teal-100 dark:bg-teal-800/50 rounded-md">
                    <svg className="w-4 h-4 text-teal-600 dark:text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 block">
                      Total Nominal
                    </span>
                    <span className="text-lg sm:text-xl font-bold text-teal-700 dark:text-teal-300">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
                    Item:
                  </div>
                  <div className="text-xs sm:text-sm font-semibold text-teal-600 dark:text-teal-400">
                    {formData.details.filter(d => !d.rejected).length}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Konten Form - Bisa di-scroll */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8 pb-24 sm:pb-6 lg:pb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >

            {/* Form */}
            <form id="rencana-form" onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              {/* Keterangan */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Keterangan *
                </label>
                <textarea
                  value={formData.keterangan}
                  onChange={(e) => setFormData(prev => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                  rows="3"
                  required
                  placeholder="Masukkan keterangan pengeluaran"
                />
              </div>

              {/* Kategori, Lembaga, dan Sumber Uang */}
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Kategori
                  </label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData(prev => ({ ...prev, kategori: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
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
                    <option value="Rapat">Rapat</option>
                    <option value="Setoran">Setoran</option>
                    <option value="lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Lembaga
                  </label>
                  {loadingLembaga ? (
                    <div className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-teal-600 mr-2"></div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">Memuat lembaga...</span>
                    </div>
                  ) : (
                    <select
                      value={formData.lembaga}
                      onChange={(e) => setFormData(prev => ({ ...prev, lembaga: e.target.value }))}
                      disabled={lembagaSelectLocked}
                      title={lembagaSelectLocked ? 'Lembaga mengikuti akses filter rencana' : undefined}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 disabled:opacity-60"
                    >
                      <option value="">Pilih Lembaga</option>
                      {lembagaOptions.map((lembaga) => (
                        <option key={lembaga.id} value={lembaga.id}>
                          {lembaga.nama != null && String(lembaga.nama).trim() !== ''
                            ? lembaga.nama
                            : lembaga.id}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Sumber Uang <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.sumber_uang}
                    onChange={(e) => setFormData(prev => ({ ...prev, sumber_uang: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                    required
                  >
                    <option value="Cash">Cash</option>
                    <option value="TF">TF</option>
                  </select>
                </div>
              </div>

              {/* Hijriyah dan Tahun Ajaran */}
              <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Hijriyah
                  </label>
                  <PickDateHijri
                    value={formData.hijriyah}
                    onChange={(value) => setFormData(prev => ({ ...prev, hijriyah: value || '' }))}
                    placeholder="Pilih tanggal Hijriyah"
                    className="w-full"
                    inputClassName="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Nilai awal otomatis dari tanggal Hijriyah di header, bisa diubah lewat picker
                  </p>
                  {formData.hijriyah ? (
                    <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
                      Dipilih: {formatHijriDateDisplay(formData.hijriyah)}
                    </p>
                  ) : null}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Kosongkan jika ingin pakai default saat submit
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tahun Ajaran
                  </label>
                  <input
                    type="text"
                    value={formData.tahun_ajaran}
                    onChange={(e) => setFormData(prev => ({ ...prev, tahun_ajaran: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                    placeholder="Auto dari header"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Otomatis diambil dari tahun ajaran yang dipilih di profil
                  </p>
                </div>
              </div>

              {!isPsbSetorMode ? (
                <div className="mb-6">
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Template
                    </button>
                    <label className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm cursor-pointer">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Import
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleImport}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
                  Jumlah per baris diisi otomatis dari selisih count terbayar (baris lunas) − jumlah yang sudah di setor (qty); minimal 1 jika selisih ≤ 0.
                </p>
              )}

              {/* Detail Items */}
              <div className="mb-4">
                <div className="mb-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    Detail Items *
                  </label>
                </div>

                <div className="space-y-2">
                  {formData.details.map((detail, index) => (
                    <div
                      key={index}
                      className={`flex flex-col sm:flex-row gap-2 items-start p-2 sm:p-2.5 border rounded-lg ${
                        detail.rejected
                          ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex-1 w-full">
                        {/* Mobile: Stack vertical, Desktop: Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-2">
                          <div className="col-span-1 sm:col-span-5">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:hidden">Item</label>
                            <input
                              type="text"
                              value={detail.item}
                              onChange={(e) => handleDetailChange(index, 'item', e.target.value)}
                              className={`w-full px-2 py-1.5 sm:px-2.5 sm:py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200 text-xs sm:text-sm ${
                                detail.rejected
                                  ? 'border-red-300 dark:border-red-700 line-through opacity-60'
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                              placeholder="Nama item"
                              required={!detail.rejected}
                              disabled={detail.rejected || (isPsbSetorMode && Boolean(detail.id_psb_item))}
                              title={
                                isPsbSetorMode && detail.id_psb_item
                                  ? 'Nama item mengikuti master PSB'
                                  : undefined
                              }
                            />
                          </div>
                          <div className="col-span-1 sm:col-span-3">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:hidden">Harga</label>
                            <input
                              type="number"
                              value={detail.harga}
                              onChange={(e) => handleDetailChange(index, 'harga', e.target.value)}
                              className={`w-full px-2 py-1.5 sm:px-2.5 sm:py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200 text-xs sm:text-sm ${
                                detail.rejected
                                  ? 'border-red-300 dark:border-red-700 line-through opacity-60'
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                              placeholder="Harga"
                              min="0"
                              step="0.01"
                              required={!detail.rejected}
                              disabled={detail.rejected}
                            />
                          </div>
                          <div className="col-span-1 sm:col-span-2">
                            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:hidden">Jumlah</label>
                            <input
                              type="number"
                              value={detail.jumlah}
                              onChange={(e) => handleDetailChange(index, 'jumlah', e.target.value)}
                              className={`w-full px-2 py-1.5 sm:px-2.5 sm:py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200 text-xs sm:text-sm ${
                                detail.rejected
                                  ? 'border-red-300 dark:border-red-700 line-through opacity-60'
                                  : 'border-gray-300 dark:border-gray-600'
                              }`}
                              placeholder="Jumlah"
                              min="1"
                              required={!detail.rejected}
                              disabled={detail.rejected}
                            />
                          </div>
                          <div className="col-span-1 sm:col-span-2 flex items-center">
                            <div className="w-full">
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5 sm:hidden">Nominal</label>
                              <span
                                className={`text-xs sm:text-sm font-medium ${
                                  detail.rejected
                                    ? 'text-red-600 dark:text-red-400 line-through'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {formatCurrency((parseFloat(detail.harga) || 0) * (parseInt(detail.jumlah) || 1))}
                              </span>
                            </div>
                          </div>
                        </div>
                        {detail.rejected && (
                          <div className="mt-2">
                            <label className="block text-xs font-medium text-red-700 dark:text-red-400 mb-1">
                              Alasan Penolakan *
                            </label>
                            <textarea
                              value={detail.alasan_penolakan || ''}
                              onChange={(e) => handleAlasanPenolakanChange(index, e.target.value)}
                              className="w-full px-2 py-1.5 sm:px-2.5 sm:py-2 border border-red-300 dark:border-red-700 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-gray-200 text-xs sm:text-sm"
                              placeholder="Masukkan alasan penolakan"
                              rows="2"
                              required
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 w-full sm:w-auto justify-end sm:justify-start">
                        {!detail.isNew && (
                          <button
                            type="button"
                            onClick={() => handleToggleRejectDetail(index)}
                            className={`px-2 py-1 sm:px-2.5 sm:py-1 text-xs rounded ${
                              detail.rejected
                                ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                            }`}
                          >
                            {detail.rejected ? 'Batal' : 'Tolak'}
                          </button>
                        )}
                        {detail.isNew && !isPsbSetorMode && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDetail(index)}
                            className="px-2 py-1 sm:px-2.5 sm:py-1 text-xs bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 rounded"
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!isPsbSetorMode ? (
                  <button
                    type="button"
                    onClick={handleAddDetail}
                    className="w-full mt-3 px-4 py-2.5 border-2 border-dashed border-teal-300 dark:border-teal-700 rounded-lg text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 dark:text-teal-400 flex items-center justify-center gap-2 transition-colors text-sm font-medium"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Tambah Item Baru</span>
                  </button>
                ) : null}
              </div>
            </form>

            {/* Upload File Section */}
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-1">
                  File Lampiran
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isCreateMode 
                    ? 'Pilih foto, PDF, Word, atau Excel sebagai lampiran. File akan di-upload setelah rencana disimpan (maks. 10MB per file)'
                    : 'Upload foto, PDF, Word, atau Excel sebagai lampiran rencana pengeluaran (maks. 10MB per file)'
                  }
                </p>
              </div>

              {/* Upload Button */}
              <div className="mb-4">
                <label className={`px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors inline-flex items-center gap-2 text-sm cursor-pointer ${(uploadingFile || uploadingPendingFiles) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {uploadingFile || uploadingPendingFiles ? 'Mengupload...' : 'Pilih File'}
                  <input
                    ref={fileUploadRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={handleFileUpload}
                    disabled={uploadingFile || uploadingPendingFiles}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Pending Files (Create Mode) */}
              {isCreateMode && pendingFiles.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    File yang akan di-upload ({pendingFiles.length}):
                  </p>
                  <div className="space-y-2">
                    {pendingFiles.map((pendingFile) => (
                      <div
                        key={pendingFile.id}
                        className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {getFileIcon(pendingFile.tipe_file, pendingFile.nama_file)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                              {pendingFile.nama_file}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              <span className={getFileTypeLabel(pendingFile.tipe_file, pendingFile.nama_file).color}>
                                {getFileTypeLabel(pendingFile.tipe_file, pendingFile.nama_file).label}
                              </span>
                              {' • '}
                              {formatFileSize(pendingFile.ukuran_file)}
                              {' • '}
                              Menunggu upload
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemovePendingFile(pendingFile.id)}
                          className="ml-3 p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* File List (Edit Mode) */}
              {!isCreateMode && (
                <>
                  {loadingFiles ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                    </div>
                  ) : files.length > 0 ? (
                    <div className="space-y-2">
                      {files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
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
                            <button
                              onClick={() => handleDeleteFile(file)}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Hapus"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                </>
              )}
            </div>

            {pengeluaranFitur.rencanaKelolaPenerimaNotif ? (
              <details className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-600 overflow-hidden group">
                <summary className="px-6 py-4 cursor-pointer list-none flex items-center justify-between text-sm font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/80">
                  <span>Kelola penerima notifikasi WA (admin)</span>
                  <span className="text-gray-400 text-xs group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="px-6 pb-6 pt-0 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 mb-4">
                    Daftar dipisah: &quot;Notif WA semua lembaga&quot; vs &quot;Notif WA lembaga sesuai role&quot; (mengikuti lembaga yang dipilih pada formulir).
                    Buka bagian ini hanya jika perlu membatasi centang penerima.
                  </p>
                  <WaNotifRecipientChecklist
                    loading={loadingAdmins}
                    recipientGroups={recipientGroups}
                    listAdminsFallback={listAdmins}
                    selectedAdmins={selectedAdmins}
                    onToggle={handleToggleAdmin}
                    canManage
                    draftContext={rencana?.ket === 'draft'}
                  />
                </div>
              </details>
            ) : null}

              {/* Actions — tombol hanya ditampilkan jika ada hak (bukan hanya disabled) */}
              <div className="flex gap-2 justify-end mt-6 flex-wrap">
                <button
                  type="button"
                  onClick={() => (embedded ? onEmbeddedClose?.() : navigate('/pengeluaran'))}
                  className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Batal
                </button>
                {allowSaveAsDraft && (isCreateMode || rencana?.ket === 'draft') ? (
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e, true)}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        Menyimpan...
                      </>
                    ) : (
                      'Simpan Draft'
                    )}
                  </button>
                ) : null}
                {allowSaveSubmit ? (
                  <button
                    type="submit"
                    form="rencana-form"
                    disabled={saving}
                    className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {saving ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                        {isCreateMode || rencana?.ket === 'draft' ? 'Menyimpan...' : 'Mengupdate...'}
                      </>
                    ) : (
                      submitPrimaryLabel
                    )}
                  </button>
                ) : null}
              </div>
          </motion.div>
        </div>
      </div>

      {/* File Preview Offcanvas - Kanan */}
      {createPortal(
        <AnimatePresence>
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
                            <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <p className="text-gray-600 dark:text-gray-400 mb-4">
                              Preview tidak tersedia untuk tipe file ini
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
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Delete File Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        title="Konfirmasi Hapus File"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deletingFile}
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Apakah Anda yakin ingin menghapus file ini?
            </p>
            {fileToDelete && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  {getFileIcon(fileToDelete.tipe_file, fileToDelete.nama_file)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {fileToDelete.nama_file}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      <span className={getFileTypeLabel(fileToDelete.tipe_file, fileToDelete.nama_file).color}>
                        {getFileTypeLabel(fileToDelete.tipe_file, fileToDelete.nama_file).label}
                      </span>
                      {' • '}
                      {formatFileSize(fileToDelete.ukuran_file)}
                    </p>
                  </div>
                </div>
              </div>
            )}
            <p className="text-sm text-red-600 dark:text-red-400 font-medium">
              ⚠️ Tindakan ini tidak dapat dibatalkan!
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleCloseDeleteModal}
              disabled={deletingFile}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteFile}
              disabled={deletingFile}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deletingFile ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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

export default EditRencana

