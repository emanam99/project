import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  getKelas,
  getSantri,
  getTahunAjaran,
  getSyahriahBulan,
  getSyahriahRingkas,
  batchSyahriahWajib,
  getSyahriahBayar,
  createSyahriahBayar,
  previewSyahriahBayar,
  deleteSyahriahBayar,
  getSyahriahKhusus,
  batchSyahriahKhusus,
  deleteSyahriahKhusus,
  batchDeleteSyahriahKhusus,
  batchUpdateSyahriahKhusus,
  createSyahriahKhususBayar,
  deleteSyahriahKhususBayar,
  type KelasRow,
  type SantriRow,
  type TahunAjaranRow,
  type SyahriahBulanMeta,
  type SyahriahRingkasRow,
  type SyahriahBayarRow,
  type SyahriahKhususRow,
} from '../api/apiClient'
import { getBulanName } from './Kalender/utils/bulanHijri'
import { masehiToHijriLocal } from './Kalender/utils/kalenderLocalConvert'
import { formatHijriDateDisplay, formatMasehiDateDisplay } from '../components/PickDateHijri/PickDateHijri'
import { getStoredUser } from '../utils/auth'
import MaterialIcon from '../components/MaterialIcon'
import OffcanvasCariSantri from '../components/OffcanvasCariSantri'
import OffcanvasEditSantri from '../components/OffcanvasEditSantri'
import { tabPanelMotion } from '../components/AnimatedPanel'
import { ContentSkeleton } from '../components/LazyFallback'
import { exportSyahriahKhususToExcel } from '../utils/exportExcel'

type TabId = 'ringkas' | 'wajib' | 'bayar'
type BayarMobileTab = 'biodata' | 'riwayat'
type StatusSubTab = 'syahriyah' | 'khusus'
type BayarInnerTab = 'syahriyah' | 'khusus'
type KhususStatusFilter = '' | 'lunas' | 'kurang' | 'belum'

const TAB_IDS: TabId[] = ['bayar', 'ringkas', 'wajib']
const WAJIB_DRAFT_KEY = 'mdtwustha_syahriah_wajib_draft'

type WajibDraft = {
  tahun_ajaran_id: string
  bulan: string[]
  nominal: string
}

function parseTab(raw?: string): TabId {
  return TAB_IDS.includes(raw as TabId) ? (raw as TabId) : 'bayar'
}

function loadWajibDraft(taId: string): WajibDraft | null {
  if (!taId) return null
  try {
    const raw = localStorage.getItem(WAJIB_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WajibDraft
    if (!parsed || String(parsed.tahun_ajaran_id) !== String(taId)) return null
    if (!Array.isArray(parsed.bulan)) return null
    return {
      tahun_ajaran_id: String(parsed.tahun_ajaran_id),
      bulan: parsed.bulan.map(String),
      nominal: parsed.nominal != null ? String(parsed.nominal) : '20000',
    }
  } catch {
    return null
  }
}

function saveWajibDraft(taId: string, bulan: Set<string> | string[], nominal: string) {
  if (!taId) return
  try {
    const payload: WajibDraft = {
      tahun_ajaran_id: String(taId),
      bulan: Array.from(bulan),
      nominal: String(nominal || '20000'),
    }
    localStorage.setItem(WAJIB_DRAFT_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota */
  }
}

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

function formatKelasLabel(nama: string, kel?: string) {
  return kel ? `${nama} · ${kel}` : nama
}

function formatRp(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '–'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}

function bulanLabel(bulan: number, tahun: number) {
  return `${getBulanName(bulan, 'hijriyah')} ${tahun}`
}

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cellDisabled(cell: SyahriahRingkasRow['bulan'][0]) {
  return cell.nominal == null || Number(cell.nominal) <= 0
}

function cellClass(cell: SyahriahRingkasRow['bulan'][0]) {
  if (cellDisabled(cell)) return 'bg-slate-100/80 dark:bg-white/5 text-slate-400'
  if ((cell.sisa ?? 0) <= 0) return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
  if ((cell.terbayar ?? 0) > 0) return 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
  return 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
}

function cellStatusLabel(cell: SyahriahRingkasRow['bulan'][0]) {
  if (cellDisabled(cell)) return 'Disabled'
  if ((cell.sisa ?? 0) <= 0) return 'Lunas'
  return formatRp(cell.sisa)
}

function alamatSantri(s: SantriRow) {
  const parts = [s.dusun, s.rt && s.rw ? `RT ${s.rt}/RW ${s.rw}` : '', s.desa, s.kecamatan, s.kabupaten, s.provinsi]
  return parts.filter(Boolean).join(', ') || '–'
}

function getInitial(nama: string) {
  const parts = (nama || '').trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return ((nama || '')[0] || '?').toUpperCase()
}

function formatBayarHariTanggal(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '–'
  const d = new Date(`${ymd}T12:00:00`)
  const hari = d.toLocaleDateString('id-ID', { weekday: 'long' })
  return `${hari}, ${formatMasehiDateDisplay(ymd)}`
}

function formatBayarHijriyah(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '–'
  const h = masehiToHijriLocal(ymd, '12:00:00')
  return h ? formatHijriDateDisplay(h) : '–'
}

export default function PembayaranPage() {
  const navigate = useNavigate()
  const { tab: tabParam } = useParams<{ tab?: string }>()
  const tab = parseTab(tabParam)
  const user = getStoredUser()
  const akses = user?.akses || ''
  const pengurusId = user?.id || ''

  const [tahunList, setTahunList] = useState<TahunAjaranRow[]>([])
  const [taId, setTaId] = useState('')
  const [bulanMeta, setBulanMeta] = useState<SyahriahBulanMeta[]>([])
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [selectedKelasIds, setSelectedKelasIds] = useState<Set<string>>(new Set())
  const [kelasMenuOpen, setKelasMenuOpen] = useState(false)
  const [rows, setRows] = useState<SyahriahRingkasRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  // Batch wajib
  const [selectedSantri, setSelectedSantri] = useState<Set<string>>(new Set())
  const [wajibCanvasOpen, setWajibCanvasOpen] = useState(false)
  const [selectedBulan, setSelectedBulan] = useState<Set<string>>(new Set())
  const [nominalWajib, setNominalWajib] = useState('20000')
  const [savingWajib, setSavingWajib] = useState(false)

  // Pembayaran khusus
  const [khususCanvasOpen, setKhususCanvasOpen] = useState(false)
  const [khususNama, setKhususNama] = useState('')
  const [khususNominal, setKhususNominal] = useState('')
  const [khususDeadline, setKhususDeadline] = useState(todayYmd())
  const [khususKet, setKhususKet] = useState('')
  const [savingKhusus, setSavingKhusus] = useState(false)
  const [khususRows, setKhususRows] = useState<SyahriahKhususRow[]>([])
  const [khususSantriList, setKhususSantriList] = useState<SyahriahKhususRow[]>([])
  const [loadingKhusus, setLoadingKhusus] = useState(false)
  const [statusSubTab, setStatusSubTab] = useState<StatusSubTab>('syahriyah')
  const [bayarInnerTab, setBayarInnerTab] = useState<BayarInnerTab>('syahriyah')
  const [khususBayarTarget, setKhususBayarTarget] = useState<SyahriahKhususRow | null>(null)
  const [khususBayarNominal, setKhususBayarNominal] = useState('')
  const [khususBayarVia, setKhususBayarVia] = useState<'cash' | 'tf'>('cash')
  const [khususBayarKet, setKhususBayarKet] = useState('')
  const [savingKhususBayar, setSavingKhususBayar] = useState(false)
  const [khususHistOpenIds, setKhususHistOpenIds] = useState<Set<string>>(new Set())
  const [khususSelectedIds, setKhususSelectedIds] = useState<Set<string>>(new Set())
  const [khususNamaFilter, setKhususNamaFilter] = useState('')
  const [khususStatusFilter, setKhususStatusFilter] = useState<KhususStatusFilter>('')
  const [exportingKhusus, setExportingKhusus] = useState(false)
  const [khususDeleteIds, setKhususDeleteIds] = useState<string[] | null>(null)
  const [deletingKhusus, setDeletingKhusus] = useState(false)
  const [khususEditOpen, setKhususEditOpen] = useState(false)
  const [editKhususNama, setEditKhususNama] = useState('')
  const [editKhususNominal, setEditKhususNominal] = useState('')
  const [editKhususDeadline, setEditKhususDeadline] = useState(todayYmd())
  const [editKhususKet, setEditKhususKet] = useState('')
  const [savingKhususEdit, setSavingKhususEdit] = useState(false)

  // Bayar
  const [cariSantriOpen, setCariSantriOpen] = useState(false)
  const [selectedSantriFull, setSelectedSantriFull] = useState<SantriRow | null>(null)
  const [bayarHist, setBayarHist] = useState<SyahriahBayarRow[]>([])
  const [bayarRingkas, setBayarRingkas] = useState<SyahriahRingkasRow | null>(null)
  const [bayarSheetOpen, setBayarSheetOpen] = useState(false)
  const [bayarNominal, setBayarNominal] = useState('')
  const [bayarVia, setBayarVia] = useState<'cash' | 'tf'>('cash')
  const [bayarKet, setBayarKet] = useState('')
  const [preview, setPreview] = useState<{
    alokasi: { bulan_hijri: number; tahun_hijri: number; nominal: number }[]
    saldo: number
  } | null>(null)
  const [savingBayar, setSavingBayar] = useState(false)
  const [bayarMobileTab, setBayarMobileTab] = useState<BayarMobileTab>('biodata')
  const [editSantriOpen, setEditSantriOpen] = useState(false)
  const [tabMenuOpen, setTabMenuOpen] = useState(false)

  const goTab = (id: TabId) => {
    if (id !== tab) navigate(`/pembayaran/${id}`)
    setTabMenuOpen(false)
    setError('')
    setOkMsg('')
  }

  useEffect(() => {
    if (!user || !isAdminAkses(user.akses)) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (tabParam === 'tahun') {
      navigate('/tahun-ajaran', { replace: true })
      return
    }
    if (tabParam && !TAB_IDS.includes(tabParam as TabId)) {
      navigate('/pembayaran/bayar', { replace: true })
    }
  }, [user, navigate, tabParam])

  const loadTahun = useCallback(async () => {
    if (!akses) return
    const res = await getTahunAjaran(akses)
    if (res.success) {
      setTahunList(res.data)
      setTaId((prev) => {
        if (prev) return prev
        const aktif = res.data.find((t) => Number(t.aktif) === 1)
        return aktif ? String(aktif.id) : res.data[0] ? String(res.data[0].id) : ''
      })
    }
  }, [akses])

  useEffect(() => {
    loadTahun()
    getKelas().then((r) => {
      if (r.success) setKelasList(r.data)
    })
  }, [loadTahun])

  const kelasFilterIds = useMemo(() => Array.from(selectedKelasIds), [selectedKelasIds])

  const loadRingkas = useCallback(async () => {
    if (!akses || !taId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const [bulanRes, ringkasRes] = await Promise.all([
      getSyahriahBulan(akses, taId),
      getSyahriahRingkas(akses, taId, kelasFilterIds.length ? kelasFilterIds : undefined),
    ])
    if (bulanRes.success) setBulanMeta(bulanRes.data)
    if (ringkasRes.success) {
      setRows(ringkasRes.data)
      if (ringkasRes.meta?.bulan) setBulanMeta(ringkasRes.meta.bulan)
    } else {
      setError(ringkasRes.message || 'Gagal memuat data')
      setRows([])
    }
    setLoading(false)
  }, [akses, taId, kelasFilterIds])

  useEffect(() => {
    loadRingkas()
  }, [loadRingkas])

  const loadKhususStatus = useCallback(async () => {
    if (!akses || !taId) {
      setKhususRows([])
      setKhususSelectedIds(new Set())
      return
    }
    setLoadingKhusus(true)
    const res = await getSyahriahKhusus(akses, taId, {
      kelasIds: kelasFilterIds.length ? kelasFilterIds : undefined,
    })
    if (res.success) {
      setKhususRows(res.data)
      setKhususSelectedIds((prev) => {
        const valid = new Set(res.data.map((r) => String(r.id)))
        return new Set(Array.from(prev).filter((id) => valid.has(id)))
      })
    } else {
      setError(res.message || 'Gagal memuat pembayaran khusus')
      setKhususRows([])
      setKhususSelectedIds(new Set())
    }
    setLoadingKhusus(false)
  }, [akses, taId, kelasFilterIds])

  useEffect(() => {
    if (tab === 'ringkas' && statusSubTab === 'khusus') {
      void loadKhususStatus()
    }
  }, [tab, statusSubTab, loadKhususStatus])

  const refreshBayarSantri = useCallback(async () => {
    if (!akses || !taId || !selectedSantriFull?.id) {
      setBayarHist([])
      setBayarRingkas(null)
      setKhususSantriList([])
      return
    }
    const sid = String(selectedSantriFull.id)
    const santriSnap = selectedSantriFull
    const [hist, ringkas, khusus] = await Promise.all([
      getSyahriahBayar(akses, taId, sid),
      getSyahriahRingkas(akses, taId, undefined, sid),
      getSyahriahKhusus(akses, taId, { santriId: sid }),
    ])
    if (hist.success) setBayarHist(hist.data)
    if (khusus.success) setKhususSantriList(khusus.data)
    else setKhususSantriList([])
    if (ringkas.success) {
      const found =
        ringkas.data.find((r) => String(r.santri_id) === sid) ||
        ringkas.data[0] ||
        null
      if (found) {
        setBayarRingkas(found)
      } else {
        const bulanSrc = ringkas.meta?.bulan?.length ? ringkas.meta.bulan : bulanMeta
        setBayarRingkas({
          santri_id: sid,
          nomer_induk: santriSnap.nomer_induk || '',
          nama: santriSnap.nama || '',
          kelas_id: santriSnap.kelas_id || '',
          nama_kelas: santriSnap.nama_kelas || santriSnap.kelas || '',
          kel: santriSnap.kelas_kel || santriSnap.kel || '',
          bulan: bulanSrc.map((b) => ({
            ...b,
            wajib_id: null,
            nominal: null,
            terbayar: 0,
            sisa: null,
          })),
          total_wajib: 0,
          total_terbayar: 0,
          total_sisa: 0,
          total_bayar: 0,
          saldo: 0,
        })
      }
    }
  }, [akses, taId, selectedSantriFull, bulanMeta])

  useEffect(() => {
    refreshBayarSantri()
  }, [refreshBayarSantri])

  useEffect(() => {
    const nom = Number(bayarNominal)
    if (!akses || !taId || !selectedSantriFull?.id || !nom || nom <= 0) {
      setPreview(null)
      return
    }
    const t = window.setTimeout(async () => {
      const res = await previewSyahriahBayar(akses, {
        tahun_ajaran_id: taId,
        santri_id: selectedSantriFull.id,
        nominal: nom,
      })
      if (res.success && res.data) setPreview(res.data)
      else setPreview(null)
    }, 280)
    return () => window.clearTimeout(t)
  }, [akses, taId, selectedSantriFull?.id, bayarNominal])

  const allSantriIds = useMemo(() => rows.map((r) => r.santri_id), [rows])
  const allSelected = allSantriIds.length > 0 && allSantriIds.every((id) => selectedSantri.has(id))

  const kelasFilterLabel = useMemo(() => {
    if (selectedKelasIds.size === 0) return 'Semua kelas'
    if (selectedKelasIds.size === 1) {
      const k = kelasList.find((x) => selectedKelasIds.has(x.id))
      return k ? formatKelasLabel(k.nama_kelas, k.kel) : '1 kelas'
    }
    return `${selectedKelasIds.size} kelas dipilih`
  }, [selectedKelasIds, kelasList])

  const applyWajibDraftOrDefault = useCallback(
    (preferExisting?: { bulan_hijri: number; tahun_hijri: number; nominal: number | null }[]) => {
      const draft = loadWajibDraft(taId)
      const validKeys = new Set(bulanMeta.map((b) => `${b.bulan_hijri}_${b.tahun_hijri}`))
      if (draft) {
        const restored = draft.bulan.filter((k) => validKeys.has(k))
        if (restored.length > 0) {
          setSelectedBulan(new Set(restored))
          setNominalWajib(draft.nominal || '20000')
          return
        }
        if (draft.nominal) setNominalWajib(draft.nominal)
      }
      const existing = (preferExisting || []).filter((b) => b.nominal != null)
      if (existing.length > 0) {
        setSelectedBulan(new Set(existing.map((b) => `${b.bulan_hijri}_${b.tahun_hijri}`)))
        const firstNom = existing.find((b) => b.nominal != null)?.nominal
        setNominalWajib(firstNom != null ? String(Math.round(firstNom)) : '20000')
        return
      }
      setSelectedBulan(new Set(bulanMeta.map((b) => `${b.bulan_hijri}_${b.tahun_hijri}`)))
      setNominalWajib(draft?.nominal || '20000')
    },
    [taId, bulanMeta]
  )

  const openWajibCanvas = () => {
    applyWajibDraftOrDefault()
    setWajibCanvasOpen(true)
  }

  const openWajibUntukSantriTerpilih = () => {
    if (!selectedSantriFull?.id || !taId) return
    setSelectedSantri(new Set([String(selectedSantriFull.id)]))
    applyWajibDraftOrDefault(bayarRingkas?.bulan)
    setWajibCanvasOpen(true)
  }

  const openKhususCanvas = () => {
    setKhususNama('')
    setKhususNominal('')
    setKhususDeadline(todayYmd())
    setKhususKet('')
    setKhususCanvasOpen(true)
  }

  const openKhususUntukSantriTerpilih = () => {
    if (!selectedSantriFull?.id || !taId) return
    setSelectedSantri(new Set([String(selectedSantriFull.id)]))
    openKhususCanvas()
  }

  const toggleKhususHist = (id: string | number) => {
    const key = String(id)
    setKhususHistOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  useEffect(() => {
    if (!wajibCanvasOpen || !taId) return
    saveWajibDraft(taId, selectedBulan, nominalWajib)
  }, [wajibCanvasOpen, taId, selectedBulan, nominalWajib])

  const handleBatchWajib = async (opts?: { nominal?: number; disabled?: boolean }) => {
    setOkMsg('')
    setError('')
    const asDisabled = Boolean(opts?.disabled)
    const nom = asDisabled ? 0 : opts?.nominal != null ? Number(opts.nominal) : Number(nominalWajib)
    if (!taId || selectedSantri.size === 0 || selectedBulan.size === 0 || Number.isNaN(nom) || nom < 0) {
      setError(asDisabled ? 'Pilih santri dan bulan' : 'Lengkapi santri, bulan, dan nominal')
      return
    }
    setSavingWajib(true)
    const bulan = bulanMeta
      .filter((b) => selectedBulan.has(`${b.bulan_hijri}_${b.tahun_hijri}`))
      .map((b) => ({ bulan_hijri: b.bulan_hijri, tahun_hijri: b.tahun_hijri }))
    const santriIds = Array.from(selectedSantri)
    const res = await batchSyahriahWajib(akses, {
      tahun_ajaran_id: taId,
      santri_ids: santriIds,
      bulan,
      nominal: nom,
    })
    setSavingWajib(false)
    if (res.success) {
      if (!asDisabled) saveWajibDraft(taId, selectedBulan, nominalWajib)
      setOkMsg(res.message || (asDisabled ? 'Bulan di-disable' : 'Kewajiban disimpan'))
      setWajibCanvasOpen(false)
      setSelectedSantri(new Set())
      loadRingkas()
      const sid = selectedSantriFull?.id ? String(selectedSantriFull.id) : ''
      if (sid && santriIds.includes(sid)) refreshBayarSantri()
    } else {
      setError(res.message || 'Gagal menyimpan')
    }
  }

  const handleBatchKhusus = async () => {
    setOkMsg('')
    setError('')
    const nama = khususNama.trim()
    const nom = Number(khususNominal)
    if (!taId || selectedSantri.size === 0 || !nama || !khususDeadline || !nom || nom <= 0) {
      setError('Lengkapi santri, nama, nominal, dan terakhir pembayaran')
      return
    }
    setSavingKhusus(true)
    const santriIds = Array.from(selectedSantri)
    const res = await batchSyahriahKhusus(akses, {
      tahun_ajaran_id: taId,
      santri_ids: santriIds,
      nama,
      nominal: nom,
      terakhir_pembayaran: khususDeadline,
      keterangan: khususKet.trim() || undefined,
    })
    setSavingKhusus(false)
    if (res.success) {
      setOkMsg(res.message || 'Pembayaran khusus ditambahkan')
      setKhususCanvasOpen(false)
      setSelectedSantri(new Set())
      if (statusSubTab === 'khusus') void loadKhususStatus()
      const sid = selectedSantriFull?.id ? String(selectedSantriFull.id) : ''
      if (sid && santriIds.includes(sid)) void refreshBayarSantri()
    } else {
      setError(res.message || 'Gagal menyimpan')
    }
  }

  const handleSelectSantriBayar = async (s: SantriRow) => {
    setSelectedSantriFull(s)
    setBayarMobileTab('biodata')
    setBayarSheetOpen(false)
    setKhususBayarTarget(null)
    setBayarInnerTab('syahriyah')
    // pastikan biodata lengkap
    const all = await getSantri()
    if (all.success) {
      const full = all.data.find((x) => x.id === s.id)
      if (full) setSelectedSantriFull(full)
    }
  }

  const handleBayar = async () => {
    setOkMsg('')
    setError('')
    const nom = Number(bayarNominal)
    if (!selectedSantriFull?.id || !nom || nom <= 0) {
      setError('Nominal wajib diisi')
      return
    }
    const sisaTa = bayarRingkas?.total_sisa ?? 0
    if (sisaTa <= 0) {
      setError('Tidak ada sisa kewajiban syahriah tahun ajaran ini')
      return
    }
    if (nom > sisaTa + 0.009) {
      setError(`Nominal melebihi sisa kewajiban tahun ajaran (maksimal ${formatRp(sisaTa)})`)
      return
    }
    if (!pengurusId) {
      setError('Sesi pengguna tidak valid — silakan login ulang')
      return
    }
    setSavingBayar(true)
    const res = await createSyahriahBayar(akses, {
      tahun_ajaran_id: taId,
      santri_id: selectedSantriFull.id,
      nominal: nom,
      tanggal: todayYmd(),
      keterangan: bayarKet,
      via: bayarVia,
      pengurus_id: pengurusId,
    })
    setSavingBayar(false)
    if (res.success) {
      setOkMsg(res.message || 'Pembayaran dicatat')
      setBayarNominal('')
      setBayarKet('')
      setBayarSheetOpen(false)
      refreshBayarSantri()
      loadRingkas()
    } else {
      setError(res.message || 'Gagal mencatat pembayaran')
    }
  }

  const handleDeleteBayar = async (id: string | number) => {
    if (!confirm('Hapus pembayaran ini?')) return
    const res = await deleteSyahriahBayar(akses, id)
    if (res.success) {
      refreshBayarSantri()
      loadRingkas()
    } else setError(res.message || 'Gagal menghapus')
  }

  const openKhususBayar = (row: SyahriahKhususRow) => {
    if (row.lunas || (row.sisa ?? 0) <= 0) return
    setKhususBayarTarget(row)
    setKhususBayarNominal('')
    setKhususBayarVia('cash')
    setKhususBayarKet('')
    setBayarSheetOpen(false)
  }

  const handleKhususBayar = async () => {
    setOkMsg('')
    setError('')
    const nom = Number(khususBayarNominal)
    if (!khususBayarTarget?.id || !nom || nom <= 0) {
      setError('Nominal wajib diisi')
      return
    }
    const sisa = khususBayarTarget.sisa ?? 0
    if (sisa <= 0) {
      setError('Pembayaran khusus ini sudah lunas')
      return
    }
    if (nom > sisa + 0.009) {
      setError(`Nominal melebihi sisa pembayaran khusus (maksimal ${formatRp(sisa)})`)
      return
    }
    if (!pengurusId) {
      setError('Sesi pengguna tidak valid — silakan login ulang')
      return
    }
    setSavingKhususBayar(true)
    const res = await createSyahriahKhususBayar(akses, {
      khusus_id: khususBayarTarget.id,
      nominal: nom,
      tanggal: todayYmd(),
      keterangan: khususBayarKet.trim() || undefined,
      via: khususBayarVia,
      pengurus_id: pengurusId,
    })
    setSavingKhususBayar(false)
    if (res.success) {
      setOkMsg(res.message || 'Pembayaran khusus dicatat')
      setKhususBayarTarget(null)
      setKhususBayarNominal('')
      setKhususBayarKet('')
      void refreshBayarSantri()
      if (statusSubTab === 'khusus') void loadKhususStatus()
    } else {
      setError(res.message || 'Gagal mencatat pembayaran')
    }
  }

  const handleDeleteKhususBayar = async (id: string | number) => {
    if (!confirm('Hapus pembayaran khusus ini?')) return
    const res = await deleteSyahriahKhususBayar(akses, id)
    if (res.success) {
      void refreshBayarSantri()
      if (statusSubTab === 'khusus') void loadKhususStatus()
    } else setError(res.message || 'Gagal menghapus')
  }

  const askDeleteKhusus = (ids: Array<string | number>) => {
    const clean = Array.from(new Set(ids.map(String).filter(Boolean)))
    if (clean.length === 0) return
    setKhususDeleteIds(clean)
  }

  const confirmDeleteKhusus = async () => {
    if (!khususDeleteIds?.length) return
    setDeletingKhusus(true)
    setError('')
    const res =
      khususDeleteIds.length === 1
        ? await deleteSyahriahKhusus(akses, khususDeleteIds[0])
        : await batchDeleteSyahriahKhusus(akses, khususDeleteIds)
    setDeletingKhusus(false)
    if (res.success) {
      setOkMsg(res.message || 'Pembayaran khusus dihapus')
      setKhususDeleteIds(null)
      setKhususSelectedIds(new Set())
      void loadKhususStatus()
      void refreshBayarSantri()
    } else {
      setError(res.message || 'Gagal menghapus')
    }
  }

  const openKhususEditMasal = () => {
    const selected = khususRows.filter((k) => khususSelectedIds.has(String(k.id)))
    if (selected.length === 0) return
    const first = selected[0]
    const sameNama = selected.every((k) => k.nama === first.nama)
    const sameNominal = selected.every((k) => Number(k.nominal) === Number(first.nominal))
    const sameDeadline = selected.every((k) => k.terakhir_pembayaran === first.terakhir_pembayaran)
    const sameKet = selected.every((k) => (k.keterangan || '') === (first.keterangan || ''))
    setEditKhususNama(sameNama ? first.nama : '')
    setEditKhususNominal(sameNominal ? String(Math.round(Number(first.nominal) || 0)) : '')
    setEditKhususDeadline(sameDeadline ? first.terakhir_pembayaran : todayYmd())
    setEditKhususKet(sameKet ? first.keterangan || '' : '')
    setKhususEditOpen(true)
  }

  const handleBatchUpdateKhusus = async () => {
    const ids = Array.from(khususSelectedIds)
    if (ids.length === 0) {
      setError('Pilih minimal satu pembayaran khusus')
      return
    }
    const nama = editKhususNama.trim()
    const nom = Number(editKhususNominal)
    if (!nama || !nom || nom <= 0 || !editKhususDeadline) {
      setError('Lengkapi nama, nominal, dan terakhir pembayaran')
      return
    }
    setSavingKhususEdit(true)
    setError('')
    const res = await batchUpdateSyahriahKhusus(akses, {
      ids,
      nama,
      nominal: nom,
      terakhir_pembayaran: editKhususDeadline,
      keterangan: editKhususKet.trim(),
    })
    setSavingKhususEdit(false)
    if (res.success) {
      setOkMsg(res.message || 'Pembayaran khusus diperbarui')
      setKhususEditOpen(false)
      setKhususSelectedIds(new Set())
      void loadKhususStatus()
      void refreshBayarSantri()
    } else {
      setError(res.message || 'Gagal memperbarui')
    }
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'bayar', label: 'Bayar', icon: 'payments' },
    { id: 'ringkas', label: 'Status', icon: 'grid_view' },
    { id: 'wajib', label: 'Atur Wajib', icon: 'edit_note' },
  ]
  const activeTabMeta = tabs.find((t) => t.id === tab) || tabs[0]

  const kewajibanBulan = useMemo(() => {
    if (bayarRingkas?.bulan?.length) return bayarRingkas.bulan
    if (!selectedSantriFull || bulanMeta.length === 0) return []
    return bulanMeta.map((b) => ({
      ...b,
      wajib_id: null as number | null,
      nominal: null as number | null,
      terbayar: 0,
      sisa: null as number | null,
    }))
  }, [bayarRingkas, selectedSantriFull, bulanMeta])

  const hasWajibSantri = useMemo(
    () =>
      (bayarRingkas?.total_wajib ?? 0) > 0 ||
      Boolean(bayarRingkas?.bulan?.some((b) => b.nominal != null && Number(b.nominal) > 0)),
    [bayarRingkas]
  )

  const khususNamaOptions = useMemo(() => {
    const set = new Set<string>()
    khususRows.forEach((k) => {
      const n = (k.nama || '').trim()
      if (n) set.add(n)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'))
  }, [khususRows])

  const khususFilteredRows = useMemo(() => {
    return khususRows.filter((k) => {
      if (khususNamaFilter && k.nama !== khususNamaFilter) return false
      if (khususStatusFilter === 'lunas' && !k.lunas) return false
      if (khususStatusFilter === 'kurang' && (k.lunas || !k.sudah_bayar)) return false
      if (khususStatusFilter === 'belum' && k.sudah_bayar) return false
      return true
    })
  }, [khususRows, khususNamaFilter, khususStatusFilter])

  const taLabel = useMemo(
    () => tahunList.find((t) => String(t.id) === String(taId))?.label || '',
    [tahunList, taId]
  )

  const handleExportKhusus = async () => {
    setError('')
    if (khususFilteredRows.length === 0) {
      setError('Tidak ada data untuk diekspor')
      return
    }
    setExportingKhusus(true)
    try {
      await exportSyahriahKhususToExcel(khususFilteredRows, { tahunAjaranLabel: taLabel })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengekspor ke Excel')
    } finally {
      setExportingKhusus(false)
    }
  }

  const khususFilteredIds = useMemo(
    () => khususFilteredRows.map((k) => String(k.id)),
    [khususFilteredRows]
  )

  const khususAllFilteredSelected =
    khususFilteredIds.length > 0 && khususFilteredIds.every((id) => khususSelectedIds.has(id))

  const toggleKhususSelectAll = () => {
    setKhususSelectedIds((prev) => {
      const next = new Set(prev)
      if (khususAllFilteredSelected) {
        khususFilteredIds.forEach((id) => next.delete(id))
      } else {
        khususFilteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const toggleKhususSelectOne = (id: string | number) => {
    const key = String(id)
    setKhususSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const wajibCanvasSubtitle = useMemo(() => {
    if (selectedSantri.size === 1 && selectedSantriFull) {
      const only = Array.from(selectedSantri)[0]
      if (String(selectedSantriFull.id) === only) {
        return selectedSantriFull.nama || '1 santri'
      }
    }
    return `${selectedSantri.size} santri dipilih`
  }, [selectedSantri, selectedSantriFull])

  if (!isAdminAkses(akses)) return null

  const handleSantriSaved = async (saved: SantriRow) => {
    const sid = String(saved.id || selectedSantriFull?.id || '')
    const all = await getSantri()
    if (all.success && sid) {
      const full = all.data.find((x) => String(x.id) === sid)
      if (full) {
        setSelectedSantriFull(full)
        return
      }
    }
    setSelectedSantriFull((prev) => (prev ? { ...prev, ...saved } : saved))
  }

  const biodataPanel = selectedSantriFull ? (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-sky-500 text-white p-3.5 sm:p-4">
        <div
          className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/10"
          aria-hidden
        />
        <div className="relative flex items-start gap-2.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 text-sm font-bold ring-1 ring-white/30">
            {getInitial(selectedSantriFull.nama || '')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug tracking-tight">{selectedSantriFull.nama}</p>
            <p className="mt-0.5 text-xs text-white/85">NIS {selectedSantriFull.nomer_induk || '–'}</p>
            <p className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium ring-1 ring-white/20">
              <MaterialIcon name="school" size={13} />
              <span className="truncate">
                {formatKelasLabel(
                  selectedSantriFull.nama_kelas || selectedSantriFull.kelas || '',
                  selectedSantriFull.kelas_kel || selectedSantriFull.kel
                ) || 'Belum ada kelas'}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setCariSantriOpen(true)}
              title="Ganti santri"
              aria-label="Ganti santri"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25 transition"
            >
              <MaterialIcon name="person_search" size={18} />
            </button>
            <button
              type="button"
              onClick={() => setEditSantriOpen(true)}
              title="Edit santri"
              aria-label="Edit santri"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25 transition"
            >
              <MaterialIcon name="edit" size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <div className="rounded-xl border ui-divider bg-slate-50/70 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider ui-text-muted mb-1.5">Orang tua</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0">
              <p className="text-[11px] ui-text-muted">Ayah</p>
              <p className="ui-text-strong mt-0.5 text-sm truncate">{selectedSantriFull.ayah || '–'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[11px] ui-text-muted">Ibu</p>
              <p className="ui-text-strong mt-0.5 text-sm truncate">{selectedSantriFull.ibu || '–'}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border ui-divider bg-slate-50/70 dark:bg-white/[0.03] px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider ui-text-muted mb-1.5">Alamat</p>
          <p className="text-sm leading-relaxed ui-text">{alamatSantri(selectedSantriFull)}</p>
        </div>

        {(selectedSantriFull.tempat_lahir || selectedSantriFull.tanggal_lahir || selectedSantriFull.jenis_kelamin) && (
          <div className="rounded-xl border ui-divider bg-slate-50/70 dark:bg-white/[0.03] px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider ui-text-muted mb-1.5">Identitas</p>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {selectedSantriFull.jenis_kelamin && (
                <span className="rounded-md border ui-divider px-2 py-0.5 ui-text">
                  {selectedSantriFull.jenis_kelamin === 'L'
                    ? 'Laki-laki'
                    : selectedSantriFull.jenis_kelamin === 'P'
                      ? 'Perempuan'
                      : selectedSantriFull.jenis_kelamin}
                </span>
              )}
              {(selectedSantriFull.tempat_lahir || selectedSantriFull.tanggal_lahir) && (
                <span className="rounded-md border ui-divider px-2 py-0.5 ui-text">
                  {[selectedSantriFull.tempat_lahir, selectedSantriFull.tanggal_lahir].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null

  const riwayatInnerTabs = (
    <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100/80 dark:bg-slate-900/50 border ui-divider mb-3">
      {(
        [
          { id: 'syahriyah' as const, label: 'Syahriyah' },
          { id: 'khusus' as const, label: 'Khusus' },
        ] as const
      ).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => {
            setBayarInnerTab(t.id)
            setBayarSheetOpen(false)
            setKhususBayarTarget(null)
          }}
          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
            bayarInnerTab === t.id
              ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-sm'
              : 'ui-text-muted'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )

  const riwayatPanelSyahriyah = (
    <div className="space-y-3">
      {selectedSantriFull && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-1.5 text-sm">
            <div className="rounded-lg border ui-divider px-2.5 py-2">
              <p className="text-[10px] ui-text-muted">Total wajib</p>
              <p className="tabular-nums ui-text-strong mt-0.5 text-sm">
                {formatRp(bayarRingkas?.total_wajib ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border ui-divider px-2.5 py-2">
              <p className="text-[10px] ui-text-muted">Terbayar</p>
              <p className="tabular-nums mt-0.5 text-sm">{formatRp(bayarRingkas?.total_terbayar ?? 0)}</p>
            </div>
            <div className="rounded-lg border ui-divider px-2.5 py-2">
              <p className="text-[10px] ui-text-muted">Sisa</p>
              <p className="tabular-nums font-semibold text-rose-600 dark:text-rose-400 mt-0.5 text-sm">
                {formatRp(bayarRingkas?.total_sisa ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border ui-divider px-2.5 py-2">
              <p className="text-[10px] ui-text-muted">Saldo</p>
              <p className="tabular-nums text-amber-700 dark:text-amber-300 mt-0.5 text-sm">
                {formatRp(bayarRingkas?.saldo ?? 0)}
              </p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide ui-text-muted">
                Kewajiban tahun ajaran
              </p>
              {hasWajibSantri && (bayarRingkas?.total_sisa ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setKhususBayarTarget(null)
                    setBayarNominal('')
                    setBayarVia('cash')
                    setBayarKet('')
                    setBayarSheetOpen(true)
                  }}
                  disabled={!taId}
                  className="ui-btn-primary px-2.5 py-1 text-[11px] disabled:opacity-60"
                >
                  Bayar
                </button>
              )}
            </div>
            {kewajibanBulan.length === 0 ? (
              <p className="text-sm ui-text-muted">Memuat bulan…</p>
            ) : (
              <ul className="space-y-1">
                {kewajibanBulan.map((b) => (
                  <li
                    key={`${b.bulan_hijri}_${b.tahun_hijri}`}
                    className={`flex items-center justify-between gap-2 text-xs rounded-lg border ui-divider px-2.5 py-1.5 ${
                      cellDisabled(b) ? 'opacity-70' : ''
                    }`}
                  >
                    <span className={`ui-text-muted truncate ${cellDisabled(b) ? 'line-through' : ''}`}>
                      {bulanLabel(b.bulan_hijri, b.tahun_hijri)}
                    </span>
                    <span className="flex items-center gap-2 shrink-0 tabular-nums">
                      <span className={`ui-text-muted ${cellDisabled(b) ? 'line-through' : ''}`}>
                        {b.nominal != null && Number(b.nominal) > 0 ? formatRp(b.nominal) : '–'}
                      </span>
                      <span className={`${cellClass(b)} px-1.5 py-0.5 rounded min-w-[4.5rem] text-right`}>
                        {cellStatusLabel(b)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide ui-text-muted mb-2">Riwayat bayar</p>
        {bayarHist.length === 0 ? (
          <p className="text-sm ui-text-muted">Belum ada pembayaran</p>
        ) : (
          <ul className="space-y-2">
            {bayarHist.map((b) => (
              <li key={b.id} className="rounded-xl border ui-divider p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="ui-text-strong tabular-nums">{formatRp(b.nominal)}</p>
                    <p className="text-xs ui-text-muted">{formatBayarHariTanggal(b.tanggal)}</p>
                    <p className="text-xs ui-text-muted">Hijriyah: {formatBayarHijriyah(b.tanggal)}</p>
                    <p className="text-xs ui-text-muted">
                      Via {(b.via || 'cash').toUpperCase()}
                      {b.keterangan ? ` · ${b.keterangan}` : ''}
                    </p>
                    <p className="text-xs ui-text-muted">Admin: {b.pengurus_nama || '–'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteBayar(b.id)}
                    className="text-rose-600 dark:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10"
                  >
                    <MaterialIcon name="delete" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  const riwayatPanelKhusus = (
    <div className="space-y-2">
      {khususSantriList.length === 0 ? (
        <p className="text-sm ui-text-muted py-4 text-center">Belum ada pembayaran khusus</p>
      ) : (
        <ul className="space-y-2">
          {khususSantriList.map((k) => {
            const histOpen = khususHistOpenIds.has(String(k.id))
            const bayarList = k.bayar || []
            return (
              <li key={k.id} className="rounded-xl border ui-divider p-3 text-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="ui-text-strong truncate">{k.nama}</p>
                    <p className="text-xs ui-text-muted mt-0.5">
                      Wajib {formatRp(k.nominal)} · Sisa {formatRp(k.sisa)}
                      {k.lunas ? ' · Lunas' : k.sudah_bayar ? ' · Cicilan' : ''}
                    </p>
                    <p className="text-xs ui-text-muted mt-0.5">Terakhir: {k.terakhir_pembayaran}</p>
                    {k.keterangan ? <p className="text-xs ui-text-muted mt-0.5">{k.keterangan}</p> : null}
                  </div>
                  {!k.lunas && (k.sisa ?? 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => openKhususBayar(k)}
                      disabled={!taId}
                      className="ui-btn-primary px-2.5 py-1 text-[11px] shrink-0 disabled:opacity-60"
                    >
                      Bayar
                    </button>
                  ) : (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                      Lunas
                    </span>
                  )}
                </div>
                {bayarList.length > 0 && (
                  <div className="border-t ui-divider pt-1.5">
                    <button
                      type="button"
                      onClick={() => toggleKhususHist(k.id)}
                      className="w-full flex items-center justify-between gap-2 py-1 text-xs font-medium ui-text-muted hover:text-blue-600 dark:hover:text-blue-300 transition"
                      aria-expanded={histOpen}
                    >
                      <span>Riwayat bayar ({bayarList.length})</span>
                      <MaterialIcon
                        name="expand_more"
                        size={18}
                        className={`transition-transform ${histOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {histOpen && (
                        <motion.ul
                          key={`khusus-hist-${k.id}`}
                          className="space-y-1.5 pt-1.5 overflow-hidden"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          {bayarList.map((b) => (
                            <li
                              key={b.id}
                              className="flex items-start justify-between gap-2 text-xs rounded-lg border ui-divider px-2.5 py-2"
                            >
                              <div className="min-w-0 space-y-0.5">
                                <p className="tabular-nums ui-text-strong">{formatRp(b.nominal)}</p>
                                <p className="ui-text-muted">{formatBayarHariTanggal(b.tanggal)}</p>
                                <p className="ui-text-muted">Hijriyah: {formatBayarHijriyah(b.tanggal)}</p>
                                <p className="ui-text-muted">
                                  Via {(b.via || 'cash').toUpperCase()}
                                  {b.keterangan ? ` · ${b.keterangan}` : ''}
                                </p>
                                <p className="ui-text-muted">Admin: {b.pengurus_nama || '–'}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDeleteKhususBayar(b.id)}
                                className="text-rose-600 dark:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10 shrink-0"
                              >
                                <MaterialIcon name="delete" size={16} />
                              </button>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )

  const riwayatPanel = (
    <div>
      {riwayatInnerTabs}
      {bayarInnerTab === 'syahriyah' ? riwayatPanelSyahriyah : riwayatPanelKhusus}
    </div>
  )

  return (
    <div className="max-w-7xl h-full min-h-0 flex flex-col overflow-hidden gap-2">
      <div
        className={`ui-card px-2.5 py-2 shrink-0 overflow-visible ${
          kelasMenuOpen || tabMenuOpen ? 'relative z-40' : 'relative z-20'
        }`}
      >
        <div className={`flex flex-wrap items-end gap-2 ${kelasMenuOpen || tabMenuOpen ? 'relative z-40' : ''}`}>
          <div className="min-w-[8.5rem] flex-1 sm:flex-none sm:w-40">
            <label className="ui-label mb-0.5 block text-[10px] leading-tight">Tahun ajaran</label>
            <select
              value={taId}
              onChange={(e) => setTaId(e.target.value)}
              className="ui-input appearance-none w-full !py-1.5 !text-xs !rounded-lg"
            >
              {tahunList.length === 0 && <option value="">Belum ada</option>}
              {tahunList.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.label}
                  {Number(t.aktif) === 1 ? ' · aktif' : ''}
                </option>
              ))}
            </select>
          </div>

          {(tab === 'ringkas' || tab === 'wajib') && (
            <div className={`relative min-w-[8rem] flex-1 sm:flex-none sm:w-44 ${kelasMenuOpen ? 'z-50' : 'z-10'}`}>
              <label className="ui-label mb-0.5 block text-[10px] leading-tight">Filter kelas</label>
              <button
                type="button"
                onClick={() => {
                  setTabMenuOpen(false)
                  setKelasMenuOpen((v) => !v)
                }}
                className="ui-input w-full text-left flex items-center justify-between gap-1 !py-1.5 !text-xs !rounded-lg"
              >
                <span className="truncate">{kelasFilterLabel}</span>
                <MaterialIcon name="expand_more" size={16} />
              </button>
              {kelasMenuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[60]"
                    aria-label="Tutup"
                    onClick={() => setKelasMenuOpen(false)}
                  />
                  <div className="absolute left-0 right-0 top-full z-[70] mt-0.5 max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-xl p-1.5 space-y-0.5 text-xs">
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/5"
                      onClick={() => {
                        setSelectedKelasIds(new Set())
                        setKelasMenuOpen(false)
                      }}
                    >
                      Semua kelas
                    </button>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/5"
                      onClick={() => setSelectedKelasIds(new Set(kelasList.map((k) => k.id)))}
                    >
                      Centang semua
                    </button>
                    <div className="h-px bg-slate-200 dark:bg-white/10 my-0.5" />
                    {kelasList.map((k) => {
                      const on = selectedKelasIds.has(k.id)
                      return (
                        <label
                          key={k.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              setSelectedKelasIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(k.id)) next.delete(k.id)
                                else next.add(k.id)
                                return next
                              })
                            }}
                          />
                          {formatKelasLabel(k.nama_kelas, k.kel)}
                        </label>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Tabs desktop: sejajar select */}
          <div className="hidden md:flex flex-1 items-end justify-end min-w-0">
            <div className="relative flex flex-wrap gap-0.5 p-0.5 rounded-lg bg-slate-100/80 dark:bg-slate-900/50 border ui-divider">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => goTab(t.id)}
                  className={`relative z-[1] flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                    tab === t.id
                      ? 'text-blue-600 dark:text-blue-300'
                      : 'ui-text-muted hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab === t.id && (
                    <motion.span
                      layoutId="syahriah-tab-pill"
                      className="absolute inset-0 rounded-md bg-white dark:bg-slate-800 shadow-sm"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative z-[1] flex items-center gap-1">
                    <MaterialIcon name={t.icon} size={16} />
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Tabs mobile: 1 icon + label → menu */}
          <div className="relative md:hidden ml-auto">
            <label className="ui-label mb-0.5 block text-[10px] leading-tight opacity-0 select-none">Menu</label>
            <button
              type="button"
              onClick={() => {
                setKelasMenuOpen(false)
                setTabMenuOpen((v) => !v)
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ui-divider bg-slate-100/80 dark:bg-slate-900/50"
            >
              <MaterialIcon name={activeTabMeta.icon} size={16} />
              <span>{activeTabMeta.label}</span>
              <MaterialIcon name="expand_more" size={16} />
            </button>
            {tabMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-[60]"
                  aria-label="Tutup menu"
                  onClick={() => setTabMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-[70] mt-0.5 w-44 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 shadow-xl p-1 space-y-0.5">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => goTab(t.id)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-left ${
                        tab === t.id
                          ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300 font-medium'
                          : 'ui-text-muted hover:bg-slate-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <MaterialIcon name={t.icon} size={16} />
                      {t.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {(error || okMsg) && (
        <div className="shrink-0 space-y-1.5">
          {error && <div className="ui-error-box px-3 py-2 text-xs">{error}</div>}
          {okMsg && (
            <div className="px-3 py-2 text-xs rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
              {okMsg}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            className="flex-1 min-h-0 overflow-hidden flex flex-col"
            initial={tabPanelMotion.initial}
            animate={tabPanelMotion.animate}
            exit={tabPanelMotion.exit}
            transition={tabPanelMotion.transition}
          >
      {/* ===== STATUS ===== */}
      {tab === 'ringkas' && (
        <div className="h-full min-h-0 flex flex-col overflow-hidden gap-2">
          <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100/80 dark:bg-slate-900/50 border ui-divider shrink-0 self-start">
            {(
              [
                { id: 'syahriyah' as const, label: 'Syahriyah' },
                { id: 'khusus' as const, label: 'Khusus' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusSubTab(t.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  statusSubTab === t.id
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'ui-text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {statusSubTab === 'syahriyah' ? (
            <div className="ui-table-wrap overflow-auto flex-1 min-h-0">
              {loading ? (
                <ContentSkeleton rows={6} className="p-4" />
              ) : !taId ? (
                <div className="py-12 text-center ui-text-muted text-sm">Buat tahun ajaran terlebih dahulu</div>
              ) : rows.length === 0 ? (
                <div className="py-12 text-center ui-text-muted text-sm">Tidak ada santri</div>
              ) : (
                <table className="w-full text-sm text-left min-w-[900px]">
                  <thead className="ui-table-head">
                    <tr>
                      <th className="px-3 py-3 sticky left-0 bg-slate-100 dark:bg-slate-900/80 z-10">Santri</th>
                      {bulanMeta.map((b) => (
                        <th
                          key={`${b.bulan_hijri}_${b.tahun_hijri}`}
                          className="px-2 py-3 text-center whitespace-nowrap"
                        >
                          <div className="text-xs">{getBulanName(b.bulan_hijri, 'hijriyah')}</div>
                          <div className="text-[10px] opacity-70">{b.tahun_hijri}</div>
                        </th>
                      ))}
                      <th className="px-3 py-3 text-right whitespace-nowrap">Total bayar</th>
                      <th className="px-3 py-3 text-right">Sisa</th>
                    </tr>
                  </thead>
                  <tbody className="ui-table-body">
                    {rows.map((r) => (
                      <tr key={r.santri_id} className="ui-table-row">
                        <td className="px-3 py-2 sticky left-0 bg-white dark:bg-slate-800/90 z-10 min-w-[10rem]">
                          <div className="ui-text-strong truncate">{r.nama}</div>
                          <div className="text-xs ui-text-muted">
                            {r.nomer_induk} · {formatKelasLabel(r.nama_kelas, r.kel)}
                          </div>
                        </td>
                        {r.bulan.map((c) => (
                          <td
                            key={`${c.bulan_hijri}_${c.tahun_hijri}`}
                            className={`px-1.5 py-2 text-center text-xs tabular-nums ${cellClass(c)}`}
                          >
                            {cellStatusLabel(c)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums">{formatRp(r.total_bayar)}</td>
                        <td className="px-3 py-2 text-right tabular-nums ui-text-strong">{formatRp(r.total_sisa)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden gap-2">
              <div className="flex flex-wrap items-end gap-2 shrink-0 px-0.5">
                <div className="min-w-[9rem] flex-1 sm:flex-none sm:w-44">
                  <label className="ui-label mb-0.5 block text-[10px] leading-tight">Filter nama</label>
                  <select
                    value={khususNamaFilter}
                    onChange={(e) => setKhususNamaFilter(e.target.value)}
                    className="ui-input appearance-none w-full !py-1.5 !text-xs !rounded-lg"
                  >
                    <option value="">Semua nama</option>
                    {khususNamaOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-[8rem] flex-1 sm:flex-none sm:w-36">
                  <label className="ui-label mb-0.5 block text-[10px] leading-tight">Status</label>
                  <select
                    value={khususStatusFilter}
                    onChange={(e) => setKhususStatusFilter(e.target.value as KhususStatusFilter)}
                    className="ui-input appearance-none w-full !py-1.5 !text-xs !rounded-lg"
                  >
                    <option value="">Semua status</option>
                    <option value="lunas">Lunas</option>
                    <option value="kurang">Kurang</option>
                    <option value="belum">Belum</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5 ml-auto flex-wrap justify-end">
                  <button
                    type="button"
                    disabled={exportingKhusus || khususFilteredRows.length === 0}
                    onClick={() => void handleExportKhusus()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border ui-divider ui-text-strong hover:border-emerald-500/40 hover:bg-emerald-500/10 disabled:opacity-45"
                  >
                    <MaterialIcon name="download" size={16} />
                    {exportingKhusus ? 'Ekspor…' : 'Ekspor xlsx'}
                  </button>
                  <button
                    type="button"
                    disabled={khususSelectedIds.size === 0}
                    onClick={openKhususEditMasal}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border ui-divider ui-text-strong hover:border-blue-500/40 hover:bg-blue-500/10 disabled:opacity-45"
                  >
                    <MaterialIcon name="edit" size={16} />
                    Edit ({khususSelectedIds.size})
                  </button>
                  <button
                    type="button"
                    disabled={khususSelectedIds.size === 0}
                    onClick={() => askDeleteKhusus(Array.from(khususSelectedIds))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-45"
                  >
                    <MaterialIcon name="delete" size={16} />
                    Hapus ({khususSelectedIds.size})
                  </button>
                </div>
              </div>

              <div className="ui-table-wrap overflow-auto flex-1 min-h-0">
                {loadingKhusus ? (
                  <ContentSkeleton rows={6} className="p-4" />
                ) : !taId ? (
                  <div className="py-12 text-center ui-text-muted text-sm">Buat tahun ajaran terlebih dahulu</div>
                ) : khususRows.length === 0 ? (
                  <div className="py-12 text-center ui-text-muted text-sm">Belum ada pembayaran khusus</div>
                ) : khususFilteredRows.length === 0 ? (
                  <div className="py-12 text-center ui-text-muted text-sm">Tidak ada data untuk filter ini</div>
                ) : (
                  <table className="w-full text-sm text-left min-w-[900px]">
                    <thead className="ui-table-head">
                      <tr>
                        <th className="px-2 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={khususAllFilteredSelected}
                            onChange={toggleKhususSelectAll}
                            aria-label={khususAllFilteredSelected ? 'Batal centang semua' : 'Centang semua'}
                            title={khususAllFilteredSelected ? 'Batal centang semua' : 'Centang semua'}
                          />
                        </th>
                        <th className="px-3 py-3">Santri</th>
                        <th className="px-3 py-3">Nama</th>
                        <th className="px-3 py-3 text-right">Nominal</th>
                        <th className="px-3 py-3 text-right">Terbayar</th>
                        <th className="px-3 py-3 text-right">Sisa</th>
                        <th className="px-3 py-3 whitespace-nowrap">Terakhir pembayaran</th>
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3">Keterangan</th>
                        <th className="px-3 py-3 w-12" />
                      </tr>
                    </thead>
                    <tbody className="ui-table-body">
                      {khususFilteredRows.map((k) => (
                        <tr key={k.id} className="ui-table-row">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={khususSelectedIds.has(String(k.id))}
                              onChange={() => toggleKhususSelectOne(k.id)}
                              aria-label={`Pilih ${k.nama_santri || k.nama}`}
                            />
                          </td>
                          <td className="px-3 py-2 min-w-[10rem]">
                            <div className="ui-text-strong truncate">{k.nama_santri}</div>
                            <div className="text-xs ui-text-muted">
                              {k.nomer_induk} · {formatKelasLabel(k.nama_kelas || '', k.kel)}
                            </div>
                          </td>
                          <td className="px-3 py-2 ui-text-strong">{k.nama}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatRp(k.nominal)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatRp(k.total_bayar)}</td>
                          <td className="px-3 py-2 text-right tabular-nums ui-text-strong">{formatRp(k.sisa)}</td>
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">{k.terakhir_pembayaran}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                k.lunas
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                  : k.sudah_bayar
                                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                              }`}
                            >
                              {k.lunas ? 'Lunas' : k.sudah_bayar ? 'Kurang' : 'Belum'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs ui-text-muted max-w-[12rem] truncate">
                            {k.keterangan || '–'}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => askDeleteKhusus([k.id])}
                              className="text-rose-600 dark:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10"
                              title="Hapus"
                            >
                              <MaterialIcon name="delete" size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== ATUR WAJIB ===== */}
      {tab === 'wajib' && (
        <div className="ui-card p-3 sm:p-4 h-full min-h-0 flex flex-col overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 mb-2">
            <h2 className="ui-text-strong text-sm">Pilih santri</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (allSelected) setSelectedSantri(new Set())
                  else setSelectedSantri(new Set(allSantriIds))
                }}
                className="text-xs text-blue-600 dark:text-blue-400 font-medium"
              >
                {allSelected ? 'Hapus semua' : 'Centang semua'}
              </button>
              <button
                type="button"
                disabled={selectedSantri.size === 0 || !taId}
                onClick={openWajibCanvas}
                className="ui-btn-primary px-3 py-1.5 text-xs disabled:opacity-50"
              >
                Syahriyah ({selectedSantri.size})
              </button>
              <button
                type="button"
                disabled={selectedSantri.size === 0 || !taId}
                onClick={openKhususCanvas}
                className="px-3 py-1.5 text-xs rounded-lg border ui-divider ui-text-strong hover:border-blue-500/40 hover:bg-blue-500/10 disabled:opacity-50"
              >
                Khusus ({selectedSantri.size})
              </button>
            </div>
          </div>
          {loading ? (
            <ContentSkeleton rows={5} />
          ) : (
            <ul className="space-y-1 flex-1 min-h-0 overflow-y-auto">
              {rows.map((r) => (
                <li key={r.santri_id}>
                  <label className="ui-list-item !cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedSantri.has(r.santri_id)}
                      onChange={() => {
                        setSelectedSantri((prev) => {
                          const next = new Set(prev)
                          if (next.has(r.santri_id)) next.delete(r.santri_id)
                          else next.add(r.santri_id)
                          return next
                        })
                      }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="ui-text-strong block truncate">{r.nama}</span>
                      <span className="text-xs ui-text-muted">
                        {r.nomer_induk} · {formatKelasLabel(r.nama_kelas, r.kel)}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ===== BAYAR ===== */}
      {tab === 'bayar' && (
        <div className="h-full min-h-0 flex flex-col gap-2 overflow-hidden">
          {!selectedSantriFull ? (
            <div className="ui-card flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="ui-text-muted text-sm max-w-sm">
                Pilih santri untuk melihat biodata dan riwayat pembayaran.
              </p>
              <button
                type="button"
                onClick={() => setCariSantriOpen(true)}
                className="ui-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
              >
                <MaterialIcon name="person_search" size={18} />
                Cari santri
              </button>
            </div>
          ) : (
            <>
              <div className="lg:hidden flex gap-1 p-0.5 rounded-lg bg-slate-100/80 dark:bg-slate-900/50 border ui-divider shrink-0">
                {(
                  [
                    { id: 'biodata' as const, label: 'Biodata' },
                    { id: 'riwayat' as const, label: 'Kewajiban' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBayarMobileTab(t.id)}
                    className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition ${
                      bayarMobileTab === t.id
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-300 shadow-sm'
                        : 'ui-text-muted'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 flex-1 min-h-0 overflow-hidden">
                <div
                  className={`ui-card p-3 sm:p-3.5 min-h-0 overflow-y-auto overscroll-contain ${
                    bayarMobileTab === 'biodata' ? 'flex flex-col' : 'hidden'
                  } lg:flex lg:flex-col`}
                >
                  {biodataPanel}
                </div>

                <div
                  className={`ui-card p-0 relative min-h-0 flex-col overflow-hidden ${
                    bayarMobileTab === 'riwayat' ? 'flex' : 'hidden'
                  } lg:flex`}
                >
                  <div className="flex items-start justify-between gap-2 px-3 sm:px-3.5 pt-3 pb-2 shrink-0 border-b ui-divider">
                    <div className="min-w-0 pr-1">
                      <h2 className="ui-text-strong text-sm leading-tight">Kewajiban &amp; riwayat</h2>
                      <p className="text-[11px] mt-0.5 truncate ui-text-muted opacity-80">
                        {selectedSantriFull.nama}
                        {selectedSantriFull.nomer_induk ? ` · ${selectedSantriFull.nomer_induk}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {bayarInnerTab === 'syahriyah' ? (
                        hasWajibSantri ? (
                          <button
                            type="button"
                            onClick={openWajibUntukSantriTerpilih}
                            disabled={!taId}
                            title="Atur syahriyah"
                            aria-label="Atur syahriyah"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border ui-divider ui-text-muted hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-500/40 hover:bg-blue-500/10 transition disabled:opacity-60"
                          >
                            <MaterialIcon name="edit_note" size={18} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={openWajibUntukSantriTerpilih}
                            disabled={!taId}
                            className="ui-btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
                          >
                            Atur syahriyah
                          </button>
                        )
                      ) : khususSantriList.length > 0 ? (
                        <button
                          type="button"
                          onClick={openKhususUntukSantriTerpilih}
                          disabled={!taId}
                          title="Atur khusus"
                          aria-label="Atur khusus"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border ui-divider ui-text-muted hover:text-blue-600 dark:hover:text-blue-300 hover:border-blue-500/40 hover:bg-blue-500/10 transition disabled:opacity-60"
                        >
                          <MaterialIcon name="edit_note" size={18} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={openKhususUntukSantriTerpilih}
                          disabled={!taId}
                          className="ui-btn-primary px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          Atur khusus
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-3.5 py-2.5">
                    {riwayatPanel}
                  </div>

                  <AnimatePresence>
                    {(bayarSheetOpen || khususBayarTarget) && (
                      <motion.button
                        key="bayar-backdrop"
                        type="button"
                        className="absolute inset-0 z-10 bg-black/35 rounded-2xl"
                        aria-label="Tutup form bayar"
                        onClick={() => {
                          setBayarSheetOpen(false)
                          setKhususBayarTarget(null)
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      />
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {bayarSheetOpen && (
                      <motion.div
                        key="bayar-sheet"
                        className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t ui-divider bg-white dark:bg-slate-800 shadow-2xl p-3 space-y-2 max-h-[min(85%,28rem)] overflow-y-auto"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                      >
                          <div className="flex items-center justify-between">
                            <h3 className="ui-text-strong text-sm">Bayar syahriyah</h3>
                            <button type="button" className="ui-btn-close !w-8 !h-8" onClick={() => setBayarSheetOpen(false)}>
                              <MaterialIcon name="close" size={16} />
                            </button>
                          </div>
                          <p className="text-[11px] ui-text-muted">
                            Tanggal: {todayYmd()}
                            {user?.name ? ` · Penerima: ${user.name}` : ''}
                            {' · '}Sisa TA: {formatRp(bayarRingkas?.total_sisa ?? 0)}
                          </p>
                          <div>
                            <label className="ui-label mb-1 block text-xs">Nominal</label>
                            <input
                              type="number"
                              min={1}
                              max={Math.max(0, bayarRingkas?.total_sisa ?? 0)}
                              step={1000}
                              value={bayarNominal}
                              onChange={(e) => setBayarNominal(e.target.value)}
                              className="ui-input w-full !py-2 !text-sm"
                              placeholder="Contoh: 50000"
                              autoFocus
                            />
                          </div>
                          <div>
                            <label className="ui-label mb-1 block text-xs">Via</label>
                            <div className="flex gap-2">
                              {(['cash', 'tf'] as const).map((v) => (
                                <button
                                  key={v}
                                  type="button"
                                  onClick={() => setBayarVia(v)}
                                  className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                                    bayarVia === v
                                      ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                      : 'ui-divider ui-text-muted'
                                  }`}
                                >
                                  {v === 'cash' ? 'Cash' : 'TF'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="ui-label mb-1 block text-xs">Keterangan</label>
                            <input
                              type="text"
                              value={bayarKet}
                              onChange={(e) => setBayarKet(e.target.value)}
                              className="ui-input w-full !py-2 !text-sm"
                              placeholder="Opsional"
                            />
                          </div>
                          {preview && (
                            <div className="rounded-lg border ui-divider p-2 text-[11px] space-y-0.5 bg-slate-50 dark:bg-slate-900/40 max-h-20 overflow-y-auto">
                              <p className="font-medium">Alokasi</p>
                              {preview.alokasi.length === 0 ? (
                                <p className="ui-text-muted">Masuk saldo</p>
                              ) : (
                                preview.alokasi.map((a, i) => (
                                  <div key={i} className="flex justify-between gap-2">
                                    <span>{bulanLabel(a.bulan_hijri, a.tahun_hijri)}</span>
                                    <span className="tabular-nums">{formatRp(a.nominal)}</span>
                                  </div>
                                ))
                              )}
                              {preview.saldo > 0 && (
                                <div className="flex justify-between text-amber-700 dark:text-amber-300">
                                  <span>Saldo</span>
                                  <span className="tabular-nums">{formatRp(preview.saldo)}</span>
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={handleBayar}
                            disabled={savingBayar}
                            className="ui-btn-primary w-full py-2 text-sm disabled:opacity-60"
                          >
                            {savingBayar ? 'Menyimpan...' : 'Simpan pembayaran'}
                          </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {khususBayarTarget && (
                      <motion.div
                        key="khusus-bayar-sheet"
                        className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t ui-divider bg-white dark:bg-slate-800 shadow-2xl p-3 space-y-2 max-h-[min(85%,28rem)] overflow-y-auto"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <h3 className="ui-text-strong text-sm truncate">Bayar khusus</h3>
                            <p className="text-[11px] ui-text-muted truncate">{khususBayarTarget.nama}</p>
                          </div>
                          <button
                            type="button"
                            className="ui-btn-close !w-8 !h-8"
                            onClick={() => setKhususBayarTarget(null)}
                          >
                            <MaterialIcon name="close" size={16} />
                          </button>
                        </div>
                        <p className="text-[11px] ui-text-muted">
                          Tanggal: {todayYmd()}
                          {user?.name ? ` · Penerima: ${user.name}` : ''}
                          {' · '}Sisa: {formatRp(khususBayarTarget.sisa ?? 0)}
                        </p>
                        <div>
                          <label className="ui-label mb-1 block text-xs">Nominal</label>
                          <input
                            type="number"
                            min={1}
                            max={Math.max(0, khususBayarTarget.sisa ?? 0)}
                            step={1000}
                            value={khususBayarNominal}
                            onChange={(e) => setKhususBayarNominal(e.target.value)}
                            className="ui-input w-full !py-2 !text-sm"
                            placeholder="Contoh: 50000"
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className="ui-label mb-1 block text-xs">Via</label>
                          <div className="flex gap-2">
                            {(['cash', 'tf'] as const).map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setKhususBayarVia(v)}
                                className={`flex-1 py-2 rounded-lg text-xs font-medium border transition ${
                                  khususBayarVia === v
                                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                    : 'ui-divider ui-text-muted'
                                }`}
                              >
                                {v === 'cash' ? 'Cash' : 'TF'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="ui-label mb-1 block text-xs">Keterangan</label>
                          <input
                            type="text"
                            value={khususBayarKet}
                            onChange={(e) => setKhususBayarKet(e.target.value)}
                            className="ui-input w-full !py-2 !text-sm"
                            placeholder="Opsional"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleKhususBayar()}
                          disabled={savingKhususBayar}
                          className="ui-btn-primary w-full py-2 text-sm disabled:opacity-60"
                        >
                          {savingKhususBayar ? 'Menyimpan...' : 'Simpan pembayaran'}
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </>
          )}
        </div>
      )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Offcanvas Atur Wajib */}
      <AnimatePresence>
        {wajibCanvasOpen && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm"
              aria-label="Tutup"
              onClick={() => setWajibCanvasOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="ui-offcanvas z-[1001]"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="ui-modal-header shrink-0">
                <div>
                  <h2 className="font-semibold">Atur syahriyah</h2>
                  <p className="text-xs ui-text-muted mt-0.5">{wajibCanvasSubtitle}</p>
                </div>
                <button type="button" className="ui-btn-close" onClick={() => setWajibCanvasOpen(false)}>
                  <MaterialIcon name="close" size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="ui-label mb-1.5 block">Nominal per bulan</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={nominalWajib}
                    onChange={(e) => setNominalWajib(e.target.value)}
                    className="ui-input-lg w-full"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="ui-label">Bulan akademik</span>
                    <button
                      type="button"
                      className="text-xs text-blue-600 dark:text-blue-400"
                      onClick={() => {
                        if (selectedBulan.size === bulanMeta.length) setSelectedBulan(new Set())
                        else setSelectedBulan(new Set(bulanMeta.map((b) => `${b.bulan_hijri}_${b.tahun_hijri}`)))
                      }}
                    >
                      {selectedBulan.size === bulanMeta.length ? 'Hapus semua' : 'Centang semua'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {bulanMeta.map((b) => {
                      const key = `${b.bulan_hijri}_${b.tahun_hijri}`
                      const on = selectedBulan.has(key)
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer text-sm ${
                            on ? 'border-blue-500/40 bg-blue-500/10' : 'ui-divider'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => {
                              setSelectedBulan((prev) => {
                                const next = new Set(prev)
                                if (next.has(key)) next.delete(key)
                                else next.add(key)
                                return next
                              })
                            }}
                          />
                          {bulanLabel(b.bulan_hijri, b.tahun_hijri)}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="p-4 border-t ui-divider shrink-0 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleBatchWajib({ disabled: true })}
                  disabled={savingWajib || selectedBulan.size === 0}
                  className="flex-1 py-2.5 text-sm rounded-xl border ui-divider ui-text-muted hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-60"
                  title="Isi nominal 0 untuk bulan terpilih (Disabled)"
                >
                  {savingWajib ? '…' : 'Disabled'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleBatchWajib()}
                  disabled={savingWajib}
                  className="ui-btn-primary flex-[1.4] py-2.5 text-sm disabled:opacity-60"
                >
                  {savingWajib
                    ? 'Menyimpan...'
                    : `Simpan (${selectedSantri.size} × ${selectedBulan.size})`}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Offcanvas Pembayaran Khusus */}
      <AnimatePresence>
        {khususCanvasOpen && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm"
              aria-label="Tutup"
              onClick={() => setKhususCanvasOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="ui-offcanvas z-[1001]"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="ui-modal-header shrink-0">
                <div>
                  <h2 className="font-semibold">Pembayaran khusus</h2>
                  <p className="text-xs ui-text-muted mt-0.5">{wajibCanvasSubtitle}</p>
                </div>
                <button type="button" className="ui-btn-close" onClick={() => setKhususCanvasOpen(false)}>
                  <MaterialIcon name="close" size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="ui-label mb-1.5 block">Nama</label>
                  <input
                    type="text"
                    value={khususNama}
                    onChange={(e) => setKhususNama(e.target.value)}
                    className="ui-input-lg w-full"
                    placeholder="Contoh: Seragam, Buku, dll."
                    autoFocus
                  />
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Nominal wajib</label>
                  <input
                    type="number"
                    min={1}
                    step={1000}
                    value={khususNominal}
                    onChange={(e) => setKhususNominal(e.target.value)}
                    className="ui-input-lg w-full"
                    placeholder="Contoh: 150000"
                  />
                  <p className="text-[11px] ui-text-muted mt-1">Bisa dicicil; total bayar tidak boleh melebihi nominal ini.</p>
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Terakhir pembayaran</label>
                  <input
                    type="date"
                    value={khususDeadline}
                    onChange={(e) => setKhususDeadline(e.target.value)}
                    className="ui-input-lg w-full"
                  />
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Keterangan (opsional)</label>
                  <textarea
                    value={khususKet}
                    onChange={(e) => setKhususKet(e.target.value)}
                    className="ui-input w-full min-h-[5rem] !py-2"
                    placeholder="Catatan tambahan"
                  />
                </div>
              </div>
              <div className="p-4 border-t ui-divider shrink-0">
                <button
                  type="button"
                  onClick={() => void handleBatchKhusus()}
                  disabled={savingKhusus}
                  className="ui-btn-primary w-full py-2.5 text-sm disabled:opacity-60"
                >
                  {savingKhusus ? 'Menyimpan...' : `Tambah (${selectedSantri.size} santri)`}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Modal konfirmasi hapus khusus */}
      <AnimatePresence>
        {khususDeleteIds && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm"
              aria-label="Tutup"
              onClick={() => !deletingKhusus && setKhususDeleteIds(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="khusus-delete-title"
                className="pointer-events-auto w-full max-w-sm rounded-2xl border ui-divider bg-white dark:bg-slate-800 shadow-2xl p-5 space-y-4"
                initial={{ scale: 0.94, y: 12, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, y: 8, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <MaterialIcon name="delete_forever" size={24} />
                  </div>
                  <div className="min-w-0">
                    <h3 id="khusus-delete-title" className="ui-text-strong text-base leading-snug">
                      Hapus pembayaran khusus?
                    </h3>
                    <p className="text-sm ui-text-muted mt-1 leading-relaxed">
                      {khususDeleteIds.length === 1
                        ? 'Data ini beserta riwayat pembayarannya akan dihapus permanen.'
                        : `${khususDeleteIds.length} data terpilih beserta riwayat pembayarannya akan dihapus permanen.`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={deletingKhusus}
                    onClick={() => setKhususDeleteIds(null)}
                    className="px-3.5 py-2 text-sm rounded-xl border ui-divider ui-text-strong hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-60"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={deletingKhusus}
                    onClick={() => void confirmDeleteKhusus()}
                    className="px-3.5 py-2 text-sm rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium disabled:opacity-60"
                  >
                    {deletingKhusus ? 'Menghapus…' : 'Hapus'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Offcanvas edit masal khusus */}
      <AnimatePresence>
        {khususEditOpen && (
          <>
            <motion.button
              type="button"
              className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm"
              aria-label="Tutup"
              onClick={() => setKhususEditOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="ui-offcanvas z-[1001]"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="ui-modal-header shrink-0">
                <div>
                  <h2 className="font-semibold">Edit pembayaran khusus</h2>
                  <p className="text-xs ui-text-muted mt-0.5">
                    {khususSelectedIds.size} data terpilih akan diperbarui
                  </p>
                </div>
                <button type="button" className="ui-btn-close" onClick={() => setKhususEditOpen(false)}>
                  <MaterialIcon name="close" size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <label className="ui-label mb-1.5 block">Nama</label>
                  <input
                    type="text"
                    value={editKhususNama}
                    onChange={(e) => setEditKhususNama(e.target.value)}
                    className="ui-input-lg w-full"
                    placeholder="Nama pembayaran khusus"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Nominal wajib</label>
                  <input
                    type="number"
                    min={1}
                    step={1000}
                    value={editKhususNominal}
                    onChange={(e) => setEditKhususNominal(e.target.value)}
                    className="ui-input-lg w-full"
                  />
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Terakhir pembayaran</label>
                  <input
                    type="date"
                    value={editKhususDeadline}
                    onChange={(e) => setEditKhususDeadline(e.target.value)}
                    className="ui-input-lg w-full"
                  />
                </div>
                <div>
                  <label className="ui-label mb-1.5 block">Keterangan (opsional)</label>
                  <textarea
                    value={editKhususKet}
                    onChange={(e) => setEditKhususKet(e.target.value)}
                    className="ui-input w-full min-h-[5rem] !py-2"
                    placeholder="Catatan tambahan"
                  />
                </div>
              </div>
              <div className="p-4 border-t ui-divider shrink-0">
                <button
                  type="button"
                  onClick={() => void handleBatchUpdateKhusus()}
                  disabled={savingKhususEdit}
                  className="ui-btn-primary w-full py-2.5 text-sm disabled:opacity-60"
                >
                  {savingKhususEdit
                    ? 'Menyimpan...'
                    : `Simpan (${khususSelectedIds.size} data)`}
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <OffcanvasCariSantri
        open={cariSantriOpen}
        onClose={() => setCariSantriOpen(false)}
        onSelect={handleSelectSantriBayar}
      />
      <OffcanvasEditSantri
        open={editSantriOpen}
        onClose={() => setEditSantriOpen(false)}
        mode="edit"
        santri={selectedSantriFull}
        onSaved={(s) => void handleSantriSaved(s)}
      />
    </div>
  )
}
