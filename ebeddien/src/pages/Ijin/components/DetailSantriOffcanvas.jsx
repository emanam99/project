import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useNotification } from '../../../contexts/NotificationContext'
import { useAuthStore } from '../../../store/authStore'
import { useIjinTahunAjaran } from '../../../hooks/useIjinTahunAjaran'
import { ijinAPI, santriAPI, kalenderAPI, santriBiodataAPI } from '../../../services/api'
import { parseKelompok } from '../../Lttq/lttqKelompokUtils'
import {
  getIjinSnapshot,
  mergeIjinListWithOutbox,
  saveIjinSnapshot,
  tryIjinCreate,
  tryIjinDelete,
  tryIjinMarkKembali,
  tryIjinUpdate
} from '../../../services/ijinOutbox/ijinOutboxService'
import { EBEDDIEN_IJIN_HINT, ijinHintMatches } from '../../../services/ijinLiveEvents'
import { PickDateHijri, formatHijriDateDisplay, compareHijriYmd } from '../../../components/PickDateHijri'
import PrintIjinOffcanvas from './PrintIjinOffcanvas'

/** Form edit biodata santri di panel ijin (cascade seperti UWABA) */
function buildSantriFormData(santri) {
  if (!santri) return {}
  return {
    nama: santri.nama || '',
    gender: santri.gender || '',
    status_santri: santri.status_santri || '',
    kategori: santri.kategori || '',
    id_daerah: santri.id_daerah ?? '',
    id_kamar: santri.id_kamar ?? '',
    lembaga_diniyah: String(santri.diniyah || santri.lembaga_diniyah || ''),
    kelas_diniyah: santri.kelas_diniyah || '',
    kel_diniyah: santri.kel_diniyah || '',
    id_diniyah: santri.id_diniyah ?? '',
    lembaga_formal: String(santri.formal || santri.lembaga_formal || ''),
    kelas_formal: santri.kelas_formal || '',
    kel_formal: santri.kel_formal || '',
    id_formal: santri.id_formal ?? '',
    lttq: santri.lttq || '',
    kelas_lttq: santri.kelas_lttq || '',
    kel_lttq: santri.kel_lttq || '',
    id_lttq_tingkatan: santri.id_lttq_tingkatan ?? '',
  }
}

/** Unique lembaga dari flat rombel (ijinAPI.getRombelOptions) */
function uniqueLembagaFromRombel(rows) {
  const map = new Map()
  for (const r of rows || []) {
    const id = String(r.lembaga_id ?? '')
    if (!id || map.has(id)) continue
    map.set(id, { id, nama: r.lembaga_nama || id })
  }
  return Array.from(map.values()).sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id'))
}

/** Unique daerah dari flat kamar (ijinAPI.getKamarOptions) */
function uniqueDaerahFromKamar(rows, kategori = '') {
  const map = new Map()
  const kat = String(kategori || '').trim()
  for (const k of rows || []) {
    if (kat && String(k.daerah_kategori || '') !== kat) continue
    const id = k.id_daerah
    if (id == null || id === '' || map.has(Number(id))) continue
    map.set(Number(id), {
      id: Number(id),
      daerah: k.daerah_nama || String(id),
      kategori: k.daerah_kategori || '',
    })
  }
  return Array.from(map.values()).sort((a, b) => String(a.daerah).localeCompare(String(b.daerah), 'id'))
}

/** Nilai Y-m-d Hijriyah atau null jika format lain / kosong */
function parseHijriYmd(s) {
  if (!s || typeof s !== 'string') return null
  const t = s.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

function labelTanggalIjin(s) {
  const v = parseHijriYmd(s)
  return v ? formatHijriDateDisplay(v) : s
}

/** Batas atas "Dari": tidak boleh melewati sampai maupun perpanjang (jika ada). */
function minHijriYmd(a, b) {
  if (!a) return b ?? null
  if (!b) return a
  return compareHijriYmd(a, b) <= 0 ? a : b
}

/** Tampilkan Y-m-d Masehi sebagai d/m/Y */
function formatMasehiTampil(yMd) {
  if (!yMd || typeof yMd !== 'string') return ''
  const raw = yMd.trim().split(/\s/)[0]
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return yMd
  return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}`
}

function labelAdminPetugas(nama, id) {
  const n = nama != null ? String(nama).trim() : ''
  if (n) return n
  if (id != null && id !== '') return `#${id}`
  return '—'
}

const MS_PER_DAY = 86400000

const IJIN_ALASAN_OPTIONS = ['Sakit', 'Walimah', 'Orang Tua Sakit', 'Orang Tua Wafat']

/** TIME / HH:MM:SS → HH:MM untuk input type=time */
function jamToInputValue(raw) {
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`
}

function jamToMinutes(raw) {
  const m = String(raw ?? '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Label lama dari selisih jam, contoh: "3 Jam", "2 Jam 30 Menit" */
function formatLamaJam(jamDari, jamSampai) {
  const a = jamToMinutes(jamDari)
  const b = jamToMinutes(jamSampai)
  if (a == null || b == null || b <= a) return ''
  const mins = b - a
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h} Jam ${m} Menit`
  if (h > 0) return `${h} Jam`
  return `${m} Menit`
}

function localMasehiYmdNow() {
  const now = new Date()
  const y = now.getFullYear()
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${mo}-${d}`
}

function localWaktuHmsNow() {
  const now = new Date()
  const h = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `${h}:${mi}:${s}`
}

async function fetchHijriyahHariIni() {
  try {
    const res = await kalenderAPI.get({
      action: 'today',
      tanggal: localMasehiYmdNow(),
      waktu: localWaktuHmsNow(),
    })
    const h = res?.hijriyah ?? (Array.isArray(res) ? undefined : res?.data?.hijriyah)
    if (h && h !== '0000-00-00' && /^\d{4}-\d{2}-\d{2}/.test(String(h))) {
      return String(h).slice(0, 10)
    }
  } catch (_) {}
  return null
}

function formatJamTampil(raw) {
  const v = jamToInputValue(raw)
  return v || '—'
}

function isIjinSehariRow(ijin) {
  return Number(ijin?.ijin_sehari) === 1 || ijin?.ijin_sehari === true
}

/** Ringkas rentang: dari → sampai (atau jam jika sehari) */
function labelRentangIjinSingkat(ijin) {
  if (isIjinSehariRow(ijin)) {
    const tgl = ijin.dari ? labelTanggalIjin(ijin.dari) : '—'
    return `${tgl} · ${formatJamTampil(ijin.jam_dari)}–${formatJamTampil(ijin.jam_sampai)}`
  }
  const dari = ijin.dari ? labelTanggalIjin(ijin.dari) : '—'
  const sampai = ijin.sampai ? labelTanggalIjin(ijin.sampai) : dari
  return `${dari} → ${sampai}`
}

const IJIN_LIST_DETAIL_STORAGE_KEY = 'ebeddien.ijin.formListDetail'

function readIjinListDetailMode() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(IJIN_LIST_DETAIL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeIjinListDetailMode(detail) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(IJIN_LIST_DETAIL_STORAGE_KEY, detail ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/**
 * Lama ijin dalam hari kalender Masehi, inklusif: hari pertama (dari) dan hari terakhir (sampai/perpanjang) ikut dihitung.
 * Contoh: Ahad → Senin berurutan = 2 hari. Normalisasi ke tengah malam zona waktu lokal.
 */
function jumlahHariMasehiInklusif(d1, d2) {
  const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate())
  if (b < a) return 0
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY) + 1
}

function FormIjinLoadingSkeleton({ label = 'Memuat data…' }) {
  return (
    <div className="space-y-4 py-2" aria-busy="true" aria-live="polite" aria-label={label}>
      <div className="flex flex-col items-center justify-center gap-3 py-6">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-teal-600 border-t-transparent" />
        <p className="text-sm text-gray-500 dark:text-gray-400 animate-pulse">{label}</p>
      </div>
      <div className="space-y-3 animate-pulse">
        <div className="h-20 rounded-lg bg-gray-200 dark:bg-gray-700/70" />
        <div className="h-10 rounded-lg bg-gray-200 dark:bg-gray-700/70 w-3/4" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-10 rounded-lg bg-gray-200 dark:bg-gray-700/70" />
          <div className="h-10 rounded-lg bg-gray-200 dark:bg-gray-700/70" />
        </div>
        <div className="h-24 rounded-lg bg-gray-200 dark:bg-gray-700/70" />
        <div className="h-16 rounded-lg bg-gray-200 dark:bg-gray-700/70" />
      </div>
    </div>
  )
}

function DetailSantriOffcanvas({
  isOpen,
  onClose,
  santri,
  onSuccess,
  /** 'offcanvas' (default) | 'panel' — panel untuk layout meja PC (tanpa portal) */
  variant = 'offcanvas',
  onCariSantri,
  hideCloseButton = false,
  /** Override TA dari halaman induk (pemilih TA); fallback ke TA aktif */
  tahunAjaran: tahunAjaranProp,
  /** Loading saat ganti santri / klik list (parent fetch biodata) */
  contentLoading = false,
  /** Dari klik list ijin kiri: buka mode edit ijin ini */
  editIjinId = null,
  editIjinSeed = null,
  /** Toggle kamera QR (panel meja) */
  onToggleCamera = null,
  cameraActive = false,
}) {
  const { showNotification } = useNotification()
  const currentUserNama = useAuthStore((s) => s.user?.nama)
  const tahunAjaranAktif = useIjinTahunAjaran()
  const tahunAjaran = tahunAjaranProp || tahunAjaranAktif
  const isPanel = variant === 'panel'
  const [loading, setLoading] = useState(false)
  const [loadingIjin, setLoadingIjin] = useState(false)
  const [loadingSantri, setLoadingSantri] = useState(false)
  const [ijinList, setIjinList] = useState([])
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [selectedIjinId, setSelectedIjinId] = useState(null)
  const [isEditingSantri, setIsEditingSantri] = useState(false)
  const [santriFormData, setSantriFormData] = useState({})
  /** Flat list dari ijinAPI — di-cascade di UI (daerah→kamar, lembaga→kelas→kel) */
  const [kamarListAll, setKamarListAll] = useState([])
  const [rombelDiniyahOptions, setRombelDiniyahOptions] = useState([])
  const [rombelFormalOptions, setRombelFormalOptions] = useState([])
  const [lttqTingkatanOptions, setLttqTingkatanOptions] = useState([])
  const [formData, setFormData] = useState({
    tahun_ajaran: tahunAjaran || '',
    alasan: '',
    dari: '',
    sampai: '',
    perpanjang: '',
    lama: '',
    ijin_sehari: false,
    jam_dari: '',
    jam_sampai: '',
  })
  const [editingIjin, setEditingIjin] = useState(null)
  const [alasanManual, setAlasanManual] = useState(false)
  const [masehiPreview, setMasehiPreview] = useState({ dari: '', sampai: '', perpanjang: '' })
  const [markingKembaliId, setMarkingKembaliId] = useState(null)
  const [ijinListDetail, setIjinListDetail] = useState(() => readIjinListDetailMode())
  const loadIjinListRef = useRef(() => {})
  const alasanManualInputRef = useRef(null)
  const appliedEditIjinRef = useRef(null)

  const ijinGroupedByTa = useMemo(() => {
    const map = new Map()
    for (const ijin of ijinList) {
      const ta = String(ijin.tahun_ajaran || '').trim() || '—'
      if (!map.has(ta)) map.set(ta, [])
      map.get(ta).push(ijin)
    }
    return Array.from(map.entries())
  }, [ijinList])

  const toggleIjinListDetail = () => {
    setIjinListDetail((prev) => {
      const next = !prev
      writeIjinListDetailMode(next)
      return next
    })
  }

  useEffect(() => {
    if (contentLoading) {
      setIjinList([])
      setLoadingIjin(true)
      setEditingIjin(null)
      appliedEditIjinRef.current = null
    }
  }, [contentLoading])

  useEffect(() => {
    if (isOpen && santri?.id) {
      setIjinList([])
      setLoadingIjin(true)
      setFormData((prev) => ({
        ...prev,
        tahun_ajaran: tahunAjaran || ''
      }))
      setSantriFormData(buildSantriFormData(santri))
      setIsEditingSantri(false)
      loadIjinList()
      resetForm()
    }
  }, [isOpen, santri?.id, tahunAjaran])

  // Refresh data induk setelah save tidak boleh mengosongkan form ijin yang sedang aktif.
  useEffect(() => {
    if (isOpen && santri) {
      setSantriFormData(buildSantriFormData(santri))
    }
  }, [isOpen, santri])

  const resetForm = () => {
    setFormData({
      tahun_ajaran: tahunAjaran || '',
      alasan: '',
      dari: '',
      sampai: '',
      perpanjang: '',
      lama: '',
      ijin_sehari: false,
      jam_dari: '',
      jam_sampai: '',
    })
    setAlasanManual(false)
    setEditingIjin(null)
  }

  const applyEditIjin = (ijin) => {
    if (!ijin) return
    setEditingIjin(ijin)
    const alasan = ijin.alasan != null ? String(ijin.alasan) : ''
    const sehari = Number(ijin.ijin_sehari) === 1 || ijin.ijin_sehari === true
    setFormData({
      tahun_ajaran: ijin.tahun_ajaran || tahunAjaran || '',
      alasan,
      dari: ijin.dari != null ? String(ijin.dari) : '',
      sampai: ijin.sampai != null ? String(ijin.sampai) : '',
      perpanjang: ijin.perpanjang != null ? String(ijin.perpanjang) : '',
      lama: ijin.lama || '',
      ijin_sehari: sehari,
      jam_dari: jamToInputValue(ijin.jam_dari),
      jam_sampai: jamToInputValue(ijin.jam_sampai),
    })
    setAlasanManual(alasan !== '' && !IJIN_ALASAN_OPTIONS.includes(alasan))
  }

  /** Setelah load santri dari klik list kiri → masuk mode edit ijin tersebut */
  useEffect(() => {
    if (contentLoading || !isOpen || !santri || !editIjinId) return
    const idNum = Number(editIjinId)
    if (!idNum) return
    if (appliedEditIjinRef.current === idNum) return

    const fromList = ijinList.find((i) => Number(i.id) === idNum)
    const fromSeed =
      editIjinSeed && Number(editIjinSeed.id) === idNum ? editIjinSeed : null
    const ijin = fromList || fromSeed
    if (!ijin) return

    applyEditIjin(ijin)
    appliedEditIjinRef.current = idNum
  }, [contentLoading, isOpen, santri, editIjinId, editIjinSeed, ijinList, tahunAjaran])

  const loadIjinList = async (opts = {}) => {
    const quiet = opts?.quiet === true
    if (!santri?.id) return

    if (!quiet) setLoadingIjin(true)
    try {
      const result = await ijinAPI.get(santri.id, tahunAjaran)

      if (result.success) {
        const base = result.data || []
        await saveIjinSnapshot(santri.id, tahunAjaran, base)
        const merged = await mergeIjinListWithOutbox(santri.id, tahunAjaran, base)
        setIjinList(merged)
      } else {
        const snap = await getIjinSnapshot(santri.id, tahunAjaran)
        const merged = await mergeIjinListWithOutbox(santri.id, tahunAjaran, snap?.rows || [])
        setIjinList(merged)
        showNotification(result.message || 'Gagal memuat data ijin; menampilkan cache lokal', 'error')
      }
    } catch (error) {
      console.error('Error loading ijin list:', error)
      const snap = await getIjinSnapshot(santri.id, tahunAjaran)
      const merged = await mergeIjinListWithOutbox(santri.id, tahunAjaran, snap?.rows || [])
      setIjinList(merged)
      if (!merged.length) {
        showNotification('Gagal memuat data ijin (tanpa cache)', 'error')
      } else {
        showNotification('Memakai data ijin tersimpan lokal + antrean', 'error')
      }
    } finally {
      if (!quiet) {
        setLoadingIjin(false)
      }
    }
  }

  loadIjinListRef.current = loadIjinList

  useEffect(() => {
    const onHint = (e) => {
      if (!isOpen || !santri?.id) return
      const detail = e?.detail || {}
      if (!ijinHintMatches(detail, santri.id, tahunAjaran)) return
      void loadIjinListRef.current({ quiet: true })
    }
    window.addEventListener(EBEDDIEN_IJIN_HINT, onHint)
    return () => window.removeEventListener(EBEDDIEN_IJIN_HINT, onHint)
  }, [isOpen, santri?.id, tahunAjaran])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!santri?.id) {
      showNotification('Data santri tidak valid', 'error')
      return
    }

    if (!formData.tahun_ajaran) {
      showNotification('Tahun ajaran harus diisi', 'error')
      return
    }

    if (!String(formData.alasan || '').trim()) {
      showNotification('Alasan wajib diisi', 'error')
      return
    }

    if (formData.ijin_sehari) {
      if (!formData.dari) {
        showNotification('Tanggal ijin sehari wajib diisi', 'error')
        return
      }
      if (!formData.jam_dari || !formData.jam_sampai) {
        showNotification('Jam dari dan jam sampai wajib diisi', 'error')
        return
      }
      if (formData.jam_sampai <= formData.jam_dari) {
        showNotification('Jam sampai harus setelah jam dari', 'error')
        return
      }
    }

    const payload = {
      id_santri: santri.id,
      ...formData,
      ijin_sehari: formData.ijin_sehari ? 1 : 0,
      sampai: formData.ijin_sehari ? formData.dari : formData.sampai,
      perpanjang: formData.ijin_sehari ? '' : formData.perpanjang,
      lama: formData.ijin_sehari
        ? formatLamaJam(formData.jam_dari, formData.jam_sampai) || formData.lama
        : formData.lama,
      jam_dari: formData.ijin_sehari ? formData.jam_dari : '',
      jam_sampai: formData.ijin_sehari ? formData.jam_sampai : '',
    }

    setLoading(true)
    try {
      const result = editingIjin
        ? await tryIjinUpdate(
            editingIjin.id,
            santri.id,
            formData.tahun_ajaran,
            payload,
            santri.nama
          )
        : await tryIjinCreate(santri.id, formData.tahun_ajaran, payload, santri.nama)

      if (result.success) {
        if (result.offline) {
          showNotification(
            editingIjin
              ? 'Perubahan disimpan di antrean; akan disinkronkan saat online'
              : 'Ijin disimpan di antrean; akan disinkronkan saat online',
            'info'
          )
        } else {
          showNotification(
            editingIjin ? 'Data ijin berhasil diupdate' : 'Data ijin berhasil ditambahkan',
            'success'
          )
        }
        const savedIjinId = Number(
          editingIjin?.id ?? result.data?.id ?? result.raw?.data?.id ?? 0
        )

        // Pertahankan semua nilai form dan lanjutkan sebagai mode edit agar klik
        // Simpan berikutnya tidak membuat baris duplikat.
        if (savedIjinId) {
          const savedIjin = {
            ...(editingIjin || {}),
            ...payload,
            id: savedIjinId,
          }
          setEditingIjin(savedIjin)
          appliedEditIjinRef.current = savedIjinId
        }

        void loadIjinList()
        if (typeof onSuccess === 'function') onSuccess()

        // Print membutuhkan ID server; antrean offline belum dapat dipreview
        // sampai tersinkron.
        if (!result.offline && savedIjinId > 0) {
          setSelectedIjinId(savedIjinId)
          setShowPrintOffcanvas(true)
        }
      } else {
        showNotification(result.message || 'Gagal menyimpan data ijin', 'error')
      }
    } catch (error) {
      console.error('Error saving ijin:', error)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (ijin) => {
    applyEditIjin(ijin)
    if (ijin?.id != null) appliedEditIjinRef.current = Number(ijin.id)
  }

  const selectAlasanOption = (option) => {
    setAlasanManual(false)
    setFormData((prev) => ({ ...prev, alasan: option }))
  }

  const enableAlasanManual = () => {
    setAlasanManual(true)
    if (IJIN_ALASAN_OPTIONS.includes(formData.alasan)) {
      setFormData((prev) => ({ ...prev, alasan: '' }))
    }
    window.requestAnimationFrame(() => {
      alasanManualInputRef.current?.focus()
    })
  }

  const setIjinSehari = (checked) => {
    if (!checked) {
      setFormData((prev) => ({
        ...prev,
        ijin_sehari: false,
        jam_dari: '',
        jam_sampai: '',
      }))
      return
    }
    setFormData((prev) => {
      const lamaJam = formatLamaJam(prev.jam_dari, prev.jam_sampai)
      return {
        ...prev,
        ijin_sehari: true,
        sampai: prev.dari || prev.sampai,
        perpanjang: '',
        lama: lamaJam || '',
        jam_dari: prev.jam_dari || '',
        jam_sampai: prev.jam_sampai || '',
      }
    })
    ;(async () => {
      const hijriToday = await fetchHijriyahHariIni()
      if (!hijriToday) return
      setFormData((prev) => {
        if (!prev.ijin_sehari) return prev
        return {
          ...prev,
          dari: hijriToday,
          sampai: hijriToday,
          perpanjang: '',
          lama: formatLamaJam(prev.jam_dari, prev.jam_sampai) || prev.lama,
        }
      })
    })()
  }

  const handleDelete = async (ijin) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus data ijin ini?`)) {
      return
    }

    setLoading(true)
    try {
      const result = await tryIjinDelete(ijin.id, santri.id, tahunAjaran, santri.nama)

      if (result.success) {
        if (result.offline) {
          if (result.cancelled) {
            showNotification('Tambah ijin dibatalkan (belum terkirim)', 'info')
          } else {
            showNotification('Penghapusan di antrean; akan disinkronkan saat online', 'info')
          }
        } else {
          showNotification('Data ijin berhasil dihapus', 'success')
        }
        void loadIjinList()
      } else {
        showNotification(result.message || 'Gagal menghapus data ijin', 'error')
      }
    } catch (error) {
      console.error('Error deleting ijin:', error)
      showNotification('Terjadi kesalahan saat menghapus data', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleMarkKembali = async (ijinRow, set) => {
    setMarkingKembaliId(ijinRow.id)
    try {
      const result = await tryIjinMarkKembali(ijinRow.id, set, santri.id, tahunAjaran, santri.nama)
      if (result.success) {
        const tanggal = result.tanggal_kembali ?? result.data?.tanggal_kembali ?? null
        const adminKembali = set ? (result.data?.admin_kembali ?? null) : null
        const adminKembaliNama = set
          ? (result.data?.admin_kembali_nama ?? currentUserNama ?? null)
          : null
        setIjinList((prev) =>
          prev.map((row) =>
            row.id === ijinRow.id
              ? {
                  ...row,
                  tanggal_kembali: tanggal,
                  admin_kembali: adminKembali,
                  admin_kembali_nama: adminKembaliNama
                }
              : row
          )
        )
        setEditingIjin((prev) =>
          prev && prev.id === ijinRow.id
            ? {
                ...prev,
                tanggal_kembali: tanggal,
                admin_kembali: adminKembali,
                admin_kembali_nama: adminKembaliNama
              }
            : prev
        )
        if (result.offline) {
          showNotification(
            set ? 'Tanggal kembali di antrean; disinkronkan nanti' : 'Status kembali (antrean; disinkronkan nanti)',
            'info'
          )
        } else {
          showNotification(
            set ? 'Tanggal kembali (Masehi) dicatat' : 'Status kembali dibatalkan',
            'success'
          )
        }
      } else {
        showNotification(result.message || 'Gagal memperbarui tanggal kembali', 'error')
      }
    } catch (error) {
      console.error('markKembali:', error)
      showNotification('Gagal memperbarui tanggal kembali', 'error')
    } finally {
      setMarkingKembaliId(null)
    }
  }

  const handleEditSantri = () => {
    setIsEditingSantri(true)
  }

  const handleCancelEditSantri = () => {
    setIsEditingSantri(false)
    if (santri) setSantriFormData(buildSantriFormData(santri))
  }

  // Load flat kamar + rombel + LTTQ; UI cascade daerah→kamar & lembaga→kelas→kel
  useEffect(() => {
    if (!isOpen || !santri) return
    let cancelled = false
    Promise.all([
      ijinAPI.getKamarOptions({ status: 'aktif' }),
      ijinAPI.getRombelOptions('Diniyah'),
      ijinAPI.getRombelOptions('Formal'),
      santriBiodataAPI.getLttqTingkatanOptions({ lembaga_id: 'LTTQ', status: 'aktif', limit: 500 }),
    ]).then(([kRes, dinRes, forRes, lttqRes]) => {
      if (cancelled) return
      if (kRes?.success && Array.isArray(kRes.data)) {
        const sorted = [...kRes.data].sort((a, b) => {
          const kc = String(a.daerah_kategori || '').localeCompare(String(b.daerah_kategori || ''), 'id')
          if (kc !== 0) return kc
          const da = String(a.daerah_nama || '').localeCompare(String(b.daerah_nama || ''), 'id')
          if (da !== 0) return da
          return String(a.kamar || '').localeCompare(String(b.kamar || ''), 'id')
        })
        setKamarListAll(sorted)
      } else {
        setKamarListAll([])
      }
      if (dinRes?.success && Array.isArray(dinRes.data)) setRombelDiniyahOptions(dinRes.data)
      else setRombelDiniyahOptions([])
      if (forRes?.success && Array.isArray(forRes.data)) setRombelFormalOptions(forRes.data)
      else setRombelFormalOptions([])
      if (lttqRes?.success && Array.isArray(lttqRes.data)) setLttqTingkatanOptions(lttqRes.data)
      else setLttqTingkatanOptions([])
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOpen, santri?.id])

  const daerahOptions = useMemo(
    () => uniqueDaerahFromKamar(kamarListAll, santriFormData.kategori),
    [kamarListAll, santriFormData.kategori]
  )

  const kamarOptions = useMemo(() => {
    const idDaerah = santriFormData.id_daerah
    if (idDaerah == null || idDaerah === '') return []
    return kamarListAll.filter((k) => Number(k.id_daerah) === Number(idDaerah))
  }, [kamarListAll, santriFormData.id_daerah])

  const lembagaDiniyahOptions = useMemo(
    () => uniqueLembagaFromRombel(rombelDiniyahOptions),
    [rombelDiniyahOptions]
  )

  const kelasDiniyahOptions = useMemo(() => {
    const lid = String(santriFormData.lembaga_diniyah || '')
    if (!lid) return []
    const set = new Set()
    for (const r of rombelDiniyahOptions) {
      if (String(r.lembaga_id) === lid && r.kelas != null && r.kelas !== '') set.add(String(r.kelas))
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
  }, [rombelDiniyahOptions, santriFormData.lembaga_diniyah])

  const kelDiniyahOptions = useMemo(() => {
    const lid = String(santriFormData.lembaga_diniyah || '')
    const kelas = String(santriFormData.kelas_diniyah || '')
    if (!lid || !kelas) return []
    return rombelDiniyahOptions.filter(
      (r) => String(r.lembaga_id) === lid && String(r.kelas) === kelas
    )
  }, [rombelDiniyahOptions, santriFormData.lembaga_diniyah, santriFormData.kelas_diniyah])

  const lembagaFormalOptions = useMemo(
    () => uniqueLembagaFromRombel(rombelFormalOptions),
    [rombelFormalOptions]
  )

  const kelasFormalOptions = useMemo(() => {
    const lid = String(santriFormData.lembaga_formal || '')
    if (!lid) return []
    const set = new Set()
    for (const r of rombelFormalOptions) {
      if (String(r.lembaga_id) === lid && r.kelas != null && r.kelas !== '') set.add(String(r.kelas))
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
  }, [rombelFormalOptions, santriFormData.lembaga_formal])

  const kelFormalOptions = useMemo(() => {
    const lid = String(santriFormData.lembaga_formal || '')
    const kelas = String(santriFormData.kelas_formal || '')
    if (!lid || !kelas) return []
    return rombelFormalOptions.filter(
      (r) => String(r.lembaga_id) === lid && String(r.kelas) === kelas
    )
  }, [rombelFormalOptions, santriFormData.lembaga_formal, santriFormData.kelas_formal])

  const lttqProgramOptions = useMemo(() => {
    const set = new Set()
    for (const t of lttqTingkatanOptions) {
      const tk = String(t.tingkatan || '').trim()
      if (tk) set.add(tk)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [lttqTingkatanOptions])

  const lttqProgramSelected = useMemo(() => {
    const fromField = String(santriFormData.lttq || '').trim()
    if (fromField) return fromField
    const row = lttqTingkatanOptions.find(
      (t) => String(t.id) === String(santriFormData.id_lttq_tingkatan ?? '')
    )
    return row ? String(row.tingkatan || '').trim() : ''
  }, [santriFormData.lttq, santriFormData.id_lttq_tingkatan, lttqTingkatanOptions])

  const kelasLttqOptions = useMemo(() => {
    if (!lttqProgramSelected) return []
    const set = new Set()
    for (const t of lttqTingkatanOptions) {
      if (String(t.tingkatan || '').trim() !== lttqProgramSelected) continue
      const { kelas } = parseKelompok(t.kelompok)
      if (kelas) set.add(String(kelas).trim())
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id', { numeric: true }))
  }, [lttqTingkatanOptions, lttqProgramSelected])

  const kelLttqOptions = useMemo(() => {
    const kelas = String(santriFormData.kelas_lttq || '').trim()
    if (!lttqProgramSelected || !kelas) return []
    return lttqTingkatanOptions
      .filter((t) => {
        if (String(t.tingkatan || '').trim() !== lttqProgramSelected) return false
        const { kelas: k } = parseKelompok(t.kelompok)
        return String(k).trim() === kelas
      })
      .map((t) => {
        const { kel } = parseKelompok(t.kelompok)
        return { id: t.id, kel: kel || '-' }
      })
  }, [lttqTingkatanOptions, lttqProgramSelected, santriFormData.kelas_lttq])

  const labelDiniyahView = useMemo(() => {
    if (!santri) return '-'
    const lid = String(santri.diniyah || '')
    const fromOpt = lembagaDiniyahOptions.find((l) => String(l.id) === lid)
    return fromOpt?.nama || santri.diniyah_lembaga_nama || santri.diniyah || '-'
  }, [santri, lembagaDiniyahOptions])

  const labelFormalView = useMemo(() => {
    if (!santri) return '-'
    const lid = String(santri.formal || '')
    const fromOpt = lembagaFormalOptions.find((l) => String(l.id) === lid)
    return fromOpt?.nama || santri.formal_lembaga_nama || santri.formal || '-'
  }, [santri, lembagaFormalOptions])

  const labelLttqView = useMemo(() => {
    if (!santri) return '-'
    if (santri.lttq) return santri.lttq
    const row = lttqTingkatanOptions.find(
      (t) => String(t.id) === String(santri.id_lttq_tingkatan ?? '')
    )
    return row?.tingkatan || '-'
  }, [santri, lttqTingkatanOptions])

  const handleSantriFieldChange = (field, value) => {
    setSantriFormData((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'status_santri' && value !== 'Mukim') {
        next.kategori = ''
        next.id_daerah = ''
        next.id_kamar = ''
      }
      if (field === 'kategori') {
        next.id_daerah = ''
        next.id_kamar = ''
      }
      if (field === 'id_daerah') next.id_kamar = ''
      if (field === 'lembaga_diniyah') {
        next.kelas_diniyah = ''
        next.kel_diniyah = ''
        next.id_diniyah = ''
      }
      if (field === 'kelas_diniyah') {
        next.kel_diniyah = ''
        next.id_diniyah = ''
      }
      if (field === 'lembaga_formal') {
        next.kelas_formal = ''
        next.kel_formal = ''
        next.id_formal = ''
      }
      if (field === 'kelas_formal') {
        next.kel_formal = ''
        next.id_formal = ''
      }
      if (field === 'lttq') {
        next.kelas_lttq = ''
        next.kel_lttq = ''
        next.id_lttq_tingkatan = ''
      }
      if (field === 'kelas_lttq') {
        next.kel_lttq = ''
        next.id_lttq_tingkatan = ''
      }
      return next
    })
  }

  const handleKelDiniyahPick = (rombelId) => {
    const id = rombelId === '' ? '' : Number(rombelId)
    const row = kelDiniyahOptions.find((r) => Number(r.id) === Number(id))
    setSantriFormData((prev) => ({
      ...prev,
      id_diniyah: id,
      kel_diniyah: row ? (row.kel ?? '') : '',
    }))
  }

  const handleKelFormalPick = (rombelId) => {
    const id = rombelId === '' ? '' : Number(rombelId)
    const row = kelFormalOptions.find((r) => Number(r.id) === Number(id))
    setSantriFormData((prev) => ({
      ...prev,
      id_formal: id,
      kel_formal: row ? (row.kel ?? '') : '',
    }))
  }

  const handleKelLttqPick = (tingkatanId) => {
    const id = tingkatanId === '' ? '' : Number(tingkatanId)
    const row = lttqTingkatanOptions.find((t) => Number(t.id) === Number(id))
    if (!row) {
      setSantriFormData((prev) => ({
        ...prev,
        id_lttq_tingkatan: '',
        kel_lttq: '',
      }))
      return
    }
    const { kelas, kel } = parseKelompok(row.kelompok)
    setSantriFormData((prev) => ({
      ...prev,
      id_lttq_tingkatan: id,
      lttq: String(row.tingkatan || '').trim(),
      kelas_lttq: kelas,
      kel_lttq: kel,
    }))
  }

  const handleSaveSantri = async () => {
    if (!santri?.id) {
      showNotification('Data santri tidak valid', 'error')
      return
    }

    const payload = {
      nama: santriFormData.nama || '',
      gender: santriFormData.gender || '',
      status_santri: santriFormData.status_santri || '',
      kategori: santriFormData.kategori || null,
    }
    if (santriFormData.id_diniyah != null && santriFormData.id_diniyah !== '') payload.id_diniyah = Number(santriFormData.id_diniyah)
    else payload.id_diniyah = null
    if (santriFormData.id_formal != null && santriFormData.id_formal !== '') payload.id_formal = Number(santriFormData.id_formal)
    else payload.id_formal = null
    if (santriFormData.id_lttq_tingkatan != null && santriFormData.id_lttq_tingkatan !== '') {
      payload.id_lttq_tingkatan = Number(santriFormData.id_lttq_tingkatan)
    } else {
      payload.id_lttq_tingkatan = null
    }
    if (santriFormData.id_kamar != null && santriFormData.id_kamar !== '') payload.id_kamar = Number(santriFormData.id_kamar)
    else payload.id_kamar = null

    setLoadingSantri(true)
    try {
      const result = await santriAPI.update(santri.id, payload)

      if (result.success) {
        showNotification('Data santri berhasil diupdate', 'success')
        setIsEditingSantri(false)
        if (onSuccess) onSuccess()
      } else {
        showNotification(result.message || 'Gagal mengupdate data santri', 'error')
      }
    } catch (error) {
      console.error('Error updating santri:', error)
      showNotification('Terjadi kesalahan saat mengupdate data', 'error')
    } finally {
      setLoadingSantri(false)
    }
  }

  // Prevent body scroll when offcanvas is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  const offcanvasTransition = { type: 'tween', duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }

  const dariHijriPilih = parseHijriYmd(formData.dari)
  const sampaiHijriPilih = parseHijriYmd(formData.sampai)
  const perpanjangHijriPilih = parseHijriYmd(formData.perpanjang)
  const batasAtasDari = minHijriYmd(sampaiHijriPilih, perpanjangHijriPilih)

  /**
   * Lama:
   * - ijin sehari → selisih jam_dari–jam_sampai
   * - biasa → hari kalender inklusif (via Masehi)
   */
  useEffect(() => {
    if (!isOpen) return
    if (formData.ijin_sehari) {
      const label = formatLamaJam(formData.jam_dari, formData.jam_sampai)
      setFormData((prev) => (prev.lama === label ? prev : { ...prev, lama: label }))
      return
    }
    const dari = dariHijriPilih
    const perpanjang = perpanjangHijriPilih
    const sampai = sampaiHijriPilih
    const akhir = perpanjang || sampai
    if (!dari || !akhir) {
      setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
      return
    }
    if (compareHijriYmd(akhir, dari) < 0) {
      setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const [r1, r2] = await Promise.all([
          kalenderAPI.get({ action: 'to_masehi', tanggal: dari }),
          kalenderAPI.get({ action: 'to_masehi', tanggal: akhir })
        ])
        if (cancelled) return
        if (!r1?.masehi || !r2?.masehi) {
          setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
          return
        }
        const d1 = new Date(`${r1.masehi}T12:00:00`)
        const d2 = new Date(`${r2.masehi}T12:00:00`)
        if (d2 < d1) {
          setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
          return
        }
        const days = jumlahHariMasehiInklusif(d1, d2)
        const label = `${days} Hari`
        setFormData((prev) => (prev.lama === label ? prev : { ...prev, lama: label }))
      } catch {
        if (!cancelled) setFormData((prev) => (prev.lama === '' ? prev : { ...prev, lama: '' }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    isOpen,
    formData.ijin_sehari,
    formData.jam_dari,
    formData.jam_sampai,
    dariHijriPilih,
    sampaiHijriPilih,
    perpanjangHijriPilih,
  ])

  /** Pratinjau konversi ke Masehi untuk form (sama logika dengan penyimpanan server). */
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const conv = async (raw) => {
      const y = parseHijriYmd(raw)
      if (!y) return ''
      try {
        const r = await kalenderAPI.get({ action: 'to_masehi', tanggal: y })
        return r?.masehi && r.masehi !== '0000-00-00' ? r.masehi : ''
      } catch {
        return ''
      }
    }
    ;(async () => {
      const [d, s, p] = await Promise.all([
        conv(formData.dari),
        conv(formData.sampai),
        conv(formData.perpanjang)
      ])
      if (!cancelled) setMasehiPreview({ dari: d, sampai: s, perpanjang: p })
    })()
    return () => {
      cancelled = true
    }
  }, [isOpen, formData.dari, formData.sampai, formData.perpanjang])

  const headerActions = (
    <div className="flex items-center gap-1.5 shrink-0 ml-auto">
      {typeof onToggleCamera === 'function' && (
        <button
          type="button"
          onClick={onToggleCamera}
          className={`w-9 h-9 inline-flex items-center justify-center rounded-lg border transition-colors ${
            cameraActive
              ? 'border-teal-400 dark:border-teal-600 bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          title={cameraActive ? 'Nonaktifkan kamera' : 'Aktifkan kamera'}
          aria-label={cameraActive ? 'Nonaktifkan kamera' : 'Aktifkan kamera'}
          aria-pressed={cameraActive}
        >
          {cameraActive ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4l16 16" />
            </svg>
          )}
        </button>
      )}
      {typeof onCariSantri === 'function' && (
        <button
          type="button"
          onClick={onCariSantri}
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:text-teal-700 dark:hover:text-teal-300 hover:border-teal-300 dark:hover:border-teal-700 transition-colors"
          title="Cari santri"
          aria-label="Cari santri"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      )}
      {!hideCloseButton && (
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          disabled={loading}
          aria-label="Tutup"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )

  const scrollBody = (
    <>
              {contentLoading ? (
                <FormIjinLoadingSkeleton label="Memuat data santri…" />
              ) : santri ? (
                <>
                  {/* Profil santri */}
                  <div className="mb-6">
                    {!isEditingSantri && (
                      <div className="flex items-center justify-end mb-3">
                        <button
                          onClick={handleEditSantri}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                          title="Edit Data Santri"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                      </div>
                    )}
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                      {isEditingSantri ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">ID:</span>
                              <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.id}</span>
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(Tidak bisa diubah)</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700 dark:text-gray-300">NIS:</span>
                              <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.nis ?? '-'}</span>
                            </div>
                            <div>
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Nama:</label>
                              <input
                                type="text"
                                value={santriFormData.nama || ''}
                                onChange={(e) => handleSantriFieldChange('nama', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Gender:</label>
                              <select
                                value={santriFormData.gender || ''}
                                onChange={(e) => handleSantriFieldChange('gender', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="">Pilih Gender</option>
                                <option value="Laki-laki">Laki-laki</option>
                                <option value="Perempuan">Perempuan</option>
                              </select>
                            </div>
                            <div>
                              <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Status Santri:</label>
                              <select
                                value={santriFormData.status_santri || ''}
                                onChange={(e) => handleSantriFieldChange('status_santri', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                              >
                                <option value="">Pilih Status</option>
                                <option value="Mukim">Mukim</option>
                                <option value="Khoriji">Khoriji</option>
                                <option value="Alumni">Alumni</option>
                              </select>
                            </div>
                            {santriFormData.status_santri === 'Mukim' && (
                              <>
                                <div>
                                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Kategori:</label>
                                  <select
                                    value={santriFormData.kategori || ''}
                                    onChange={(e) => handleSantriFieldChange('kategori', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="">Pilih Kategori</option>
                                    <option value="Banin">Banin</option>
                                    <option value="Banat">Banat</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Daerah:</label>
                                  <select
                                    value={santriFormData.id_daerah ?? ''}
                                    onChange={(e) => handleSantriFieldChange('id_daerah', e.target.value === '' ? '' : Number(e.target.value))}
                                    disabled={!santriFormData.kategori}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Daerah</option>
                                    {daerahOptions.map((d) => (
                                      <option key={d.id} value={d.id}>{d.daerah}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <label className="block font-medium text-gray-700 dark:text-gray-300 mb-1">Kamar:</label>
                                  <select
                                    value={santriFormData.id_kamar ?? ''}
                                    onChange={(e) => handleSantriFieldChange('id_kamar', e.target.value === '' ? '' : Number(e.target.value))}
                                    disabled={!santriFormData.id_daerah}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Kamar</option>
                                    {kamarOptions.map((k) => (
                                      <option key={k.id} value={k.id}>{k.kamar}</option>
                                    ))}
                                  </select>
                                </div>
                              </>
                            )}
                            <div className="col-span-2 space-y-2">
                              <p className="font-medium text-gray-700 dark:text-gray-300">Diniyah</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Lembaga</label>
                                  <select
                                    value={String(santriFormData.lembaga_diniyah || '')}
                                    onChange={(e) => handleSantriFieldChange('lembaga_diniyah', e.target.value)}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="">Pilih Diniyah</option>
                                    {lembagaDiniyahOptions.map((l) => (
                                      <option key={l.id} value={String(l.id)}>{l.nama}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kelas</label>
                                  <select
                                    value={santriFormData.kelas_diniyah || ''}
                                    onChange={(e) => handleSantriFieldChange('kelas_diniyah', e.target.value)}
                                    disabled={!santriFormData.lembaga_diniyah}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Kelas</option>
                                    {kelasDiniyahOptions.map((k) => (
                                      <option key={k} value={k}>{k}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kel</label>
                                  <select
                                    value={santriFormData.id_diniyah ?? ''}
                                    onChange={(e) => handleKelDiniyahPick(e.target.value)}
                                    disabled={!santriFormData.lembaga_diniyah || !santriFormData.kelas_diniyah}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Kel</option>
                                    {kelDiniyahOptions.map((r) => (
                                      <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                            <div className="col-span-2 space-y-2">
                              <p className="font-medium text-gray-700 dark:text-gray-300">Formal</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Lembaga</label>
                                  <select
                                    value={String(santriFormData.lembaga_formal || '')}
                                    onChange={(e) => handleSantriFieldChange('lembaga_formal', e.target.value)}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="">Pilih Formal</option>
                                    {lembagaFormalOptions.map((l) => (
                                      <option key={l.id} value={String(l.id)}>{l.nama}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kelas</label>
                                  <select
                                    value={santriFormData.kelas_formal || ''}
                                    onChange={(e) => handleSantriFieldChange('kelas_formal', e.target.value)}
                                    disabled={!santriFormData.lembaga_formal}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Kelas</option>
                                    {kelasFormalOptions.map((k) => (
                                      <option key={k} value={k}>{k}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kel</label>
                                  <select
                                    value={santriFormData.id_formal ?? ''}
                                    onChange={(e) => handleKelFormalPick(e.target.value)}
                                    disabled={!santriFormData.lembaga_formal || !santriFormData.kelas_formal}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Kel</option>
                                    {kelFormalOptions.map((r) => (
                                      <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                            <div className="col-span-2 space-y-2">
                              <p className="font-medium text-gray-700 dark:text-gray-300">LTTQ</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tingkatan</label>
                                  <select
                                    value={lttqProgramSelected}
                                    onChange={(e) => handleSantriFieldChange('lttq', e.target.value)}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm"
                                  >
                                    <option value="">Pilih LTTQ</option>
                                    {lttqProgramOptions.map((tk) => (
                                      <option key={tk} value={tk}>{tk}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kelas</label>
                                  <select
                                    value={santriFormData.kelas_lttq || ''}
                                    onChange={(e) => handleSantriFieldChange('kelas_lttq', e.target.value)}
                                    disabled={!lttqProgramSelected}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Kelas</option>
                                    {kelasLttqOptions.map((k) => (
                                      <option key={k} value={k}>{k}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kel</label>
                                  <select
                                    value={santriFormData.id_lttq_tingkatan ?? ''}
                                    onChange={(e) => handleKelLttqPick(e.target.value)}
                                    disabled={!lttqProgramSelected || !santriFormData.kelas_lttq}
                                    className="w-full px-2 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-60"
                                  >
                                    <option value="">Pilih Kel</option>
                                    {kelLttqOptions.map((r) => (
                                      <option key={r.id} value={r.id}>{r.kel ?? '-'}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-3 pt-2">
                            <button
                              type="button"
                              onClick={handleCancelEditSantri}
                              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                              disabled={loadingSantri}
                            >
                              Batal
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveSantri}
                              disabled={loadingSantri}
                              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {loadingSantri ? 'Menyimpan...' : 'Simpan'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">ID:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.id}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">NIS:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.nis ?? '-'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Nama:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.nama || '-'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Gender:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.gender || '-'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">{santri.status_santri || '-'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Kamar:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">
                              {santri.id_kamar != null && santri.id_kamar !== ''
                                ? (
                                  <>
                                    {[santri.kamar, santri.daerah].filter(Boolean).join(' — ') || '-'}
                                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                      (id_kamar: {santri.id_kamar})
                                    </span>
                                  </>
                                )
                                : '-'}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Diniyah:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">
                              {labelDiniyahView}
                              {(santri.kelas_diniyah || santri.kel_diniyah) && (
                                <span className="ml-1">
                                  {' '}[{santri.kelas_diniyah || ''}{santri.kelas_diniyah && santri.kel_diniyah ? '.' : ''}{santri.kel_diniyah || ''}]
                                </span>
                              )}
                              {santri.id_diniyah != null && santri.id_diniyah !== '' && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                  (id_diniyah: {santri.id_diniyah})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">Formal:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">
                              {labelFormalView}
                              {(santri.kelas_formal || santri.kel_formal) && (
                                <span className="ml-1">
                                  {' '}[{santri.kelas_formal || ''}{santri.kelas_formal && santri.kel_formal ? '.' : ''}{santri.kel_formal || ''}]
                                </span>
                              )}
                              {santri.id_formal != null && santri.id_formal !== '' && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                  (id_formal: {santri.id_formal})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700 dark:text-gray-300">LTTQ:</span>
                            <span className="ml-2 text-gray-900 dark:text-gray-100">
                              {labelLttqView}
                              {(santri.kelas_lttq || santri.kel_lttq) && (
                                <span className="ml-1">
                                  {' '}[{santri.kelas_lttq || ''}{santri.kelas_lttq && santri.kel_lttq ? '.' : ''}{santri.kel_lttq || ''}]
                                </span>
                              )}
                              {santri.id_lttq_tingkatan != null && santri.id_lttq_tingkatan !== '' && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                  (id_lttq_tingkatan: {santri.id_lttq_tingkatan})
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Ijin */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {editingIjin ? 'Edit Data Ijin' : 'Tambah Data Ijin'}
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                          Tahun Ajaran
                        </label>
                        <input
                          type="text"
                          value={formData.tahun_ajaran}
                          readOnly
                          className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                          placeholder="1446-1447"
                        />
                        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                          Tahun ajaran hijriyah aktif (rentang master yang mencakup hari ini)
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Alasan <span className="text-red-500">*</span>
                        </label>
                        <div className="flex flex-wrap gap-1">
                          {IJIN_ALASAN_OPTIONS.map((opt) => {
                            const selected = !alasanManual && formData.alasan === opt
                            return (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => selectAlasanOption(opt)}
                                className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                                  selected
                                    ? 'bg-teal-600 border-teal-600 text-white'
                                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-teal-400 dark:hover:border-teal-500'
                                }`}
                              >
                                {opt}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            onClick={enableAlasanManual}
                            className={`px-2 py-1 text-[11px] font-medium rounded-md border transition-colors ${
                              alasanManual
                                ? 'bg-amber-500 border-amber-500 text-white'
                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-amber-400 dark:hover:border-amber-500'
                            }`}
                          >
                            Ketik Manual
                          </button>
                        </div>
                        {alasanManual && (
                          <input
                            ref={alasanManualInputRef}
                            type="text"
                            value={formData.alasan}
                            onChange={(e) => setFormData({ ...formData, alasan: e.target.value })}
                            className="mt-1.5 w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="Tulis alasan ijin…"
                            required={!!alasanManual}
                          />
                        )}
                      </div>

                      <div>
                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!formData.ijin_sehari}
                            onChange={(e) => setIjinSehari(e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-xs font-medium text-gray-800 dark:text-gray-100">
                            Ijin sehari
                          </span>
                        </label>
                        <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                          Centang: tanggal Hijriyah hari ini + jam mulai–selesai; lama dihitung otomatis.
                        </p>
                      </div>

                      <div className={`grid grid-cols-1 gap-3 ${formData.ijin_sehari ? '' : 'sm:grid-cols-2'}`}>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                            {formData.ijin_sehari ? 'Tanggal (Hijriyah)' : 'Dari (Hijriyah)'}
                          </label>
                          <PickDateHijri
                            id="ijin-dari-hijri"
                            name="dari"
                            value={dariHijriPilih}
                            onChange={(ymd) => {
                              const v = ymd != null ? ymd : ''
                              setFormData((prev) =>
                                prev.ijin_sehari
                                  ? {
                                      ...prev,
                                      dari: v,
                                      sampai: v,
                                      perpanjang: '',
                                      lama: formatLamaJam(prev.jam_dari, prev.jam_sampai) || prev.lama,
                                    }
                                  : { ...prev, dari: v }
                              )
                            }}
                            max={formData.ijin_sehari ? undefined : (batasAtasDari || undefined)}
                            placeholder={formData.ijin_sehari ? 'Pilih tanggal ijin' : 'Pilih tanggal mulai'}
                            className="w-full"
                            inputClassName="!text-xs !py-1.5 !px-2.5"
                          />
                          {formData.dari && !dariHijriPilih && (
                            <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                              Tersimpan (format lama): {formData.dari}
                            </p>
                          )}
                          <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                            Kalender dari database Hijriyah PSA
                          </p>
                        </div>
                        {!formData.ijin_sehari && (
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                              Sampai (Hijriyah)
                            </label>
                            <PickDateHijri
                              id="ijin-sampai-hijri"
                              name="sampai"
                              value={sampaiHijriPilih}
                              onChange={(ymd) =>
                                setFormData({ ...formData, sampai: ymd != null ? ymd : '' })
                              }
                              min={dariHijriPilih || undefined}
                              max={perpanjangHijriPilih || undefined}
                              placeholder="Pilih tanggal selesai"
                              className="w-full"
                              inputClassName="!text-xs !py-1.5 !px-2.5"
                            />
                            {formData.sampai && !sampaiHijriPilih && (
                              <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                                Tersimpan (format lama): {formData.sampai}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      {formData.ijin_sehari ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                              Jam dari
                            </label>
                            <input
                              type="time"
                              value={formData.jam_dari}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  jam_dari: e.target.value,
                                  lama: formatLamaJam(e.target.value, prev.jam_sampai),
                                }))
                              }
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              required={!!formData.ijin_sehari}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                              Jam sampai
                            </label>
                            <input
                              type="time"
                              value={formData.jam_sampai}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  jam_sampai: e.target.value,
                                  lama: formatLamaJam(prev.jam_dari, e.target.value),
                                }))
                              }
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                              required={!!formData.ijin_sehari}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                              Lama
                            </label>
                            <input
                              type="text"
                              value={formData.lama}
                              readOnly
                              className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                              placeholder="Otomatis dari jam"
                            />
                          </div>
                        </div>
                      ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                            Perpanjang (Hijriyah)
                          </label>
                          <PickDateHijri
                            id="ijin-perpanjang-hijri"
                            name="perpanjang"
                            value={perpanjangHijriPilih}
                            onChange={(ymd) =>
                              setFormData({ ...formData, perpanjang: ymd != null ? ymd : '' })
                            }
                            min={sampaiHijriPilih || dariHijriPilih || undefined}
                            placeholder="Opsional"
                            className="w-full"
                            inputClassName="!text-xs !py-1.5 !px-2.5"
                          />
                          {formData.perpanjang && !perpanjangHijriPilih && (
                            <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                              Tersimpan (format lama): {formData.perpanjang}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
                            Lama
                          </label>
                          <input
                            type="text"
                            value={formData.lama}
                            readOnly
                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                            placeholder="Otomatis dari tanggal"
                          />
                        </div>
                      </div>
                      )}

                      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-600 p-2.5 bg-gray-50/80 dark:bg-gray-800/40">
                        <p className="text-[10px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                          Versi Masehi (otomatis dari konversi Hijriyah)
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[10px] text-gray-700 dark:text-gray-300">
                          <div>
                            Dari (M):{' '}
                            <span className="font-mono">
                              {masehiPreview.dari ? formatMasehiTampil(masehiPreview.dari) : '—'}
                            </span>
                          </div>
                          <div>
                            Sampai (M):{' '}
                            <span className="font-mono">
                              {masehiPreview.sampai ? formatMasehiTampil(masehiPreview.sampai) : '—'}
                            </span>
                          </div>
                          <div>
                            Perpanjang (M):{' '}
                            <span className="font-mono">
                              {masehiPreview.perpanjang ? formatMasehiTampil(masehiPreview.perpanjang) : '—'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-1">
                        {editingIjin && (
                          <button
                            type="button"
                            onClick={() => {
                              resetForm()
                            }}
                            className="flex-1 px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          >
                            Batal Edit
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={loading || !editingIjin?.id || Number(editingIjin.id) <= 0}
                          onClick={() => {
                            setSelectedIjinId(editingIjin.id)
                            setShowPrintOffcanvas(true)
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border border-purple-300 dark:border-purple-700 rounded-lg text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            editingIjin?.id && Number(editingIjin.id) > 0
                              ? 'Print surat ijin'
                              : 'Simpan data terlebih dahulu untuk print'
                          }
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Print
                        </button>
                        <button
                          type="submit"
                          disabled={loading}
                          className="flex-1 px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loading ? 'Menyimpan...' : editingIjin ? 'Update' : 'Simpan'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Daftar Ijin */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                        Daftar Ijin
                      </h3>
                      <button
                        type="button"
                        onClick={toggleIjinListDetail}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title={ijinListDetail ? 'Tampilan minimalis' : 'Tampilan detail'}
                        aria-label={ijinListDetail ? 'Tampilan minimalis' : 'Tampilan detail'}
                        aria-pressed={ijinListDetail}
                      >
                        {ijinListDetail ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {loadingIjin ? (
                      <FormIjinLoadingSkeleton label="Memuat daftar ijin…" />
                    ) : ijinList.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                        Belum ada data ijin
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {ijinGroupedByTa.map(([ta, rows]) => (
                          <div key={ta}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                              <span className="text-[11px] font-semibold tracking-wide text-teal-700 dark:text-teal-300 whitespace-nowrap px-1">
                                TA {ta}
                              </span>
                              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                            </div>
                            <div className={ijinListDetail ? 'space-y-2' : 'space-y-1'}>
                              {rows.map((ijin) => {
                                const isEditing = editingIjin && Number(editingIjin.id) === Number(ijin.id)
                                const rowClass = isEditing
                                  ? 'border-teal-400 dark:border-teal-600 bg-teal-50/80 dark:bg-teal-900/25'
                                  : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:border-teal-300 dark:hover:border-teal-700'

                                if (!ijinListDetail) {
                                  return (
                                    <div
                                      key={ijin.id}
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => handleEdit(ijin)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          handleEdit(ijin)
                                        }
                                      }}
                                      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors ${rowClass}`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate leading-tight">
                                          {ijin.alasan != null && String(ijin.alasan).trim() !== ''
                                            ? String(ijin.alasan).trim()
                                            : '—'}
                                        </p>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
                                          {labelRentangIjinSingkat(ijin)}
                                          {ijin.tanggal_kembali ? ' · sudah kembali' : ''}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-0.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setSelectedIjinId(ijin.id)
                                            setShowPrintOffcanvas(true)
                                          }}
                                          className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                          title="Print"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          disabled={Boolean(ijin.tanggal_kembali) || markingKembaliId === ijin.id}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void handleMarkKembali(ijin, true)
                                          }}
                                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                          title="Kembali"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void handleDelete(ijin)
                                          }}
                                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                          title="Hapus"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  )
                                }

                                return (
                                  <div
                                    key={ijin.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleEdit(ijin)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault()
                                        handleEdit(ijin)
                                      }
                                    }}
                                    className={`rounded-lg p-4 border cursor-pointer transition-colors ${rowClass}`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        {ijin.urutan && (
                                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                            Urutan: {ijin.urutan}
                                          </p>
                                        )}
                                        {ijin.alasan && (
                                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                            {ijin.alasan}
                                          </p>
                                        )}
                                        {isIjinSehariRow(ijin) && (
                                          <p className="text-xs font-medium text-teal-700 dark:text-teal-300 mb-1">
                                            Ijin sehari · {formatJamTampil(ijin.jam_dari)}–{formatJamTampil(ijin.jam_sampai)}
                                          </p>
                                        )}
                                        {ijin.dari && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400">
                                            Dari: {labelTanggalIjin(ijin.dari)}
                                          </p>
                                        )}
                                        {ijin.sampai && !isIjinSehariRow(ijin) && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400">
                                            Sampai: {labelTanggalIjin(ijin.sampai)}
                                          </p>
                                        )}
                                        {ijin.lama && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400">
                                            Lama: {ijin.lama}
                                          </p>
                                        )}
                                        {ijin.perpanjang && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400">
                                            Perpanjang: {labelTanggalIjin(ijin.perpanjang)}
                                          </p>
                                        )}
                                        {(ijin.dari_masehi || ijin.sampai_masehi || ijin.perpanjang_masehi) && (
                                          <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-600 space-y-0.5">
                                            {ijin.dari_masehi && (
                                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Dari (M): {formatMasehiTampil(String(ijin.dari_masehi))}
                                              </p>
                                            )}
                                            {ijin.sampai_masehi && (
                                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Sampai (M): {formatMasehiTampil(String(ijin.sampai_masehi))}
                                              </p>
                                            )}
                                            {ijin.perpanjang_masehi && (
                                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Perpanjang (M): {formatMasehiTampil(String(ijin.perpanjang_masehi))}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                        {(ijin.admin_ijin_nama || ijin.admin_ijin) && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Dicatat oleh:{' '}
                                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                              {labelAdminPetugas(ijin.admin_ijin_nama, ijin.admin_ijin)}
                                            </span>
                                          </p>
                                        )}
                                        <div
                                          className="mt-3 flex flex-wrap items-center gap-3"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                                            <input
                                              type="checkbox"
                                              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                              checked={Boolean(ijin.tanggal_kembali)}
                                              disabled={markingKembaliId === ijin.id}
                                              onChange={(e) => handleMarkKembali(ijin, e.target.checked)}
                                            />
                                            Sudah kembali
                                          </label>
                                          <button
                                            type="button"
                                            disabled={Boolean(ijin.tanggal_kembali) || markingKembaliId === ijin.id}
                                            onClick={() => handleMarkKembali(ijin, true)}
                                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
                                          >
                                            Kembali
                                          </button>
                                          {ijin.tanggal_kembali && (
                                            <span className="text-xs text-teal-700 dark:text-teal-300">
                                              Tgl kembali (M):{' '}
                                              {formatMasehiTampil(String(ijin.tanggal_kembali).split(/\s/)[0])}
                                            </span>
                                          )}
                                        </div>
                                        {ijin.tanggal_kembali && (ijin.admin_kembali_nama || ijin.admin_kembali) && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Kembali dicatat oleh:{' '}
                                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                              {labelAdminPetugas(ijin.admin_kembali_nama, ijin.admin_kembali)}
                                            </span>
                                          </p>
                                        )}
                                      </div>
                                      <div
                                        className="flex gap-2 ml-2 shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setSelectedIjinId(ijin.id)
                                            setShowPrintOffcanvas(true)
                                          }}
                                          className="p-1.5 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                          title="Print"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                          </svg>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDelete(ijin)}
                                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                          title="Hapus"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                  {isPanel
                    ? 'Aktifkan kamera atau cari santri (ikon di header) untuk mengisi form ijin.'
                    : 'Tidak ada data santri'}
                </p>
              )}
    </>
  )

  const headerBlock = (
    <div className={`${isPanel ? 'px-4 py-3' : 'px-6 py-4'} border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2`}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {isPanel ? 'Form Ijin' : 'Detail Santri & Ijin'}
        </h2>
        {contentLoading ? (
          <p className="text-sm text-teal-600 dark:text-teal-400 mt-1 animate-pulse">Memuat…</p>
        ) : santri ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">
            {santri.nama} (ID: {santri.id} | NIS: {santri.nis ?? '-'})
          </p>
        ) : null}
      </div>
      {headerActions}
    </div>
  )

  const printPortals = (
    <>
      <PrintIjinOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => {
          setShowPrintOffcanvas(false)
          setSelectedIjinId(null)
        }}
        santriId={santri?.id || santri?.nis}
        ijinId={selectedIjinId}
      />
    </>
  )

  if (isPanel) {
    if (!isOpen) return null
    return (
      <>
        <div className="h-full flex flex-col min-h-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          {headerBlock}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
            {scrollBody}
          </div>
        </div>
        {printPortals}
      </>
    )
  }

  const offcanvasContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="detail-santri-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99998
          }}
        />
      )}
      {isOpen && (
        <motion.div
          key="detail-santri-panel"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={offcanvasTransition}
          className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white dark:bg-gray-800 shadow-xl flex flex-col"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            zIndex: 99999
          }}
        >
          {headerBlock}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {scrollBody}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {createPortal(offcanvasContent, document.body)}
      {printPortals}
    </>
  )
}

export default DetailSantriOffcanvas
