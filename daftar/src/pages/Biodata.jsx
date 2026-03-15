import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { santriAPI, pendaftaranAPI, resetCsrfToken } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { extractTanggalLahirFromNIK, extractGenderFromNIK, extractTempatLahirFromNIK } from '../utils/nikUtils'
import SidebarNavigation from '../components/Biodata/SidebarNavigation'
import HeaderSection from '../components/Biodata/HeaderSection'
import { useSectionNavigation } from '../components/Biodata/hooks/useSectionNavigation'
import { useWhatsAppCheck } from '../components/Biodata/hooks/useWhatsAppCheck'
import DataDiriSection from '../components/Biodata/sections/DataDiriSection'
import BiodataOrangTuaSection from '../components/Biodata/sections/BiodataOrangTuaSection'
import AlamatSection from '../components/Biodata/sections/AlamatSection'
import RiwayatPendidikanSection from '../components/Biodata/sections/RiwayatPendidikanSection'
import BiodataWaliSection from '../components/Biodata/sections/BiodataWaliSection'
import InformasiTambahanSection from '../components/Biodata/sections/InformasiTambahanSection'
import StatusPendaftaranSection from '../components/Biodata/sections/StatusPendaftaranSection'
import { useNotification } from '../contexts/NotificationContext'
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext'
import RequiredFieldsModal from '../components/Modal/RequiredFieldsModal'
import Modal from '../components/Modal/Modal'

const NOMOR_DAFTAR_NOTIF = '6285123123399'
function normalizeNomor(v) {
  if (!v) return ''
  const digits = String(v).replace(/\D/g, '')
  if (digits.startsWith('0')) return '62' + digits.slice(1)
  if (!digits.startsWith('62')) return '62' + digits
  return digits
}

function Biodata() {
  const { user } = useAuthStore()
  const { tahunHijriyah, tahunMasehi, loadTahunAjaran } = useTahunAjaranStore()
  const navigate = useNavigate()
  const { setUnsavedChanges, clearUnsavedChanges } = useUnsavedChanges()
  // Initial state: NIK dari sessionStorage (di-set saat login) agar langsung terisi di form tanpa menunggu effect
  const [formData, setFormData] = useState(() => {
    const nikInit = (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') : null) || ''
    const ls = typeof localStorage !== 'undefined' ? localStorage : null
    const statusPendaftarInit = (ls && ls.getItem('daftar_status_pendaftar')) || ''
    const daftarDiniyahInit = (ls && ls.getItem('daftar_diniyah')) || ''
    const daftarFormalInit = (ls && ls.getItem('daftar_formal')) || ''
    const statusSantriInit = (ls && ls.getItem('daftar_status_santri')) || ''
    const statusMuridInit = (ls && ls.getItem('daftar_status_murid')) || ''
    const prodiInit = (ls && ls.getItem('daftar_prodi')) || ''
    return {
    // NIS
    id: '',

    // Data Diri
    nama: '',
    nik: nikInit,
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

    // Biodata Ayah
    ayah: '',
    status_ayah: 'Masih Hidup',
    nik_ayah: '',
    tempat_lahir_ayah: '',
    tanggal_lahir_ayah: '',
    pekerjaan_ayah: '',
    pendidikan_ayah: '',
    penghasilan_ayah: '',

    // Biodata Ibu
    ibu: '',
    status_ibu: 'Masih Hidup',
    nik_ibu: '',
    tempat_lahir_ibu: '',
    tanggal_lahir_ibu: '',
    pekerjaan_ibu: '',
    pendidikan_ibu: '',
    penghasilan_ibu: '',

    // Biodata Wali
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

    // Riwayat Madrasah
    madrasah: '',
    nama_madrasah: '',
    alamat_madrasah: '',
    lulus_madrasah: '',

    // Riwayat Sekolah
    sekolah: '',
    nama_sekolah: '',
    alamat_sekolah: '',
    lulus_sekolah: '',
    npsn: '',
    nsm: '',
    jurusan: '',
    program_sekolah: '',

    // Informasi Tambahan
    no_telpon: '',
    email: '',
    riwayat_sakit: '',
    ukuran_baju: '',
    kip: '',
    pkh: '',
    kks: '',
    status_nikah: '',
    pekerjaan: '',
    no_wa_santri: '',

    // Status Pendaftaran (dari slide pilihan di awal: Pilihan Status, Opsi Pendidikan, Status Murid, Prodi, Status Santri)
    status_pendaftar: statusPendaftarInit,
    daftar_diniyah: daftarDiniyahInit,
    daftar_formal: daftarFormalInit,
    status_murid: statusMuridInit,
    prodi: prodiInit,
    gelombang: '',
    status_santri: statusSantriInit,

    // Kategori & Pendidikan
    kategori: '',
    daerah: '',
    kamar: '',
    diniyah: '',
    kelas_diniyah: '',
    kel_diniyah: '',
    nim_diniyah: '',
    formal: '',
    kelas_formal: '',
    kel_formal: '',
    nim_formal: '',
    lttq: '',
    kelas_lttq: '',
    kel_lttq: '',
  }
  })

  const [hasChanges, setHasChanges] = useState(false)
  const [showRequiredFieldsModal, setShowRequiredFieldsModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [missingRequiredFields, setMissingRequiredFields] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [focusedField, setFocusedField] = useState(null)
  const [justSaved, setJustSaved] = useState(false) // Flag untuk skip validasi setelah save
  const [showPostSaveNotifModal, setShowPostSaveNotifModal] = useState(false)
  const [postSaveNotifNumbers, setPostSaveNotifNumbers] = useState([]) // [{ field: 'telpon'|'wa_santri', number, label }]
  const [showWaMeModal, setShowWaMeModal] = useState(false)
  const [waMeModalFor, setWaMeModalFor] = useState(null) // 'telpon' | 'wa_santri'
  const { showNotification } = useNotification()
  const waCheck = useWhatsAppCheck(showNotification)
  // Daftar kondisi: dari API (semua field yang punya value di DB), di-filter ke field yang disimpan di registrasi
  const [kondisiFields, setKondisiFields] = useState([]) // [{ field_name, field_label, values: [{ value, label }] }, ...]

  const formRef = useRef(null)
  const isLoadingDataRef = useRef(false)
  const hasLoadedForUserIdRef = useRef(null)

  // Use section navigation hook
  const { sectionRefs, activeSection, scrollToSection } = useSectionNavigation()

  // Helper function untuk validasi ID
  const isValidId = (id) => {
    if (!id) return false
    const idStr = String(id).trim()
    // Cek jika ID adalah null, undefined, kosong, atau karakter yang menandakan tidak ada
    const invalidValues = ['', 'null', 'undefined', '-', '0', 'undefined', 'null']
    return idStr !== '' &&
      !invalidValues.includes(idStr) &&
      id !== null &&
      id !== undefined
  }

  // Helper function untuk mendapatkan className label berdasarkan focused state
  const getLabelClassName = (fieldName) => {
    const baseClass = "block text-xs mb-1 transition-colors duration-200"
    if (focusedField === fieldName) {
      return `${baseClass} text-teal-600 dark:text-teal-400 font-semibold`
    }
    return `${baseClass} text-gray-500 dark:text-gray-400`
  }

  // Update kategori options berdasarkan status santri
  const getKategoriOptions = (status) => {
    if (status === 'Khoriji') {
      return ['PAUD', 'SD', 'Banin', 'Banat', 'Kuliah']
    } else if (status) {
      return ['Banin', 'Banat']
    }
    return []
  }

  // Load tahun ajaran saat mount
  useEffect(() => {
    loadTahunAjaran()

    // Refresh setiap 5 menit untuk mendapatkan update dari pengaturan
    const interval = setInterval(() => {
      loadTahunAjaran(true) // Force refresh
    }, 5 * 60 * 1000) // 5 menit

    return () => clearInterval(interval)
  }, [loadTahunAjaran])

  // Field kondisi yang disimpan di tabel psb___registrasi (backend hanya menyimpan kolom ini)
  const REGISTRASI_CONDITION_FIELDS = ['status_pendaftar', 'daftar_diniyah', 'daftar_formal', 'status_murid', 'status_santri']

  // Load semua kondisi dari DB: panggil API tanpa filter, group by field_name (urut sesuai urutan dari API)
  useEffect(() => {
    const loadKondisiFields = async () => {
      try {
        const result = await pendaftaranAPI.getKondisiValues()
        if (!result || !result.success || !Array.isArray(result.data)) {
          setKondisiFields([])
          return
        }
        const rows = result.data
        const seen = new Set()
        const ordered = []
        for (const row of rows) {
          const fn = row.field_name
          if (!fn) continue
          if (!seen.has(fn)) {
            seen.add(fn)
            ordered.push({
              field_name: fn,
              field_label: row.field_label || fn,
              values: []
            })
          }
          const obj = ordered.find(o => o.field_name === fn)
          if (obj) {
            obj.values.push({
              value: row.value,
              label: row.value_label || row.value
            })
          }
        }
        // Hanya tampilkan field yang ada di registrasi (supaya bisa disimpan)
        const allowed = ordered.filter(f => REGISTRASI_CONDITION_FIELDS.includes(f.field_name))
        setKondisiFields(allowed)
      } catch (error) {
        console.warn('Error loading kondisi fields:', error)
        setKondisiFields([])
      }
    }

    loadKondisiFields()
  }, [])

  // Helper: ambil NIK dari user atau sessionStorage (NIK yang dimasukkan saat login)
  const getLoginNik = useCallback(() => {
    return user?.nik || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') : null) || ''
  }, [user?.nik])

  // Initialize form dengan NIK dari user atau sessionStorage (NIK yang dimasukkan saat login)
  useEffect(() => {
    const nikToSet = getLoginNik()
    if (nikToSet && !formData.nik) {
      setFormData(prev => ({ ...prev, nik: nikToSet }))
    }
  }, [getLoginNik])

  // Load data dari API berdasarkan ID dari user (jika ada)
  useEffect(() => {
    const loadDataFromUser = async () => {
      // Tunggu tahun ajaran dimuat dulu
      if (!tahunHijriyah || !tahunMasehi) return

      // Validasi: jika user tidak punya ID, redirect ke login
      if (!isValidId(user?.id)) {
        console.warn('User ID tidak valid. Redirecting to login...', { user, userId: user?.id })
        resetCsrfToken()
        const authStore = useAuthStore.getState()
        authStore.logout()
        window.location.href = '/login'
        return
      }

      // User ID valid, lanjutkan load data
      setIsLoading(true)
      isLoadingDataRef.current = true

      try {
        // Jika ada draft di localStorage (perubahan yang belum disimpan ke server), pakai itu dulu
        const draftRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('daftar_biodata_draft') : null
        if (draftRaw) {
          try {
            const parsed = JSON.parse(draftRaw)
            if (parsed && typeof parsed === 'object' && (parsed.nik || parsed.nama)) {
              setFormData(parsed)
              setHasChanges(true)
              setIsLoading(false)
              isLoadingDataRef.current = false
              return
            }
          } catch (_) {}
        }

        const biodataResponse = await pendaftaranAPI.getBiodata(user.id)

        if (biodataResponse.success && biodataResponse.data) {
          const biodata = biodataResponse.data

          // Tampilan untuk pendaftar: NIS 7 digit. Backend id santri = acuan API, tidak wajib sama dengan yang tampil.
          const nisDisplay = (biodata.nis && /^\d{7}$/.test(String(biodata.nis)))
            ? String(biodata.nis)
            : (biodata.id != null && biodata.id !== '' ? String(biodata.id) : '')
          const nikFallback = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') : null
          const newFormData = {
            id: nisDisplay,
            nama: biodata.nama || '',
            nik: biodata.nik || user.nik || nikFallback || '',
            gender: biodata.gender || '',
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

            // Riwayat sekolah dan madrasah (Akan diupdate dari psb___registrasi di bawah jika ada)
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

            no_telpon: biodata.no_telpon || '',
            // Email wajib diisi - load dari database
            // Jika email null atau empty di database, tetap set ke empty string (akan divalidasi saat save)
            email: biodata.email ? String(biodata.email).trim() : '',
            riwayat_sakit: biodata.riwayat_sakit || '',
            ukuran_baju: biodata.ukuran_baju || '',
            kip: biodata.kip || '',
            pkh: biodata.pkh || '',
            kks: biodata.kks || '',
            status_nikah: biodata.status_nikah || '',
            pekerjaan: biodata.pekerjaan || '',
            no_wa_santri: biodata.no_wa_santri || '',
            status_santri: biodata.status_santri || '',
            kategori: biodata.kategori || '',
            daerah: biodata.daerah || '',
            kamar: biodata.kamar || '',
            diniyah: biodata.diniyah || '',
            kelas_diniyah: biodata.kelas_diniyah || '',
            kel_diniyah: biodata.kel_diniyah || '',
            nim_diniyah: biodata.nim_diniyah || '',
            formal: biodata.formal || '',
            kelas_formal: biodata.kelas_formal || '',
            kel_formal: biodata.kel_formal || '',
            nim_formal: biodata.nim_formal || '',
            lttq: biodata.lttq || '',
            kelas_lttq: biodata.kelas_lttq || '',
            kel_lttq: biodata.kel_lttq || '',
            prodi: biodata.prodi || '',
            gelombang: '',
            status_pendaftar: '',
            daftar_diniyah: '',
            daftar_formal: '',
            status_murid: '',
          }

          // Load data registrasi jika ada
          const registrasiResponse = await pendaftaranAPI.getRegistrasi(
            user.id,
            tahunHijriyah,
            tahunMasehi
          )
          if (registrasiResponse.success && registrasiResponse.data) {
            const registrasi = registrasiResponse.data
            newFormData.status_pendaftar = registrasi.status_pendaftar || ''
            newFormData.daftar_diniyah = registrasi.daftar_diniyah || ''
            newFormData.daftar_formal = registrasi.daftar_formal || ''
            newFormData.status_murid = registrasi.status_murid || ''
            newFormData.status_santri = registrasi.status_santri || ''
            newFormData.prodi = registrasi.prodi || ''
            // Gunakan gelombang dari registrasi jika ada, jika tidak gunakan gelombang aktif
            const { getGelombangAktif } = useTahunAjaranStore.getState()
            const gelombangAktif = getGelombangAktif()
            newFormData.gelombang = registrasi.gelombang || gelombangAktif || ''

            // Riwayat sekolah dan madrasah diambil dari psb___registrasi (sesuai UWABA)
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
          } else {
            // Belum ada registrasi tahun ini - gunakan pilihan dari halaman Pilihan Status, Opsi Pendidikan & Status Santri
            try {
              const savedPendaftar = localStorage.getItem('daftar_status_pendaftar')
              if (savedPendaftar === 'Baru' || savedPendaftar === 'Lama') {
                newFormData.status_pendaftar = savedPendaftar
              }
              const savedDiniyah = localStorage.getItem('daftar_diniyah')
              if (savedDiniyah && savedDiniyah !== '') {
                newFormData.daftar_diniyah = savedDiniyah
              }
              const savedFormal = localStorage.getItem('daftar_formal')
              if (savedFormal && savedFormal !== '') {
                newFormData.daftar_formal = savedFormal
              }
              const savedSantri = localStorage.getItem('daftar_status_santri')
              if (savedSantri === 'Mukim' || savedSantri === 'Khoriji') {
                newFormData.status_santri = savedSantri
              }
              const savedMurid = localStorage.getItem('daftar_status_murid')
              if (savedMurid && savedMurid !== '') {
                newFormData.status_murid = savedMurid
              }
              const savedProdi = localStorage.getItem('daftar_prodi')
              if (savedProdi && savedProdi !== '') {
                newFormData.prodi = savedProdi
              }
            } catch (e) { /* ignore */ }
          }

          setFormData(newFormData)
          setHasChanges(false)
        } else {
          console.warn('Data santri tidak ditemukan di database.', { response: biodataResponse, userId: user.id })
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setIsLoading(false)
        setTimeout(() => {
          isLoadingDataRef.current = false
        }, 100)
      }
    }

    // Load data sekali saja per user.id agar tidak overwrite input saat user mengetik atau setelah save
    const uid = user?.id != null ? String(user.id) : null
    if (uid && tahunHijriyah && tahunMasehi && hasLoadedForUserIdRef.current !== uid) {
      hasLoadedForUserIdRef.current = uid
      loadDataFromUser()
    }
  }, [user?.id, tahunHijriyah, tahunMasehi])

  // Muat draft dari localStorage untuk santri baru (belum punya user.id) saat buka halaman
  const hasLoadedDraftRef = useRef(false)
  useEffect(() => {
    if (hasLoadedDraftRef.current) return
    if (!tahunHijriyah || !tahunMasehi) return
    if (isValidId(user?.id)) return // Yang punya id di-handle di loadDataFromUser (draft diprioritaskan di sana)
    hasLoadedDraftRef.current = true
    try {
      const draftRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('daftar_biodata_draft') : null
      if (draftRaw) {
        const parsed = JSON.parse(draftRaw)
        if (parsed && typeof parsed === 'object' && (parsed.nik || parsed.nama)) {
          setFormData(parsed)
          setHasChanges(true)
        }
      }
    } catch (_) {}
  }, [tahunHijriyah, tahunMasehi, user?.id])

  // Santri baru (belum punya id): isi dari localStorage sekali saja, jangan overwrite saat user mengetik
  const hasFilledFromStorageRef = useRef(false)
  useEffect(() => {
    if (!user || user.id || hasFilledFromStorageRef.current) return
    hasFilledFromStorageRef.current = true
    try {
      setFormData(prev => {
        let updated = false
        const next = { ...prev }
        if ((prev.status_pendaftar || '') === '') {
          const saved = localStorage.getItem('daftar_status_pendaftar')
          if (saved === 'Baru' || saved === 'Lama') { next.status_pendaftar = saved; updated = true }
        }
        if ((prev.daftar_diniyah || '') === '') {
          const saved = localStorage.getItem('daftar_diniyah')
          if (saved && saved !== '') { next.daftar_diniyah = saved; updated = true }
        }
        if ((prev.daftar_formal || '') === '') {
          const saved = localStorage.getItem('daftar_formal')
          if (saved && saved !== '') { next.daftar_formal = saved; updated = true }
        }
        if ((prev.status_santri || '') === '') {
          const saved = localStorage.getItem('daftar_status_santri')
          if (saved === 'Mukim' || saved === 'Khoriji') { next.status_santri = saved; updated = true }
        }
        if ((prev.status_murid || '') === '') {
          const saved = localStorage.getItem('daftar_status_murid')
          if (saved && saved !== '') { next.status_murid = saved; updated = true }
        }
        if ((prev.prodi || '') === '') {
          const saved = localStorage.getItem('daftar_prodi')
          if (saved && saved !== '') { next.prodi = saved; updated = true }
        }
        return updated ? next : prev
      })
    } catch (e) { /* ignore */ }
  }, [user?.id])

  const DRAFT_STORAGE_KEY = 'daftar_biodata_draft'

  // Simpan formData ke sessionStorage (validasi Berkas) dan localStorage (tetap ada saat ditinggal/masuk lagi)
  useEffect(() => {
    if (formData.nik || formData.nama) {
      sessionStorage.setItem('pendaftaranData', JSON.stringify(formData))
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData))
      } catch (e) {
        // quota / private mode
      }
    }
  }, [formData])

  // Handle perubahan field
  const handleFieldChange = (field, value) => {
    // ID tidak bisa diubah manual oleh pendaftar
    if (field === 'id') {
      return
    }

    // Khusus untuk field NIK - auto extract tempat lahir, tanggal lahir, dan gender (real-time)
    if (field === 'nik') {
      // Hanya filter angka dan batasi 16 digit
      const numericValue = value.replace(/\D/g, '').slice(0, 16)

      setFormData(prev => {
        const updated = { ...prev, [field]: numericValue }

        // Extract tempat lahir jika sudah 4 digit atau lebih
        if (numericValue.length >= 4) {
          const tempatLahir = extractTempatLahirFromNIK(numericValue)
          if (tempatLahir) {
            // Selalu update tempat lahir dari NIK (real-time)
            updated.tempat_lahir = tempatLahir
          } else {
            // Jika kode wilayah tidak dikenal, kosongkan tempat lahir yang auto-filled
            // Cek apakah tempat lahir sebelumnya berasal dari NIK sebelumnya
            if (prev.nik && prev.nik.length >= 4) {
              const prevTempatFromNik = extractTempatLahirFromNIK(prev.nik)
              if (prevTempatFromNik === prev.tempat_lahir) {
                updated.tempat_lahir = ''
              }
            }
          }
        } else {
          // Jika kurang dari 4 digit, kosongkan tempat lahir yang auto-filled dari NIK
          if (prev.nik && prev.nik.length >= 4) {
            const prevTempatFromNik = extractTempatLahirFromNIK(prev.nik)
            if (prevTempatFromNik === prev.tempat_lahir) {
              updated.tempat_lahir = ''
            }
          }
        }

        // Extract gender jika sudah 8 digit atau lebih
        if (numericValue.length >= 8) {
          const gender = extractGenderFromNIK(numericValue)
          if (gender) {
            // Selalu update gender dari NIK (real-time, NIK adalah sumber kebenaran)
            updated.gender = gender

            // Auto-fill kategori berdasarkan gender yang di-extract dari NIK
            if (gender === 'Laki-laki') {
              const kategoriOptions = getKategoriOptions(updated.status_santri)
              if (kategoriOptions.includes('Banin')) {
                updated.kategori = 'Banin'
              }
            } else if (gender === 'Perempuan') {
              const kategoriOptions = getKategoriOptions(updated.status_santri)
              if (kategoriOptions.includes('Banat')) {
                updated.kategori = 'Banat'
              }
            }
          }
        } else {
          // Jika kurang dari 8 digit, kosongkan gender yang auto-filled dari NIK
          if (prev.nik && prev.nik.length >= 8) {
            const prevGenderFromNik = extractGenderFromNIK(prev.nik)
            if (prevGenderFromNik === prev.gender) {
              updated.gender = ''
            }
          }
        }

        // Extract tanggal lahir jika sudah 12 digit atau lebih
        if (numericValue.length >= 12) {
          const tanggalLahir = extractTanggalLahirFromNIK(numericValue)
          if (tanggalLahir) {
            // Selalu update tanggal lahir dari NIK (real-time)
            updated.tanggal_lahir = tanggalLahir
          } else {
            // Jika tanggal tidak valid, kosongkan jika sebelumnya auto-filled dari NIK
            if (prev.nik && prev.nik.length >= 12) {
              const prevTanggalFromNik = extractTanggalLahirFromNIK(prev.nik)
              if (prevTanggalFromNik === prev.tanggal_lahir) {
                updated.tanggal_lahir = ''
              }
            }
          }
        } else {
          // Jika kurang dari 12 digit, kosongkan tanggal lahir yang auto-filled dari NIK
          if (prev.nik && prev.nik.length >= 12) {
            const prevTanggalFromNik = extractTanggalLahirFromNIK(prev.nik)
            if (prevTanggalFromNik === prev.tanggal_lahir) {
              updated.tanggal_lahir = ''
            }
          }
        }

        return updated
      })
      setHasChanges(true)
      return
    } else if (field === 'nik_ayah' || field === 'nik_ibu' || field === 'nik_wali') {
      // Hanya filter angka dan batasi 16 digit
      const numericValue = value.replace(/\D/g, '').slice(0, 16)

      setFormData(prev => {
        const updated = { ...prev, [field]: numericValue }

        // Tentukan field tanggal lahir yang sesuai
        let tanggalLahirField = ''
        if (field === 'nik_ayah') {
          tanggalLahirField = 'tanggal_lahir_ayah'
        } else if (field === 'nik_ibu') {
          tanggalLahirField = 'tanggal_lahir_ibu'
        } else if (field === 'nik_wali') {
          tanggalLahirField = 'tanggal_lahir_wali'
        }

        // Extract tanggal lahir jika sudah 12 digit atau lebih (real-time)
        if (numericValue.length >= 12 && tanggalLahirField) {
          const tanggalLahir = extractTanggalLahirFromNIK(numericValue)

          if (tanggalLahir) {
            // Selalu update tanggal lahir dari NIK (real-time)
            updated[tanggalLahirField] = tanggalLahir
          } else {
            // Jika tanggal tidak valid, kosongkan jika sebelumnya auto-filled dari NIK
            if (prev[field] && prev[field].length >= 12) {
              const prevTanggalFromNik = extractTanggalLahirFromNIK(prev[field])
              if (prevTanggalFromNik === prev[tanggalLahirField]) {
                updated[tanggalLahirField] = ''
              }
            }
          }
        } else {
          // Jika kurang dari 12 digit, kosongkan tanggal lahir yang auto-filled dari NIK
          if (tanggalLahirField && prev[field] && prev[field].length >= 12) {
            const prevTanggalFromNik = extractTanggalLahirFromNIK(prev[field])
            if (prevTanggalFromNik === prev[tanggalLahirField]) {
              updated[tanggalLahirField] = ''
            }
          }
        }

        return updated
      })
      setHasChanges(true)
      return
    }

    setFormData(prev => {
      const updated = { ...prev, [field]: value }

      // Auto-fill kategori berdasarkan gender
      if (field === 'gender') {
        // Jika gender berubah, auto-fill kategori
        if (value === 'Laki-laki') {
          // Cek apakah kategori "Banin" valid berdasarkan status_santri
          const kategoriOptions = getKategoriOptions(updated.status_santri)
          if (kategoriOptions.includes('Banin')) {
            updated.kategori = 'Banin'
          }
        } else if (value === 'Perempuan') {
          // Cek apakah kategori "Banat" valid berdasarkan status_santri
          const kategoriOptions = getKategoriOptions(updated.status_santri)
          if (kategoriOptions.includes('Banat')) {
            updated.kategori = 'Banat'
          }
        }
      }

      return updated
    })
    setHasChanges(true)
  }

  // Fungsi untuk cek field wajib yang belum diisi
  const checkRequiredFields = useCallback(() => {
    const missing = []

    if (!formData.nik || formData.nik.length !== 16) {
      missing.push({ field: 'nik', label: 'NIK (16 digit angka)' })
    }
    if (!formData.nama || formData.nama.trim() === '') {
      missing.push({ field: 'nama', label: 'Nama Lengkap' })
    }
    if (!formData.gender || formData.gender === '') {
      missing.push({ field: 'gender', label: 'Jenis Kelamin' })
    }
    if (!formData.tempat_lahir || formData.tempat_lahir.trim() === '') {
      missing.push({ field: 'tempat_lahir', label: 'Tempat Lahir' })
    }
    if (!formData.tanggal_lahir || formData.tanggal_lahir === '') {
      missing.push({ field: 'tanggal_lahir', label: 'Tanggal Lahir' })
    }
    if (!formData.no_kk || formData.no_kk.length !== 16) {
      missing.push({ field: 'no_kk', label: 'No. KK (16 digit angka)' })
    }
    if (!formData.kepala_keluarga || formData.kepala_keluarga.trim() === '') {
      missing.push({ field: 'kepala_keluarga', label: 'Kepala Keluarga' })
    }
    if (!formData.saudara_di_pesantren || formData.saudara_di_pesantren === '') {
      missing.push({ field: 'saudara_di_pesantren', label: 'Saudara di Pesantren' })
    }
    if (!formData.ayah || formData.ayah.trim() === '') {
      missing.push({ field: 'ayah', label: 'Nama Ayah' })
    }
    if (!formData.status_ayah || formData.status_ayah === '') {
      missing.push({ field: 'status_ayah', label: 'Status Ayah' })
    }
    if (!formData.ibu || formData.ibu.trim() === '') {
      missing.push({ field: 'ibu', label: 'Nama Ibu' })
    }
    if (!formData.status_ibu || formData.status_ibu === '') {
      missing.push({ field: 'status_ibu', label: 'Status Ibu' })
    }
    if (!formData.no_telpon || formData.no_telpon.trim() === '') {
      missing.push({ field: 'no_telpon', label: 'No. Telpon (Nomor Wali)' })
    }
    // Email wajib diisi
    if (!formData.email || formData.email.trim() === '') {
      missing.push({ field: 'email', label: 'Email' })
    }
    // Status Santri wajib diisi
    if (!formData.status_santri || formData.status_santri.trim() === '') {
      missing.push({ field: 'status_santri', label: 'Status Santri' })
    }
    // Daftar Formal wajib diisi
    if (!formData.daftar_formal || formData.daftar_formal.trim() === '') {
      missing.push({ field: 'daftar_formal', label: 'Daftar Formal' })
    }
    // Daftar Diniyah wajib diisi
    if (!formData.daftar_diniyah || formData.daftar_diniyah.trim() === '') {
      missing.push({ field: 'daftar_diniyah', label: 'Daftar Diniyah' })
    }
    // Status Murid wajib diisi jika Daftar Formal SMP, MTs, SMAI, atau STAI
    const formalPerluStatusMurid = ['SMP', 'MTs', 'SMAI', 'STAI']
    if (formalPerluStatusMurid.includes(formData.daftar_formal)) {
      if (!formData.status_murid || formData.status_murid.trim() === '') {
        missing.push({ field: 'status_murid', label: 'Status Murid' })
      }
    }

    // Return format yang sesuai untuk validateBeforeNavigate
    return {
      valid: missing.length === 0,
      missingFields: missing
    }
  }, [formData])

  // Handle save data
  const saveData = useCallback(async () => {
    console.log('Save button clicked, formData:', formData)

    // Validasi field wajib
    const validation = checkRequiredFields()
    if (!validation.valid && validation.missingFields && validation.missingFields.length > 0) {
      const fieldLabels = validation.missingFields.map(f => f.label).join(', ')
      showNotification(`Data wajib belum lengkap: ${fieldLabels}`, 'warning')
      return
    }
    // Validasi format email (email wajib diisi)
    if (!formData.email || formData.email.trim() === '') {
      showNotification('Email wajib diisi', 'warning')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email.trim())) {
      showNotification('Format email tidak valid', 'warning')
      return
    }

    // Jika ID belum ada (santri baru), biarkan kosong - backend akan generate
    // Jika NIS sudah ada, validasi harus 7 digit
    // Handle case dimana id bisa string atau number
    if (formData.id && String(formData.id).trim() !== '' && !/^\d{7}$/.test(String(formData.id))) {
      showNotification('NIS harus 7 digit angka atau kosongkan untuk santri baru', 'warning')
      return
    }

    setIsSaving(true)
    // Set flag justSaved SEBELUM save untuk mencegah validasi trigger
    setJustSaved(true)
    
    try {
      // Pastikan data terbaru dari form terkirim
      // id_admin diset null karena user di aplikasi daftar adalah santri, bukan pengurus
      // (Foreign key psb___registrasi.id_admin merujuk ke tabel pengurus)
      // Email wajib diisi, sudah divalidasi di atas
      const emailToSave = formData.email.trim()
      
      // Log untuk debugging
      console.log('Email to save:', emailToSave, 'Original formData.email:', formData.email, 'Has ID:', !!formData.id)

      // id untuk backend = santri PK (user.id dari backend) saat update saja; santri baru jangan kirim id (biar AUTO_INCREMENT)
      const santriIdForSave = user?.id != null && user?.id !== '' ? String(user.id) : null
      const biodataPayload = {
        ...formData,
        email: emailToSave, // Gunakan email yang diisi atau default
        id: santriIdForSave,
        id_admin: null,
        tahun_hijriyah: tahunHijriyah,
        tahun_masehi: tahunMasehi,
        nama: formData.nama,
        gender: formData.gender,
        status_pendaftar: formData.status_pendaftar,
        daftar_diniyah: formData.daftar_diniyah,
        daftar_formal: formData.daftar_formal,
        status_murid: formData.status_murid,
        prodi: formData.prodi,
        gelombang: formData.gelombang,
        status_santri: formData.status_santri
      }

      console.log('Sending save request with payload:', biodataPayload)
      const biodataResponse = await pendaftaranAPI.saveBiodata(biodataPayload)

      if (!biodataResponse.success) {
        // Reset flag jika save gagal
        setJustSaved(false)
        throw new Error(biodataResponse.message || 'Gagal menyimpan biodata')
      }

      // Backend mengembalikan id santri (acuan API) dan nis (7 digit, yang ditampilkan ke pendaftar)
      if (biodataResponse.data && biodataResponse.data.id) {
        const idSantri = String(biodataResponse.data.id)
        const nis = biodataResponse.data.nis != null ? String(biodataResponse.data.nis) : ''
        hasLoadedForUserIdRef.current = idSantri
        const authStore = useAuthStore.getState()
        authStore.setAuth(authStore.token, {
          ...user,
          id: idSantri,
          nama: formData.nama || user?.nama || '',
          nik: formData.nik || user?.nik || '',
          role_key: user?.role_key || 'santri',
          role_label: user?.role_label || 'Santri',
          allowed_apps: user?.allowed_apps || ['daftar'],
          permissions: user?.permissions || []
        })
        setFormData(prev => ({ ...prev, id: nis }))
      }

      setHasChanges(false)
      clearUnsavedChanges()
      showNotification('Data pendaftaran berhasil disimpan!', 'success')
      try {
        localStorage.removeItem('daftar_biodata_draft')
        localStorage.removeItem('daftar_status_pendaftar')
        localStorage.removeItem('daftar_diniyah')
        localStorage.removeItem('daftar_formal')
        localStorage.removeItem('daftar_status_santri')
        localStorage.removeItem('daftar_status_murid')
        localStorage.removeItem('daftar_prodi')
      } catch (e) { /* ignore */ }

      // Setelah simpan, cek nomor yang bisa diaktifkan notifikasi WA (belum di kontak atau notif off)
      const noTelpon = normalizeNomor(formData.no_telpon)
      const noWaSantri = normalizeNomor(formData.no_wa_santri)
      const toCheck = []
      if (noTelpon.length >= 10) toCheck.push({ field: 'telpon', number: noTelpon, label: 'No. Telpon (Wali)' })
      if (noWaSantri.length >= 10 && noWaSantri !== noTelpon) toCheck.push({ field: 'wa_santri', number: noWaSantri, label: 'No. WA Santri' })
      if (toCheck.length > 0) {
        const results = await Promise.all(toCheck.map(async (item) => {
          try {
            const res = await pendaftaranAPI.getWhatsAppKontakStatus(item.number)
            if (res?.success && (!res.exists || !res.siap_terima_notif)) return item
          } catch { /* skip */ }
          return null
        }))
        const needActivation = results.filter(Boolean)
        if (needActivation.length > 0) {
          setPostSaveNotifNumbers(needActivation)
          setShowPostSaveNotifModal(true)
          pendaftaranAPI.getWaWake().catch(() => {})
        }
      }

      // Reset flag setelah 3 detik (cukup waktu untuk semua state ter-update)
      setTimeout(() => {
        setJustSaved(false)
      }, 3000)

      // Sinkronkan keterangan_status di backend (jalan di background)
      const currentUserId = biodataResponse.data?.id ? String(biodataResponse.data.id) : (user?.id ? String(user.id) : null)
      if (currentUserId && tahunHijriyah && tahunMasehi) {
        pendaftaranAPI.syncKeteranganStatus({
          id_santri: currentUserId,
          tahun_hijriyah: tahunHijriyah,
          tahun_masehi: tahunMasehi
        }).catch(() => {})
      }
    } catch (error) {
      console.error('Error saving data:', error)
      
      // Reset flag jika error
      setJustSaved(false)

      // Tampilkan notifikasi error
      const errorMessage = error.response?.data?.message || error.message || 'Terjadi kesalahan saat menyimpan data'
      showNotification(errorMessage, 'error')
      
      // Jangan redirect ke login jika error, biarkan user tetap di halaman untuk memperbaiki data
      // Axios interceptor akan handle redirect jika memang token tidak valid
    } finally {
      setIsSaving(false)
    }
  }, [formData, tahunHijriyah, tahunMasehi, user, showNotification, navigate, clearUnsavedChanges])

  // Wrapper handleSave untuk konfirmasi NIK & Gender (Hanya untuk ID Baru)
  const handleSave = useCallback(() => {
    // Validasi field wajib
    const validation = checkRequiredFields()
    if (!validation.valid && validation.missingFields && validation.missingFields.length > 0) {
      const fieldLabels = validation.missingFields.map(f => f.label).join(', ')
      showNotification(`Data wajib belum lengkap: ${fieldLabels}`, 'warning')
      return
    }

    // Jika ID belum ada (santri baru), tampilkan modal konfirmasi
    if (!formData.id || String(formData.id).trim() === '') {
      setShowConfirmModal(true)
    } else {
      saveData()
    }
  }, [formData.id, checkRequiredFields, showNotification, saveData])

  const handleConfirmSave = () => {
    setShowConfirmModal(false)
    saveData()
  }

  useEffect(() => {
    if (hasChanges) {
      setUnsavedChanges(true, handleSave, checkRequiredFields)
    } else {
      clearUnsavedChanges()
    }
  }, [hasChanges, setUnsavedChanges, clearUnsavedChanges, handleSave, checkRequiredFields])

  // Notif saat pindah tab browser: ingatkan simpan jika ada perubahan yang belum disimpan ke server
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasChanges) {
        showNotification('Ada perubahan yang belum disimpan. Simpan ke server?', 'warning')
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [hasChanges, showNotification])

  return (
    <div className="h-full overflow-hidden bg-white dark:bg-gray-900 rounded-lg shadow-sm flex flex-col relative">
      {/* Sidebar Navigation - Fixed di kiri */}
      <SidebarNavigation
        isOpen={isSidebarOpen}
        activeSection={activeSection}
        scrollToSection={scrollToSection}
      />

      {/* Header dengan ID Input dan Tombol - Fixed */}
      <HeaderSection
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        onSave={handleSave}
        isSaving={isSaving}
        isLoading={isLoading}
        formDataId={formData.id}
        hasChanges={hasChanges}
        formData={formData}
      />

      {/* Scrollable Content Area */}
      <div className={`flex-1 overflow-y-auto min-h-0 p-6 transition-all duration-300 ${isSidebarOpen ? 'ml-12' : 'ml-0'
        }`}>
        <style>{`
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
          .dark div::-webkit-scrollbar-thumb {
            background: transparent;
          }
          .dark div:hover::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
          .dark div::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
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
          />

          {/* Status Pendaftaran (termasuk Daerah & Kamar jika status santri Mukim) */}
          <StatusPendaftaranSection
            sectionRef={sectionRefs.statusPendaftaran}
            formData={formData}
            onFieldChange={handleFieldChange}
            focusedField={focusedField}
            onFocus={setFocusedField}
            onBlur={() => setFocusedField(null)}
            getLabelClassName={getLabelClassName}
            kondisiFields={kondisiFields}
          />
        </form>

        {/* Spacer untuk mobile - agar tidak terhalang navigasi bawah */}
        <div className="h-24 md:h-8"></div>
      </div>



      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Konfirmasi Data"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="flex items-center gap-4 mb-6 text-amber-600 dark:text-amber-400">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-full">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold">Cek Sekali Lagi!</h3>
              <p className="text-sm opacity-90">Pastikan NIK dan Jenis Kelamin sudah benar.</p>
            </div>
          </div>

          <div className="space-y-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">NIK (Nomor Induk Kependudukan)</label>
              <div className="text-lg font-mono font-bold tracking-wider text-teal-600 dark:text-teal-400">
                {formData.nik}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Jenis Kelamin</label>
              <div className="text-base font-semibold text-gray-800 dark:text-gray-200">
                {formData.gender}
              </div>
            </div>
          </div>

          <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-6 flex gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            ID pendaftaran hanya bisa dibuat satu kali. Kesalahan NIK dapat menghambat proses verifikasi.
          </p>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="flex-1 px-4 py-3 border-2 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl font-semibold hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Perbaiki
            </button>
            <button
              onClick={handleConfirmSave}
              className="flex-1 px-4 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2"
            >
              <span>Benar, Simpan</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>
      </Modal>

      {/* Required Fields Modal */}
      <RequiredFieldsModal
        isOpen={showRequiredFieldsModal}
        onClose={() => setShowRequiredFieldsModal(false)}
        requiredFields={missingRequiredFields}
      />

      {/* Modal setelah Simpan: opsi aktifkan notifikasi WA untuk nomor yang belum notif on */}
      <Modal
        isOpen={showPostSaveNotifModal}
        onClose={() => setShowPostSaveNotifModal(false)}
        title="Aktifkan notifikasi WhatsApp"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Data berhasil disimpan. Ingin mengaktifkan notifikasi WhatsApp untuk nomor berikut?
          </p>
          <ul className="space-y-3 mb-6">
            {postSaveNotifNumbers.map((item) => (
              <li key={item.field} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                <div>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{item.label}</span>
                  <span className="block text-sm text-gray-500 dark:text-gray-400">{item.number}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPostSaveNotifModal(false)
                    setWaMeModalFor(item.field)
                    setShowWaMeModal(true)
                  }}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Aktifkan notifikasi WA
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowPostSaveNotifModal(false)}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 rounded-lg font-medium transition-colors"
            >
              Lewati
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal wa.me: Aktifkan notifikasi untuk nomor saya (setelah pilih dari modal atas) */}
      <Modal
        isOpen={showWaMeModal}
        onClose={() => { setShowWaMeModal(false); setWaMeModalFor(null) }}
        title="Aktifkan notifikasi WhatsApp"
        maxWidth="max-w-sm"
      >
        <div className="p-5">
          <p className="text-gray-600 dark:text-gray-300 mb-4">
            Aktifkan notifikasi whatsapp untuk nomor saya.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => {
                pendaftaranAPI.getWaWake().catch(() => {})
                const lines = ['Daftar Notifikasi']
                if (formData.nama) lines.push(`Nama: ${formData.nama}`)
                if (formData.nik) lines.push(`NIK: ${formData.nik}`)
                const num = waMeModalFor === 'telpon' ? String(formData.no_telpon || '').replace(/\D/g, '') : String(formData.no_wa_santri || '').replace(/\D/g, '')
                const nomor62 = num.startsWith('0') ? '62' + num.slice(1) : (num.startsWith('62') ? num : '62' + num)
                if (nomor62.length >= 12) lines.push(`No WA: ${nomor62}`)
                const text = lines.join('\n')
                const url = `https://wa.me/${NOMOR_DAFTAR_NOTIF}?text=${encodeURIComponent(text)}`
                window.open(url, '_blank', 'noopener,noreferrer')
                setShowWaMeModal(false)
                setWaMeModalFor(null)
              }}
              className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
            >
              Aktifkan via WhatsApp
            </button>
            <button
              type="button"
              onClick={() => { setShowWaMeModal(false); setWaMeModalFor(null) }}
              className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors"
            >
              Batal
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Biodata
