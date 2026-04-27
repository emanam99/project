import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { santriAPI, pendaftaranAPI } from '../../../services/api'
import { loadSantriBiodataWithCache } from '../../../services/santriBiodataLoad'
import { putSantriBiodataFromApi, subscribeSantriBiodataByDbId } from '../../../services/offcanvasSearchCache'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { useAuthStore } from '../../../store/authStore'
import { userMatchesAnyAllowedRole } from '../../../utils/roleAccess'
import { usePendaftaranFiturAccess } from '../../../hooks/usePendaftaranFiturAccess'
import { useNotification } from '../../../contexts/NotificationContext'
import { extractTanggalLahirFromNIK, extractGenderFromNIK } from '../../../utils/nikUtils'
import BerkasOffcanvas from './BerkasOffcanvas'
import FilePreviewOffcanvas from '../../../components/FilePreview/FilePreviewOffcanvas'
import CameraScanner from '../../../components/CameraScanner/CameraScanner'
import ImageEditorModal from '../../../components/ImageEditor/ImageEditorModal'
import Modal from '../../../components/Modal/Modal'
import { formatFileSize } from './utils/fileUtils'
import { compressImage } from '../../../utils/imageCompression'
import { useBerkasManagement } from './hooks/useBerkasManagement'
import { useSectionNavigation } from './hooks/useSectionNavigation'
import { useWhatsAppCheck } from './hooks/useWhatsAppCheck'
import SidebarNavigation from './SidebarNavigation'
import HeaderSection from './HeaderSection'
import DataDiriSection from './sections/DataDiriSection'
import BiodataOrangTuaSection from './sections/BiodataOrangTuaSection'
import AlamatSection from './sections/AlamatSection'
import RiwayatPendidikanSection from './sections/RiwayatPendidikanSection'
import BiodataWaliSection from './sections/BiodataWaliSection'
import InformasiTambahanSection from './sections/InformasiTambahanSection'
import RiwayatChatOffcanvas from './RiwayatChatOffcanvas'
import StatusPendaftaranSection from './sections/StatusPendaftaranSection'
import KategoriPendidikanSection from './sections/KategoriPendidikanSection'
import BerkasSection from './sections/BerkasSection'
import { shouldShowStatusMuridForFormal } from '../constants/statusMuridByFormal'

function BiodataPendaftaran({ onDataChange, externalSantriId, onOpenSearch, onBiodataSaved, hideBerkasSection = false }) {
  const { showNotification } = useNotification()
  const [formData, setFormData] = useState({
    // NIS
    id: '',
    
    // Data Diri
    nama: '',
    nik: '',
    gender: '',
    tempat_lahir: '',
    tanggal_lahir: '',
    nisn: '',
    no_kk: '',
    kepala_keluarga: '',
    anak_ke: '',
    jumlah_saudara: '',
    saudara_di_pesantren: '',
    hobi: '',
    cita_cita: '',
    kebutuhan_khusus: '',
    
    // Biodata Ayah (sesuai kolom database)
    ayah: '',
    status_ayah: 'Masih Hidup',
    nik_ayah: '',
    tempat_lahir_ayah: '',
    tanggal_lahir_ayah: '',
    pekerjaan_ayah: '',
    pendidikan_ayah: '',
    penghasilan_ayah: '',
    
    // Biodata Ibu (sesuai kolom database)
    ibu: '',
    status_ibu: 'Masih Hidup',
    nik_ibu: '',
    tempat_lahir_ibu: '',
    tanggal_lahir_ibu: '',
    pekerjaan_ibu: '',
    pendidikan_ibu: '',
    penghasilan_ibu: '',
    
    // Biodata Wali (sesuai kolom database)
    hubungan_wali: '',
    wali: '',
    nik_wali: '',
    tempat_lahir_wali: '',
    tanggal_lahir_wali: '',
    pekerjaan_wali: '',
    pendidikan_wali: '',
    penghasilan_wali: '',
    
    // Alamat Santri
    dusun: '',
    rt: '',
    rw: '',
    desa: '',
    kecamatan: '',
    kabupaten: '',
    provinsi: '',
    kode_pos: '',
    
    // Riwayat Madrasah (sesuai kolom database)
    madrasah: '', // varchar(255) di database
    nama_madrasah: '',
    alamat_madrasah: '',
    lulus_madrasah: '',
    
    // Riwayat Sekolah (sesuai kolom database)
    sekolah: '',
    nama_sekolah: '',
    alamat_sekolah: '',
    lulus_sekolah: '',
    npsn: '',
    nsm: '',
    jurusan: '',
    program_sekolah: '',
    
    // Informasi Tambahan (sesuai kolom database)
    email: '',
    no_telpon: '',
    riwayat_sakit: '',
    ukuran_baju: '',
    kip: '',
    pkh: '',
    kks: '',
    status_nikah: '',
    pekerjaan: '',
    no_wa_santri: '',
    
    // Status Pendaftaran (dari tabel psb___registrasi)
    status_pendaftar: '',
    keterangan_status: '',
    daftar_diniyah: '',
    daftar_formal: '',
    status_murid: '',
    prodi: '',
    gelombang: '',
    status_santri: '',
    
    // Kategori & Pendidikan (kamar/daerah/diniyah/formal dari select; tersimpan id_*)
    kategori: '',
    id_daerah: '',
    id_kamar: '',
    daerah: '',
    kamar: '',
    tidak_sekolah_diniyah: false,
    lembaga_diniyah: '',
    id_diniyah: '',
    kelas_diniyah: '',
    kel_diniyah: '',
    nim_diniyah: '',
    tidak_sekolah_formal: false,
    lembaga_formal: '',
    id_formal: '',
    kelas_formal: '',
    kel_formal: '',
    nim_formal: '',
    lttq: '',
    kelas_lttq: '',
    kel_lttq: '',
  })
  
  const [hasChanges, setHasChanges] = useState(false)
  const hasChangesRef = useRef(false)
  const [biodataSantriDbId, setBiodataSantriDbId] = useState(null)
  /** Biodata dari IndexedDB (offline / server error) */
  const [biodataDariCache, setBiodataDariCache] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [localId, setLocalId] = useState('')
  const isUserTypingRef = useRef(false) // Flag untuk track apakah user sedang mengetik
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newSantriForm, setNewSantriForm] = useState({
    nama: '',
    nik: '',
    gender: '',
    status_pendaftar: '',
    daftar_diniyah: '',
    daftar_formal: ''
  })
  const [isCreating, setIsCreating] = useState(false)
  const [nikSearchError, setNikSearchError] = useState('')
  const [focusedField, setFocusedField] = useState(null)
  const [existingBerkasToReplace, setExistingBerkasToReplace] = useState(null)
  const [showCameraScanner, setShowCameraScanner] = useState(false)
  const [cameraImageEditorOpen, setCameraImageEditorOpen] = useState(false)
  const [cameraImageFileForEditor, setCameraImageFileForEditor] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const fileRef = useRef(null)
  const [showDeleteRegistrasiModal, setShowDeleteRegistrasiModal] = useState(false)
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false)
  const [confirmSendWaSantri, setConfirmSendWaSantri] = useState(true)
  const [confirmSendWaWali, setConfirmSendWaWali] = useState(true)
  const [registrasiList, setRegistrasiList] = useState([])
  const [selectedRegistrasi, setSelectedRegistrasi] = useState([])
  const [hapusDiTabelSantri, setHapusDiTabelSantri] = useState(false)
  const [loadingRegistrasi, setLoadingRegistrasi] = useState(false)
  const [deletingRegistrasi, setDeletingRegistrasi] = useState(false)
  const [showRiwayatChatOffcanvas, setShowRiwayatChatOffcanvas] = useState(false)
  const [riwayatChatMeta, setRiwayatChatMeta] = useState({ nomor: '', idSantri: '', namaSantri: '' })
  const [kondisiValues, setKondisiValues] = useState({
    status_pendaftar: [],
    status_santri: [],
    daftar_diniyah: [],
    daftar_formal: [],
  })
  const [kategoriOptions, setKategoriOptions] = useState([])
  const [daerahOptions, setDaerahOptions] = useState([])
  const [kamarOptions, setKamarOptions] = useState([])
  const [lembagaDiniyahOptions, setLembagaDiniyahOptions] = useState([])
  const [lembagaFormalOptions, setLembagaFormalOptions] = useState([])
  const [kelasDiniyahOptions, setKelasDiniyahOptions] = useState([])
  const [kelasFormalOptions, setKelasFormalOptions] = useState([])
  const [kelDiniyahOptions, setKelDiniyahOptions] = useState([])
  const [kelFormalOptions, setKelFormalOptions] = useState([])
  
  // Use berkas management hook
  const berkasManagement = useBerkasManagement(localId)
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
    uploading,
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
    downloadForPreview,
    handleGantiClickBerkas,
    handleUpdateBerkas,
    handleDeleteClickBerkas,
    handleDeleteConfirmBerkas,
    handleCloseDeleteModalBerkas
  } = berkasManagement

  // State untuk KK yang sama dengan KK Santri
  const [kkSamaDenganSantri, setKkSamaDenganSantri] = useState(() => {
    if (localId) {
      const saved = localStorage.getItem(`kkSamaDenganSantri_${localId}`)
      return saved ? JSON.parse(saved) : []
    }
    return []
  })

  // berkasNotAvailable dari server (berkas dengan status_tidak_ada=1)
  const berkasNotAvailable = useMemo(() =>
    berkasList.filter(b => b.status_tidak_ada == 1).map(b => b.jenis_berkas),
    [berkasList]
  )

  // Load kkSamaDenganSantri dari localStorage saat localId berubah
  useEffect(() => {
    if (localId) {
      // Load kkSamaDenganSantri
      const savedKk = localStorage.getItem(`kkSamaDenganSantri_${localId}`)
      if (savedKk) {
        try {
          setKkSamaDenganSantri(JSON.parse(savedKk))
        } catch (e) {
          console.error('Error parsing kkSamaDenganSantri from localStorage:', e)
          setKkSamaDenganSantri([])
        }
      } else {
        setKkSamaDenganSantri([])
      }
      
      // Sync kkSamaDenganSantri dengan berkasList yang ada (hanya uploaded, bukan status tidak ada)
      const uploadedJenisBerkas = berkasList.filter(b => !b.status_tidak_ada).map(b => b.jenis_berkas)
      if (uploadedJenisBerkas.length > 0) {
        setKkSamaDenganSantri(prev => {
          const updated = prev.filter(jenisBerkas => uploadedJenisBerkas.includes(jenisBerkas))
          if (updated.length !== prev.length) {
            localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updated))
          }
          return updated
        })
      }
    } else {
      setKkSamaDenganSantri([])
    }
  }, [localId, berkasList])

  // Save kkSamaDenganSantri to localStorage
  useEffect(() => {
    if (localId) {
      localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(kkSamaDenganSantri))
    }
  }, [kkSamaDenganSantri, localId])

  // Sinkronisasi kkSamaDenganSantri dengan berkasList (hanya uploaded)
  useEffect(() => {
    if (berkasList.length > 0 && localId) {
      const uploadedJenisBerkas = berkasList.filter(b => !b.status_tidak_ada).map(b => b.jenis_berkas)
      setKkSamaDenganSantri(prev => {
        const updated = prev.filter(jenisBerkas => uploadedJenisBerkas.includes(jenisBerkas))
        if (updated.length !== prev.length && localId) {
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updated))
        }
        return updated
      })
    }
  }, [berkasList, localId])

  // Fungsi untuk toggle status "tidak ada" - simpan ke server
  const toggleBerkasNotAvailable = async (jenisBerkas, existingBerkas = null) => {
    const isCurrentlyNotAvailable = berkasNotAvailable.includes(jenisBerkas)

    if (!localId || !/^\d{7}$/.test(localId)) {
      showNotification('NIS tidak valid', 'error')
      return
    }

    if (!isCurrentlyNotAvailable && existingBerkas && existingBerkas.status_tidak_ada != 1) {
      if (!window.confirm(`Berkas "${jenisBerkas}" sudah diupload. Hapus berkas dan tandai sebagai "Tidak Ada"?`)) {
        return
      }
    }

    try {
      if (isCurrentlyNotAvailable) {
        const result = await pendaftaranAPI.unmarkTidakAda(localId, jenisBerkas)
        if (result.success) {
          updateBerkasTidakAdaLocal(jenisBerkas, false)
          showNotification(`"${jenisBerkas}" ditandai sebagai tersedia`, 'info')
        } else {
          showNotification(result.message || 'Gagal menghapus tanda tidak ada', 'error')
        }
      } else {
        const result = await pendaftaranAPI.markTidakAda(localId, jenisBerkas)
        if (result.success) {
          updateBerkasTidakAdaLocal(jenisBerkas, true)
          showNotification(`"${jenisBerkas}" ditandai sebagai tidak ada`, 'info')
        } else {
          showNotification(result.message || 'Gagal menandai berkas', 'error')
        }
      }
    } catch (error) {
      console.error('Error toggle tidak ada:', error)
      showNotification('Gagal mengubah status berkas', 'error')
    }
  }

  // Fungsi untuk toggle "Sama dengan KK Santri"
  const toggleKkSamaDenganSantri = async (jenisBerkas) => {
    const isCurrentlySame = kkSamaDenganSantri.includes(jenisBerkas)
    const kkSantri = berkasList.find(b => b.jenis_berkas === 'KK Santri' && !b.status_tidak_ada)
    const existingBerkas = berkasList.find(b => b.jenis_berkas === jenisBerkas)
    
    if (!kkSantri) {
      showNotification('KK Santri belum diupload. Silakan upload KK Santri terlebih dahulu.', 'warning')
      return
    }

    // Pastikan localId valid sebelum melanjutkan
    if (!localId || !/^\d{7}$/.test(localId)) {
      showNotification('NIS tidak valid', 'error')
      return
    }

    if (!isCurrentlySame) {
      // Jika akan dicentang, link KK Santri ke jenis berkas yang dipilih (gunakan file yang sama)
      try {
        showNotification('Menghubungkan dengan KK Santri...', 'info')
        
        // Jika sudah ada berkas, konfirmasi dulu
        if (existingBerkas) {
          if (!window.confirm(`"${jenisBerkas}" sudah ada. Ganti dengan link ke KK Santri?`)) {
            return
          }
          // Hapus berkas yang sudah ada dulu
          const deleteResult = await pendaftaranAPI.deleteBerkas(existingBerkas.id)
          if (!deleteResult.success) {
            throw new Error(deleteResult.message || 'Gagal menghapus berkas yang sudah ada')
          }
        }
        
        // Link berkas (gunakan file yang sama tanpa upload)
        const result = await pendaftaranAPI.linkBerkas(
          localId,
          jenisBerkas,
          kkSantri.id,
          'KK Santri'
        )
        
        if (result.success) {
          // Refresh list berkas dengan localId yang eksplisit SEBELUM update state
          await fetchBerkasList(localId)
          
          // Tandai sebagai sama dengan KK Santri
          const updatedList = [...kkSamaDenganSantri, jenisBerkas]
          setKkSamaDenganSantri(updatedList)
          
          // Simpan ke localStorage
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updatedList))
          
          showNotification(`"${jenisBerkas}" berhasil dihubungkan dengan KK Santri`, 'success')
        } else {
          showNotification(result.message || 'Gagal menghubungkan dengan KK Santri', 'error')
          // Refresh list berkas untuk memastikan state konsisten
          if (localId && /^\d{7}$/.test(localId)) {
            await fetchBerkasList(localId)
          }
        }
      } catch (error) {
        console.error('Error linking KK Santri:', error)
        showNotification('Gagal menghubungkan dengan KK Santri', 'error')
        // Refresh list berkas untuk memastikan state konsisten
        if (localId && /^\d{7}$/.test(localId)) {
          await fetchBerkasList(localId)
        }
      }
    } else {
      // Jika akan di-uncheck, hapus berkas yang di-link
      if (existingBerkas) {
        try {
          const response = await pendaftaranAPI.deleteBerkas(existingBerkas.id)
          if (!response.success) {
            throw new Error(response.message || 'Gagal menghapus link berkas')
          }
          
          // Refresh list berkas dengan localId yang eksplisit SEBELUM update state
          await fetchBerkasList(localId)
          
          // Hapus dari daftar
          const updatedList = kkSamaDenganSantri.filter(item => item !== jenisBerkas)
          setKkSamaDenganSantri(updatedList)
          
          // Simpan ke localStorage
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updatedList))
          
          showNotification(`Link "${jenisBerkas}" berhasil dihapus`, 'success')
        } catch (error) {
          console.error('Error deleting linked berkas:', error)
          showNotification('Gagal menghapus link berkas', 'error')
          // Refresh list berkas untuk memastikan state konsisten
          if (localId && /^\d{7}$/.test(localId)) {
            await fetchBerkasList(localId)
          }
        }
      } else {
        // Jika tidak ada berkas, cukup hapus dari daftar
        const updatedList = kkSamaDenganSantri.filter(item => item !== jenisBerkas)
        setKkSamaDenganSantri(updatedList)
        localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updatedList))
      }
    }
  }

  const applyCompressIfNeededCamera = useCallback(async (editedFile) => {
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

  const handleCameraImageEditorSave = useCallback(
    async (editedFile) => {
      const fileToUse = await applyCompressIfNeededCamera(editedFile)
      const jenisBerkas = sessionStorage.getItem('uploadingBerkasJenis')
      if (jenisBerkas) setSelectedJenisBerkas(jenisBerkas)
      setSelectedFile(fileToUse)
      setIsBerkasOffcanvasOpen(true)
    },
    [applyCompressIfNeededCamera, setSelectedJenisBerkas, setIsBerkasOffcanvasOpen]
  )

  // Handle camera capture
  const handleCameraCapture = async (file) => {
    console.log('handleCameraCapture called with file:', file)
    
    if (!file) {
      console.error('No file received in handleCameraCapture')
      showNotification('Gagal menerima file dari kamera. Silakan coba lagi.', 'error')
      return
    }

    try {
      const maxSizeBytes = 1024 * 1024 // 1MB
      let fileToUse = file

      // Jika ukuran > 1MB, compress otomatis tanpa notifikasi
      if (file.size > maxSizeBytes) {
        try {
          console.log('Auto-compressing camera image:', file.size, 'bytes')
          const compressedFile = await compressImage(file, 1) // 1MB
          console.log('Compressed:', file.size, 'bytes →', compressedFile.size, 'bytes')
          fileToUse = compressedFile
        } catch (compressionErr) {
          console.error('Error compressing camera image:', compressionErr)
          showNotification('Gagal mengompresi gambar. Silakan coba lagi.', 'error')
          return
        }
      }

      const jenisBerkas = sessionStorage.getItem('uploadingBerkasJenis')
      sessionStorage.setItem('uploadingBerkasJenis', jenisBerkas || 'Ijazah SD Sederajat')
      setShowCameraScanner(false)
      setCameraImageFileForEditor(fileToUse)
      setCameraImageEditorOpen(true)
    } catch (err) {
      console.error('Error in handleCameraCapture:', err)
      showNotification('Gagal memproses file dari kamera. Silakan coba lagi.', 'error')
    }
  }

  const formRef = useRef(null)
  const previousExternalIdRef = useRef(null)
  const isLoadingDataRef = useRef(false) // Track apakah sedang load data dari API
  const loadDataRef = useRef(async () => {})
  const onDataChangeTimeoutRef = useRef(null) // Track timeout untuk debounce onDataChange
  // Data dari modal Tambah Santri Baru agar NIK, nama, gender, dan pilihan status langsung terisi di biodata
  const initialDataFromCreateRef = useRef(null)
  const { tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const { user } = useAuthStore()
  const { hapusSantri, biodataUbahKeteranganStatus } = usePendaftaranFiturAccess()
  
  // Note: showNotification sudah dideklarasikan di atas (baris 35)
  
  // WhatsApp checking hook
  const waCheck = useWhatsAppCheck(showNotification)
  
  // Helper function untuk mendapatkan className label berdasarkan focused state
  const getLabelClassName = (fieldName) => {
    const baseClass = "block text-xs mb-1 transition-colors duration-200"
    if (focusedField === fieldName) {
      return `${baseClass} text-teal-600 dark:text-teal-400 font-semibold`
    }
    return `${baseClass} text-gray-500 dark:text-gray-400`
  }
  
  // Use section navigation hook
  const { sectionRefs, activeSection, scrollToSection } = useSectionNavigation()

  // Load opsi kategori, lembaga diniyah/formal (untuk section Kategori & Pendidikan)
  useEffect(() => {
    const load = async () => {
      try {
        const [kategoriRes, lembagaDiniyahRes, lembagaFormalRes] = await Promise.all([
          pendaftaranAPI.getKategoriOptions(),
          pendaftaranAPI.getLembagaOptions('diniyah'),
          pendaftaranAPI.getLembagaOptions('formal')
        ])
        if (kategoriRes.success && Array.isArray(kategoriRes.data)) setKategoriOptions(kategoriRes.data)
        if (lembagaDiniyahRes.success && Array.isArray(lembagaDiniyahRes.data)) setLembagaDiniyahOptions(lembagaDiniyahRes.data)
        if (lembagaFormalRes.success && Array.isArray(lembagaFormalRes.data)) setLembagaFormalOptions(lembagaFormalRes.data)
      } catch (e) {
        console.error('Load options kategori/lembaga:', e)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!formData.kategori) {
      setDaerahOptions([])
      return
    }
    pendaftaranAPI.getDaerahOptions(formData.kategori).then((res) => {
      if (res.success && Array.isArray(res.data)) setDaerahOptions(res.data)
      else setDaerahOptions([])
    }).catch(() => setDaerahOptions([]))
  }, [formData.kategori])

  useEffect(() => {
    if (!formData.id_daerah) {
      setKamarOptions([])
      return
    }
    pendaftaranAPI.getKamarOptions(formData.id_daerah).then((res) => {
      if (res.success && Array.isArray(res.data)) setKamarOptions(res.data)
      else setKamarOptions([])
    }).catch(() => setKamarOptions([]))
  }, [formData.id_daerah])

  // Kelas diniyah: saat lembaga_diniyah berubah
  useEffect(() => {
    if (!formData.lembaga_diniyah) {
      setKelasDiniyahOptions([])
      return
    }
    pendaftaranAPI.getKelasOptions(formData.lembaga_diniyah).then((res) => {
      if (res.success && Array.isArray(res.data)) setKelasDiniyahOptions(res.data)
      else setKelasDiniyahOptions([])
    }).catch(() => setKelasDiniyahOptions([]))
  }, [formData.lembaga_diniyah])

  // Kelas formal: saat lembaga_formal berubah
  useEffect(() => {
    if (!formData.lembaga_formal) {
      setKelasFormalOptions([])
      return
    }
    pendaftaranAPI.getKelasOptions(formData.lembaga_formal).then((res) => {
      if (res.success && Array.isArray(res.data)) setKelasFormalOptions(res.data)
      else setKelasFormalOptions([])
    }).catch(() => setKelasFormalOptions([]))
  }, [formData.lembaga_formal])

  // Kel diniyah: saat lembaga_diniyah + kelas_diniyah berubah
  useEffect(() => {
    if (!formData.lembaga_diniyah) {
      setKelDiniyahOptions([])
      return
    }
    pendaftaranAPI.getKelOptions(formData.lembaga_diniyah, formData.kelas_diniyah).then((res) => {
      if (res.success && Array.isArray(res.data)) setKelDiniyahOptions(res.data)
      else setKelDiniyahOptions([])
    }).catch(() => setKelDiniyahOptions([]))
  }, [formData.lembaga_diniyah, formData.kelas_diniyah])

  // Kel formal: saat lembaga_formal + kelas_formal berubah
  useEffect(() => {
    if (!formData.lembaga_formal) {
      setKelFormalOptions([])
      return
    }
    pendaftaranAPI.getKelOptions(formData.lembaga_formal, formData.kelas_formal).then((res) => {
      if (res.success && Array.isArray(res.data)) setKelFormalOptions(res.data)
      else setKelFormalOptions([])
    }).catch(() => setKelFormalOptions([]))
  }, [formData.lembaga_formal, formData.kelas_formal])

  // Load kondisi values saat component mount
  // Mengambil data dari tabel psb___kondisi_value berdasarkan field_name
  // Backend akan otomatis mengambil ID field yang tepat dari tabel psb___kondisi_field
  // melalui JOIN: psb___kondisi_value.id_field = psb___kondisi_field.id
  useEffect(() => {
    const loadKondisiValues = async () => {
      try {
        const fields = ['status_pendaftar', 'status_santri', 'daftar_diniyah', 'daftar_formal']
        const valuesMap = {}
        
        for (const fieldName of fields) {
          try {
            // Memanggil API dengan field_name, backend akan mencari ID field yang sesuai
            // dari tabel psb___kondisi_field dan mengambil data dari psb___kondisi_value
            const result = await pendaftaranAPI.getKondisiValues(null, fieldName)
            if (result && result.success && result.data) {
              valuesMap[fieldName] = result.data.map(item => ({
                value: item.value,
                label: item.value_label || item.value
              }))
            } else {
              valuesMap[fieldName] = []
            }
          } catch (fieldError) {
            // Jika error untuk field tertentu, set empty array dan lanjutkan ke field berikutnya
            console.warn(`Error loading kondisi value for ${fieldName}:`, fieldError)
            valuesMap[fieldName] = []
          }
        }
        
        setKondisiValues(valuesMap)
      } catch (error) {
        // Fallback: set semua ke empty array jika error umum
        console.warn('Error loading kondisi values:', error)
        setKondisiValues({
          status_pendaftar: [],
          status_santri: [],
          daftar_diniyah: [],
          daftar_formal: [],
        })
      }
    }
    
    loadKondisiValues()
  }, [])

  // Sync externalSantriId (dari URL) ke localId dan load data (mirip dengan BiodataBox)
  useEffect(() => {
    // Skip jika user sedang mengetik (untuk mencegah clear form saat user menghapus angka)
    if (isUserTypingRef.current) {
      return
    }
    
    if (externalSantriId) {
      // Jika externalSantriId berbeda dengan localId saat ini
      if (externalSantriId !== localId) {
        // Simulasi mengetik manual: kosongkan dulu, kemudian isi
        setLocalId('')
        setFormData(prev => {
          const cleared = { ...prev }
          // Reset semua field ke default
          Object.keys(cleared).forEach(key => {
            if (key === 'status_ayah' || key === 'status_ibu') {
              cleared[key] = 'Masih Hidup'
            } else {
              cleared[key] = ''
            }
          })
          return cleared
        })
        setHasChanges(false)
        
        // Set ID baru setelah delay kecil untuk simulasi mengetik
        setTimeout(() => {
          setLocalId(externalSantriId)
          // Trigger load jika ID valid (7 karakter)
          if (/^\d{7}$/.test(externalSantriId)) {
            loadData(externalSantriId)
          }
        }, 150)
      }
    } else {
      // Jika externalSantriId kosong/null, hanya kosongkan form jika:
      // 1. User TIDAK sedang mengetik (isUserTypingRef.current = false)
      // 2. localId sudah 7 angka (artinya data sudah di-load sebelumnya)
      // Jika localId tidak 7 angka, berarti user sedang mengetik, jangan clear
      
      if (isUserTypingRef.current) {
        // User sedang mengetik, jangan clear form termasuk ID
        return
      }
      
      // Hanya clear jika ID sebelumnya sudah lengkap (7 angka)
      // Ini berarti data sudah di-load, bukan user sedang mengetik
      if (localId && /^\d{7}$/.test(localId)) {
        setLocalId('')
        setFormData(prev => {
          const cleared = { ...prev }
          Object.keys(cleared).forEach(key => {
            if (key === 'status_ayah' || key === 'status_ibu') {
              cleared[key] = 'Masih Hidup'
            } else {
              cleared[key] = ''
            }
          })
          return cleared
        })
        setHasChanges(false)
      }
      // Jika localId tidak 7 angka (1-6 angka), berarti user sedang mengetik, jangan clear
      // ID akan tetap ada di input field
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSantriId])

  // Cleanup timeout saat component unmount
  useEffect(() => {
    return () => {
      if (onDataChangeTimeoutRef.current) {
        clearTimeout(onDataChangeTimeoutRef.current)
      }
    }
  }, [])

  // Load data dari API
  const loadData = async (id) => {
    if (!id || !/^\d{7}$/.test(id)) {
      return
    }

    // Set flag bahwa sedang load data
    isLoadingDataRef.current = true
    setIsLoading(true)
      try {
        setBiodataDariCache(false)
        const online = typeof navigator === 'undefined' || navigator.onLine !== false
        const biodataResponse = await loadSantriBiodataWithCache(id)
        if (biodataResponse.success && biodataResponse.data) {
          const biodata = biodataResponse.data
          setBiodataSantriDbId(biodata.id != null ? Number(biodata.id) : null)
          setBiodataDariCache(!!(biodataResponse.fromCache && (biodataResponse.offline || !!biodataResponse.message)))
          
          // Data awal dari modal Tambah Santri Baru (agar NIK, nama, gender & pilihan tidak hilang)
          const fromCreate = initialDataFromCreateRef.current

          // Buat object formData baru untuk menghindari multiple re-render
          // Tampilkan NIS di input (backend resolve id/nis; nilai yang diketik/dipilih adalah NIS)
          const newFormData = {
            id: biodata.nis ?? biodata.id ?? id,
            nama: biodata.nama || fromCreate?.nama || '',
            nik: biodata.nik || fromCreate?.nik || '',
            gender: biodata.gender || fromCreate?.gender || '',
            tempat_lahir: biodata.tempat_lahir || '',
            tanggal_lahir: biodata.tanggal_lahir || '',
            nisn: biodata.nisn || '',
            no_kk: biodata.no_kk || '',
            kepala_keluarga: biodata.kepala_keluarga || '',
            anak_ke: biodata.anak_ke || '',
            jumlah_saudara: biodata.jumlah_saudara || '',
            saudara_di_pesantren: biodata.saudara_di_pesantren || '',
            hobi: biodata.hobi || '',
            cita_cita: biodata.cita_cita || '',
            kebutuhan_khusus: biodata.kebutuhan_khusus || '',
            ayah: biodata.ayah || '',
            status_ayah: biodata.status_ayah || 'Masih Hidup',
            nik_ayah: biodata.nik_ayah || '',
            tempat_lahir_ayah: biodata.tempat_lahir_ayah || '',
            tanggal_lahir_ayah: biodata.tanggal_lahir_ayah || '',
            pekerjaan_ayah: biodata.pekerjaan_ayah || '',
            pendidikan_ayah: biodata.pendidikan_ayah || '',
            penghasilan_ayah: biodata.penghasilan_ayah || '',
            ibu: biodata.ibu || '',
            status_ibu: biodata.status_ibu || 'Masih Hidup',
            nik_ibu: biodata.nik_ibu || '',
            tempat_lahir_ibu: biodata.tempat_lahir_ibu || '',
            tanggal_lahir_ibu: biodata.tanggal_lahir_ibu || '',
            pekerjaan_ibu: biodata.pekerjaan_ibu || '',
            pendidikan_ibu: biodata.pendidikan_ibu || '',
            penghasilan_ibu: biodata.penghasilan_ibu || '',
            hubungan_wali: biodata.hubungan_wali || '',
            wali: biodata.wali || '',
            nik_wali: biodata.nik_wali || '',
            tempat_lahir_wali: biodata.tempat_lahir_wali || '',
            tanggal_lahir_wali: biodata.tanggal_lahir_wali || '',
            pekerjaan_wali: biodata.pekerjaan_wali || '',
            pendidikan_wali: biodata.pendidikan_wali || '',
            penghasilan_wali: biodata.penghasilan_wali || '',
            dusun: biodata.dusun || '',
            rt: biodata.rt || '',
            rw: biodata.rw || '',
            desa: biodata.desa || '',
            kecamatan: biodata.kecamatan || '',
            kabupaten: biodata.kabupaten || '',
            provinsi: biodata.provinsi || '',
            kode_pos: biodata.kode_pos || '',
            // Riwayat sekolah dan madrasah hanya diambil dari psb___registrasi, bukan dari santri
            madrasah: '',
            nama_madrasah: '',
            alamat_madrasah: '',
            lulus_madrasah: '',
            sekolah: '',
            nama_sekolah: '',
            alamat_sekolah: '',
            lulus_sekolah: '',
            npsn: '',
            nsm: '',
            jurusan: '',
            program_sekolah: '',
            email: biodata.email || '',
            no_telpon: biodata.no_telpon || '',
            riwayat_sakit: biodata.riwayat_sakit || '',
            ukuran_baju: biodata.ukuran_baju || '',
            kip: biodata.kip || '',
            pkh: biodata.pkh || '',
            kks: biodata.kks || '',
            status_nikah: biodata.status_nikah || '',
            pekerjaan: biodata.pekerjaan || '',
            no_wa_santri: biodata.no_wa_santri || '',
            status_santri: biodata.status_santri || '',
            kategori: biodata.kategori || (biodata.gender === 'Laki-laki' ? 'Banin' : biodata.gender === 'Perempuan' ? 'Banat' : ''),
            id_daerah: biodata.id_daerah ?? '',
            id_kamar: biodata.id_kamar ?? '',
            daerah: biodata.daerah || '',
            kamar: biodata.kamar || '',
            tidak_sekolah_diniyah: biodata.tidak_sekolah_diniyah === true || !biodata.id_diniyah,
            lembaga_diniyah: biodata.diniyah || '',
            id_diniyah: biodata.id_diniyah ?? '',
            kelas_diniyah: biodata.kelas_diniyah || '',
            kel_diniyah: biodata.kel_diniyah || '',
            nim_diniyah: biodata.nim_diniyah || '',
            tidak_sekolah_formal: biodata.tidak_sekolah_formal === true || !biodata.id_formal,
            lembaga_formal: biodata.formal || '',
            id_formal: biodata.id_formal ?? '',
            kelas_formal: biodata.kelas_formal || '',
            kel_formal: biodata.kel_formal || '',
            nim_formal: biodata.nim_formal || '',
            lttq: biodata.lttq || '',
            kelas_lttq: biodata.kelas_lttq || '',
            kel_lttq: biodata.kel_lttq || '',
            prodi: biodata.prodi || '',
          }

          // Load data registrasi dari tabel psb___registrasi (perlu jaringan)
          const thReg = String(tahunAjaran || '').trim()
          const tmReg = String(tahunAjaranMasehi || '').trim()
          const registrasiResponse =
            online && thReg && tmReg
              ? await pendaftaranAPI.getRegistrasi(id, thReg, tmReg)
              : { success: false, data: null }
          if (registrasiResponse.success && registrasiResponse.data) {
            const registrasi = registrasiResponse.data
            // Update field status pendaftaran (prioritas: API, lalu data dari modal Tambah Santri Baru)
            newFormData.status_pendaftar = registrasi.status_pendaftar || fromCreate?.status_pendaftar || newFormData.status_pendaftar
            newFormData.keterangan_status = registrasi.keterangan_status || newFormData.keterangan_status
            newFormData.daftar_diniyah = registrasi.daftar_diniyah || fromCreate?.daftar_diniyah || newFormData.daftar_diniyah
            newFormData.daftar_formal = registrasi.daftar_formal || fromCreate?.daftar_formal || newFormData.daftar_formal
            newFormData.status_murid = registrasi.status_murid || newFormData.status_murid
            newFormData.prodi = registrasi.prodi || newFormData.prodi || ''
            newFormData.gelombang = registrasi.gelombang || newFormData.gelombang || ''
            
            // Riwayat sekolah dan madrasah HANYA diambil dari psb___registrasi, tidak dari santri
            // Selalu gunakan data dari registrasi (jika ada) untuk riwayat sekolah/madrasah
            newFormData.madrasah = registrasi.madrasah || ''
            newFormData.nama_madrasah = registrasi.nama_madrasah || ''
            newFormData.alamat_madrasah = registrasi.alamat_madrasah || ''
            newFormData.lulus_madrasah = registrasi.lulus_madrasah || ''
            newFormData.sekolah = registrasi.sekolah || ''
            newFormData.nama_sekolah = registrasi.nama_sekolah || ''
            newFormData.alamat_sekolah = registrasi.alamat_sekolah || ''
            newFormData.lulus_sekolah = registrasi.lulus_sekolah || ''
            newFormData.npsn = registrasi.npsn || ''
            newFormData.nsm = registrasi.nsm || ''
            newFormData.jurusan = registrasi.jurusan || ''
            newFormData.program_sekolah = registrasi.program_sekolah || ''
          }

          // Jika tidak ada data registrasi, isi status dari modal Tambah Santri Baru (pilihan awal)
          if (fromCreate) {
            if (!newFormData.status_pendaftar && fromCreate.status_pendaftar) newFormData.status_pendaftar = fromCreate.status_pendaftar
            if (!newFormData.daftar_diniyah && fromCreate.daftar_diniyah) newFormData.daftar_diniyah = fromCreate.daftar_diniyah
            if (!newFormData.daftar_formal && fromCreate.daftar_formal) newFormData.daftar_formal = fromCreate.daftar_formal
          }

          // Set semua data sekaligus untuk menghindari multiple re-render
          setFormData(newFormData)
          if (fromCreate) initialDataFromCreateRef.current = null
          setHasChanges(false)
          previousExternalIdRef.current = id
          
          if (online && id && /^\d{7}$/.test(id)) {
            fetchBerkasList(id)
          }
          
          // Jangan trigger onDataChange saat load dari API (hanya saat user edit)
        } else {
          setBiodataSantriDbId(null)
          setBiodataDariCache(false)
          // Jika santri belum ada (atau data belum ready), set ID dan pertahankan data dari modal Tambah Santri Baru
          const fromCreate = initialDataFromCreateRef.current
          setFormData(prev => ({
            ...prev,
            id: id,
            ...(fromCreate ? {
              nik: fromCreate.nik || prev.nik,
              nama: fromCreate.nama || prev.nama,
              gender: fromCreate.gender || prev.gender,
              status_pendaftar: fromCreate.status_pendaftar || prev.status_pendaftar,
              daftar_diniyah: fromCreate.daftar_diniyah || prev.daftar_diniyah,
              daftar_formal: fromCreate.daftar_formal || prev.daftar_formal
            } : {})
          }))
          if (fromCreate) initialDataFromCreateRef.current = null
          previousExternalIdRef.current = id
          setBerkasList([]) // Clear berkas list jika santri belum ada
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
        // Reset flag setelah load selesai
        setTimeout(() => {
          isLoadingDataRef.current = false
        }, 100)
      }
  }

  loadDataRef.current = loadData

  useEffect(() => {
    hasChangesRef.current = hasChanges
  }, [hasChanges])

  useEffect(() => {
    if (!biodataSantriDbId || hasChanges) return
    const sub = subscribeSantriBiodataByDbId(biodataSantriDbId, () => {
      if (hasChangesRef.current || isLoadingDataRef.current) return
      const nis = String(externalSantriId || localId || '').trim()
      if (/^\d{7}$/.test(nis)) void loadDataRef.current(nis)
    })
    return () => sub.unsubscribe()
  }, [biodataSantriDbId, hasChanges, externalSantriId, localId])

  // Handle perubahan field
  const handleFieldChange = (field, value) => {
    // Khusus untuk field ID
    if (field === 'id') {
      // Set flag bahwa user sedang mengetik
      isUserTypingRef.current = true
      
      // Hanya filter angka
      const numericValue = value.replace(/\D/g, '').slice(0, 7)
      
      // Update localId dan formData - PASTIKAN ID TIDAK IKUT TERHAPUS
      setLocalId(numericValue)
      
      setFormData(prev => {
        const updated = { ...prev, [field]: numericValue }
        setHasChanges(true)
        return updated
      })
      
      // Reset flag setelah delay yang lebih lama untuk memastikan useEffect tidak trigger
      setTimeout(() => {
        isUserTypingRef.current = false
      }, 1000)
      
      // Reset previousExternalIdRef ketika ID dikosongkan agar bisa load ulang ID yang sama
      if (numericValue.length === 0) {
        previousExternalIdRef.current = null
        // Clear timeout sebelumnya jika ada
        if (onDataChangeTimeoutRef.current) {
          clearTimeout(onDataChangeTimeoutRef.current)
          onDataChangeTimeoutRef.current = null
        }
        // Notify parent bahwa ID dikosongkan dengan debounce
        if (onDataChange) {
          onDataChangeTimeoutRef.current = setTimeout(() => {
            onDataChange({ id: '', invalid: true })
            onDataChangeTimeoutRef.current = null
          }, 300)
        }
      } else {
        // Clear timeout sebelumnya jika user masih mengetik
        if (onDataChangeTimeoutRef.current) {
          clearTimeout(onDataChangeTimeoutRef.current)
          onDataChangeTimeoutRef.current = null
        }
      }
      
      // Load data jika NIS lengkap (7 digit)
      if (numericValue.length === 7 && /^\d{7}$/.test(numericValue)) {
        if (numericValue !== previousExternalIdRef.current) {
          loadData(numericValue)
          if (onDataChangeTimeoutRef.current) {
            clearTimeout(onDataChangeTimeoutRef.current)
          }
          onDataChangeTimeoutRef.current = setTimeout(() => {
            if (onDataChange && numericValue !== externalSantriId) {
              onDataChange({ id: numericValue })
            }
            onDataChangeTimeoutRef.current = null
          }, 600)
        }
      } else if (numericValue.length > 0 && numericValue.length < 7) {
        const previousIdStr = previousExternalIdRef.current ? String(previousExternalIdRef.current) : ''
        if (previousExternalIdRef.current && numericValue.length < previousIdStr.length) {
          previousExternalIdRef.current = null
        }
        setFormData(prev => {
          const cleared = { ...prev }
          Object.keys(cleared).forEach(key => {
            if (key === 'status_ayah' || key === 'status_ibu') {
              cleared[key] = 'Masih Hidup'
            } else if (key !== 'id') {
              cleared[key] = ''
            }
          })
          return cleared
        })
      }
      return
    }
    
    // Khusus untuk field NIK - auto extract tanggal lahir dan gender
    if (field === 'nik') {
      // Hanya filter angka dan batasi 16 digit
      const numericValue = value.replace(/\D/g, '').slice(0, 16)
      
      setFormData(prev => {
        const updated = { ...prev, [field]: numericValue }
        
        // Jika NIK sudah lengkap (16 digit), extract tanggal lahir dan gender
        if (numericValue.length === 16) {
          const tanggalLahir = extractTanggalLahirFromNIK(numericValue)
          const gender = extractGenderFromNIK(numericValue)
          
          // Auto-fill tanggal lahir jika berhasil extract dan belum diisi
          if (tanggalLahir && !prev.tanggal_lahir) {
            updated.tanggal_lahir = tanggalLahir
          }
          
          // Auto-update gender dari NIK (selalu update karena NIK adalah sumber kebenaran)
          if (gender) {
            updated.gender = gender
            updated.kategori = gender === 'Laki-laki' ? 'Banin' : gender === 'Perempuan' ? 'Banat' : (updated.kategori || '')
          }
        }
        
        setHasChanges(true)
        return updated
      })
    } else if (field === 'nik_ayah' || field === 'nik_ibu' || field === 'nik_wali') {
      // Hanya filter angka dan batasi 16 digit
      const numericValue = value.replace(/\D/g, '').slice(0, 16)
      
      setFormData(prev => {
        const updated = { ...prev, [field]: numericValue }
        
        // Jika NIK sudah lengkap (16 digit), extract tanggal lahir
        if (numericValue.length === 16) {
          const tanggalLahir = extractTanggalLahirFromNIK(numericValue)
          
          // Tentukan field tanggal lahir yang sesuai
          let tanggalLahirField = ''
          if (field === 'nik_ayah') {
            tanggalLahirField = 'tanggal_lahir_ayah'
          } else if (field === 'nik_ibu') {
            tanggalLahirField = 'tanggal_lahir_ibu'
          } else if (field === 'nik_wali') {
            tanggalLahirField = 'tanggal_lahir_wali'
          }
          
          // Auto-fill tanggal lahir jika berhasil extract dan belum diisi
          if (tanggalLahir && tanggalLahirField && !prev[tanggalLahirField]) {
            updated[tanggalLahirField] = tanggalLahir
          }
        }
        
        setHasChanges(true)
        return updated
      })
      return
    } else {
      setFormData(prev => {
        const updated = { ...prev, [field]: value }
        
        // Setiap ubah gender: perbarui kategori (Laki-laki → Banin, Perempuan → Banat)
        if (field === 'gender') {
          if (value === 'Laki-laki') {
            updated.kategori = 'Banin'
          } else if (value === 'Perempuan') {
            updated.kategori = 'Banat'
          } else {
            updated.kategori = ''
          }
        }
        
        setHasChanges(true)
        
        // Jangan notify parent component saat sedang load data dari API
        // Hanya notify jika user benar-benar mengubah field (bukan dari load API)
        if (onDataChange && !isLoadingDataRef.current) {
          // Hanya notify jika ID berubah, bukan untuk field lain
          // Field lain tidak perlu trigger update di parent karena tidak mempengaruhi externalSantriId
          if (field === 'id' && updated.id !== previousExternalIdRef.current) {
            onDataChange(updated)
          }
        }
        
        return updated
      })
    }
  }

  // Generate grup berdasarkan gender dan tahun ajaran (untuk tampilan; backend pakai tahun_hijriyah + gender L/P)
  const generateGrup = (gender, tahunAjaran) => {
    if (!gender || !tahunAjaran) return null
    const first = String(gender).trim().toUpperCase().charAt(0)
    const genderCode = first === 'L' ? 1 : first === 'P' ? 2 : 0
    if (genderCode === 0) return null
    
    // Ambil 2 digit tengah dari tahun ajaran (misal: 1445-1446 -> 45)
    // Format tahun ajaran: 1445-1446, ambil digit ke-3 dan ke-4 dari tahun pertama (45)
    const tahunMatch = tahunAjaran.match(/^\d{2}(\d{2})-\d{4}$/)
    if (!tahunMatch) {
      return null
    }
    
    const tahunCode = tahunMatch[1] // Ambil 2 digit tengah (digit ke-3 dan ke-4)
    
    // Format: gender (1 digit) + tahun (2 digit) = 3 digit
    // Urutan akan ditambahkan di backend untuk membuat ID 7 digit
    return parseInt(`${genderCode}${tahunCode}`)
  }

  // Handle search by NIK
  const handleNikSearch = async (nik) => {
    if (!nik || nik.length < 16) {
      setNikSearchError('')
      return
    }

    try {
      const response = await pendaftaranAPI.searchByNik(nik)
      if (response.success && response.data) {
        const santriData = response.data
        const nis = (santriData.nis != null && santriData.nis !== '') ? String(santriData.nis) : String(santriData.id)
        setLocalId(nis)
        setFormData(prev => ({ ...prev, id: nis }))
        if (nis) {
          loadData(nis)
        }
        if (onDataChange) {
          onDataChange({ id: nis })
        }
        
        // Close modal dan reset form
        setShowNewModal(false)
        setNewSantriForm({ nama: '', nik: '', gender: '', status_pendaftar: '', daftar_diniyah: '', daftar_formal: '' })
        setNikSearchError('')
      } else {
        setNikSearchError('NIK tidak ditemukan')
      }
    } catch (error) {
      console.error('Error searching by NIK:', error)
      setNikSearchError('Gagal mencari NIK')
    }
  }

  // Handle open delete modal
  const handleOpenDeleteModal = async () => {
    if (!localId || !/^\d{7}$/.test(String(localId).trim())) {
      showNotification('NIS harus 7 digit', 'error')
      return
    }

    setShowDeleteRegistrasiModal(true)
    setLoadingRegistrasi(true)
    setSelectedRegistrasi([])
    setHapusDiTabelSantri(false)

    try {
      const response = await pendaftaranAPI.getAllRegistrasiBySantri(localId)
      if (response.success && response.data) {
        setRegistrasiList(response.data)
      } else {
        showNotification('Gagal memuat data registrasi', 'error')
        setRegistrasiList([])
      }
    } catch (error) {
      console.error('Error loading registrasi:', error)
      showNotification('Gagal memuat data registrasi', 'error')
      setRegistrasiList([])
    } finally {
      setLoadingRegistrasi(false)
    }
  }

  // Handle toggle select registrasi
  const handleToggleRegistrasi = (idRegistrasi) => {
    setSelectedRegistrasi(prev => {
      if (prev.includes(idRegistrasi)) {
        return prev.filter(id => id !== idRegistrasi)
      } else {
        return [...prev, idRegistrasi]
      }
    })
  }

  // Handle delete registrasi
  const handleDeleteRegistrasi = async () => {
    if (selectedRegistrasi.length === 0) {
      showNotification('Pilih minimal satu registrasi untuk dihapus', 'error')
      return
    }

    const confirmMessage = hapusDiTabelSantri
      ? `Apakah Anda yakin ingin menghapus ${selectedRegistrasi.length} registrasi dan data santri terkait? Tindakan ini tidak dapat dibatalkan!`
      : `Apakah Anda yakin ingin menghapus ${selectedRegistrasi.length} registrasi? Tindakan ini tidak dapat dibatalkan!`

    if (!window.confirm(confirmMessage)) {
      return
    }

    setDeletingRegistrasi(true)
    try {
      const response = await pendaftaranAPI.deleteRegistrasi(selectedRegistrasi, hapusDiTabelSantri)
      if (response.success) {
        showNotification(response.message || 'Registrasi berhasil dihapus', 'success')
        setShowDeleteRegistrasiModal(false)
        setSelectedRegistrasi([])
        setHapusDiTabelSantri(false)
        
        // Jika data santri dihapus, reset form
        if (hapusDiTabelSantri) {
          setLocalId('')
          setFormData(prev => {
            const cleared = { ...prev }
            Object.keys(cleared).forEach(key => {
              if (key === 'status_ayah' || key === 'status_ibu') {
                cleared[key] = 'Masih Hidup'
              } else {
                cleared[key] = ''
              }
            })
            return cleared
          })
          setHasChanges(false)
          if (onDataChange) {
            onDataChange({ id: '', invalid: true })
          }
        } else {
          // Reload data jika masih ada registrasi lain
          if (localId && /^\d{7}$/.test(localId)) {
            loadData(localId)
          }
        }
      } else {
        showNotification(response.message || 'Gagal menghapus registrasi', 'error')
      }
    } catch (error) {
      console.error('Error deleting registrasi:', error)
      showNotification('Gagal menghapus registrasi: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setDeletingRegistrasi(false)
    }
  }

  // Handle create new santri
  const handleCreateSantri = async () => {
    if (!newSantriForm.nama || !newSantriForm.gender || !newSantriForm.nik) {
      showNotification('Nama, NIK, dan Gender wajib diisi', 'error')
      return
    }

    if (newSantriForm.nik.length !== 16) {
      showNotification('NIK harus 16 digit', 'error')
      return
    }

    if (!tahunAjaran || !/^\d{4}-\d{4}$/.test(tahunAjaran.trim())) {
      showNotification('Tahun ajaran hijriyah wajib dipilih (contoh: 1447-1448)', 'error')
      return
    }

    setIsCreating(true)
    try {
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null

      const response = await pendaftaranAPI.createSantri({
        nama: newSantriForm.nama,
        nik: newSantriForm.nik,
        gender: newSantriForm.gender,
        tahun_hijriyah: tahunAjaran.trim(),
        id_admin: user?.id || null
      })

      if (response.success) {
        const rawNis = response.data.nis != null && response.data.nis !== '' ? String(response.data.nis) : String(response.data.id)
        const nis = (/^\d{7}$/.test(rawNis) ? rawNis : String(response.data.id))
        const nik = newSantriForm.nik
        const nama = newSantriForm.nama
        const gender = response.data.gender || newSantriForm.gender
        if (!/^\d{7}$/.test(rawNis) && rawNis !== '0') {
          showNotification('NIS dari server tidak 7 digit. Data santri tetap dibuat.', 'warning')
        }
        if (rawNis === '0' || rawNis === 0) {
          showNotification('NIS belum tergenerate di server (trigger mungkin hilang). Backend akan isi otomatis; refresh atau buka lagi santri ini.', 'warning')
        }
        // Simpan data dari modal agar langsung terisi di biodata (NIK, nama, gender, pilihan status)
        initialDataFromCreateRef.current = {
          nik,
          nama,
          gender,
          status_pendaftar: newSantriForm.status_pendaftar || '',
          daftar_diniyah: newSantriForm.daftar_diniyah || '',
          daftar_formal: newSantriForm.daftar_formal || ''
        }
        setLocalId(nis)
        setFormData(prev => ({
          ...prev,
          id: nis,
          nik,
          nama,
          gender,
          status_pendaftar: newSantriForm.status_pendaftar || prev.status_pendaftar,
          daftar_diniyah: newSantriForm.daftar_diniyah || prev.daftar_diniyah,
          daftar_formal: newSantriForm.daftar_formal || prev.daftar_formal
        }))
        loadData(nis)
        if (onDataChange && /^\d{7}$/.test(nis)) {
          onDataChange({ id: nis })
        }
        
        // Close modal dan reset form
        setShowNewModal(false)
        setNewSantriForm({ nama: '', nik: '', gender: '', status_pendaftar: '', daftar_diniyah: '', daftar_formal: '' })
        setNikSearchError('')
        
        showNotification('Santri baru berhasil dibuat!', 'success')
      } else {
        // Jika NIK sudah terdaftar, tampilkan data yang ditemukan
        if (response.data && (response.data.id != null || response.data.nis != null)) {
          const existingNis = (response.data.nis != null && response.data.nis !== '') ? String(response.data.nis) : String(response.data.id)
          const existingNama = response.data.nama
          if (confirm(`NIK sudah terdaftar dengan NIS: ${existingNis}, Nama: ${existingNama}\n\nApakah Anda ingin membuka data tersebut?`)) {
            setLocalId(existingNis)
            setFormData(prev => ({ ...prev, id: existingNis }))
            loadData(existingNis)
            if (onDataChange) {
              onDataChange({ id: existingNis })
            }
            setShowNewModal(false)
            setNewSantriForm({ nama: '', nik: '', gender: '', status_pendaftar: '', daftar_diniyah: '', daftar_formal: '' })
            setNikSearchError('')
          }
        } else {
          showNotification(response.message || 'Gagal membuat santri baru', 'error')
        }
      }
    } catch (error) {
      console.error('Error creating santri:', error)
      showNotification('Gagal membuat santri baru: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setIsCreating(false)
    }
  }

  // Klik Simpan: tampilkan modal konfirmasi (UWABA) dengan opsi kirim WA
  const handleSaveClick = () => {
    const noWaSantri = (formData.no_wa_santri || '').trim()
    const noTelpon = (formData.no_telpon || '').trim()
    setConfirmSendWaSantri(!!noWaSantri)
    setConfirmSendWaWali(!!noTelpon)
    setShowSaveConfirmModal(true)
  }

  const handleSave = async (waOptions = null) => {
    if (!formData.id || !/^\d{7}$/.test(String(formData.id).trim())) {
      showNotification('NIS harus 7 digit', 'error')
      return
    }

    const email = (formData.email || '').trim()
    if (!email) {
      showNotification('Email wajib diisi', 'error')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      showNotification('Format email tidak valid', 'error')
      return
    }

    if (shouldShowStatusMuridForFormal(formData.daftar_formal)) {
      const sm = (formData.status_murid || '').trim()
      if (!sm) {
        showNotification('Status murid wajib diisi untuk formal yang dipilih', 'error')
        return
      }
    }

    setIsSaving(true)
    if (showSaveConfirmModal) setShowSaveConfirmModal(false)
    try {
      // Get user info from localStorage
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null
      
      // Save biodata ke tabel santri dan psb___registrasi
      // waOptions dari modal konfirmasi UWABA: { send_wa_santri, send_wa_wali } — jika ada, backend hanya kirim WA ke yang dicentang
      const biodataPayload = {
        ...formData,
        id_admin: user?.id || null,
        tahun_hijriyah: tahunAjaran || null,
        tahun_masehi: tahunAjaranMasehi || null
      }
      if (waOptions !== null && typeof waOptions === 'object') {
        biodataPayload.send_wa_santri = !!waOptions.send_wa_santri
        biodataPayload.send_wa_wali = !!waOptions.send_wa_wali
      }
      const biodataResponse = await pendaftaranAPI.saveBiodata(biodataPayload)
      
      if (!biodataResponse.success) {
        throw new Error(biodataResponse.message || 'Gagal menyimpan biodata')
      }

      setHasChanges(false)
      setBiodataDariCache(false)
      const idStr = String(formData.id || '').trim()
      if (/^\d{7}$/.test(idStr)) {
        void santriAPI.getById(idStr).then((r) => {
          if (r?.success && r.data) void putSantriBiodataFromApi(r.data)
        })
      }
      showNotification('Data berhasil disimpan!', 'success')
      
      // Notify parent component bahwa biodata sudah disimpan (untuk refresh PembayaranBox)
      // Tambahkan sedikit delay untuk memastikan data benar-benar tersimpan di database
      if (onBiodataSaved) {
        setTimeout(() => {
          onBiodataSaved()
        }, 300)
      }
    } catch (error) {
      console.error('Error saving data:', error)
      showNotification('Gagal menyimpan data: ' + error.message, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  // WhatsApp checking functions - REMOVED: moved to useWhatsAppCheck hook

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-full min-h-0 flex flex-col overflow-hidden relative flex-1">
      {/* Sidebar Navigation - Fixed di kiri */}
      <SidebarNavigation
        isOpen={isSidebarOpen}
        activeSection={activeSection}
        scrollToSection={scrollToSection}
        excludeSections={hideBerkasSection ? ['berkas'] : []}
      />

      {/* Header dengan ID Input dan Tombol - Fixed (tidak ikut scroll) */}
      <HeaderSection
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        localId={localId}
        onIdChange={(value) => handleFieldChange('id', value)}
        onSave={handleSaveClick}
        isSaving={isSaving}
        isLoading={isLoading}
        formDataId={formData.id}
        hasChanges={hasChanges}
        onOpenSearch={onOpenSearch}
        onOpenNewModal={() => setShowNewModal(true)}
        onOpenDeleteModal={handleOpenDeleteModal}
        showDeleteButton={hapusSantri}
      />

      {biodataDariCache && (
        <div className="flex-shrink-0 px-3 py-2 text-xs bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 border-b border-amber-200/80 dark:border-amber-800/60">
          Biodata santri dari penyimpanan lokal. Registrasi/berkas hanya dimuat ulang saat online; data akan diperbarui otomatis saat sinkron.
        </div>
      )}

      {/* Modal Konfirmasi Simpan Biodata + Opsi Kirim WA */}
      <AnimatePresence>
        {showSaveConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowSaveConfirmModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md"
            >
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">
                Simpan biodata?
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Data biodata akan disimpan. Kirim notifikasi WhatsApp ke nomor berikut?
              </p>
              <div className="space-y-3 mb-6">
                {(formData.no_wa_santri || '').trim() && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmSendWaSantri}
                      onChange={(e) => setConfirmSendWaSantri(e.target.checked)}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Kirim notif ke WA Santri: {(formData.no_wa_santri || '').trim()}
                    </span>
                  </label>
                )}
                {(formData.no_telpon || '').trim() && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmSendWaWali}
                      onChange={(e) => setConfirmSendWaWali(e.target.checked)}
                      className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Kirim notif ke WA Wali/Orang Tua: {(formData.no_telpon || '').trim()}
                    </span>
                  </label>
                )}
                {!((formData.no_wa_santri || '').trim()) && !((formData.no_telpon || '').trim()) && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    Tidak ada nomor WA santri atau wali yang diisi. Notifikasi WA tidak akan dikirim.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveConfirmModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => handleSave({ send_wa_santri: confirmSendWaSantri, send_wa_wali: confirmSendWaWali })}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                >
                  Iya
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Hapus Registrasi */}
      <AnimatePresence>
        {showDeleteRegistrasiModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => !deletingRegistrasi && setShowDeleteRegistrasiModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                  Hapus Data Registrasi
                </h2>
                <button
                  onClick={() => !deletingRegistrasi && setShowDeleteRegistrasiModal(false)}
                  disabled={deletingRegistrasi}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              {loadingRegistrasi ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                </div>
              ) : registrasiList.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Tidak ada data registrasi untuk santri ini
                </div>
              ) : (
                <>
                  <div className="mb-4">
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                      Pilih registrasi yang ingin dihapus:
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                      {registrasiList.map((registrasi) => {
                        const isSelected = selectedRegistrasi.includes(registrasi.id_registrasi)
                        const tahunDisplay = registrasi.tahun_hijriyah && registrasi.tahun_masehi
                          ? `${registrasi.tahun_hijriyah} / ${registrasi.tahun_masehi}`
                          : registrasi.tahun_hijriyah || registrasi.tahun_masehi || '-'
                        
                        return (
                          <label
                            key={registrasi.id_registrasi}
                            className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-teal-50 dark:bg-teal-900/20 border-2 border-teal-500 dark:border-teal-400'
                                : 'bg-gray-50 dark:bg-gray-700/50 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRegistrasi(registrasi.id_registrasi)}
                              className="mr-3 w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-gray-800 dark:text-gray-200">
                                Tahun Ajaran: {tahunDisplay}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                Status: {registrasi.status_pendaftar || '-'} | 
                                Tanggal: {registrasi.tanggal_dibuat ? new Date(registrasi.tanggal_dibuat).toLocaleDateString('id-ID') : '-'}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="flex items-center p-3 rounded-lg cursor-pointer bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800">
                      <input
                        type="checkbox"
                        checked={hapusDiTabelSantri}
                        onChange={(e) => setHapusDiTabelSantri(e.target.checked)}
                        className="mr-3 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                      />
                      <div>
                        <div className="font-medium text-red-800 dark:text-red-200">
                          Hapus Di tabel santri
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                          Jika dicentang, data santri di tabel santri juga akan dihapus
                        </div>
                      </div>
                    </label>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => setShowDeleteRegistrasiModal(false)}
                      disabled={deletingRegistrasi}
                      className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleDeleteRegistrasi}
                      disabled={deletingRegistrasi || selectedRegistrasi.length === 0}
                      className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                        deletingRegistrasi || selectedRegistrasi.length === 0
                          ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-700 text-white'
                      }`}
                    >
                      {deletingRegistrasi ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Menghapus...
                        </span>
                      ) : (
                        'Hapus'
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal Tambah Santri Baru */}
      <AnimatePresence>
        {showNewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowNewModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md"
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                  Tambah Santri Baru
                </h2>
                <button
                  onClick={() => {
                    setShowNewModal(false)
                    setNewSantriForm({ nama: '', nik: '', gender: '', status_pendaftar: '', daftar_diniyah: '', daftar_formal: '' })
                    setNikSearchError('')
                  }}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Field lain (status pendaftar, diniyah, formal, dll.) dapat diisi di form biodata setelah santri dibuat.
              </p>

              <div className="space-y-4">
                {/* Nama */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Nama <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newSantriForm.nama}
                    onChange={(e) => setNewSantriForm(prev => ({ ...prev, nama: e.target.value }))}
                    className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 bg-transparent text-gray-900 dark:text-gray-100"
                    placeholder="Masukkan nama santri"
                  />
                </div>

                {/* NIK */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    NIK <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newSantriForm.nik}
                    onChange={(e) => {
                      const nikValue = e.target.value.replace(/\D/g, '').slice(0, 16)
                      setNewSantriForm(prev => ({ ...prev, nik: nikValue }))
                      setNikSearchError('')
                      
                      // Auto search jika NIK lengkap (16 digit)
                      if (nikValue.length === 16) {
                        handleNikSearch(nikValue)
                      }
                    }}
                    className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 bg-transparent text-gray-900 dark:text-gray-100"
                    placeholder="16 digit NIK"
                    maxLength={16}
                    inputMode="numeric"
                    required
                  />
                  {nikSearchError && (
                    <p className="text-sm text-red-500 mt-1">{nikSearchError}</p>
                  )}
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newSantriForm.gender}
                    onChange={(e) => setNewSantriForm(prev => ({ ...prev, gender: e.target.value }))}
                    className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 bg-transparent text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Pilih Gender</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>

                {/* Info Grup */}
                {newSantriForm.gender && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      <strong>Grup akan di-generate:</strong> {generateGrup(newSantriForm.gender, tahunAjaran) || '-'}
                      <br />
                      <span className="text-xs">
                        Format: {String(newSantriForm.gender).trim().toUpperCase().charAt(0) === 'P' ? '2' : '1'} (L/P) + {tahunAjaran.match(/^\d{2}(\d{2})-\d{4}$/)?.[1] || 'XX'} (tahun) + urutan
                      </span>
                    </p>
                  </div>
                )}

                {/* Tombol */}
                <div className="flex gap-2 pt-4">
                  <button
                    onClick={() => {
                      setShowNewModal(false)
                      setNewSantriForm({ nama: '', nik: '', gender: '', status_pendaftar: '', daftar_diniyah: '', daftar_formal: '' })
                      setNikSearchError('')
                    }}
                    className="flex-1 px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleCreateSantri}
                    disabled={isCreating || !newSantriForm.nama || !newSantriForm.gender || !newSantriForm.nik || newSantriForm.nik.length !== 16 || !tahunAjaran || !/^\d{4}-\d{4}$/.test(tahunAjaran.trim())}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                      isCreating || !newSantriForm.nama || !newSantriForm.gender || !newSantriForm.nik || newSantriForm.nik.length !== 16 || !tahunAjaran || !/^\d{4}-\d{4}$/.test(tahunAjaran.trim())
                        ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-teal-600 hover:bg-teal-700 text-white'
                    }`}
                  >
                    {isCreating ? 'Membuat...' : 'Buat Santri'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Berkas Offcanvas, Camera, File Preview, Delete Modal - disembunyikan jika berkas punya tab sendiri */}
      {!hideBerkasSection && (
        <>
          <BerkasOffcanvas
            isOpen={isBerkasOffcanvasOpen}
            onClose={() => {
              setIsBerkasOffcanvasOpen(false)
              setSelectedJenisBerkas(null)
              setExistingBerkasToReplace(null)
              setSelectedFile(null)
              if (localId && /^\d{7}$/.test(localId)) fetchBerkasList(localId)
            }}
            idSantri={localId && /^\d{7}$/.test(localId) ? localId : null}
            defaultJenisBerkas={selectedJenisBerkas}
            existingBerkas={existingBerkasToReplace}
            defaultFile={selectedFile}
            onUploadSuccess={() => {
              if (localId && /^\d{7}$/.test(localId)) fetchBerkasList(localId)
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
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{formatFileSize(berkasToDelete.ukuran_file)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">⚠️ Tindakan ini tidak dapat dibatalkan!</p>
              </div>
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={handleCloseDeleteModalBerkas} disabled={deletingId} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Batal</button>
                <button type="button" onClick={handleDeleteConfirmBerkas} disabled={deletingId} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
                  {deletingId ? (<><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Menghapus...</>) : 'Hapus'}
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {/* Scrollable Content Area */}
      <div className={`flex-1 overflow-y-auto min-h-0 p-6 transition-all duration-300 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-600 dark:hover:scrollbar-thumb-gray-500 ${
        isSidebarOpen ? 'ml-12' : 'ml-0'
      }`} style={{ 
        scrollbarWidth: 'thin',
        scrollbarColor: 'transparent transparent'
      }}>
        <style>{`
          /* Webkit scrollbar - kecil dan autohide */
          div::-webkit-scrollbar {
            width: 2px;
          }
          div::-webkit-scrollbar-track {
            background: transparent;
          }
          div::-webkit-scrollbar-thumb {
            background: transparent;
            border-radius: 3px;
            transition: background 0.3s ease;
          }
          div:hover::-webkit-scrollbar-thumb {
            background: #cbd5e1;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
          /* Dark mode */
          .dark div::-webkit-scrollbar-thumb {
            background: transparent;
          }
          .dark div:hover::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
          .dark div::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
          /* Firefox scrollbar - kecil dan autohide */
          div {
            scrollbar-width: thin;
            scrollbar-color: transparent transparent;
          }
          div:hover {
            scrollbar-color: #cbd5e1 transparent;
          }
          .dark div:hover {
            scrollbar-color: #4b5563 transparent;
          }
        `}</style>

        <form 
          ref={formRef} 
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            return false
          }}
        >
          {/* Data Diri */}
          <DataDiriSection
            sectionRef={sectionRefs.dataDiri}
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
              onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
          />

          {/* Biodata Ayah */}
          <BiodataOrangTuaSection
            sectionRef={sectionRefs.biodataAyah}
            title="Biodata Ayah"
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            prefix="ayah"
          />

          {/* Biodata Ibu */}
          <BiodataOrangTuaSection
            sectionRef={sectionRefs.biodataIbu}
            title="Biodata Ibu"
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            prefix="ibu"
          />

          {/* Biodata Wali */}
          <BiodataWaliSection
            sectionRef={sectionRefs.biodataWali}
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
          />

          {/* Alamat */}
          <AlamatSection
            sectionRef={sectionRefs.alamat}
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
          />

          {/* Riwayat Madrasah */}
          <RiwayatPendidikanSection
            sectionRef={sectionRefs.riwayatMadrasah}
            title="Riwayat Madrasah"
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            type="madrasah"
          />

          {/* Riwayat Sekolah */}
          <RiwayatPendidikanSection
            sectionRef={sectionRefs.riwayatSekolah}
            title="Riwayat Sekolah"
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            type="sekolah"
          />

          {/* Informasi Tambahan */}
          <InformasiTambahanSection
            sectionRef={sectionRefs.informasiTambahan}
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            waCheck={waCheck}
            onOpenRiwayatChat={(nomor) => {
              if ((nomor || '').trim()) {
                setRiwayatChatMeta({
                  nomor: (nomor || '').trim(),
                  idSantri: String(formData.id || ''),
                  namaSantri: String(formData.nama || '')
                })
                setShowRiwayatChatOffcanvas(true)
              }
            }}
          />


          {/* Status Pendaftaran */}
          <StatusPendaftaranSection
            sectionRef={sectionRefs.statusPendaftaran}
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
                onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            kondisiValues={kondisiValues}
            canEditKeteranganStatus={biodataUbahKeteranganStatus}
          />

          {/* Kategori & Pendidikan */}
          <KategoriPendidikanSection
            sectionRef={sectionRefs.kategoriPendidikan}
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
            onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            kategoriOptions={kategoriOptions}
            daerahOptions={daerahOptions}
            kamarOptions={kamarOptions}
            lembagaDiniyahOptions={lembagaDiniyahOptions}
            lembagaFormalOptions={lembagaFormalOptions}
            kelasDiniyahOptions={kelasDiniyahOptions}
            kelasFormalOptions={kelasFormalOptions}
            kelDiniyahOptions={kelDiniyahOptions}
            kelFormalOptions={kelFormalOptions}
          />

            {/* List Berkas - disembunyikan jika punya tab sendiri (BerkasTabPanel) */}
            {!hideBerkasSection && (
              <BerkasSection
                sectionRef={sectionRefs.berkas}
                localId={localId}
                berkasList={berkasList}
                loadingBerkas={loadingBerkas}
                handlePreviewBerkas={handlePreviewBerkas}
                handleDeleteClickBerkas={handleDeleteClickBerkas}
                handleGantiClickBerkas={handleGantiClickBerkas}
                deletingId={deletingId}
                setIsBerkasOffcanvasOpen={setIsBerkasOffcanvasOpen}
                setSelectedJenisBerkas={setSelectedJenisBerkas}
                berkasNotAvailable={berkasNotAvailable}
                toggleBerkasNotAvailable={toggleBerkasNotAvailable}
                kkSamaDenganSantri={kkSamaDenganSantri}
                toggleKkSamaDenganSantri={toggleKkSamaDenganSantri}
              />
            )}
        </form>

        <RiwayatChatOffcanvas
          isOpen={showRiwayatChatOffcanvas}
          onClose={() => setShowRiwayatChatOffcanvas(false)}
          nomorTujuan={riwayatChatMeta.nomor}
          idSantri={riwayatChatMeta.idSantri}
          namaSantri={riwayatChatMeta.namaSantri}
        />
      </div>
    </div>
  )
}

export default BiodataPendaftaran

