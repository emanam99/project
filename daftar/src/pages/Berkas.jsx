import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { invalidateDashboardCacheOnly } from '../utils/daftarPagesLocalCache'
import { useBerkasManagement } from '../components/Berkas/hooks/useBerkasManagement'
import BerkasOffcanvas from '../components/Berkas/BerkasOffcanvas'
import FilePreviewOffcanvas from '../components/FilePreview/FilePreviewOffcanvas'
import CameraScanner from '../components/CameraScanner/CameraScanner'
import Modal from '../components/Modal/Modal'
import { formatFileSize, getFileTypeLabel } from '../utils/fileUtils'
import { pendaftaranAPI, santriAPI } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { compressImage } from '../utils/imageCompression'
import { shouldShowStatusMuridForFormal } from './PilihanStatusMurid'

function Berkas() {
  const { user } = useAuthStore()
  const { tahunHijriyah, tahunMasehi } = useTahunAjaranStore()
  const location = useLocation()
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const localId = user?.id || ''
  const [hasUnsavedData, setHasUnsavedData] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const fileRef = useRef(null)
  const hasSyncedRef = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [requiredFields, setRequiredFields] = useState([])
  const [biodataFromStorage, setBiodataFromStorage] = useState(null)
  const [showDuplicateNikModal, setShowDuplicateNikModal] = useState(false)
  const [duplicateNikData, setDuplicateNikData] = useState(null)
  const [showCameraScanner, setShowCameraScanner] = useState(false)

  const bumpDashboardCache = useCallback(() => {
    if (!user?.id) return
    const sessionNik =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
    invalidateDashboardCacheOnly(
      user?.nik || sessionNik,
      user.id,
      tahunHijriyah,
      tahunMasehi,
      sessionNik
    )
  }, [user?.id, user?.nik, tahunHijriyah, tahunMasehi])

  const {
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
    setIsBerkasOffcanvasOpen,
    setSelectedJenisBerkas,
    setExistingBerkasToReplace,
    fetchBerkasList,
    handlePreviewBerkas,
    handleClosePreviewBerkas,
    downloadForPreview,
    handleDeleteClickBerkas,
    handleDeleteConfirmBerkas,
    handleCloseDeleteModalBerkas,
    handleUploadSuccess
  } = useBerkasManagement(localId, { cacheNik: user?.nik, onAfterMutation: bumpDashboardCache })

  // State untuk KK yang sama dengan KK Santri
  const [kkSamaDenganSantri, setKkSamaDenganSantri] = useState(() => {
    if (localId) {
      const saved = localStorage.getItem(`kkSamaDenganSantri_${localId}`)
      return saved ? JSON.parse(saved) : []
    }
    return []
  })

  // Debug: Monitor modal state changes
  useEffect(() => {
    console.log('=== Modal State Changed ===')
    console.log('showDuplicateNikModal:', showDuplicateNikModal)
    console.log('duplicateNikData:', duplicateNikData)
  }, [showDuplicateNikModal, duplicateNikData])

  // berkasNotAvailable dari server (berkas dengan status_tidak_ada=1)
  const berkasNotAvailable = useMemo(() =>
    berkasList.filter(b => b.status_tidak_ada == 1).map(b => b.jenis_berkas),
    [berkasList]
  )

  // Load kkSamaDenganSantri dari localStorage saat localId berubah
  useEffect(() => {
    if (localId) {
      const saved = localStorage.getItem(`kkSamaDenganSantri_${localId}`)
      if (saved) {
        try {
          setKkSamaDenganSantri(JSON.parse(saved))
        } catch (e) {
          console.error('Error parsing kkSamaDenganSantri from localStorage:', e)
          setKkSamaDenganSantri([])
        }
      } else {
        setKkSamaDenganSantri([])
      }
    } else {
      setKkSamaDenganSantri([])
    }
  }, [localId])

  // Save kkSamaDenganSantri to localStorage
  useEffect(() => {
    if (localId) {
      localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(kkSamaDenganSantri))
    }
  }, [kkSamaDenganSantri, localId])

  // Fungsi untuk toggle status "tidak ada" - simpan di latar belakang, update tampilan lokal tanpa reload list
  const toggleBerkasNotAvailable = async (jenisBerkas, existingBerkas = null) => {
    const isCurrentlyNotAvailable = berkasNotAvailable.includes(jenisBerkas)

    if (!localId || String(localId).trim() === '') {
      showNotification('NIS santri tidak valid', 'error')
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
          setBerkasList(prev => prev.filter(b => !(b.jenis_berkas === jenisBerkas && b.status_tidak_ada == 1)))
          bumpDashboardCache()
          await fetchBerkasList(localId)
          showNotification(`"${jenisBerkas}" ditandai sebagai tersedia`, 'info')
        } else {
          showNotification(result.message || 'Gagal menghapus tanda tidak ada', 'error')
        }
      } else {
        const result = await pendaftaranAPI.markTidakAda(localId, jenisBerkas)
        if (result.success) {
          const newId = result.data?.id
          setBerkasList(prev => {
            const existing = prev.find(b => b.jenis_berkas === jenisBerkas)
            if (existing) {
              return prev.map(b => b.jenis_berkas === jenisBerkas ? { ...b, status_tidak_ada: 1, nama_file: 'Tidak ada', path_file: '-', id: newId ?? b.id } : b)
            }
            return [...prev, { id: newId, id_santri: localId, jenis_berkas: jenisBerkas, nama_file: 'Tidak ada', path_file: '-', status_tidak_ada: 1 }]
          })
          bumpDashboardCache()
          await fetchBerkasList(localId)
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
    const kkSantri = berkasList.find(b => b.jenis_berkas === 'KK Santri')
    const existingBerkas = berkasList.find(b => b.jenis_berkas === jenisBerkas)
    
    if (!kkSantri) {
      showNotification('KK Santri belum diupload. Silakan upload KK Santri terlebih dahulu.', 'warning')
      return
    }

    // Pastikan localId valid sebelum melanjutkan (user.id = PK santri)
    if (!localId || String(localId).trim() === '') {
      showNotification('NIS santri tidak valid', 'error')
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
          bumpDashboardCache()
          await fetchBerkasList(localId)

          // Tandai sebagai sama dengan KK Santri
          const updatedList = [...kkSamaDenganSantri, jenisBerkas]
          setKkSamaDenganSantri(updatedList)
          
          // Simpan ke localStorage
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updatedList))
          
          showNotification(`"${jenisBerkas}" berhasil dihubungkan dengan KK Santri`, 'success')
        } else {
          showNotification(result.message || 'Gagal menghubungkan dengan KK Santri', 'error')
          if (localId) {
            bumpDashboardCache()
            await fetchBerkasList(localId)
          }
        }
      } catch (error) {
        console.error('Error linking KK Santri:', error)
        showNotification('Gagal menghubungkan dengan KK Santri', 'error')
        if (localId) {
          bumpDashboardCache()
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

          bumpDashboardCache()
          await fetchBerkasList(localId)

          const updatedList = kkSamaDenganSantri.filter(item => item !== jenisBerkas)
          setKkSamaDenganSantri(updatedList)
          
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updatedList))
          
          showNotification(`Link "${jenisBerkas}" berhasil dihapus`, 'success')
        } catch (error) {
          console.error('Error deleting linked berkas:', error)
          showNotification('Gagal menghapus link berkas', 'error')
          if (localId) {
            bumpDashboardCache()
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

  // Fetch berkas saat component mount atau user.id berubah
  useEffect(() => {
    if (localId) {
      // Reset sync flag saat user berubah
      hasSyncedRef.current = false
      fetchBerkasList(localId)
      setHasUnsavedData(false)
    }
  }, [localId])

  // Sinkronisasi kkSamaDenganSantri dengan berkasList (berkas uploaded, bukan status tidak ada)
  useEffect(() => {
    if (berkasList.length > 0 && localId) {
      const existingJenisBerkas = berkasList
        .filter(b => !b.status_tidak_ada)
        .map(b => b.jenis_berkas)
      setKkSamaDenganSantri(prev => {
        const updated = prev.filter(jenisBerkas => existingJenisBerkas.includes(jenisBerkas))
        if (updated.length !== prev.length && localId) {
          localStorage.setItem(`kkSamaDenganSantri_${localId}`, JSON.stringify(updated))
        }
        return updated
      })
    }
  }, [berkasList, localId])

  // Fungsi untuk load biodata dari storage
  const loadBiodataFromStorage = () => {
    console.log('=== Loading biodata from storage ===')
    // Cek apakah ada biodata yang sedang diisi tapi belum disimpan
    const storedBiodata = sessionStorage.getItem('pendaftaranData') || localStorage.getItem('pendaftaranData')
    console.log('Stored biodata raw:', storedBiodata)
    
    if (storedBiodata) {
      try {
        const biodata = JSON.parse(storedBiodata)
        console.log('Parsed biodata:', biodata)
        setBiodataFromStorage(biodata)
        checkRequiredFields(biodata)
      } catch (error) {
        console.error('Error parsing biodata:', error)
        setBiodataFromStorage(null)
        checkRequiredFields({})
      }
    } else {
      console.log('No biodata found in storage')
      // Tidak ada biodata sama sekali
      setBiodataFromStorage(null)
      checkRequiredFields({})
    }
  }

  // Fetch biodata dari sessionStorage atau localStorage untuk validasi field wajib
  useEffect(() => {
    if (!localId) {
      loadBiodataFromStorage()
    }
  }, [localId])

  // Re-load data setiap kali halaman menjadi visible (user kembali dari tab lain atau halaman lain)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !localId) {
        console.log('Page became visible, reloading biodata from storage')
        loadBiodataFromStorage()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [localId])

  // Handle return from editor
  useEffect(() => {
    if (location.state?.returnFromEditor) {
      const loadEditedFile = async () => {
        try {
          // Ambil file dari sessionStorage
          const imageData = sessionStorage.getItem('editedImageData')
          const imageMeta = sessionStorage.getItem('editedImageMeta')
          
          console.log('Loading edited file from sessionStorage...', { hasData: !!imageData, hasMeta: !!imageMeta })
          
          if (imageData && imageMeta) {
            const meta = JSON.parse(imageMeta)
            
            // Convert base64 ke Blob lalu ke File
            const base64Response = await fetch(imageData)
            const blob = await base64Response.blob()
            let editedFile = new File([blob], meta.name, {
              type: meta.type || 'image/jpeg',
              lastModified: meta.lastModified || Date.now()
            })
            
            console.log('Loaded edited file:', editedFile.name, editedFile.size, 'bytes', editedFile.type)
            
            // Auto-compress jika > 1MB
            const maxSizeBytes = 1024 * 1024 // 1MB
            if (editedFile.size > maxSizeBytes) {
              try {
                console.log('Auto-compressing edited file:', editedFile.size, 'bytes')
                const compressedFile = await compressImage(editedFile, 1)
                console.log('Compressed edited file:', editedFile.size, 'bytes →', compressedFile.size, 'bytes')
                editedFile = compressedFile
              } catch (compressionErr) {
                console.error('Error compressing edited file:', compressionErr)
                // Jika gagal compress, tetap gunakan file original
              }
            }
            
            console.log('Final file is instance of File:', editedFile instanceof File)
            
            // Restore jenisBerkas dari sessionStorage
            const savedJenisBerkas = sessionStorage.getItem('uploadingBerkasJenis')
            console.log('Restored jenisBerkas from sessionStorage:', savedJenisBerkas)
            if (savedJenisBerkas) {
              setSelectedJenisBerkas(savedJenisBerkas)
            }
            
            // Simpan file ke ref dan state
            fileRef.current = editedFile
            setSelectedFile(editedFile)
            
            // Buka offcanvas setelah state ter-update
            // Gunakan setTimeout lebih lama untuk memastikan state benar-benar ter-update
            setTimeout(() => {
              console.log('Opening offcanvas with file, selectedFile state should be set')
              // Pastikan file masih ada di ref
              if (fileRef.current) {
                setSelectedFile(fileRef.current)
              }
              setIsBerkasOffcanvasOpen(true)
            }, 300)
            
            // Clear sessionStorage setelah berhasil
            sessionStorage.removeItem('editedImageData')
            sessionStorage.removeItem('editedImageMeta')
            sessionStorage.removeItem('uploadingBerkasJenis')
          } else {
            console.warn('No edited file data found in sessionStorage')
          }
        } catch (err) {
          console.error('Error loading edited file:', err)
          showNotification('Gagal memuat file yang sudah di-edit. Silakan coba lagi.', 'error')
        }
        
        // Clear state setelah selesai
        window.history.replaceState({}, document.title)
      }
      
      loadEditedFile()
    }
  }, [location.state])
  
  // Monitor perubahan berkas untuk indikator unsaved
  useEffect(() => {
    // Reset unsaved state setelah upload berhasil (di handle via handleUploadSuccess)
    setHasUnsavedData(false)
  }, [berkasList])

  const jenisBerkasOptions = [
    'Ijazah SD Sederajat',
    'Ijazah SMP Sederajat',
    'Ijazah SMA Sederajat',
    'SKL',
    'KTP Santri',
    'KTP Ayah',
    'KTP Ibu',
    'KTP Wali',
    'KK Santri',
    'KK Ayah',
    'KK Ibu',
    'KK Wali',
    'Akta Lahir',
    'KIP',
    'PKH',
    'KKS',
    'Kartu Bantuan Lain',
    'Surat Pindah'
  ]

  const berkasMap = new Map()
  berkasList.forEach(berkas => {
    berkasMap.set(berkas.jenis_berkas, berkas)
  })

  // Fungsi untuk cek field wajib yang kosong
  const checkRequiredFields = (biodata) => {
    const missing = []
    
    // Field wajib minimal
    if (!biodata.nik || biodata.nik.length !== 16) {
      missing.push({ field: 'NIK', label: 'NIK (16 digit)' })
    }
    if (!biodata.nama || biodata.nama.trim() === '') {
      missing.push({ field: 'nama', label: 'Nama Lengkap' })
    }
    if (!biodata.gender || biodata.gender === '') {
      missing.push({ field: 'gender', label: 'Jenis Kelamin' })
    }
    if (!biodata.tempat_lahir || biodata.tempat_lahir.trim() === '') {
      missing.push({ field: 'tempat_lahir', label: 'Tempat Lahir' })
    }
    if (!biodata.tanggal_lahir || biodata.tanggal_lahir === '') {
      missing.push({ field: 'tanggal_lahir', label: 'Tanggal Lahir' })
    }
    if (!biodata.no_kk || biodata.no_kk.length !== 16) {
      missing.push({ field: 'no_kk', label: 'No. KK (16 digit)' })
    }
    if (!biodata.kepala_keluarga || biodata.kepala_keluarga.trim() === '') {
      missing.push({ field: 'kepala_keluarga', label: 'Kepala Keluarga' })
    }
    if (!biodata.saudara_di_pesantren || biodata.saudara_di_pesantren === '') {
      missing.push({ field: 'saudara_di_pesantren', label: 'Saudara di Pesantren' })
    }
    if (!biodata.ayah || biodata.ayah.trim() === '') {
      missing.push({ field: 'ayah', label: 'Nama Ayah' })
    }
    if (!biodata.status_ayah || biodata.status_ayah === '') {
      missing.push({ field: 'status_ayah', label: 'Status Ayah' })
    }
    if (!biodata.ibu || biodata.ibu.trim() === '') {
      missing.push({ field: 'ibu', label: 'Nama Ibu' })
    }
    if (!biodata.status_ibu || biodata.status_ibu === '') {
      missing.push({ field: 'status_ibu', label: 'Status Ibu' })
    }
    if (!biodata.no_telpon || biodata.no_telpon.trim() === '') {
      missing.push({ field: 'no_telpon', label: 'No. Telpon (Nomor Wali)' })
    }
    if (!biodata.status_santri || biodata.status_santri.trim() === '') {
      missing.push({ field: 'status_santri', label: 'Status Santri' })
    }
    if (!biodata.daftar_formal || biodata.daftar_formal.trim() === '') {
      missing.push({ field: 'daftar_formal', label: 'Daftar Formal' })
    }
    if (!biodata.daftar_diniyah || biodata.daftar_diniyah.trim() === '') {
      missing.push({ field: 'daftar_diniyah', label: 'Daftar Diniyah' })
    }
    if (shouldShowStatusMuridForFormal(biodata.daftar_formal)) {
      if (!biodata.status_murid || biodata.status_murid.trim() === '') {
        missing.push({ field: 'status_murid', label: 'Status Murid' })
      }
    }

    setRequiredFields(missing)
    return missing
  }

  // Fungsi untuk simpan biodata
  const handleSaveBiodata = async (forceUpdate = false, existingId = null) => {
    console.log('=== handleSaveBiodata called ===')
    console.log('forceUpdate:', forceUpdate, 'existingId:', existingId)
    console.log('biodataFromStorage:', biodataFromStorage)
    
    const biodata = biodataFromStorage || {}
    
    // Cek apakah ada data biodata
    if (!biodata.nik && !biodata.nama) {
      console.error('No biodata found in storage')
      showNotification('Data biodata tidak ditemukan. Silakan isi biodata terlebih dahulu di halaman Biodata.', 'error')
      return
    }
    
    const missing = checkRequiredFields(biodata)
    console.log('Missing fields:', missing)
    
    if (missing.length > 0) {
      showNotification('Silakan lengkapi field wajib di halaman Biodata terlebih dahulu', 'warning')
      return
    }

    setIsSaving(true)
    try {
      const tahunAjaranHijriyah = localStorage.getItem('tahun_ajaran') || '1446-1447'
      const tahunAjaranMasehi = localStorage.getItem('tahun_ajaran_masehi') || '2025-2026'
      
      const biodataPayload = {
        ...biodata,
        id: forceUpdate && existingId ? String(existingId) : null, // Jika update, gunakan ID yang ada
        id_admin: user?.id || null,
        tahun_hijriyah: tahunAjaranHijriyah,
        tahun_masehi: tahunAjaranMasehi,
        id_registrasi: user?.id_registrasi != null && user.id_registrasi !== ''
          ? String(user.id_registrasi)
          : ''
      }
      
      console.log('Sending payload:', biodataPayload)
      
      const biodataResponse = await pendaftaranAPI.saveBiodata(biodataPayload)
      
      console.log('Response from API:', biodataResponse)
      
      if (!biodataResponse.success) {
        throw new Error(biodataResponse.message || 'Gagal menyimpan biodata')
      }

      // Update user store dengan ID (PK) dan NIS dari backend
      if (biodataResponse.data && biodataResponse.data.id) {
        const newId = String(biodataResponse.data.id)
        const nisToShow = biodataResponse.data.nis != null ? String(biodataResponse.data.nis) : newId
        console.log('ID (PK):', newId, 'NIS:', nisToShow)
        
        const authStore = useAuthStore.getState()
        const updatedUser = {
          ...user,
          id: newId,
          nis: nisToShow,
          id_registrasi: biodataResponse.data.id_registrasi != null
            ? Number(biodataResponse.data.id_registrasi)
            : (user?.id_registrasi ?? null),
          nama: biodata.nama || user.nama || '',
          role_key: user.role_key || 'santri',
          role_label: user.role_label || 'Santri',
          allowed_apps: user.allowed_apps || ['daftar'],
          permissions: user.permissions || []
        }
        
        authStore.setAuth(authStore.token, updatedUser)
        
        sessionStorage.removeItem('pendaftaranData')
        localStorage.removeItem('pendaftaranData')
        
        showNotification(`Data berhasil disimpan! NIS: ${nisToShow}`, 'success')
        
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        console.error('No ID in response:', biodataResponse)
        showNotification('Data tersimpan tetapi NIS tidak ditemukan. Silakan coba login ulang.', 'warning')
      }
    } catch (error) {
      console.error('Error saving biodata:', error)
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      })
      
      const errorData = error.response?.data
      const errorMessage = errorData?.message || error.message || 'Terjadi kesalahan saat menyimpan data'
      
      console.log('=== Error Analysis ===')
      console.log('errorData:', errorData)
      console.log('errorData.error_type:', errorData?.error_type)
      console.log('errorData.data:', errorData?.data)
      console.log('errorMessage:', errorMessage)
      
      // Cek apakah error karena duplicate NIK (dari backend kita atau dari database)
      if (errorData?.error_type === 'duplicate_nik' || 
          (errorMessage.includes('Duplicate entry') && errorMessage.includes('nik'))) {
        
        console.log('Duplicate NIK detected')
        console.log('Has errorData.data?', !!errorData?.data)
        console.log('errorData.data.nik:', errorData?.data?.nik)
        console.log('errorData.data.nama:', errorData?.data?.nama)
        console.log('errorData.data.id:', errorData?.data?.id)
        
        // Jika backend sudah memberikan data santri yang duplicate
        if (errorData?.data?.nik && errorData?.data?.nama) {
          console.log('Setting duplicate data from backend')
          const duplicateData = {
            nik: errorData.data.nik,
            nama: errorData.data.nama,
            id: errorData.data.id,
            nis: errorData.data.nis ?? errorData.data.id
          }
          console.log('Duplicate data to set:', duplicateData)
          setDuplicateNikData(duplicateData)
          setShowDuplicateNikModal(true)
          console.log('Modal should show now')
        } else {
          // Fallback: cari manual jika backend tidak memberikan data
          const nik = biodata.nik
          console.log('Fetching NIK data manually:', nik)
          
          try {
            const response = await pendaftaranAPI.searchByNik(nik)
            console.log('Search NIK response:', response)
            
            if (response.success && response.data?.exists) {
              const d = response.data
              console.log('Setting duplicate data from search')
              setDuplicateNikData({
                nik: nik,
                nama: d.nama || 'Tidak diketahui',
                id: d.id,
                nis: d.nis ?? d.id
              })
              setShowDuplicateNikModal(true)
              console.log('Modal should show now (from search)')
            } else {
              showNotification('NIK sudah terdaftar, tetapi data tidak ditemukan. Silakan hubungi admin.', 'error')
            }
          } catch (searchError) {
            console.error('Error searching NIK:', searchError)
            showNotification('NIK sudah terdaftar. Silakan cek kembali NIK Santri.', 'error')
          }
        }
      } else {
        showNotification(errorMessage, 'error')
      }
      setIsSaving(false)
    }
  }

  // Handle konfirmasi update data untuk NIK duplicate
  const handleConfirmUpdateDuplicate = () => {
    setShowDuplicateNikModal(false)
    // Panggil save dengan force update
    handleSaveBiodata(true, duplicateNikData.id)
  }

  // Handle reject update data untuk NIK duplicate
  const handleRejectUpdateDuplicate = () => {
    setShowDuplicateNikModal(false)
    setDuplicateNikData(null)
    showNotification('Silakan cek kembali NIK Santri dan pastikan sudah benar.', 'warning')
  }

  // Handle ganti berkas
  const handleGantiClickBerkas = (berkas) => {
    setSelectedJenisBerkas(berkas.jenis_berkas)
    setExistingBerkasToReplace(berkas)
    setIsBerkasOffcanvasOpen(true)
  }

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

      // jenisBerkas sudah disimpan di sessionStorage dari BerkasOffcanvas
      // Redirect ke halaman editor untuk gambar dari kamera (sudah dikompres jika perlu)
      setShowCameraScanner(false)
      navigate('/editor', { state: { file: fileToUse } })
    } catch (err) {
      console.error('Error in handleCameraCapture:', err)
      showNotification('Gagal memproses file dari kamera. Silakan coba lagi.', 'error')
    }
  }

  const getFileTypeColor = (tipeFile, namaFile) => {
    if (!tipeFile && !namaFile) return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
    
    const extension = namaFile?.split('.').pop()?.toLowerCase() || ''
    
    if (tipeFile?.startsWith('image/')) {
      if (extension === 'jpg' || extension === 'jpeg') {
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      } else if (extension === 'png') {
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
      } else if (extension === 'gif') {
        return 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300'
      } else if (extension === 'webp') {
        return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300'
      }
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'
    }
    
    if (tipeFile === 'application/pdf' || extension === 'pdf') {
      return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    }
    
    return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
  }

  if (!user) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400 text-center py-8">
            Harap login terlebih dahulu untuk mengakses halaman Berkas
          </p>
          {/* Spacer untuk mobile - agar tidak terhalang navigasi bawah */}
          <div className="h-24 md:h-8"></div>
        </div>
      </div>
    )
  }
  
  // Jika belum punya ID (santri baru), minta simpan biodata dulu
  if (!localId) {
    return (
      <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4">
        <div className="max-w-4xl mx-auto">
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Pastikan Biodata Sudah Benar dan Valid
              </h3>
              <button
                onClick={loadBiodataFromStorage}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                title="Refresh data dari Biodata"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <p className="text-gray-600 dark:text-gray-400 mb-4 text-center">
              Untuk mengakses halaman Berkas, Anda perlu menyimpan biodata terlebih dahulu.
            </p>
            
            {requiredFields.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Field wajib yang masih kosong:
                </p>
                <ul className="space-y-2">
                  {requiredFields.map((field, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {field.label}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-4">
                  Silakan lengkapi data di halaman Biodata terlebih dahulu.
                </p>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate('/biodata')}
                className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Isi Biodata
              </button>
              
              {requiredFields.length === 0 ? (
                <button
                  onClick={handleSaveBiodata}
                  disabled={isSaving}
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      Simpan Biodata
                    </>
                  )}
                </button>
              ) : (
                <button
                  disabled
                  className="px-6 py-2.5 bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 rounded-lg inline-flex items-center gap-2 cursor-not-allowed"
                  title="Lengkapi field wajib terlebih dahulu"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Simpan Biodata
                </button>
              )}
            </div>
          </div>
          
          {/* Spacer untuk mobile - agar tidak terhalang navigasi bawah */}
          <div className="h-24 md:h-8"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-gray-900 rounded-lg shadow-sm p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 gap-3">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Berkas
            </h2>
            {hasUnsavedData && (
              <span className="text-sm text-orange-600 dark:text-orange-400 font-medium shrink-0">
                Ada perubahan yang belum tersimpan
              </span>
            )}
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💡 <strong>Info:</strong> Centang checkbox (☑️) untuk berkas yang tidak dimiliki. 
               - upload berkas yang ada saja.
            </p>
          </div>
        </div>

        {loadingBerkas ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          </div>
        ) : (
          <div className="space-y-2">
            {jenisBerkasOptions.map((jenisBerkas) => {
              const existingBerkas = berkasMap.get(jenisBerkas)
              const isNotAvailable = berkasNotAvailable.includes(jenisBerkas)
              const isKkSamaDenganSantri = kkSamaDenganSantri.includes(jenisBerkas)
              const isKkType = ['KK Ayah', 'KK Ibu', 'KK Wali'].includes(jenisBerkas)
              const hasKkSantri = berkasMap.has('KK Santri')
              
              return (
                <div key={jenisBerkas}>
                  <div
                    className={`p-3 rounded-lg flex items-center justify-between transition-all ${
                      isNotAvailable
                        ? 'bg-gray-100 dark:bg-gray-800/50 border border-dashed border-gray-300 dark:border-gray-700 opacity-50'
                        : existingBerkas 
                        ? 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600' 
                        : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={existingBerkas && !isNotAvailable ? () => handlePreviewBerkas(existingBerkas) : undefined}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {/* Checkbox untuk "Tidak Ada" */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleBerkasNotAvailable(jenisBerkas, existingBerkas)
                          }}
                          className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                            isNotAvailable
                              ? 'bg-orange-500 border-orange-500'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:border-orange-400 dark:hover:border-orange-500'
                          }`}
                          title={
                            isNotAvailable 
                              ? 'Klik untuk tandai sebagai tersedia' 
                              : existingBerkas
                              ? 'Klik untuk hapus berkas dan tandai tidak ada'
                              : 'Tandai sebagai tidak ada'
                          }
                        >
                          {isNotAvailable && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>

                        <p className={`text-sm font-medium ${
                          isNotAvailable
                            ? 'text-gray-400 dark:text-gray-600 line-through'
                            : existingBerkas 
                            ? 'text-gray-900 dark:text-gray-100' 
                            : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {jenisBerkas}
                        </p>

                        {isNotAvailable && (
                          <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded">
                            Tidak Ada
                          </span>
                        )}

                        {isKkSamaDenganSantri && !isNotAvailable && (
                          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium rounded">
                            Sama dengan KK Santri
                          </span>
                        )}
                      </div>
                      
                      {/* Checkbox "Sama dengan KK Santri" untuk KK Ayah, Ibu, Wali */}
                      {isKkType && !isNotAvailable && hasKkSantri && (
                        <div className="flex items-center gap-2 mt-2 ml-7">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isKkSamaDenganSantri}
                              onChange={(e) => {
                                e.stopPropagation()
                                toggleKkSamaDenganSantri(jenisBerkas)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700"
                            />
                            <span className="text-xs text-gray-600 dark:text-gray-400">
                              Sama dengan KK Santri
                            </span>
                          </label>
                        </div>
                      )}
                      {!isNotAvailable && existingBerkas ? (
                        <div className="flex items-center gap-2 flex-wrap mt-1 ml-7">
                          {existingBerkas.tipe_file && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getFileTypeColor(existingBerkas.tipe_file, existingBerkas.nama_file)}`}>
                              {getFileTypeLabel(existingBerkas.tipe_file, existingBerkas.nama_file)}
                            </span>
                          )}
                          {existingBerkas.ukuran_file && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatFileSize(existingBerkas.ukuran_file)}
                            </span>
                          )}
                        </div>
                      ) : !isNotAvailable ? (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 ml-7">Belum diupload</p>
                      ) : null}
                      {existingBerkas?.keterangan && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                          {existingBerkas.keterangan}
                        </p>
                      )}
                    </div>
                    {!isNotAvailable && (
                      <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                        {existingBerkas ? (
                          <>
                            <button
                              onClick={() => handleGantiClickBerkas(existingBerkas)}
                              className="p-2 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900 rounded transition-colors"
                              title="Ganti"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteClickBerkas(existingBerkas)}
                              disabled={deletingId === existingBerkas.id}
                              className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded transition-colors disabled:opacity-50"
                              title="Hapus"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                              </svg>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedJenisBerkas(jenisBerkas)
                              setIsBerkasOffcanvasOpen(true)
                            }}
                            className="p-2 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900 rounded transition-colors"
                            title="Upload"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {/* Spacer untuk mobile - agar tidak terhalang navigasi bawah */}
        <div className="h-24 md:h-8"></div>
      </div>

      {/* Berkas Offcanvas */}
      <BerkasOffcanvas
        isOpen={isBerkasOffcanvasOpen}
        onClose={() => {
          setIsBerkasOffcanvasOpen(false)
          setSelectedJenisBerkas(null)
          setExistingBerkasToReplace(null)
          setSelectedFile(null)
        }}
        idSantri={localId}
        defaultJenisBerkas={selectedJenisBerkas}
        existingBerkas={existingBerkasToReplace}
        defaultFile={selectedFile}
        onUploadSuccess={() => {
          handleUploadSuccess()
          setHasUnsavedData(false)
          setSelectedFile(null)
        }}
        showCameraScanner={showCameraScanner}
        setShowCameraScanner={setShowCameraScanner}
      />

      {/* File Preview Offcanvas */}
      {previewFile && (
        <FilePreviewOffcanvas
          file={previewFile}
          onClose={handleClosePreviewBerkas}
          onDownload={downloadForPreview}
          onReplace={(berkas) => {
            setExistingBerkasToReplace(berkas)
            setIsBerkasOffcanvasOpen(true)
          }}
          formatFileSize={formatFileSize}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModalBerkas}
        title="Konfirmasi Hapus Berkas"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deletingId}
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Apakah Anda yakin ingin menghapus berkas ini?
            </p>
            {berkasToDelete && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 dark:text-gray-200 truncate">
                      {berkasToDelete.jenis_berkas}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {berkasToDelete.nama_file}
                    </p>
                    {berkasToDelete.ukuran_file && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {formatFileSize(berkasToDelete.ukuran_file)}
                      </p>
                    )}
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
              onClick={handleCloseDeleteModalBerkas}
              disabled={deletingId}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleDeleteConfirmBerkas}
              disabled={deletingId}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {deletingId ? (
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

      {/* Duplicate NIK Confirmation Modal */}
      <Modal
        isOpen={showDuplicateNikModal}
        onClose={() => {}}
        title="NIK Sudah Terdaftar"
        maxWidth="max-w-lg"
        closeOnBackdropClick={false}
      >
        <div className="p-6">
          <div className="mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0">
                <svg className="w-12 h-12 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-gray-700 dark:text-gray-300 mb-3">
                  NIK <strong className="font-semibold">{duplicateNikData?.nik}</strong> sudah terdaftar dengan nama:
                </p>
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                  <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                    {duplicateNikData?.nama}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    NIS: {duplicateNikData?.nis ?? duplicateNikData?.id ?? '-'}
                  </p>
                </div>
                <p className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-2">
                  Apakah orang yang sama?
                </p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                  <li><strong>Pilih "Iya"</strong> jika ini orang yang sama dan Anda ingin memperbarui data</li>
                  <li><strong>Pilih "Tidak"</strong> jika bukan orang yang sama, lalu cek kembali NIK</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={handleRejectUpdateDuplicate}
              className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors font-medium"
            >
              Tidak
            </button>
            <button
              type="button"
              onClick={handleConfirmUpdateDuplicate}
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              Iya, Perbarui Data
            </button>
          </div>
        </div>
      </Modal>

      {/* Camera Scanner */}
      {showCameraScanner && (
        <CameraScanner
          onCapture={handleCameraCapture}
          onClose={() => setShowCameraScanner(false)}
          autoEnhance={true}
          jenisBerkas={sessionStorage.getItem('uploadingBerkasJenis')}
        />
      )}
    </div>
  )
}

export default Berkas
