import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { pendaftaranAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { useTahunAjaranStore } from '../store/tahunAjaranStore'
import { useBiodataViewStore } from '../store/biodataViewStore'
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
import BiodataReadOnlyView from '../components/Biodata/BiodataReadOnlyView'
import { FEATURE_DAFTAR_WA_NOTIF_UI } from '../config/featureFlags'
import { normalizeNisForStorage } from '../utils/clientStorage'
import {
  biodataCacheMatchesUser,
  getBiodataFullCacheKey,
  parseServerTimestamp,
  readBiodataFullCache,
  writeBiodataFullCache,
} from '../utils/biodataLocalCache'
import {
  buildBiodataFormFromApis,
  mergeRegistrasiSlice,
  mergeSantriSlice,
} from '../utils/biodataFormFromApi'
import { invalidateAfterBiodataSave } from '../utils/daftarPagesLocalCache'

const NOMOR_DAFTAR_NOTIF = '6285123123399'

/**
 * Bandingkan isi draft localStorage dengan snapshot server.
 * Hanya field yang ada di serverForm yang dicek — menghindari false positive "belum simpan"
 * saat draft hanya hasil autosave identik dengan data terbaru dari API.
 */
function biodataDraftDiffersFromServer(draft, serverForm) {
  if (!draft || typeof draft !== 'object') return false
  if (!serverForm || typeof serverForm !== 'object') return true
  for (const key of Object.keys(serverForm)) {
    const s = serverForm[key]
    const ss = s == null || s === undefined ? '' : String(s).trim()
    // Field yang tidak ada di draft (versi lama / autosave parsial) dianggap sama dengan server
    const d = Object.prototype.hasOwnProperty.call(draft, key) ? draft[key] : s
    const ds = d == null || d === undefined ? '' : String(d).trim()
    if (ds !== ss) return true
  }
  return false
}

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
  const hasUserEditedRef = useRef(false)
  const hasLoadedFromServerRef = useRef(false)
  const [showRequiredFieldsModal, setShowRequiredFieldsModal] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [missingRequiredFields, setMissingRequiredFields] = useState([])
  /** Tombol Simpan: hanya boleh dinilai setelah load biodata selesai (atau tidak perlu load). */
  const [biodataReady, setBiodataReady] = useState(false)
  /** Mode baca: tombol Edit aktif setelah fetch ke server selesai (termasuk sinkron dari cache). */
  const [biodataServerSynced, setBiodataServerSynced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [focusedField, setFocusedField] = useState(null)
  const [justSaved, setJustSaved] = useState(false) // Flag untuk skip validasi setelah save
  const [showPostSaveNotifModal, setShowPostSaveNotifModal] = useState(false)
  const [postSaveNotifNumbers, setPostSaveNotifNumbers] = useState([]) // [{ field: 'telpon'|'wa_santri', number, label }]
  const [showWaMeModal, setShowWaMeModal] = useState(false)
  const [waMeModalFor, setWaMeModalFor] = useState(null) // 'telpon' | 'wa_santri'
  const { showNotification } = useNotification()
  const biodataViewMode = useBiodataViewStore((s) => s.biodataViewMode)
  const enterBiodataReadMode = useBiodataViewStore((s) => s.enterBiodataReadMode)
  const enterBiodataEditMode = useBiodataViewStore((s) => s.enterBiodataEditMode)
  const biodataEditIntent = useBiodataViewStore((s) => s.biodataEditIntent)
  const waCheck = useWhatsAppCheck(showNotification)
  // Daftar kondisi: dari API (semua field yang punya value di DB), di-filter ke field yang disimpan di registrasi
  const [kondisiFields, setKondisiFields] = useState([]) // [{ field_name, field_label, values: [{ value, label }] }, ...]

  const formRef = useRef(null)
  /** Meta sinkron server: id_santri, id_registrasi, nis, tanggal_update_*, nik_snapshot */
  const syncMetaRef = useRef(null)
  const [biodataServerTimestamps, setBiodataServerTimestamps] = useState({
    tanggal_update_santri: null,
    tanggal_update_registrasi: null,
  })
  const applySyncMeta = useCallback((meta) => {
    syncMetaRef.current = meta
    setBiodataServerTimestamps({
      tanggal_update_santri: meta?.tanggal_update_santri ?? null,
      tanggal_update_registrasi: meta?.tanggal_update_registrasi ?? null,
    })
  }, [])
  const hydratedFromCacheRef = useRef(false)
  const persistDebounceRef = useRef(null)
  const hasChangesRef = useRef(false)
  /**
   * Cegah localStorage draft ditulis saat mount pertama (form masih snapshot kosong/default).
   * Jika draft tertimpa snapshot parsial, saat fetch API selesai merge { ...server, ...draft }
   * justru menimpa data server dengan string kosong → tampak "simpan tidak jalan" / kembali ke data lama.
   */
  const biodataHydratedRef = useRef(false)

  // Use section navigation hook (reobserve saat ganti mode baca/ubah)
  const { sectionRefs, activeSection, scrollToSection } = useSectionNavigation(biodataViewMode)

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

  const userHasStoredNis = (u) => {
    const n = u?.nis != null ? String(u.nis).trim() : ''
    return /^\d{7}$/.test(n)
  }

  useEffect(() => {
    hasChangesRef.current = hasChanges
  }, [hasChanges])

  // Sebelum paint: mode baca jika NIS tersimpan; muat cache penuh v2 agar tab Biodata tampil instan.
  useLayoutEffect(() => {
    const u = useAuthStore.getState().user
    if (userHasStoredNis(u) && isValidId(u?.id)) {
      useBiodataViewStore.getState().enterBiodataReadMode()
    }
    hydratedFromCacheRef.current = false
    const sessionNik =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
    const key = getBiodataFullCacheKey(u?.nik || sessionNik, u?.id)
    const pack = readBiodataFullCache(key)
    if (pack && biodataCacheMatchesUser(pack.meta, u, sessionNik)) {
      setFormData((prev) => ({ ...prev, ...pack.form }))
      applySyncMeta(pack.meta)
      biodataHydratedRef.current = true
      hydratedFromCacheRef.current = true
      setBiodataReady(true)
    }
  }, [user?.id, user?.nik, applySyncMeta])

  // Mode baca: data dari server + tidak ada perubahan lokal (termasuk draft beda server). Mode ubah: lainnya.
  // Jangan paksa baca jika user baru menekan Ubah (biodataEditIntent) saat biodataReady reload.
  useEffect(() => {
    if (!biodataReady) return
    if (hasChanges) {
      enterBiodataEditMode()
      return
    }
    if (isValidId(formData.id) || userHasStoredNis(user)) {
      if (biodataEditIntent) return
      enterBiodataReadMode()
    } else {
      enterBiodataEditMode()
    }
  }, [biodataReady, formData.id, hasChanges, biodataEditIntent, user?.id, user?.nis, enterBiodataReadMode, enterBiodataEditMode])

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

  // Santri tanpa id server: tidak ada fetch biodata — form langsung "siap", Simpan mengikuti hasChanges saja.
  useEffect(() => {
    if (!tahunHijriyah || !tahunMasehi) return
    if (!isValidId(user?.id)) {
      setBiodataReady(true)
      setBiodataServerSynced(true)
    }
  }, [tahunHijriyah, tahunMasehi, user?.id])

  // Reset hydrasi saat ganti akun / id santri
  useEffect(() => {
    biodataHydratedRef.current = false
  }, [user?.id])

  // Santri baru (tanpa id valid): tidak ada load API — boleh persist draft setelah biodataReady.
  useEffect(() => {
    if (isValidId(user?.id)) return
    if (biodataReady) {
      biodataHydratedRef.current = true
    }
  }, [user?.id, biodataReady])

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

  // Muat dari API: tanpa cache = tunggu API lalu isi form; dengan cache = latar belakang + banding tanggal_update.
  useEffect(() => {
    if (!tahunHijriyah || !tahunMasehi) return
    const uid = user?.id != null ? String(user.id) : null
    if (!uid || !isValidId(user?.id)) return

    const syncAuthFromApis = (biodata, meta) => {
      const nisHeader =
        meta.nis != null && String(meta.nis).trim() !== '' ? String(meta.nis).trim() : null
      const authSync = useAuthStore.getState()
      authSync.setAuth(authSync.token, {
        ...authSync.user,
        id: meta.id_santri || String(biodata.id),
        nik: biodata.nik || authSync.user?.nik || '',
        nama: biodata.nama || authSync.user?.nama || '',
        nis: nisHeader ?? authSync.user?.nis ?? null,
        id_registrasi:
          meta.id_registrasi != null && !Number.isNaN(meta.id_registrasi)
            ? meta.id_registrasi
            : (authSync.user?.id_registrasi ?? null),
      })
    }

    const run = async () => {
      const fromCache = hydratedFromCacheRef.current
      setBiodataServerSynced(false)
      if (!fromCache) {
        setBiodataReady(false)
      }

      try {
        const draftRaw =
          typeof localStorage !== 'undefined' ? localStorage.getItem('daftar_biodata_draft') : null
        let parsedDraft = null
        if (draftRaw) {
          try {
            const parsed = JSON.parse(draftRaw)
            if (parsed && typeof parsed === 'object' && !parsed.v && (parsed.nik || parsed.nama)) {
              parsedDraft = parsed
            }
          } catch (_) {}
        }

        const biodataResponse = await pendaftaranAPI.getBiodata(user.id)
        if (!biodataResponse.success || !biodataResponse.data) {
          if (!fromCache) {
            console.warn('Data santri tidak ditemukan di database.', {
              response: biodataResponse,
              userId: user.id,
            })
            biodataHydratedRef.current = true
          }
          return
        }

        const biodata = biodataResponse.data
        const registrasiResponse = await pendaftaranAPI.getRegistrasi(user.id, tahunHijriyah, tahunMasehi)
        const regOk = !!(registrasiResponse.success && registrasiResponse.data)
        const registrasi = regOk ? registrasiResponse.data : null
        const nikFallback =
          typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') : null

        const { formData: newFormDataBuilt, meta: newMeta } = buildBiodataFormFromApis(
          biodata,
          registrasi,
          regOk,
          user,
          nikFallback,
          () => useTahunAjaranStore.getState().getGelombangAktif()
        )

        if (!fromCache) {
          applySyncMeta(newMeta)
          if (parsedDraft && biodataDraftDiffersFromServer(parsedDraft, newFormDataBuilt)) {
            setFormData({ ...newFormDataBuilt, ...parsedDraft })
            setHasChanges(true)
            hasUserEditedRef.current = false
          } else {
            setFormData(newFormDataBuilt)
            setHasChanges(false)
            hasUserEditedRef.current = false
          }
          hasLoadedFromServerRef.current = true
          biodataHydratedRef.current = true
          syncAuthFromApis(biodata, newMeta)
        } else {
          const sNew = parseServerTimestamp(newMeta.tanggal_update_santri)
          const rNew = parseServerTimestamp(newMeta.tanggal_update_registrasi)
          const sOld = parseServerTimestamp(syncMetaRef.current?.tanggal_update_santri)
          const rOld = parseServerTimestamp(syncMetaRef.current?.tanggal_update_registrasi)

          if (hasChangesRef.current && hasUserEditedRef.current) {
            applySyncMeta({
              ...(syncMetaRef.current || {}),
              id_santri: newMeta.id_santri,
              id_registrasi: newMeta.id_registrasi ?? syncMetaRef.current?.id_registrasi,
              nis: newMeta.nis ?? syncMetaRef.current?.nis,
              nik_snapshot: newMeta.nik_snapshot,
            })
            return
          }

          let didUpdate = false
          if (sNew > sOld && rNew > rOld) {
            setFormData(newFormDataBuilt)
            didUpdate = true
          } else if (sNew > sOld) {
            setFormData((prev) => mergeSantriSlice(prev, newFormDataBuilt))
            didUpdate = true
          } else if (rNew > rOld) {
            setFormData((prev) => mergeRegistrasiSlice(prev, newFormDataBuilt))
            didUpdate = true
          }

          if (didUpdate) {
            applySyncMeta(newMeta)
            syncAuthFromApis(biodata, newMeta)
          } else {
            applySyncMeta({
              ...(syncMetaRef.current || {}),
              id_santri: newMeta.id_santri,
              id_registrasi: newMeta.id_registrasi ?? syncMetaRef.current?.id_registrasi,
              nis: newMeta.nis ?? syncMetaRef.current?.nis,
              nik_snapshot: newMeta.nik_snapshot,
              tanggal_update_santri:
                syncMetaRef.current?.tanggal_update_santri ?? newMeta.tanggal_update_santri,
              tanggal_update_registrasi:
                syncMetaRef.current?.tanggal_update_registrasi ?? newMeta.tanggal_update_registrasi,
            })
          }
        }
      } catch (error) {
        console.error('Error loading data:', error)
      } finally {
        setBiodataReady(true)
        setBiodataServerSynced(true)
      }
    }

    void run()
  }, [user?.id, user?.nik, tahunHijriyah, tahunMasehi, applySyncMeta])

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

  // Autosave: debounce ke cache v2 (form + meta) + draft flat (kompatibilitas Berkas).
  useEffect(() => {
    if (!biodataHydratedRef.current) return
    if (!(formData.nik || formData.nama)) return
    sessionStorage.setItem('pendaftaranData', JSON.stringify(formData))
    const sessionNik =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
    const cacheKey = getBiodataFullCacheKey(user?.nik || sessionNik, user?.id)
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current)
    }
    persistDebounceRef.current = setTimeout(() => {
      const meta = {
        ...(syncMetaRef.current || {}),
        nik_snapshot: String(formData.nik || user?.nik || sessionNik || '').trim(),
      }
      writeBiodataFullCache(cacheKey, formData, meta)
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData))
      } catch {
        /* quota */
      }
    }, 350)
    return () => {
      if (persistDebounceRef.current) {
        clearTimeout(persistDebounceRef.current)
      }
    }
  }, [formData, user?.id, user?.nik])

  // Field yang diisi otomatis oleh sistem (bukan edit user) — update formData saja, jangan tandai sebagai perubahan
  const SYSTEM_AUTO_FILLED_FIELDS = ['gelombang']

  // Handle perubahan field
  const handleFieldChange = (field, value) => {
    // ID tidak bisa diubah manual oleh pendaftar
    if (field === 'id') {
      return
    }
    if (SYSTEM_AUTO_FILLED_FIELDS.includes(field)) {
      setFormData(prev => ({ ...prev, [field]: value }))
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
      hasUserEditedRef.current = true
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
      hasUserEditedRef.current = true
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
    hasUserEditedRef.current = true
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
      throw new Error('VALIDATION')
    }
    // Validasi format email (email wajib diisi)
    if (!formData.email || formData.email.trim() === '') {
      showNotification('Email wajib diisi', 'warning')
      throw new Error('VALIDATION')
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email.trim())) {
      showNotification('Format email tidak valid', 'warning')
      throw new Error('VALIDATION')
    }

    // Jika ID belum ada (santri baru), biarkan kosong - backend akan generate
    // Jika NIS sudah ada, validasi harus 7 digit
    // Handle case dimana id bisa string atau number
    if (formData.id && String(formData.id).trim() !== '' && !/^\d{7}$/.test(String(formData.id))) {
      showNotification('NIS harus 7 digit angka atau kosongkan untuk santri baru', 'warning')
      throw new Error('VALIDATION')
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
      // Field psb___registrasi: pakai ?? '' agar kunci selalu ada di JSON (JSON.stringify membuang undefined).
      // Tanpa ini backend anggap kunci hilang dan mempertahankan nilai lama — atau meng-null kolom lain (prodi/gelombang).
      const biodataPayload = {
        ...formData,
        email: emailToSave, // Gunakan email yang diisi atau default
        id: santriIdForSave,
        id_admin: null,
        tahun_hijriyah: tahunHijriyah ?? '',
        tahun_masehi: tahunMasehi ?? '',
        nama: formData.nama,
        gender: formData.gender,
        status_pendaftar: formData.status_pendaftar ?? '',
        daftar_diniyah: formData.daftar_diniyah ?? '',
        daftar_formal: formData.daftar_formal ?? '',
        status_murid: formData.status_murid ?? '',
        prodi: formData.prodi ?? '',
        gelombang: formData.gelombang ?? '',
        status_santri: formData.status_santri ?? '',
        id_registrasi: user?.id_registrasi != null && user.id_registrasi !== ''
          ? String(user.id_registrasi)
          : ''
      }

      console.log('Sending save request with payload:', biodataPayload)
      const biodataResponse = await pendaftaranAPI.saveBiodata(biodataPayload)

      if (!biodataResponse.success) {
        // Reset flag jika save gagal
        setJustSaved(false)
        throw new Error(biodataResponse.message || 'Gagal menyimpan biodata')
      }

      // Hapus draft dulu (sebelum setAuth / setFormData) agar effect muat ulang saat user.id berubah
      // tidak membaca draft lama → merge beda server → setHasChanges(true) → tetap mode ubah.
      try {
        localStorage.removeItem('daftar_biodata_draft')
        localStorage.removeItem('daftar_status_pendaftar')
        localStorage.removeItem('daftar_diniyah')
        localStorage.removeItem('daftar_formal')
        localStorage.removeItem('daftar_status_santri')
        localStorage.removeItem('daftar_status_murid')
        localStorage.removeItem('daftar_prodi')
      } catch (e) {
        /* ignore */
      }

      try {
        const sessionNik =
          typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('daftar_login_nik') || '' : ''
        const { tahunHijriyah: th, tahunMasehi: tm } = useTahunAjaranStore.getState()
        if (th && tm) {
          const idInv =
            biodataResponse.data?.id != null
              ? String(biodataResponse.data.id)
              : user?.id != null
                ? String(user.id)
                : ''
          const nikInv = String(formData.nik || user?.nik || sessionNik || '').trim()
          if (idInv) invalidateAfterBiodataSave(nikInv, idInv, th, tm, sessionNik)
        }
      } catch (_) {
        /* ignore */
      }

      hasUserEditedRef.current = false
      // Wajib flush agar hasChanges false ter-commit sebelum zustand mode baca; kalau tidak,
      // effect sinkron mode masih melihat hasChanges true → enterBiodataEditMode() menimpa mode baca.
      flushSync(() => {
        setHasChanges(false)
      })
      clearUnsavedChanges()
      useBiodataViewStore.getState().enterBiodataReadMode()

      // Backend mengembalikan id santri (acuan API) dan nis (7 digit, yang ditampilkan ke pendaftar)
      if (biodataResponse.data && biodataResponse.data.id) {
        const idSantri = String(biodataResponse.data.id)
        const nis = biodataResponse.data.nis != null ? String(biodataResponse.data.nis) : ''
        const idRegSaved =
          biodataResponse.data.id_registrasi != null
            ? Number(biodataResponse.data.id_registrasi)
            : user?.id_registrasi ?? null
        const tsBump = new Date().toISOString().replace('T', ' ').slice(0, 19)
        applySyncMeta({
          ...(syncMetaRef.current || {}),
          id_santri: idSantri,
          nis:
            normalizeNisForStorage(biodataResponse.data.nis ?? biodataResponse.data.NIS) ??
            (nis || null),
          id_registrasi: !Number.isNaN(idRegSaved) && idRegSaved != null ? idRegSaved : null,
          nik_snapshot: String(formData.nik || user?.nik || '').trim(),
          tanggal_update_santri: tsBump,
          tanggal_update_registrasi: tsBump,
        })
        const authStore = useAuthStore.getState()
        authStore.setAuth(authStore.token, {
          ...user,
          id: idSantri,
          nama: formData.nama || user?.nama || '',
          nik: formData.nik || user?.nik || '',
          nis: normalizeNisForStorage(biodataResponse.data.nis ?? biodataResponse.data.NIS) ?? (user?.nis ?? null),
          id_registrasi: biodataResponse.data.id_registrasi != null
            ? Number(biodataResponse.data.id_registrasi)
            : (user?.id_registrasi ?? null),
          role_key: user?.role_key || 'santri',
          role_label: user?.role_label || 'Santri',
          allowed_apps: user?.allowed_apps || ['daftar'],
          permissions: user?.permissions || []
        })
        setFormData(prev => ({ ...prev, id: nis }))
      } else {
        const nisSaved = normalizeNisForStorage(
          biodataResponse.data?.nis ?? biodataResponse.data?.NIS
        )
        if (nisSaved) {
          const tsBumpElse = new Date().toISOString().replace('T', ' ').slice(0, 19)
          applySyncMeta({
            ...(syncMetaRef.current || {}),
            nis: nisSaved,
            nik_snapshot: String(formData.nik || user?.nik || '').trim(),
            tanggal_update_santri: tsBumpElse,
            tanggal_update_registrasi: tsBumpElse,
          })
          const authStore = useAuthStore.getState()
          authStore.setAuth(authStore.token, {
            ...user,
            nama: formData.nama || user?.nama || '',
            nik: formData.nik || user?.nik || '',
            nis: nisSaved,
            id_registrasi:
              biodataResponse.data?.id_registrasi != null
                ? Number(biodataResponse.data.id_registrasi)
                : (user?.id_registrasi ?? null),
            role_key: user?.role_key || 'santri',
            role_label: user?.role_label || 'Santri',
            allowed_apps: user?.allowed_apps || ['daftar'],
            permissions: user?.permissions || []
          })
          setFormData((prev) => ({ ...prev, id: nisSaved }))
        }
      }

      setBiodataServerSynced(true)
      showNotification('Data pendaftaran berhasil disimpan!', 'success')

      // Setelah simpan, cek nomor yang bisa diaktifkan notifikasi WA (belum di kontak atau notif off)
      if (FEATURE_DAFTAR_WA_NOTIF_UI) {
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
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [formData, tahunHijriyah, tahunMasehi, user, showNotification, navigate, clearUnsavedChanges, applySyncMeta])

  // Wrapper handleSave untuk konfirmasi NIK & Gender (Hanya untuk ID Baru); mengembalikan Promise agar modal "simpan lalu navigasi" bisa menunggu hasil.
  const handleSave = useCallback(async () => {
    // Jika ID belum ada (santri baru), tampilkan modal konfirmasi — jangan anggap sukses (modal navigasi tetap terbuka)
    if (!formData.id || String(formData.id).trim() === '') {
      setShowConfirmModal(true)
      throw new Error('NEED_CONFIRM')
    }
    await saveData()
  }, [formData.id, saveData])

  const handleConfirmSave = useCallback(() => {
    setShowConfirmModal(false)
    void saveData().catch(() => {})
  }, [saveData])

  // Ref agar sinkronisasi ke context tidak ikut jalan setiap render (handleSave/checkRequiredFields berubah tiap formData).
  const handleSaveRef = useRef(handleSave)
  const checkRequiredRef = useRef(checkRequiredFields)
  handleSaveRef.current = handleSave
  checkRequiredRef.current = checkRequiredFields

  // Hanya halaman Biodata yang mengisi "unsaved" global. Aktif bila user benar-benar mengubah form (bukan load data).
  useEffect(() => {
    if (biodataViewMode === 'read') {
      clearUnsavedChanges()
      return
    }
    if (hasChanges && hasUserEditedRef.current) {
      setUnsavedChanges(true, () => handleSaveRef.current(), () => checkRequiredRef.current())
    } else {
      clearUnsavedChanges()
    }
  }, [biodataViewMode, hasChanges, setUnsavedChanges, clearUnsavedChanges])

  // Notif saat pindah tab browser: ingatkan simpan jika ada perubahan yang belum disimpan ke server.
  // Hanya aktif jika user memang sudah mengedit (bukan hanya load dari server).
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasChanges && hasUserEditedRef.current) {
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
        onEdit={enterBiodataEditMode}
        isSaving={isSaving}
        dataReady={biodataReady}
        serverSynced={biodataServerSynced}
        formDataId={formData.id}
        hasChanges={hasChanges}
        formData={formData}
        readOnly={biodataViewMode === 'read'}
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

        {biodataViewMode === 'read' ? (
          <BiodataReadOnlyView
            sectionRefs={sectionRefs}
            formData={formData}
            kondisiFields={kondisiFields}
            tanggalUpdateSantri={biodataServerTimestamps.tanggal_update_santri}
            tanggalUpdateRegistrasi={biodataServerTimestamps.tanggal_update_registrasi}
          />
        ) : (
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
        )}

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

      {FEATURE_DAFTAR_WA_NOTIF_UI && (
        <>
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
        </>
      )}
    </div>
  )
}

export default Biodata
