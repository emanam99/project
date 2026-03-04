import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { santriAPI, chatAPI, pendaftaranAPI } from '../../services/api'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../contexts/NotificationContext'
import { checkWhatsAppNumber } from '../../utils/whatsappCheck'
import { extractTanggalLahirFromNIK, extractGenderFromNIK } from '../../utils/nikUtils'
import WhatsAppOffcanvas from '../WhatsApp/WhatsAppOffcanvas'

function BiodataBox({ onSantriChange, onOpenSearch, externalSantriId }) {
  const { showNotification } = useNotification()
  const location = useLocation()
  const [santriId, setSantriId] = useState('')
  const [biodata, setBiodata] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [originalData, setOriginalData] = useState(null)
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false)
  const [riwayatCount, setRiwayatCount] = useState(0)
  const [waStatus, setWaStatus] = useState(null) // null, 'checking', 'registered', 'not_registered'
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)
  const [focusedField, setFocusedField] = useState(null)
  const [kategoriOptions, setKategoriOptions] = useState([])
  const [daerahOptions, setDaerahOptions] = useState([])
  const [kamarOptions, setKamarOptions] = useState([])
  const [lembagaDiniyahOptions, setLembagaDiniyahOptions] = useState([])
  const [lembagaFormalOptions, setLembagaFormalOptions] = useState([])
  const [kelasDiniyahOptions, setKelasDiniyahOptions] = useState([])
  const [kelasFormalOptions, setKelasFormalOptions] = useState([])
  const [kelDiniyahOptions, setKelDiniyahOptions] = useState([])
  const [kelFormalOptions, setKelFormalOptions] = useState([])
  const [tidakSekolahDiniyahChecked, setTidakSekolahDiniyahChecked] = useState(true)
  const [tidakSekolahFormalChecked, setTidakSekolahFormalChecked] = useState(true)

  const formRef = useRef(null)
  const isUserTypingRef = useRef(false) // Flag untuk track apakah user sedang mengetik
  const updateUrlTimeoutRef = useRef(null) // Track timeout untuk debounce update URL
  const onSantriChangeTimeoutRef = useRef(null) // Track timeout untuk debounce onSantriChange

  // Helper function untuk mendapatkan className label berdasarkan focused state
  const getLabelClassName = (fieldName) => {
    const baseClass = "block text-xs mb-1 transition-colors duration-200"
    if (focusedField === fieldName) {
      return `${baseClass} text-teal-600 dark:text-teal-400 font-semibold`
    }
    return `${baseClass} text-gray-500 dark:text-gray-400`
  }

  // Tentukan page berdasarkan path
  const getPage = () => {
    if (location.pathname === '/uwaba') return 'uwaba'
    if (location.pathname === '/khusus') return 'khusus'
    if (location.pathname === '/tunggakan') return 'tunggakan'
    return 'uwaba' // default
  }

  // Sync external santriId (dari URL) ke internal state
  // Hanya sync jika externalSantriId benar-benar berubah dari luar (bukan dari input manual)
  const prevExternalSantriIdRef = useRef(externalSantriId)
  useEffect(() => {
    // Skip jika user sedang mengetik (untuk mencegah clear form saat user menghapus angka)
    if (isUserTypingRef.current) {
      return
    }
    
    // Hanya jalankan jika externalSantriId benar-benar berubah dari luar
    if (prevExternalSantriIdRef.current !== externalSantriId) {
      prevExternalSantriIdRef.current = externalSantriId
      
      if (externalSantriId) {
        // Jika externalSantriId berbeda dengan santriId saat ini
        if (externalSantriId !== santriId) {
          // Simulasi mengetik manual: kosongkan dulu, kemudian isi
          setSantriId('')
          setBiodata(null)
          setOriginalData(null)
          setHasChanges(false)
          if (onSantriChange) onSantriChange(null)
          
          // Set ID baru setelah delay kecil untuk simulasi mengetik
          setTimeout(() => {
            setSantriId(externalSantriId)
            // Trigger fetch jika ID valid (7 karakter)
            if (isValidSantriId(externalSantriId)) {
              fetchSantriData(externalSantriId)
            }
          }, 150)
        }
      } else {
        // Jika externalSantriId kosong/null, hanya kosongkan form jika santriId sudah 7 angka
        // (artinya data sudah di-load sebelumnya, bukan user sedang mengetik)
        // Skip jika user sedang mengetik
        if (isUserTypingRef.current) {
          return
        }
        
        // Hanya clear jika ID sebelumnya sudah lengkap (7 angka)
        // Ini berarti data sudah di-load, bukan user sedang mengetik
        if (santriId && isValidSantriId(santriId) && prevExternalSantriIdRef.current !== null) {
          setSantriId('')
          setBiodata(null)
          setOriginalData(null)
          setHasChanges(false)
          if (onSantriChange) onSantriChange(null)
        }
        // Jika santriId tidak 7 angka (1-6 angka), berarti user sedang mengetik, jangan clear
        // ID akan tetap ada di input field
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSantriId])

  // Validasi ID santri harus 7 digit
  const isValidSantriId = (id) => {
    return /^\d{7}$/.test(String(id ?? '').trim())
  }

  // Fetch data santri berdasarkan ID
  const fetchSantriData = async (id) => {
    if (!isValidSantriId(id)) {
      setBiodata(null)
      setOriginalData(null)
      setHasChanges(false)
      if (onSantriChange) onSantriChange(null)
      return
    }

    setLoading(true)
    try {
      const result = await santriAPI.getById(id)
      
      if (result.success && result.data) {
        const data = result.data
        setBiodata(data)
        setOriginalData({ ...data })
        setHasChanges(false)
        // Kirim ke parent dengan id untuk tampilan/URL = NIS (7 digit), bukan id numerik DB
        if (onSantriChange) {
          const nisForDisplay = (data.nis != null && data.nis !== '') ? String(data.nis) : String(data.id ?? id).padStart(7, '0')
          onSantriChange({ ...data, nis: nisForDisplay, id: nisForDisplay })
        }
        // Load riwayat count
        loadRiwayatCount(id)
      } else {
        setBiodata(null)
        setOriginalData(null)
        setHasChanges(false)
        if (onSantriChange) onSantriChange(null)
        showNotification('Data santri tidak ditemukan', 'error')
      }
    } catch (error) {
      console.error('Error fetching santri data:', error)
      setBiodata(null)
      setOriginalData(null)
      setHasChanges(false)
      if (onSantriChange) onSantriChange(null)
      showNotification('Gagal mengambil data santri', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle perubahan input ID santri
  const handleSantriIdChange = (e) => {
    // Set flag bahwa user sedang mengetik
    isUserTypingRef.current = true
    
    // Ambil nilai dari input tanpa mengubahnya
    const rawValue = e.target.value
    // Hanya ambil angka, maks 7 digit
    const id = rawValue.replace(/\D/g, '').slice(0, 7)
    
    // Update state ID dengan nilai yang sudah difilter - PASTIKAN ID TIDAK IKUT TERHAPUS
    setSantriId(id)
    
    // Reset flag setelah delay yang lebih lama untuk memastikan useEffect tidak trigger
    setTimeout(() => {
      isUserTypingRef.current = false
    }, 1000)
    
    // Clear timeout sebelumnya jika user masih mengetik
    if (onSantriChangeTimeoutRef.current) {
      clearTimeout(onSantriChangeTimeoutRef.current)
      onSantriChangeTimeoutRef.current = null
    }
    
    // Load data jika ID lengkap (7 digit)
    if (isValidSantriId(id)) {
      fetchSantriData(id)
      // Notify parent dengan debounce untuk mencegah loop
      // Hanya notify jika ID berbeda dengan externalSantriId
      if (onSantriChange && id !== externalSantriId) {
        onSantriChangeTimeoutRef.current = setTimeout(() => {
          // Pastikan ID masih sama dan masih valid saat timeout dieksekusi
          if (id === santriId && isValidSantriId(santriId) && santriId !== externalSantriId) {
            onSantriChange({ nis: santriId, id: santriId })
          }
          onSantriChangeTimeoutRef.current = null
        }, 600)
      }
    } else {
      // Jika ID tidak lengkap (1-6 digit) atau kosong, kosongkan biodata
      // Tapi ID tetap ada di input field
      setBiodata(null)
      setOriginalData(null)
      setHasChanges(false)
      // Notify parent dengan debounce
      if (onSantriChange) {
        onSantriChangeTimeoutRef.current = setTimeout(() => {
          onSantriChange(null)
          onSantriChangeTimeoutRef.current = null
        }, 300)
      }
    }
  }

  // Handle perubahan field biodata
  // Pakai functional update agar beberapa handleFieldChange berturut-turut (mis. di handleStatusChange)
  // tidak saling menimpa — setiap update memakai state terbaru.
  const handleFieldChange = (field, value) => {
    setBiodata((prev) => {
      if (!prev) return prev
      let updated = { ...prev, [field]: value }

      // Khusus untuk field NIK - auto extract tanggal lahir dan gender
      if (field === 'nik') {
        const numericValue = String(value).replace(/\D/g, '').slice(0, 16)
        updated = { ...updated, [field]: numericValue }
        if (numericValue.length === 16) {
          const tanggalLahir = extractTanggalLahirFromNIK(numericValue)
          const gender = extractGenderFromNIK(numericValue)
          if (tanggalLahir && !prev.tanggal_lahir) updated.tanggal_lahir = tanggalLahir
          if (gender) updated.gender = gender
        }
      }

      return updated
    })

    // Notify parent (UWABA) dan hasChanges dijalankan via useEffect agar selalu pakai state terbaru
    // setelah batch update (mis. handleStatusChange yang memanggil handleFieldChange beberapa kali)
  }

  // Sinkron biodata ke parent (UWABA) dan hitung hasChanges — pakai state terbaru setelah update
  useEffect(() => {
    if (!biodata) return
    if (onSantriChange && getPage() === 'uwaba') {
      onSantriChange({ ...biodata, nis: santriId, id: santriId })
    }
    if (originalData) {
      const changed = Object.keys(biodata).some(
        (key) => (biodata[key] || '') !== (originalData[key] || '')
      )
      setHasChanges(changed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biodata, santriId])

  // Load options dari API (sama seperti page pendaftaran / LengkapiData)
  useEffect(() => {
    if (!biodata) return
    let cancelled = false
    Promise.all([
      pendaftaranAPI.getKategoriOptions(),
      pendaftaranAPI.getLembagaOptions('Diniyah'),
      pendaftaranAPI.getLembagaOptions('Formal')
    ]).then(([kRes, dRes, fRes]) => {
      if (cancelled) return
      if (kRes?.success && Array.isArray(kRes.data)) setKategoriOptions(kRes.data)
      if (dRes?.success && Array.isArray(dRes.data)) setLembagaDiniyahOptions(dRes.data)
      if (fRes?.success && Array.isArray(fRes.data)) setLembagaFormalOptions(fRes.data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [biodata?.id])

  useEffect(() => {
    if (!biodata?.kategori) { setDaerahOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getDaerahOptions(biodata.kategori).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setDaerahOptions(res.data)
      else if (!cancelled) setDaerahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [biodata?.kategori])

  useEffect(() => {
    if (!biodata?.id_daerah) { setKamarOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKamarOptions(biodata.id_daerah).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKamarOptions(res.data)
      else if (!cancelled) setKamarOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [biodata?.id_daerah])

  const lembagaDiniyahId = (biodata?.lembaga_diniyah ?? '') || (biodata?.diniyah != null && biodata?.diniyah !== '' ? String(biodata.diniyah) : '')
  useEffect(() => {
    if (!lembagaDiniyahId) { setKelasDiniyahOptions([]); setKelDiniyahOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(lembagaDiniyahId).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelasDiniyahOptions(res.data)
      else if (!cancelled) setKelasDiniyahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [lembagaDiniyahId])

  const kelasDiniyahVal = biodata?.kelas_diniyah ?? ''
  useEffect(() => {
    if (!lembagaDiniyahId || kelasDiniyahVal === '') { setKelDiniyahOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelOptions(lembagaDiniyahId, kelasDiniyahVal).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelDiniyahOptions(res.data)
      else if (!cancelled) setKelDiniyahOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [lembagaDiniyahId, kelasDiniyahVal])

  const lembagaFormalId = (biodata?.lembaga_formal ?? '') || (biodata?.formal != null && biodata?.formal !== '' ? String(biodata.formal) : '')
  useEffect(() => {
    if (!lembagaFormalId) { setKelasFormalOptions([]); setKelFormalOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelasOptions(lembagaFormalId).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelasFormalOptions(res.data)
      else if (!cancelled) setKelasFormalOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [lembagaFormalId])

  const kelasFormalVal = biodata?.kelas_formal ?? ''
  useEffect(() => {
    if (!lembagaFormalId || kelasFormalVal === '') { setKelFormalOptions([]); return }
    let cancelled = false
    pendaftaranAPI.getKelOptions(lembagaFormalId, kelasFormalVal).then(res => {
      if (!cancelled && res?.success && Array.isArray(res.data)) setKelFormalOptions(res.data)
      else if (!cancelled) setKelFormalOptions([])
    }).catch(() => {})
    return () => { cancelled = true }
  }, [lembagaFormalId, kelasFormalVal])

  // Handle perubahan status santri
  const handleStatusChange = (e) => {
    const status = e.target.value
    handleFieldChange('status_santri', status)
    if (status !== 'Mukim') {
      handleFieldChange('id_daerah', '')
      handleFieldChange('id_kamar', '')
    }
    const opts = kategoriOptions.length ? kategoriOptions : (status === 'Khoriji' ? ['PAUD', 'SD', 'Banin', 'Banat', 'Kuliah'] : ['Banin', 'Banat'])
    if (opts.length > 0 && biodata?.kategori && !opts.includes(biodata.kategori)) {
      handleFieldChange('kategori', '')
    }
  }

  const handleKategoriChange = (value) => {
    handleFieldChange('kategori', value)
    handleFieldChange('id_daerah', '')
    handleFieldChange('id_kamar', '')
  }

  const handleDaerahChange = (value) => {
    handleFieldChange('id_daerah', value === '' ? '' : Number(value))
    handleFieldChange('id_kamar', '')
  }

  const handleLembagaDiniyahChange = (value) => {
    handleFieldChange('lembaga_diniyah', value)
    handleFieldChange('kelas_diniyah', '')
    handleFieldChange('kel_diniyah', '')
    handleFieldChange('id_diniyah', '')
  }

  const handleKelasDiniyahChange = (value) => {
    handleFieldChange('kelas_diniyah', value)
    handleFieldChange('kel_diniyah', '')
    handleFieldChange('id_diniyah', '')
  }

  const handleKelDiniyahChange = (e) => {
    const id = e.target.value === '' ? '' : Number(e.target.value)
    handleFieldChange('id_diniyah', id)
    const row = kelDiniyahOptions.find((r) => Number(r.id) === id)
    handleFieldChange('kel_diniyah', row ? (row.kel ?? '') : '')
  }

  const handleLembagaFormalChange = (value) => {
    handleFieldChange('lembaga_formal', value)
    handleFieldChange('kelas_formal', '')
    handleFieldChange('kel_formal', '')
    handleFieldChange('id_formal', '')
  }

  const handleKelasFormalChange = (value) => {
    handleFieldChange('kelas_formal', value)
    handleFieldChange('kel_formal', '')
    handleFieldChange('id_formal', '')
  }

  const handleKelFormalChange = (e) => {
    const id = e.target.value === '' ? '' : Number(e.target.value)
    handleFieldChange('id_formal', id)
    const row = kelFormalOptions.find((r) => Number(r.id) === id)
    handleFieldChange('kel_formal', row ? (row.kel ?? '') : '')
  }

  // Sinkronkan checkbox Tidak Sekolah: saat ganti santri pakai data, saat ada pilihan set unchecked (jangan set checked agar user bisa uncheck)
  const prevBiodataIdRef = useRef(null)
  useEffect(() => {
    if (!biodata) return
    const diniyahFilled = (biodata.id_diniyah ?? '') !== '' || (biodata.lembaga_diniyah ?? '') !== '' || (biodata.diniyah ?? '') !== ''
    const formalFilled = (biodata.id_formal ?? '') !== '' || (biodata.lembaga_formal ?? '') !== '' || (biodata.formal ?? '') !== ''
    if (biodata.id !== prevBiodataIdRef.current) {
      prevBiodataIdRef.current = biodata.id
      setTidakSekolahDiniyahChecked(!diniyahFilled)
      setTidakSekolahFormalChecked(!formalFilled)
    } else {
      if (diniyahFilled) setTidakSekolahDiniyahChecked(false)
      if (formalFilled) setTidakSekolahFormalChecked(false)
    }
  }, [biodata?.id, biodata?.id_diniyah, biodata?.lembaga_diniyah, biodata?.diniyah, biodata?.id_formal, biodata?.lembaga_formal, biodata?.formal])

  const handleTidakSekolahDiniyahChange = (checked) => {
    setTidakSekolahDiniyahChecked(checked)
    if (checked) {
      handleFieldChange('lembaga_diniyah', '')
      handleFieldChange('kelas_diniyah', '')
      handleFieldChange('kel_diniyah', '')
      handleFieldChange('id_diniyah', '')
      handleFieldChange('diniyah', '')
      handleFieldChange('nim_diniyah', '')
    }
  }

  const handleTidakSekolahFormalChange = (checked) => {
    setTidakSekolahFormalChecked(checked)
    if (checked) {
      handleFieldChange('lembaga_formal', '')
      handleFieldChange('kelas_formal', '')
      handleFieldChange('kel_formal', '')
      handleFieldChange('id_formal', '')
      handleFieldChange('formal', '')
      handleFieldChange('nim_formal', '')
    }
  }

  // Save biodata (jangan kirim id_diniyah/id_formal/id_kamar kosong agar backend tidak set null)
  const handleSave = async () => {
    if (!biodata || !isValidSantriId(santriId)) {
      showNotification('NIS santri tidak valid!', 'error')
      return
    }
    const payload = { ...biodata }
    if (payload.id_diniyah === '' || payload.id_diniyah == null) delete payload.id_diniyah
    if (payload.id_formal === '' || payload.id_formal == null) delete payload.id_formal
    if (payload.id_kamar === '' || payload.id_kamar == null) delete payload.id_kamar
    if (payload.id_daerah === '' || payload.id_daerah == null) delete payload.id_daerah

    setSaving(true)
    try {
      const result = await santriAPI.update(santriId, payload)
      
      if (result.success) {
        setOriginalData({ ...biodata })
        setHasChanges(false)
        // Update parent component dengan biodata terbaru
        if (onSantriChange) {
          onSantriChange({ ...biodata, nis: santriId, id: santriId })
        }
        showNotification('Biodata berhasil diperbarui!', 'success')
      } else {
        showNotification(result.message || 'Gagal memperbarui biodata', 'error')
      }
    } catch (error) {
      console.error('Error saving biodata:', error)
      showNotification('Gagal memperbarui biodata: ' + (error.message || 'Unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }


  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const nisFromUrl = urlParams.get('nis') || urlParams.get('id')
    if (nisFromUrl && isValidSantriId(nisFromUrl)) {
      setSantriId(nisFromUrl)
      fetchSantriData(nisFromUrl)
    }
  }, [])

  useEffect(() => {
    if (updateUrlTimeoutRef.current) {
      clearTimeout(updateUrlTimeoutRef.current)
    }
    updateUrlTimeoutRef.current = setTimeout(() => {
      if (isValidSantriId(santriId)) {
        const url = new URL(window.location)
        url.searchParams.set('nis', santriId)
        url.searchParams.delete('id')
        window.history.replaceState({}, '', url)
      }
      updateUrlTimeoutRef.current = null
    }, 300)

    // Cleanup timeout saat unmount atau dependency berubah
    return () => {
      if (updateUrlTimeoutRef.current) {
        clearTimeout(updateUrlTimeoutRef.current)
      }
    }
  }, [santriId])

  // Cleanup timeout saat component unmount
  useEffect(() => {
    return () => {
      if (onSantriChangeTimeoutRef.current) {
        clearTimeout(onSantriChangeTimeoutRef.current)
      }
    }
  }, [])

  // Load riwayat count
  const loadRiwayatCount = async (id) => {
    if (!id) id = santriId
    if (!isValidSantriId(id)) return
    try {
      const result = await chatAPI.getCountBySantri(id)
      if (result && result.success) {
        // Backend mengembalikan count langsung, bukan di data
        setRiwayatCount(result.count || result.data || 0)
      } else {
        setRiwayatCount(0)
      }
    } catch (error) {
      console.error('Error loading riwayat count:', error)
      setRiwayatCount(0)
    }
  }

  // Cek nomor WhatsApp langsung dari biodata
  const checkPhoneNumber = async () => {
    const noTelpon = biodata?.no_telpon?.trim()
    
    if (!noTelpon || noTelpon === '') {
      showNotification('Masukkan nomor terlebih dahulu', 'error')
      setWaStatus(null)
      return
    }

    setIsCheckingPhone(true)
    setWaStatus('checking')

    try {
      const result = await checkWhatsAppNumber(noTelpon)

      if (result.success && result.isRegistered) {
        setWaStatus('registered')
        showNotification('✓ Nomor terdaftar di WhatsApp', 'success')
        // Auto-hide setelah 3 detik
        setTimeout(() => {
          setWaStatus('registered')
        }, 3000)
      } else {
        setWaStatus('not_registered')
        showNotification('✗ ' + (result.message || 'Nomor tidak terdaftar di WhatsApp'), 'warning')
        // Auto-hide setelah 3 detik
        setTimeout(() => {
          setWaStatus(null)
        }, 3000)
      }
    } catch (error) {
      console.error('Error checking WhatsApp number:', error)
      setWaStatus('not_registered')
      showNotification('Gagal mengecek nomor WhatsApp: ' + (error.message || 'Unknown error'), 'error')
      // Auto-hide setelah 3 detik
      setTimeout(() => {
        setWaStatus(null)
      }, 3000)
    } finally {
      setIsCheckingPhone(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md h-full flex flex-col overflow-hidden relative">
      {/* Header dengan NIS Input dan Tombol - Fixed (tidak ikut scroll) */}
      <div className="flex-shrink-0 bg-gray-200 dark:bg-gray-700/50 p-2 border-b-2 border-gray-300 dark:border-gray-600">
        {/* NIS Input, Tombol Simpan, dan Tombol Cari */}
        <div className="flex gap-1.5 items-center justify-between">
          <div className="flex gap-1.5 items-center">
            <label className="text-teal-600 dark:text-teal-400 font-semibold whitespace-nowrap text-sm">
              NIS
            </label>
            <input
              type="text"
              autoComplete="off"
              value={santriId}
              onChange={handleSantriIdChange}
              className={`w-20 min-w-[4.5rem] max-w-[5rem] p-1.5 text-sm border-2 rounded-lg focus:outline-none focus:ring-2 bg-transparent text-gray-900 dark:text-gray-100 text-center ${
                santriId && !isValidSantriId(santriId) 
                  ? 'border-red-300 dark:border-red-600 focus:border-red-500 dark:focus:border-red-500 focus:ring-red-500' 
                  : 'border-teal-500 dark:border-teal-400 focus:border-teal-500 dark:focus:border-teal-400 focus:ring-teal-500 dark:focus:ring-teal-400'
              }`}
              placeholder="7 digit"
              maxLength={7}
              inputMode="numeric"
            />
            {biodata && (
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving || !isValidSantriId(santriId)}
                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 border-2 ${
                  saving || !hasChanges || !isValidSantriId(santriId)
                    ? 'bg-gray-300 dark:bg-gray-600 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-700 border-teal-600 dark:border-teal-500 text-white'
                }`}
                title={
                  saving ? 'Menyimpan...' 
                  : !isValidSantriId(santriId) ? 'NIS/ID santri tidak valid' 
                  : hasChanges ? 'Simpan' 
                  : 'Data tersimpan'
                }
              >
                {saving ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : !isValidSantriId(santriId) ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                ) : hasChanges ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (onOpenSearch) {
                  onOpenSearch()
                }
              }}
              className="bg-teal-500 text-white p-1.5 rounded-lg hover:bg-teal-600 transition-colors flex-shrink-0 border-2 border-teal-500 dark:border-teal-400"
              title="Cari Santri"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </button>
          </div>
        </div>
        {santriId && !isValidSantriId(santriId) && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-1">NIS harus 7 digit</p>
        )}
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 p-6" style={{ 
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 #f1f5f9'
      }}>
        <style>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
          .dark div::-webkit-scrollbar-track {
            background: #1f2937;
          }
          .dark div::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
          .dark div::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
        `}</style>
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <span className="ml-3 text-gray-600 dark:text-gray-400">Memuat data santri...</span>
          </div>
        )}

        {/* Biodata Form */}
        {biodata && !loading && (
          <form ref={formRef} className="space-y-4">
          {/* Nama */}
          <div>
            <label className={getLabelClassName('nama')}>Nama</label>
            <input
              type="text"
              value={biodata.nama || ''}
              onChange={(e) => handleFieldChange('nama', e.target.value)}
              onFocus={() => setFocusedField('nama')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* No. Telpon */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <label className={getLabelClassName('no_telpon')}>No. Telpon</label>
                <button
                  type="button"
                  onClick={checkPhoneNumber}
                  disabled={isCheckingPhone}
                  className="px-1.5 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors flex items-center gap-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Cek nomor WhatsApp"
                >
                  {isCheckingPhone ? (
                    <span className="animate-spin text-xs">⏳</span>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      <span className="text-xs">Cek</span>
                    </>
                  )}
                </button>
                {waStatus && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    waStatus === 'checking' 
                      ? 'bg-yellow-100 text-yellow-800' 
                      : waStatus === 'registered'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {waStatus === 'checking' && 'Sedang mengecek...'}
                    {waStatus === 'registered' && '✓'}
                    {waStatus === 'not_registered' && '✗'}
                  </span>
                )}
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-400">Riwayat : {riwayatCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={biodata.no_telpon || ''}
                onChange={(e) => {
                  handleFieldChange('no_telpon', e.target.value)
                  // Reset status saat nomor berubah
                  if (waStatus) {
                    setWaStatus(null)
                  }
                }}
                onFocus={() => setFocusedField('no_telpon')}
                onBlur={() => setFocusedField(null)}
                className="flex-1 p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              />
              <button
                type="button"
                onClick={() => {
                  if (!biodata.no_telpon) {
                    showNotification('Masukkan nomor telepon terlebih dahulu!', 'error')
                    return
                  }
                  if (!biodata.nama) {
                    showNotification('Nama santri tidak boleh kosong!', 'error')
                    return
                  }
                  setIsWhatsAppModalOpen(true)
                }}
                className="p-2 text-green-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                title="Kirim pesan WhatsApp"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                </svg>
              </button>
            </div>
          </div>

          {/* NIK */}
          <div>
            <label className={getLabelClassName('nik')}>NIK</label>
            <input
              type="text"
              value={biodata.nik || ''}
              onChange={(e) => {
                // Hanya terima angka
                const numericValue = e.target.value.replace(/\D/g, '').slice(0, 16)
                handleFieldChange('nik', numericValue)
              }}
              onFocus={() => setFocusedField('nik')}
              onBlur={() => setFocusedField(null)}
              maxLength={16}
              inputMode="numeric"
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              placeholder="16 digit NIK"
            />
          </div>

          {/* Tempat & Tanggal Lahir */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={getLabelClassName('tempat_lahir')}>Tempat Lahir</label>
              <input
                type="text"
                value={biodata.tempat_lahir || ''}
                onChange={(e) => handleFieldChange('tempat_lahir', e.target.value)}
                onFocus={() => setFocusedField('tempat_lahir')}
                onBlur={() => setFocusedField(null)}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="flex-1">
              <label className={getLabelClassName('tanggal_lahir')}>Tanggal Lahir</label>
              <input
                type="date"
                value={biodata.tanggal_lahir || ''}
                onChange={(e) => handleFieldChange('tanggal_lahir', e.target.value)}
                onFocus={() => setFocusedField('tanggal_lahir')}
                onBlur={() => setFocusedField(null)}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className={getLabelClassName('gender')}>Gender</label>
            <select
              value={biodata.gender || ''}
              onChange={(e) => handleFieldChange('gender', e.target.value)}
              onFocus={() => setFocusedField('gender')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            >
              <option value="Laki-laki">Laki-laki</option>
              <option value="Perempuan">Perempuan</option>
            </select>
          </div>

          {/* Ayah & Ibu */}
          <div>
            <label className={getLabelClassName('ayah')}>Ayah</label>
            <input
              type="text"
              value={biodata.ayah || ''}
              onChange={(e) => handleFieldChange('ayah', e.target.value)}
              onFocus={() => setFocusedField('ayah')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className={getLabelClassName('ibu')}>Ibu</label>
            <input
              type="text"
              value={biodata.ibu || ''}
              onChange={(e) => handleFieldChange('ibu', e.target.value)}
              onFocus={() => setFocusedField('ibu')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Alamat */}
          <div className="flex gap-4">
            <div className="flex-grow">
              <label className={getLabelClassName('dusun')}>Dusun</label>
              <input
                type="text"
                value={biodata.dusun || ''}
                onChange={(e) => handleFieldChange('dusun', e.target.value)}
                onFocus={() => setFocusedField('dusun')}
                onBlur={() => setFocusedField(null)}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className={getLabelClassName('rt')}>RT</label>
              <input
                type="text"
                value={biodata.rt || ''}
                onChange={(e) => handleFieldChange('rt', e.target.value)}
                onFocus={() => setFocusedField('rt')}
                onBlur={() => setFocusedField(null)}
                maxLength={3}
                className="w-16 p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
              />
            </div>
            <div>
              <label className={getLabelClassName('rw')}>RW</label>
              <input
                type="text"
                value={biodata.rw || ''}
                onChange={(e) => handleFieldChange('rw', e.target.value)}
                onFocus={() => setFocusedField('rw')}
                onBlur={() => setFocusedField(null)}
                maxLength={3}
                className="w-16 p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
              />
            </div>
          </div>

          <div>
            <label className={getLabelClassName('desa')}>Desa</label>
            <input
              type="text"
              value={biodata.desa || ''}
              onChange={(e) => handleFieldChange('desa', e.target.value)}
              onFocus={() => setFocusedField('desa')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className={getLabelClassName('kecamatan')}>Kecamatan</label>
              <input
                type="text"
                value={biodata.kecamatan || ''}
                onChange={(e) => handleFieldChange('kecamatan', e.target.value)}
                onFocus={() => setFocusedField('kecamatan')}
                onBlur={() => setFocusedField(null)}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className={getLabelClassName('kode_pos')}>Kode Pos</label>
              <input
                type="text"
                value={biodata.kode_pos || ''}
                onChange={(e) => handleFieldChange('kode_pos', e.target.value)}
                onFocus={() => setFocusedField('kode_pos')}
                onBlur={() => setFocusedField(null)}
                maxLength={6}
                className="w-24 p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
              />
            </div>
          </div>

          <div>
            <label className={getLabelClassName('kabupaten')}>Kabupaten</label>
            <input
              type="text"
              value={biodata.kabupaten || ''}
              onChange={(e) => handleFieldChange('kabupaten', e.target.value)}
              onFocus={() => setFocusedField('kabupaten')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className={getLabelClassName('provinsi')}>Provinsi</label>
            <input
              type="text"
              value={biodata.provinsi || ''}
              onChange={(e) => handleFieldChange('provinsi', e.target.value)}
              onFocus={() => setFocusedField('provinsi')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            />
          </div>

          {/* Status Santri */}
          <div>
            <label className={getLabelClassName('status_santri')}>Status Santri</label>
            <select
              value={biodata.status_santri || ''}
              onChange={handleStatusChange}
              onFocus={() => setFocusedField('status_santri')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            >
              <option value="Mukim">Mukim</option>
              <option value="Khoriji">Khoriji</option>
              <option value="Boyong">Boyong</option>
              <option value="Guru Tugas">Guru Tugas</option>
              <option value="Pengurus">Pengurus</option>
            </select>
          </div>

          {/* Kategori */}
          <div>
            <label className={getLabelClassName('kategori')}>Kategori</label>
            <select
              value={biodata.kategori || ''}
              onChange={(e) => handleKategoriChange(e.target.value)}
              onFocus={() => setFocusedField('kategori')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            >
              <option value="">Pilih Kategori</option>
              {(kategoriOptions.length ? kategoriOptions : (biodata.status_santri === 'Khoriji' ? ['PAUD', 'SD', 'Banin', 'Banat', 'Kuliah'] : ['Banin', 'Banat'])).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          {/* Daerah & Kamar - hanya tampil jika status santri Mukim */}
          {biodata.status_santri === 'Mukim' && (
            <div className="flex gap-4">
              <div className="flex-1">
                <label className={getLabelClassName('daerah')}>Daerah</label>
                <select
                  value={biodata.id_daerah ?? ''}
                  onChange={(e) => handleDaerahChange(e.target.value)}
                  onFocus={() => setFocusedField('id_daerah')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                >
                  <option value="">Pilih Daerah</option>
                  {daerahOptions.map((d) => (
                    <option key={d.id} value={d.id}>{d.daerah}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className={getLabelClassName('kamar')}>Kamar</label>
                <select
                  value={biodata.id_kamar ?? ''}
                  onChange={(e) => handleFieldChange('id_kamar', e.target.value === '' ? '' : Number(e.target.value))}
                  onFocus={() => setFocusedField('id_kamar')}
                  onBlur={() => setFocusedField(null)}
                  disabled={!biodata.id_daerah}
                  className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                >
                  <option value="">Pilih Kamar</option>
                  {kamarOptions.map((k) => (
                    <option key={k.id} value={k.id}>{k.kamar}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Diniyah: Tidak Sekolah atau Diniyah → Kelas → Kel */}
          <div className="mt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={tidakSekolahDiniyahChecked}
                onChange={(e) => handleTidakSekolahDiniyahChange(e.target.checked)}
                className="w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tidak Sekolah (Diniyah)</span>
            </label>
            <AnimatePresence initial={false}>
              {!tidakSekolahDiniyahChecked && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-4 flex-wrap items-end">
                    <div className="flex-1 min-w-0">
                      <label className={getLabelClassName('diniyah')}>Diniyah</label>
                      <select
                        value={String((biodata.lembaga_diniyah ?? '') || (biodata.diniyah ?? '') || '')}
                        onChange={(e) => handleLembagaDiniyahChange(e.target.value)}
                        onFocus={() => setFocusedField('lembaga_diniyah')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Pilih Diniyah</option>
                        {lembagaDiniyahOptions.map((l) => (
                          <option key={l.id} value={String(l.id)}>{l.nama || l.id}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className={getLabelClassName('kelas_diniyah')}>Kelas</label>
                      <select
                        value={biodata.kelas_diniyah ?? ''}
                        onChange={(e) => handleKelasDiniyahChange(e.target.value)}
                        onFocus={() => setFocusedField('kelas_diniyah')}
                        onBlur={() => setFocusedField(null)}
                        disabled={!(biodata.lembaga_diniyah || biodata.diniyah)}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Pilih Kelas</option>
                        {kelasDiniyahOptions.map((k) => (
                          <option key={k} value={k}>{k || '-'}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className={getLabelClassName('kel_diniyah')}>Kel</label>
                      <select
                        value={biodata.id_diniyah ?? ''}
                        onChange={handleKelDiniyahChange}
                        onFocus={() => setFocusedField('id_diniyah')}
                        onBlur={() => setFocusedField(null)}
                        disabled={!(biodata.lembaga_diniyah || biodata.diniyah) || !biodata.kelas_diniyah}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Pilih Kel</option>
                        {kelDiniyahOptions.map((r) => (
                          <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className={getLabelClassName('nim_diniyah')}>NIM Diniyah</label>
                    <input
                      type="text"
                      value={biodata.nim_diniyah || ''}
                      onChange={(e) => handleFieldChange('nim_diniyah', e.target.value)}
                      onFocus={() => setFocusedField('nim_diniyah')}
                      onBlur={() => setFocusedField(null)}
                      className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      placeholder="NIM Diniyah"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Formal: Tidak Sekolah atau Formal → Kelas → Kel */}
          <div className="mt-4">
            <label className="inline-flex items-center gap-2 cursor-pointer mb-1">
              <input
                type="checkbox"
                checked={tidakSekolahFormalChecked}
                onChange={(e) => handleTidakSekolahFormalChange(e.target.checked)}
                className="w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tidak Sekolah (Formal)</span>
            </label>
            <AnimatePresence initial={false}>
              {!tidakSekolahFormalChecked && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="flex gap-4 flex-wrap items-end">
                    <div className="flex-1 min-w-0">
                      <label className={getLabelClassName('formal')}>Formal</label>
                      <select
                        value={String((biodata.lembaga_formal ?? '') || (biodata.formal ?? '') || '')}
                        onChange={(e) => handleLembagaFormalChange(e.target.value)}
                        onFocus={() => setFocusedField('lembaga_formal')}
                        onBlur={() => setFocusedField(null)}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Pilih Formal</option>
                        {lembagaFormalOptions.map((l) => (
                          <option key={l.id} value={String(l.id)}>{l.nama || l.id}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className={getLabelClassName('kelas_formal')}>Kelas</label>
                      <select
                        value={biodata.kelas_formal ?? ''}
                        onChange={(e) => handleKelasFormalChange(e.target.value)}
                        onFocus={() => setFocusedField('kelas_formal')}
                        onBlur={() => setFocusedField(null)}
                        disabled={!(biodata.lembaga_formal || biodata.formal)}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Pilih Kelas</option>
                        {kelasFormalOptions.map((k) => (
                          <option key={k} value={k}>{k || '-'}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className={getLabelClassName('kel_formal')}>Kel</label>
                      <select
                        value={biodata.id_formal ?? ''}
                        onChange={handleKelFormalChange}
                        onFocus={() => setFocusedField('id_formal')}
                        onBlur={() => setFocusedField(null)}
                        disabled={!(biodata.lembaga_formal || biodata.formal) || !biodata.kelas_formal}
                        className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Pilih Kel</option>
                        {kelFormalOptions.map((r) => (
                          <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className={getLabelClassName('nim_formal')}>NIM Formal</label>
                    <input
                      type="text"
                      value={biodata.nim_formal || ''}
                      onChange={(e) => handleFieldChange('nim_formal', e.target.value)}
                      onFocus={() => setFocusedField('nim_formal')}
                      onBlur={() => setFocusedField(null)}
                      className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
                      placeholder="NIM Formal"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* LTTQ */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={getLabelClassName('lttq')}>LTTQ</label>
              <select
                value={biodata.lttq || ''}
                onChange={(e) => handleFieldChange('lttq', e.target.value)}
                onFocus={() => setFocusedField('lttq')}
                onBlur={() => setFocusedField(null)}
                className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
              >
                <option value="">Pilih LTTQ</option>
                <option value="Asfal">Asfal</option>
                <option value="Ibtidaiyah">Ibtidaiyah</option>
                <option value="Tsanawiyah">Tsanawiyah</option>
                <option value="Aliyah">Aliyah</option>
                <option value="Mualim">Mualim</option>
                <option value="Ngaji Kitab">Ngaji Kitab</option>
                <option value="Tidak Mengaji">Tidak Mengaji</option>
              </select>
            </div>
            <div>
              <label className={getLabelClassName('kelas_lttq')}>Kelas</label>
              <input
                type="text"
                value={biodata.kelas_lttq || ''}
                onChange={(e) => handleFieldChange('kelas_lttq', e.target.value)}
                onFocus={() => setFocusedField('kelas_lttq')}
                onBlur={() => setFocusedField(null)}
                className="w-full p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
                style={{ width: '3.5em' }}
              />
            </div>
            <div>
              <label className={getLabelClassName('kel_lttq')}>Kel</label>
              <input
                type="text"
                value={biodata.kel_lttq || ''}
                onChange={(e) => handleFieldChange('kel_lttq', e.target.value)}
                onFocus={() => setFocusedField('kel_lttq')}
                onBlur={() => setFocusedField(null)}
                className="w-full p-2 border-b-2 border-gray-300 focus:border-teal-500 focus:outline-none bg-transparent text-center"
                style={{ width: '3.5em' }}
              />
            </div>
          </div>

          {/* Saudara */}
          <div>
            <label className={getLabelClassName('saudara_di_pesantren')}>Saudara</label>
            <select
              value={biodata.saudara_di_pesantren || ''}
              onChange={(e) => handleFieldChange('saudara_di_pesantren', e.target.value)}
              onFocus={() => setFocusedField('saudara_di_pesantren')}
              onBlur={() => setFocusedField(null)}
              className="w-full p-2 border-b-2 border-gray-300 dark:border-gray-600 focus:border-teal-500 dark:focus:border-teal-400 focus:outline-none bg-transparent text-gray-900 dark:text-gray-100"
            >
              <option value="Tidak Ada">Tidak Ada</option>
              <option value="1">1 Saudara</option>
              <option value="2">2 Saudara</option>
              <option value="3">3 Saudara</option>
              <option value="4">4 Saudara</option>
            </select>
          </div>

          {/* Save Button (sticky bottom) */}
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="sticky bottom-4 z-10 w-full bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
            >
              {saving ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                  </svg>
                  <span>Simpan</span>
                </>
              )}
            </button>
          )}
          </form>
        )}

        {/* Empty State */}
        {!biodata && !loading && santriId && isValidSantriId(santriId) && (
          <div className="text-center py-8">
            <div className="text-red-500 dark:text-red-400 mb-2">⚠️ Data santri tidak ditemukan</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Pastikan NIS Santri benar (7 digit)</div>
          </div>
        )}
      </div>

      {/* WhatsApp Offcanvas (bawah) - pengiriman lewat backend, log dengan admin_pengirim */}
      <WhatsAppOffcanvas
        isOpen={isWhatsAppModalOpen}
        onClose={() => {
          setIsWhatsAppModalOpen(false)
          loadRiwayatCount()
        }}
        santriId={santriId}
        namaSantri={biodata?.nama || ''}
        noTelpon={biodata?.no_telpon || ''}
        page={getPage()}
      />
    </div>
  )
}

export default BiodataBox

