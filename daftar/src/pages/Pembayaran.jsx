import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pendaftaranAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { useNotification } from '../contexts/NotificationContext'
import PembayaranOffcanvas from '../components/Pembayaran/PembayaranOffcanvas'
import PembayaranListOffcanvas from '../components/Pembayaran/PembayaranListOffcanvas'
import FilePreviewOffcanvas from '../components/FilePreview/FilePreviewOffcanvas'
import CameraScanner from '../components/CameraScanner/CameraScanner'
import { compressImage } from '../utils/imageCompression'
import { formatFileSize } from '../utils/fileUtils'
import {
  getPembayaranCacheKey,
  readPembayaranCache,
  writePembayaranCache,
  pembayaranCacheMatchesUser,
  invalidatePembayaranAndDashboard,
} from '../utils/daftarPagesLocalCache'
import { buildWaAdminPembayaranUrl } from '../utils/waAdminPembayaran'

/** @param {object[]} allBerkasData */
function filterSortBuktiPembayaran(allBerkasData) {
  if (!Array.isArray(allBerkasData) || allBerkasData.length === 0) return []
  const buktiList = allBerkasData.filter(
    (berkas) => berkas.jenis_berkas && berkas.jenis_berkas.startsWith('Bukti Pembayaran')
  )
  const getBuktiNumber = (berkas) => {
    if (berkas.jenis_berkas === 'Bukti Pembayaran') return 1
    const match = berkas.jenis_berkas.match(/\d+/)
    return match ? parseInt(match[0], 10) : 1
  }
  return [...buktiList].sort((a, b) => {
    const numA = getBuktiNumber(a)
    const numB = getBuktiNumber(b)
    if (numA !== numB) return numA - numB
    const dateA = new Date(a.tanggal_upload || a.tanggal_dibuat || 0)
    const dateB = new Date(b.tanggal_upload || b.tanggal_dibuat || 0)
    return dateB - dateA
  })
}

function Pembayaran() {
  const { user } = useAuthStore()
  const { tahunHijriyah, tahunMasehi, loadTahunAjaran } = useTahunAjaranStore()
  const { showNotification } = useNotification()
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname || '/pembayaran'
  const search = location.search || ''
  const isPembayaranOffcanvasOpen = search.includes('payment=open') || search.includes('payment=ipaymu')
  const [registrasi, setRegistrasi] = useState(null)
  const [registrasiDetail, setRegistrasiDetail] = useState([])
  const [loading, setLoading] = useState(true)
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [creatingRegistrasi, setCreatingRegistrasi] = useState(false)
  const [hasAttemptedAutoAssign, setHasAttemptedAutoAssign] = useState(false)
  const [isUploadBuktiOffcanvasOpen, setIsUploadBuktiOffcanvasOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const fileRef = useRef(null)
  const [buktiPembayaranList, setBuktiPembayaranList] = useState([])
  const [previewFile, setPreviewFile] = useState(null)
  const [paymentHistory, setPaymentHistory] = useState([])
  const [showCameraScanner, setShowCameraScanner] = useState(false)
  // Daftar kondisi untuk tampilan "Kondisi Pendaftaran Santri" (dari DB, agar fleksibel)
  const [kondisiDisplayFields, setKondisiDisplayFields] = useState([]) // [{ field_name, field_label }, ...]
  const hasAttemptedSyncFromFlow = useRef(false)
  const pembayaranHydratedFromCacheRef = useRef(false)

  // Reset flag sync saat tahun/user berubah agar bisa sync lagi untuk tahun baru
  useEffect(() => {
    hasAttemptedSyncFromFlow.current = false
  }, [user?.id, tahunHijriyah, tahunMasehi])

  // Hydrasi cache sebelum paint (sama pola Biodata/Dashboard)
  useLayoutEffect(() => {
    pembayaranHydratedFromCacheRef.current = false
    const sessionNik =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
    const th0 = tahunHijriyah != null ? String(tahunHijriyah).trim() : ''
    const tm0 = tahunMasehi != null ? String(tahunMasehi).trim() : ''
    if (!user?.id || !th0 || !tm0) {
      setRegistrasi(null)
      setRegistrasiDetail([])
      setBuktiPembayaranList([])
      setPaymentHistory([])
      setLoading(false)
      return
    }
    const key = getPembayaranCacheKey(user?.nik || sessionNik, user.id, th0, tm0)
    const pack = readPembayaranCache(key)
    if (pack && pembayaranCacheMatchesUser(pack.meta, user, sessionNik)) {
      setRegistrasi(pack.registrasi)
      setRegistrasiDetail(pack.registrasiDetail)
      setBuktiPembayaranList(pack.buktiPembayaranList)
      setPaymentHistory(pack.paymentHistory)
      pembayaranHydratedFromCacheRef.current = true
      setLoading(false)
    } else {
      setRegistrasi(null)
      setRegistrasiDetail([])
      setBuktiPembayaranList([])
      setPaymentHistory([])
      setLoading(true)
    }
  }, [user?.id, user?.nik, tahunHijriyah, tahunMasehi])

  // Load tahun ajaran saat mount
  useEffect(() => {
    loadTahunAjaran()
    
    // Refresh setiap 5 menit untuk mendapatkan update dari pengaturan
    const interval = setInterval(() => {
      loadTahunAjaran(true) // Force refresh
    }, 5 * 60 * 1000) // 5 menit

    return () => clearInterval(interval)
  }, [loadTahunAjaran])

  // Load daftar field kondisi dari DB (urutan sesuai psb___kondisi_field) agar tampilan fleksibel
  useEffect(() => {
    const load = async () => {
      try {
        const result = await pendaftaranAPI.getKondisiFields()
        if (!result?.success || !Array.isArray(result.data)) {
          setKondisiDisplayFields([])
          return
        }
        setKondisiDisplayFields(result.data.map((f) => ({
          field_name: f.field_name,
          field_label: f.field_label || f.field_name
        })))
      } catch (e) {
        console.warn('Load kondisi display fields:', e)
        setKondisiDisplayFields([])
      }
    }
    load()
  }, [])

  const refreshPembayaran = useCallback(
    async (force = false) => {
      const thR = tahunHijriyah != null ? String(tahunHijriyah).trim() : ''
      const tmR = tahunMasehi != null ? String(tahunMasehi).trim() : ''
      if (!user?.id || !thR || !tmR) return

      if (force) {
        pembayaranHydratedFromCacheRef.current = false
      }
      if (force || !pembayaranHydratedFromCacheRef.current) {
        setLoading(true)
      }

      const sessionNik =
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
      const cacheKey = getPembayaranCacheKey(user?.nik || sessionNik, user.id, thR, tmR)
      const meta = {
        id_santri: String(user.id),
        nik_snapshot: String(user?.nik || sessionNik || '').trim(),
        tahun_hijriyah: thR,
        tahun_masehi: tmR,
      }

      try {
        const result = await pendaftaranAPI.getRegistrasi(user.id, thR, tmR)
        let reg = null
        let detail = []

        if (result.success && result.data) {
          reg = result.data
          if (result.data.id) {
            const detailResult = await pendaftaranAPI.getRegistrasiDetail(result.data.id)
            if (detailResult.success && detailResult.data) {
              detail = detailResult.data
            }
          }
        }

        const berkasRes = await pendaftaranAPI.getBerkasList(user.id)
        const allBerkas = berkasRes.success && berkasRes.data ? berkasRes.data : []
        const bukti = filterSortBuktiPembayaran(allBerkas)

        const histRes = await pendaftaranAPI.getTransaksi(user.id, reg?.id ?? null)
        const hist = histRes.success && histRes.data ? histRes.data : []

        setRegistrasi(reg)
        setRegistrasiDetail(detail)
        setBuktiPembayaranList(bukti)
        setPaymentHistory(hist)

        writePembayaranCache(cacheKey, {
          registrasi: reg,
          registrasiDetail: detail,
          buktiPembayaranList: bukti,
          paymentHistory: hist,
          meta,
        })
        pembayaranHydratedFromCacheRef.current = true
      } catch (error) {
        console.error('Error fetching data pembayaran:', error)
        showNotification('Gagal mengambil data pembayaran', 'error')
      } finally {
        setLoading(false)
      }
    },
    [user?.id, user?.nik, tahunHijriyah, tahunMasehi, showNotification]
  )

  /** Untuk offcanvas / iPayMu: hapus cache dashboard+pembayaran lalu muat ulang penuh dari server */
  const invalidateAndRefreshPembayaran = useCallback(async () => {
    const sessionNik =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
    const thI = tahunHijriyah != null ? String(tahunHijriyah).trim() : ''
    const tmI = tahunMasehi != null ? String(tahunMasehi).trim() : ''
    if (user?.id && thI && tmI) {
      invalidatePembayaranAndDashboard(
        user?.nik || sessionNik,
        user.id,
        thI,
        tmI,
        sessionNik
      )
    }
    await refreshPembayaran(true)
  }, [user?.id, user?.nik, tahunHijriyah, tahunMasehi, refreshPembayaran])

  useEffect(() => {
    const thE = tahunHijriyah != null ? String(tahunHijriyah).trim() : ''
    const tmE = tahunMasehi != null ? String(tahunMasehi).trim() : ''
    if (thE && tmE && user?.id) {
      void refreshPembayaran(false)
    }
  }, [refreshPembayaran, tahunHijriyah, tahunMasehi, user?.id])

  // Setelah mengisi semua page flow: jika belum ada registrasi tapi ada data flow di localStorage, sync sekali agar pembayaran bisa dirender dan harga ketemu
  useEffect(() => {
    const thS = tahunHijriyah != null ? String(tahunHijriyah).trim() : ''
    const tmS = tahunMasehi != null ? String(tahunMasehi).trim() : ''
    if (!user?.id || !thS || !tmS || registrasi !== null || loading || hasAttemptedSyncFromFlow.current) return

    const syncFromFlowConditions = async () => {
      hasAttemptedSyncFromFlow.current = true
      try {
        const statusPendaftar = localStorage.getItem('daftar_status_pendaftar') || ''
        const daftarDiniyah = localStorage.getItem('daftar_diniyah') || ''
        const daftarFormal = localStorage.getItem('daftar_formal') || ''
        const statusMurid = localStorage.getItem('daftar_status_murid') || ''
        const statusSantri = localStorage.getItem('daftar_status_santri') || ''
        const prodi = localStorage.getItem('daftar_prodi') || ''
        if (!daftarDiniyah && !daftarFormal) return

        const result = await pendaftaranAPI.saveRegistrasi({
          id_santri: user.id,
          tahun_hijriyah: thS,
          tahun_masehi: tmS,
          status_pendaftar: statusPendaftar || undefined,
          daftar_diniyah: daftarDiniyah || undefined,
          daftar_formal: daftarFormal || undefined,
          status_murid: statusMurid || undefined,
          status_santri: statusSantri || undefined,
          prodi: prodi || undefined,
          auto_assign_items: true
        })
        if (result?.success) {
          await refreshPembayaran(true)
        }
      } catch (e) {
        console.warn('Sync registrasi dari flow:', e)
      }
    }
    syncFromFlowConditions()
  }, [user?.id, tahunHijriyah, tahunMasehi, registrasi, loading, refreshPembayaran])

  // Tentukan apakah bukti sudah diverifikasi
  const isBuktiVerified = useCallback((bukti) => {
    // Hitung jumlah transaksi TF yang sudah diverifikasi
    const verifiedTfCount = paymentHistory.filter(payment => 
      payment.via === 'TF' || payment.via === 'Transfer'
    ).length

    // Cari index bukti di list
    const buktiIndex = buktiPembayaranList.findIndex(b => b.id === bukti.id)
    
    // Jika index bukti < jumlah transaksi TF, berarti sudah diverifikasi
    return buktiIndex >= 0 && buktiIndex < verifiedTfCount
  }, [paymentHistory, buktiPembayaranList])

  // Reset attempt saat ID registrasi berubah
  useEffect(() => {
    setHasAttemptedAutoAssign(false)
  }, [registrasi?.id])

  // Handle camera capture untuk bukti pembayaran
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

      // jenisBerkas sudah disimpan di sessionStorage dari PembayaranOffcanvas
      // Set file dan buka offcanvas pembayaran
      setShowCameraScanner(false)
      setSelectedFile(fileToUse)
      setIsUploadBuktiOffcanvasOpen(true)
    } catch (err) {
      console.error('Error in handleCameraCapture:', err)
      showNotification('Gagal memproses file dari kamera. Silakan coba lagi.', 'error')
    }
  }

  // Auto load items jika registrasi sudah ada tapi detail masih kosong
  useEffect(() => {
    if (
      registrasi?.id && 
      !loading && 
      registrasiDetail.length === 0 && 
      !autoAssigning && 
      !hasAttemptedAutoAssign
    ) {
      setHasAttemptedAutoAssign(true)
      handleAutoAssign()
    }
  }, [registrasi?.id, loading, registrasiDetail.length, autoAssigning, hasAttemptedAutoAssign])

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
            
            // Simpan file ke ref dan state
            fileRef.current = editedFile
            setSelectedFile(editedFile)
            
            // Buka offcanvas setelah state ter-update
            setTimeout(() => {
              console.log('Opening pembayaran offcanvas with file')
              // Pastikan file masih ada di ref
              if (fileRef.current) {
                setSelectedFile(fileRef.current)
              }
              navigate(`${pathname}${pathname.includes('?') ? '&' : '?'}payment=open`)
            }, 300)
            
            // Clear sessionStorage setelah berhasil
            sessionStorage.removeItem('editedImageData')
            sessionStorage.removeItem('editedImageMeta')
            sessionStorage.removeItem('uploadingBerkasJenis')
            sessionStorage.removeItem('editorReturnPage')
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
  }, [location.state, showNotification])

  const handleDaftarkan = async () => {
    if (!user?.id) return

    setCreatingRegistrasi(true)
    try {
      // 1. Ambil data santri terbaru dari tabel santri
      const santriResult = await pendaftaranAPI.searchByNik(user.nik)
      let additionalData = {}
      
      if (santriResult.success && santriResult.data) {
        const s = santriResult.data
        additionalData = {
          ...s, // Ambil semua field dari santri (nik, nama, gender, tempat_lahir, dll)
          id_santri: user.id // Pastikan ID santri benar
        }
      }

      // 2. Kondisi dari flow (localStorage) agar item & harga (wajib) terisi
      const flowConditions = {
        status_pendaftar: localStorage.getItem('daftar_status_pendaftar') || undefined,
        daftar_diniyah: localStorage.getItem('daftar_diniyah') || undefined,
        daftar_formal: localStorage.getItem('daftar_formal') || undefined,
        status_murid: localStorage.getItem('daftar_status_murid') || undefined,
        status_santri: localStorage.getItem('daftar_status_santri') || undefined,
        prodi: localStorage.getItem('daftar_prodi') || undefined,
        auto_assign_items: true
      }

      // 3. Kirim data lengkap ke saveRegistrasi agar psb___registrasi terisi penuh + item assign
      const result = await pendaftaranAPI.saveRegistrasi({
        id_santri: user.id,
        tahun_hijriyah: tahunHijriyah,
        tahun_masehi: tahunMasehi,
        id_admin: null, // User di aplikasi daftar adalah santri, bukan admin/pengurus
        ...flowConditions,
        ...additionalData
      })

      if (result.success) {
        showNotification('Berhasil mendaftar. Item pendaftaran akan segera dimuat.', 'success')
        const sessionNik =
          typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
        invalidatePembayaranAndDashboard(
          user?.nik || sessionNik,
          user.id,
          tahunHijriyah,
          tahunMasehi,
          sessionNik
        )
        await refreshPembayaran(true)
      } else {
        showNotification(result.message || 'Gagal melakukan pendaftaran', 'error')
      }
    } catch (error) {
      console.error('Error saving registrasi:', error)
      showNotification('Gagal melakukan pendaftaran', 'error')
    } finally {
      setCreatingRegistrasi(false)
    }
  }

  const handleAutoAssign = async () => {
    if (!registrasi?.id) return

    setAutoAssigning(true)
    try {
      const result = await pendaftaranAPI.autoAssignItems(registrasi.id)
      if (result.success) {
        showNotification('Item pendaftaran berhasil diperbarui', 'success')
        await refreshPembayaran(true)
      } else {
        showNotification(result.message || 'Gagal memperbarui item', 'error')
      }
    } catch (error) {
      console.error('Error auto-assigning items:', error)
      showNotification('Gagal memperbarui item pendaftaran', 'error')
    } finally {
      setAutoAssigning(false)
    }
  }

  const calculateWajib = () => {
    return registrasiDetail.reduce((total, item) => {
      return total + parseFloat(item.harga_standar || 0)
    }, 0)
  }

  const wajib = calculateWajib()
  const bayar = parseFloat(registrasi?.bayar || 0)
  const kurang = wajib - bayar
  const wajibNol = wajib === 0
  const isLunas = !wajibNol && kurang <= 0
  const jumlahBukti = buktiPembayaranList.length
  const waHubungiAdminLink = useMemo(
    () =>
      buildWaAdminPembayaranUrl({
        nama: user?.nama || registrasi?.nama,
        nik: user?.nik,
        nis: user?.nis ?? registrasi?.nis,
        daftarFormal: registrasi?.daftar_formal,
        daftarDiniyah: registrasi?.daftar_diniyah,
      }),
    [
      user?.nama,
      user?.nik,
      user?.nis,
      registrasi?.nama,
      registrasi?.nis,
      registrasi?.daftar_formal,
      registrasi?.daftar_diniyah,
    ]
  )
  const maxBukti = 6
  const bisaUploadBukti = !isLunas && jumlahBukti < maxBukti
  
  // Helper function untuk mendapatkan nomor dari jenis_berkas
  const getBuktiNumber = useCallback((berkas) => {
    if (berkas.jenis_berkas === 'Bukti Pembayaran') {
      return 1
    }
    const match = berkas.jenis_berkas.match(/\d+/)
    return match ? parseInt(match[0]) : 1
  }, [])
  
  // Tentukan nomor bukti berikutnya berdasarkan nomor yang sudah ada
  const nomorBuktiBerikutnya = useMemo(() => {
    if (jumlahBukti === 0) return 1
    
    // Ambil semua nomor yang sudah ada (handle "Bukti Pembayaran" tanpa nomor sebagai 1)
    const nomorTerpakai = buktiPembayaranList.map(berkas => getBuktiNumber(berkas))
    
    // Cari nomor berikutnya yang belum terpakai (1-6)
    for (let i = 1; i <= maxBukti; i++) {
      if (!nomorTerpakai.includes(i)) {
        return i
      }
    }
    
    // Jika semua nomor sudah terpakai, return jumlah + 1 (tapi tidak akan digunakan karena sudah >= maxBukti)
    return jumlahBukti + 1
  }, [buktiPembayaranList, jumlahBukti, maxBukti, getBuktiNumber])

  // Kelompokkan item berdasarkan kategori
  const groupedItems = registrasiDetail.reduce((acc, item) => {
    const category = item.kategori_item || 'Lain-lain'
    if (!acc[category]) {
      acc[category] = {
        items: [],
        subtotal: 0
      }
    }
    acc[category].items.push(item)
    acc[category].subtotal += parseFloat(item.harga_standar || 0)
    return acc
  }, {})

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  if (!registrasi) {
    return (
      <div className="p-4 text-center h-full flex flex-col items-center justify-center">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-2xl border border-yellow-200 dark:border-yellow-800 max-w-md">
          <svg className="w-16 h-16 text-yellow-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-yellow-700 dark:text-yellow-400 font-medium mb-6">
            Data registrasi pendaftaran tidak ditemukan untuk tahun ajaran ini ({tahunHijriyah || '-'}).
          </p>
          <button
            onClick={handleDaftarkan}
            disabled={creatingRegistrasi}
            className="w-full px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-teal-500/30 flex items-center justify-center gap-2"
          >
            {creatingRegistrasi ? (
              <>
                <div className="animate-spin h-5 w-5 border-b-2 border-white rounded-full"></div>
                Memproses...
              </>
            ) : (
              'Daftarkan Sekarang'
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 rounded-lg shadow-sm p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Informasi Pembayaran
          </h2>
          <button
            type="button"
            onClick={() => void refreshPembayaran(true)}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-teal-600 dark:text-gray-400 dark:hover:text-teal-400 transition-colors"
            title="Muat ulang data"
          >
            <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Ringkasan Biaya */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border text-center ${wajibNol ? 'border-amber-200 dark:border-amber-700' : 'border-gray-100 dark:border-gray-700'}`}>
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Wajib Bayar</div>
            <div className={`text-xl font-bold ${wajibNol ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
              Rp {wajib.toLocaleString('id-ID')}
            </div>
            {wajibNol && (
              <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                Cek kondisi pendaftaran
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Bayar</div>
            <div className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">
              Rp {bayar.toLocaleString('id-ID')}
            </div>
            
            {/* Total wajib 0: jangan tampilkan lunas, tampilkan peringatan + link WA admin */}
            {wajibNol && (
              <div className="text-left p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <p className="text-xs text-amber-800 dark:text-amber-200 font-medium mb-2">
                  Total wajib Rp 0. Cek kondisi pendaftaran (mungkin ada yang keliru), atau hubungi admin:
                </p>
                <a
                  href={waHubungiAdminLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Hubungi Admin (WA)
                </a>
              </div>
            )}
            
            {/* Tombol Bayar - tetap ada selama belum lunas dan jumlah bukti < 6 (dan wajib tidak 0) */}
            {!wajibNol && bisaUploadBukti && (
              <button
                onClick={() => navigate(`${pathname}${pathname.includes('?') ? '&' : '?'}payment=open`)}
                className="w-full px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path>
                </svg>
                Bayar
              </button>
            )}
            
            {/* Info jika sudah lunas (hanya ketika wajib > 0) */}
            {isLunas && (
              <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                ✓ Pembayaran Lunas
              </div>
            )}
            
            {/* Info jika sudah mencapai maksimal bukti */}
            {!wajibNol && !isLunas && jumlahBukti >= maxBukti && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">
                Maksimal {maxBukti} bukti TF
              </div>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Sisa Kekurangan</div>
            <div className="text-xl font-bold text-red-600 dark:text-red-400">
              Rp {kurang.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        {/* Kondisi Pendaftaran (Sesuai di UWABA) */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-6">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <svg className="w-4 h-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
            Kondisi Pendaftaran Santri
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6">
            {kondisiDisplayFields.map((field) => {
              const value = registrasi[field.field_name]
              const filled = value != null && String(value).trim() !== ''
              return (
                <div key={field.field_name} className="space-y-1">
                  <div className="text-[10px] text-gray-500 dark:text-gray-500">{field.field_label}</div>
                  <div className={`text-sm font-medium ${filled ? 'text-gray-900 dark:text-white' : 'text-red-500 italic'}`}>
                    {filled ? value : 'Belum diisi'}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-50 dark:border-gray-700/50">
            <p className="text-[10px] text-gray-400 italic">
              * Jika kondisi di atas tidak sesuai, silakan perbarui Biodata Santri pada tab sebelumnya.
            </p>
          </div>
        </div>

        {/* Rincian Item */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">Rincian Item Pendaftaran</h3>
            {registrasiDetail.length === 0 && (
              <button
                onClick={handleAutoAssign}
                disabled={autoAssigning}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                {autoAssigning ? (
                  <>
                    <div className="animate-spin h-3 w-3 border-b-2 border-white rounded-full"></div>
                    Memproses...
                  </>
                ) : (
                  'Cek Item Pendaftaran'
                )}
              </button>
            )}
          </div>

          <div className="p-2 space-y-4">
            {Object.keys(groupedItems).length > 0 ? (
              Object.entries(groupedItems).map(([category, data]) => (
                <div key={category} className="space-y-1">
                  {/* Category Header */}
                  <div className="flex justify-between items-center px-4 py-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                      {category}
                    </span>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      Subtotal: Rp {data.subtotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                  
                  {/* Items in Category */}
                  <div className="space-y-0.5">
                    {data.items.map((item) => (
                      <div 
                        key={item.id} 
                        className="group flex justify-between items-center px-4 py-2 rounded-xl hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-all duration-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-1.5 rounded-full bg-teal-400 group-hover:scale-150 transition-transform duration-300" />
                          <span className="text-sm font-medium text-gray-600 dark:text-gray-400 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                            {item.nama_item}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          Rp {parseFloat(item.harga_standar || 0).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-gray-400 dark:text-gray-500 text-sm italic font-light">
                Belum ada rincian item pendaftaran.
              </div>
            )}
          </div>

          {registrasiDetail.length > 0 && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
              <div className="flex justify-between items-center font-bold">
                <div className="text-gray-900 dark:text-white">Total Biaya</div>
                <div className="text-teal-600 dark:text-teal-400 text-lg">
                  Rp {wajib.toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
          <div className="flex gap-3">
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-700 dark:text-blue-300">
              <p className="font-semibold mb-1">Informasi:</p>
              <p>Rincian biaya pendaftaran ditentukan berdasarkan kategori pendidikan dan pilihan pendaftaran Santri. Jika terdapat ketidaksesuaian, silakan hubungi bagian pendaftaran.</p>
            </div>
          </div>
        </div>
        
        {/* Spacer untuk mobile - agar tidak terhalang navigasi bawah */}
        <div className="h-24 md:h-8"></div>
      </div>

      {/* Pembayaran Offcanvas - List Pembayaran */}
      {isPembayaranOffcanvasOpen && (
        <PembayaranListOffcanvas
          isOpen={isPembayaranOffcanvasOpen}
          onClose={() => navigate(pathname)}
          pathname={pathname}
          registrasi={registrasi}
          user={user}
          idSantri={user?.id}
          paymentHistory={paymentHistory}
          paymentDataLoading={loading}
          buktiPembayaranList={buktiPembayaranList}
          wajib={wajib}
          wajibNol={wajibNol}
          bayar={bayar}
          kurang={kurang}
          onUploadBuktiClick={() => {
            navigate(pathname)
            setIsUploadBuktiOffcanvasOpen(true)
          }}
          onPreviewBukti={(bukti) => {
            setPreviewFile(bukti)
          }}
          bisaUploadBukti={bisaUploadBukti}
          jumlahBukti={jumlahBukti}
          nomorBuktiBerikutnya={nomorBuktiBerikutnya}
          onRefreshRegistrasi={invalidateAndRefreshPembayaran}
        />
      )}

      {/* Upload Bukti TF Offcanvas */}
      <PembayaranOffcanvas
        isOpen={isUploadBuktiOffcanvasOpen}
        onClose={() => {
          setIsUploadBuktiOffcanvasOpen(false)
          setSelectedFile(null)
        }}
        idSantri={user?.id}
        defaultFile={selectedFile}
        nomorBukti={nomorBuktiBerikutnya}
        onUploadSuccess={() => {
          const sessionNik =
            typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
          if (user?.id) {
            invalidatePembayaranAndDashboard(
              user?.nik || sessionNik,
              user.id,
              tahunHijriyah,
              tahunMasehi,
              sessionNik
            )
          }
          void refreshPembayaran(true)
          setSelectedFile(null)
          setIsUploadBuktiOffcanvasOpen(false)
        }}
        showCameraScanner={showCameraScanner}
        setShowCameraScanner={setShowCameraScanner}
      />

      {/* Camera Scanner */}
      {showCameraScanner && (
        <CameraScanner
          onCapture={handleCameraCapture}
          onClose={() => setShowCameraScanner(false)}
          autoEnhance={true}
          jenisBerkas={sessionStorage.getItem('uploadingBerkasJenis')}
        />
      )}

      {/* File Preview Offcanvas */}
      {previewFile && (
        <FilePreviewOffcanvas
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={async (idBerkas, namaFile) => {
            // Fungsi ini mengembalikan blob untuk preview, bukan langsung download
            try {
              const blob = await pendaftaranAPI.downloadBerkas(idBerkas)
              return blob
            } catch (error) {
              console.error('Error loading file for preview:', error)
              showNotification('Gagal memuat preview file', 'error')
              throw error
            }
          }}
          onReplace={(berkas) => {
            // Bisa digunakan untuk ganti bukti pembayaran jika diperlukan
            setPreviewFile(null)
            navigate(`${pathname}${pathname.includes('?') ? '&' : '?'}payment=open`)
          }}
          canReplace={!isBuktiVerified(previewFile)}
          formatFileSize={formatFileSize}
        />
      )}
    </div>
  )
}

export default Pembayaran
