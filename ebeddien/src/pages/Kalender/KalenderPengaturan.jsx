import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { kalenderAPI, hariPentingAPI } from '../../services/api'
import { useAuthStore } from '../../store/authStore'
import PickDateHijri, { formatHijriDateDisplay } from '../../components/PickDateHijri/PickDateHijri'
import { getBulanName } from './utils/bulanHijri'
import { INDONESIAN_MONTHS } from './utils/dateRange'
import { apiTimeToTimeInput, formatJamRangeLabel } from './utils/hariPentingJam'
import './Kalender.css'

const TIPE_OPTIONS = [
  { value: 'per_hari', label: 'Per Hari' },
  { value: 'per_pekan', label: 'Per Pekan' },
  { value: 'per_bulan', label: 'Per Bulan' },
  { value: 'per_tahun', label: 'Per Tahun' },
  { value: 'sekali', label: 'Sekali' },
  { value: 'dari_sampai', label: 'Dari–sampai' }
]

function formatYmdMasehiTampil(ymd) {
  if (!ymd || typeof ymd !== 'string') return ''
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ymd
  const y = m[1]
  const mo = Number(m[2])
  const d = Number(m[3])
  const namaBln = INDONESIAN_MONTHS[mo - 1]
  return `${d} ${namaBln != null ? namaBln : mo} ${y}`
}
const KATEGORI_OPTIONS = [
  { value: 'hijriyah', label: 'Hijriyah' },
  { value: 'masehi', label: 'Masehi' }
]

function formatTargetRingkas(item, myUsersId = null) {
  const t = item.targets
  if (!Array.isArray(t) || t.length === 0) return 'Semua pengguna'
  const nL = t.filter((x) => x.id_lembaga != null && String(x.id_lembaga).trim() !== '').length
  const nU = t.filter((x) => x.id_user != null).length
  if (
    myUsersId != null &&
    nL === 0 &&
    nU === 1 &&
    Number(t.find((x) => x.id_user != null)?.id_user) === Number(myUsersId)
  ) {
    return 'Hanya saya'
  }
  const parts = []
  if (nL) parts.push(`${nL} lembaga`)
  if (nU) parts.push(`${nU} pengguna`)
  return parts.length ? parts.join(' · ') : 'Target'
}

/** Pilihan warna untuk label hari penting – pilih dari grid, bukan ketik teks */
const WARNA_LABEL_OPTIONS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#8b5cf6', '#ec4899',
  '#06b6d4', '#f97316', '#6366f1', '#14b8a6', '#84cc16', '#a855f7',
  '#0ea5e9', '#dc2626', '#16a34a', '#ca8a04', '#7c3aed', '#db2777'
]

const FITUR_TAB_BULAN = 'action.kalender.pengaturan.tab_bulan'
const FITUR_TAB_HARI_PENTING = 'action.kalender.pengaturan.tab_hari_penting'
const FITUR_MENU_KAL_PENGATURAN = 'menu.kalender.pengaturan'
const HP_TARGET_GLOBAL = 'action.hari_penting.target.global'
const HP_TARGET_LEMBAGA = 'action.hari_penting.target.lembaga'
const HP_TARGET_USER_SAMES = 'action.hari_penting.target.user_selembaga'
const HP_TARGET_SELF = 'action.hari_penting.target.self'

function KalenderPengaturan() {
  const authUser = useAuthStore((s) => s.user)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const myUsersId =
    authUser?.users_id != null && Number.isFinite(Number(authUser.users_id))
      ? Number(authUser.users_id)
      : null

  const useFiturCodes = Array.isArray(fiturMenuCodes) && fiturMenuCodes.length > 0
  const legacyKalenderAdmin = useMemo(() => {
    if (!authUser) return false
    const k = String(authUser.role_key || authUser.level || '').toLowerCase()
    if (k === 'super_admin' || k === 'admin_kalender') return true
    const ar = authUser.all_roles
    if (!Array.isArray(ar)) return false
    return ar.some((r) => {
      const x = String(r).toLowerCase()
      return x === 'super_admin' || x === 'admin_kalender'
    })
  }, [authUser])

  const bypassHpTargetPolicy = !!authUser?.is_real_super_admin || legacyKalenderAdmin

  const canTabBulan = useMemo(() => {
    if (!authUser) return false
    if (authUser.is_real_super_admin) return true
    if (!useFiturCodes) return legacyKalenderAdmin
    return fiturMenuCodes.includes(FITUR_TAB_BULAN) || fiturMenuCodes.includes(FITUR_MENU_KAL_PENGATURAN)
  }, [authUser, fiturMenuCodes, legacyKalenderAdmin, useFiturCodes])

  const canTabHariPenting = useMemo(() => {
    if (!authUser) return false
    if (authUser.is_real_super_admin) return true
    if (!useFiturCodes) return legacyKalenderAdmin
    return fiturMenuCodes.includes(FITUR_TAB_HARI_PENTING) || fiturMenuCodes.includes(FITUR_MENU_KAL_PENGATURAN)
  }, [authUser, fiturMenuCodes, legacyKalenderAdmin, useFiturCodes])

  const canHpTargetGlobal = bypassHpTargetPolicy || fiturMenuCodes.includes(HP_TARGET_GLOBAL)
  const canHpTargetLembaga = bypassHpTargetPolicy || fiturMenuCodes.includes(HP_TARGET_LEMBAGA)
  const canHpTargetUserSelembaga = bypassHpTargetPolicy || fiturMenuCodes.includes(HP_TARGET_USER_SAMES)
  const canHpTargetSelf = bypassHpTargetPolicy || fiturMenuCodes.includes(HP_TARGET_SELF)

  const canTambahHariPenting =
    canTabHariPenting &&
    (bypassHpTargetPolicy ||
      canHpTargetGlobal ||
      canHpTargetLembaga ||
      canHpTargetUserSelembaga ||
      canHpTargetSelf)

  const [tab, setTab] = useState('bulan')

  useEffect(() => {
    if (!canTabBulan && tab === 'bulan' && canTabHariPenting) setTab('hari-penting')
    if (!canTabHariPenting && tab === 'hari-penting' && canTabBulan) setTab('bulan')
  }, [canTabBulan, canTabHariPenting, tab])
  const [tahunHijriyah, setTahunHijriyah] = useState('1446')
  const [kalenderRows, setKalenderRows] = useState([])
  const [loadingKalender, setLoadingKalender] = useState(false)
  const [savingKalender, setSavingKalender] = useState(false)
  const [messageKalender, setMessageKalender] = useState(null)

  const [showCariOffcanvas, setShowCariOffcanvas] = useState(false)
  const [cariOffcanvasEntered, setCariOffcanvasEntered] = useState(false)
  const [cariOffcanvasExiting, setCariOffcanvasExiting] = useState(false)
  const [tahunList, setTahunList] = useState([])
  const [loadingTahunList, setLoadingTahunList] = useState(false)

  const [hariPentingList, setHariPentingList] = useState([])
  const [loadingHariPenting, setLoadingHariPenting] = useState(false)
  const [formHariPenting, setFormHariPenting] = useState({
    id: '',
    nama_event: '',
    kategori: 'hijriyah',
    tipe: 'per_tahun',
    hari_pekan: '',
    tanggal: '',
    bulan: '',
    tahun: '',
    tanggal_dari: '',
    tanggal_sampai: '',
    target_global: true,
    target_self: false,
    target_lembaga_ids: [],
    target_user_ids: [],
    warna_label: '#3b82f6',
    keterangan: '',
    ada_jam: false,
    jam_mulai: '',
    jam_selesai: '',
    aktif: 1
  })

  const hpFormTargetViolatesPolicy = useMemo(() => {
    if (bypassHpTargetPolicy || !useFiturCodes) return false
    const {
      target_global: tg,
      target_self: ts,
      target_lembaga_ids: tlem = [],
      target_user_ids: tu = []
    } = formHariPenting
    if (tg && !canHpTargetGlobal) return true
    if (ts && !canHpTargetSelf) return true
    if (tlem.length > 0 && !canHpTargetLembaga) return true
    if (tu.length > 0) {
      if (ts) {
        if (!canHpTargetSelf) return true
      } else if (!canHpTargetUserSelembaga) return true
    }
    return false
  }, [
    bypassHpTargetPolicy,
    useFiturCodes,
    formHariPenting.target_global,
    formHariPenting.target_self,
    formHariPenting.target_lembaga_ids,
    formHariPenting.target_user_ids,
    canHpTargetGlobal,
    canHpTargetSelf,
    canHpTargetLembaga,
    canHpTargetUserSelembaga
  ])

  const [showForm, setShowForm] = useState(false)
  const [hpOffcanvasEntered, setHpOffcanvasEntered] = useState(false)
  const [hpOffcanvasExiting, setHpOffcanvasExiting] = useState(false)
  const [savingHariPenting, setSavingHariPenting] = useState(false)
  const [messageHariPenting, setMessageHariPenting] = useState(null)

  const [searchHariPenting, setSearchHariPenting] = useState('')
  const [filterKategoriHariPenting, setFilterKategoriHariPenting] = useState('')
  const [filterTipeHariPenting, setFilterTipeHariPenting] = useState('')
  const [filterBulanHariPenting, setFilterBulanHariPenting] = useState('')
  const [filterTanggalHariPenting, setFilterTanggalHariPenting] = useState('')
  const [filterTahunHariPenting, setFilterTahunHariPenting] = useState('')
  /** '' = tanpa filter target | global | lembaga | user */
  const [filterTargetJenisHariPenting, setFilterTargetJenisHariPenting] = useState('')
  const [filterHpLembagaId, setFilterHpLembagaId] = useState('')
  const [filterHpUserId, setFilterHpUserId] = useState('')
  const [filterHpUserLabel, setFilterHpUserLabel] = useState('')
  const [filterHpUserQuery, setFilterHpUserQuery] = useState('')
  const [filterHpUserHits, setFilterHpUserHits] = useState([])
  const [filterHpUserLoading, setFilterHpUserLoading] = useState(false)
  const filterHpUserSearchTimer = useRef(null)
  const [isFilterHariPentingOpen, setIsFilterHariPentingOpen] = useState(false)
  const [isInputHariPentingFocused, setIsInputHariPentingFocused] = useState(false)
  const colorPickerInputRef = useRef(null)
  const [hpLembagaOptions, setHpLembagaOptions] = useState([])
  const [hpUserQuery, setHpUserQuery] = useState('')
  const [hpUserHits, setHpUserHits] = useState([])
  const [hpUserLoading, setHpUserLoading] = useState(false)
  /** users.id → label untuk chip */
  const [hpUserLabels, setHpUserLabels] = useState({})
  const hpUserSearchTimer = useRef(null)

  /** Sub-offcanvas kanan: pilih lembaga / pengguna (di atas form hari penting z-[99999]) */
  const [hpTargetPanel, setHpTargetPanel] = useState(null)
  const [hpTargetPanelEntered, setHpTargetPanelEntered] = useState(false)
  const [hpTargetPanelExiting, setHpTargetPanelExiting] = useState(false)

  /** Infer jumlah hari (29 atau 30) dari range mulai–akhir */
  const inferJumlahHari = (mulai, akhir) => {
    if (!mulai || !akhir) return 30
    const a = new Date(mulai)
    const b = new Date(akhir)
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 30
    const days = Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1
    return days === 29 ? 29 : 30
  }

  /** Hitung otomatis mulai/akhir semua bulan dari tanggal awal bulan 1 + jumlah hari per bulan (seperti admin kalender) */
  const deriveRowsFromFirstAndDays = (rows) => {
    if (!rows.length) return rows
    let prevAkhir = null
    return rows.map((row, i) => {
      const jumlahHari = row.jumlahHari ?? 30
      let mulai = row.mulai
      let akhir = row.akhir
      if (i === 0) {
        if (mulai) {
          const tgl = new Date(mulai)
          tgl.setDate(tgl.getDate() + jumlahHari - 1)
          akhir = tgl.toISOString().slice(0, 10)
        }
      } else {
        if (prevAkhir) {
          const next = new Date(prevAkhir)
          next.setDate(next.getDate() + 1)
          mulai = next.toISOString().slice(0, 10)
        }
        if (mulai) {
          const tgl = new Date(mulai)
          tgl.setDate(tgl.getDate() + jumlahHari - 1)
          akhir = tgl.toISOString().slice(0, 10)
        }
      }
      prevAkhir = akhir || null
      return { ...row, mulai: mulai || row.mulai, akhir: akhir || row.akhir, jumlahHari }
    })
  }

  const loadKalenderByTahun = async (tahunOverride) => {
    const tahunNum = tahunOverride != null ? Number(tahunOverride) : parseInt(tahunHijriyah, 10)
    if (!Number.isFinite(tahunNum)) {
      setMessageKalender('Tahun tidak valid')
      return
    }
    const tahun = Math.floor(tahunNum)
    if (tahunOverride != null) setTahunHijriyah(String(tahun))
    setLoadingKalender(true)
    setMessageKalender(null)
    try {
      const data = await kalenderAPI.get({ action: 'year', tahun })
      let rows = Array.isArray(data) ? data : []
      if (rows.length === 0) {
        rows = Array.from({ length: 12 }, (_, i) => ({
          tahun,
          id_bulan: i + 1,
          mulai: '',
          akhir: '',
          jumlahHari: 30
        }))
        setKalenderRows(rows)
      } else {
        rows = rows.map((r) => ({
          ...r,
          jumlahHari: inferJumlahHari(r.mulai, r.akhir)
        }))
        rows.sort((a, b) => Number(a.id_bulan) - Number(b.id_bulan))
        setKalenderRows(rows)
      }
    } catch (e) {
      setMessageKalender(e.message || 'Gagal memuat data kalender')
      setKalenderRows(Array.from({ length: 12 }, (_, i) => ({
        tahun,
        id_bulan: i + 1,
        mulai: '',
        akhir: '',
        jumlahHari: 30
      })))
    } finally {
      setLoadingKalender(false)
    }
  }

  const saveKalenderBulk = async () => {
    const payload = kalenderRows.map((r) => ({
      tahun: r.tahun,
      id_bulan: r.id_bulan,
      mulai: r.mulai,
      akhir: r.akhir
    }))
    if (payload.length === 0) {
      setMessageKalender('Tidak ada data untuk disimpan')
      return
    }
    setSavingKalender(true)
    setMessageKalender(null)
    try {
      await kalenderAPI.postBulk(payload)
      setMessageKalender('Data kalender berhasil disimpan')
    } catch (e) {
      setMessageKalender(e.message || 'Gagal menyimpan')
    } finally {
      setSavingKalender(false)
    }
  }

  /** Ambil daftar tahun yang sudah ada di kalender + jumlah bulan (x/12) */
  const loadTahunList = async () => {
    setLoadingTahunList(true)
    setTahunList([])
    try {
      const data = await kalenderAPI.get({ action: 'all' })
      const rows = Array.isArray(data) ? data : []
      const byTahun = {}
      rows.forEach((r) => {
        const t = Number(r.tahun)
        if (!byTahun[t]) byTahun[t] = 0
        byTahun[t] += 1
      })
      const list = Object.entries(byTahun)
        .map(([tahun, count]) => ({ tahun: Number(tahun), count: Math.min(12, count) }))
        .sort((a, b) => b.tahun - a.tahun)
      setTahunList(list)
      setShowCariOffcanvas(true)
    } catch (e) {
      setTahunList([])
      setShowCariOffcanvas(true)
    } finally {
      setLoadingTahunList(false)
    }
  }

  const pilihTahunDariCari = (tahun) => {
    setShowCariOffcanvas(false)
    setTahunHijriyah(String(tahun))
    loadKalenderByTahun(tahun)
  }

  /** Animasi masuk offcanvas: mulai dari tertutup, lalu satu frame kemudian ke terbuka */
  useEffect(() => {
    if (!showCariOffcanvas) {
      setCariOffcanvasEntered(false)
      setCariOffcanvasExiting(false)
      return
    }
    setCariOffcanvasExiting(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setCariOffcanvasEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [showCariOffcanvas])

  /** Lock scroll body saat offcanvas Cari tahun terbuka (sama seperti Cari Santri) */
  useEffect(() => {
    if (showCariOffcanvas) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [showCariOffcanvas])

  const tutupCariOffcanvas = () => {
    setCariOffcanvasExiting(true)
  }

  const handleCariOffcanvasTransitionEnd = (e) => {
    if (e.target !== e.currentTarget) return
    if (cariOffcanvasExiting) {
      setShowCariOffcanvas(false)
      setCariOffcanvasExiting(false)
      setCariOffcanvasEntered(false)
    }
  }

  const loadHariPenting = async () => {
    setLoadingHariPenting(true)
    try {
      const data = await hariPentingAPI.getList({ include_targets: '1' })
      setHariPentingList(Array.isArray(data) ? data : [])
    } catch (e) {
      setHariPentingList([])
    } finally {
      setLoadingHariPenting(false)
    }
  }

  const filteredHariPentingList = useMemo(() => {
    let list = hariPentingList
    const q = (searchHariPenting || '').trim().toLowerCase()
    if (q) {
      list = list.filter(
        (item) =>
          (item.nama_event && item.nama_event.toLowerCase().includes(q)) ||
          (item.keterangan && item.keterangan.toLowerCase().includes(q))
      )
    }
    if (filterKategoriHariPenting) {
      list = list.filter((item) => (item.kategori || '') === filterKategoriHariPenting)
    }
    if (filterTipeHariPenting) {
      list = list.filter((item) => (item.tipe || '') === filterTipeHariPenting)
    }
    if (filterBulanHariPenting) {
      const bulanNum = parseInt(filterBulanHariPenting, 10)
      list = list.filter((item) => item.bulan != null && Number(item.bulan) === bulanNum)
    }
    if (filterTanggalHariPenting) {
      const tglNum = parseInt(filterTanggalHariPenting, 10)
      list = list.filter((item) => item.tanggal != null && Number(item.tanggal) === tglNum)
    }
    if (filterTahunHariPenting) {
      const tahunNum = parseInt(filterTahunHariPenting, 10)
      list = list.filter((item) => item.tahun != null && Number(item.tahun) === tahunNum)
    }
    if (filterTargetJenisHariPenting === 'global') {
      list = list.filter((item) => {
        const t = item.targets
        return !Array.isArray(t) || t.length === 0
      })
    } else if (filterTargetJenisHariPenting === 'lembaga' && String(filterHpLembagaId || '').trim() !== '') {
      const lid = String(filterHpLembagaId).trim()
      list = list.filter((item) => {
        const t = item.targets
        if (!Array.isArray(t) || t.length === 0) return false
        return t.some(
          (x) => x.id_lembaga != null && String(x.id_lembaga).trim() === lid
        )
      })
    } else if (filterTargetJenisHariPenting === 'user' && String(filterHpUserId || '').trim() !== '') {
      const uid = Number(filterHpUserId)
      if (Number.isFinite(uid) && uid > 0) {
        list = list.filter((item) => {
          const t = item.targets
          if (!Array.isArray(t) || t.length === 0) return false
          return t.some((x) => x.id_user != null && Number(x.id_user) === uid)
        })
      }
    }
    return list
  }, [
    hariPentingList,
    searchHariPenting,
    filterKategoriHariPenting,
    filterTipeHariPenting,
    filterBulanHariPenting,
    filterTanggalHariPenting,
    filterTahunHariPenting,
    filterTargetJenisHariPenting,
    filterHpLembagaId,
    filterHpUserId
  ])

  useEffect(() => {
    if (tab === 'bulan' && tahunHijriyah) loadKalenderByTahun()
  }, [tab, tahunHijriyah])

  useEffect(() => {
    if (tab === 'hari-penting') loadHariPenting()
  }, [tab])

  useEffect(() => {
    if (!showForm) {
      setHpOffcanvasEntered(false)
      setHpOffcanvasExiting(false)
      return
    }
    setHpOffcanvasExiting(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setHpOffcanvasEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [showForm])

  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [showForm])

  useEffect(() => {
    if (!showForm) {
      setHpTargetPanel(null)
      setHpTargetPanelEntered(false)
      setHpTargetPanelExiting(false)
    }
  }, [showForm])

  useEffect(() => {
    if (!hpTargetPanel) {
      setHpTargetPanelEntered(false)
      setHpTargetPanelExiting(false)
      return
    }
    setHpTargetPanelExiting(false)
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setHpTargetPanelEntered(true))
    })
    return () => cancelAnimationFrame(id)
  }, [hpTargetPanel])

  const tutupHpTargetPanel = () => setHpTargetPanelExiting(true)

  const handleHpTargetPanelTransitionEnd = (e) => {
    if (e.target !== e.currentTarget) return
    if (hpTargetPanelExiting) {
      setHpTargetPanel(null)
      setHpTargetPanelExiting(false)
      setHpTargetPanelEntered(false)
    }
  }

  useEffect(() => {
    if (tab !== 'hari-penting' && !showForm) return undefined
    let cancelled = false
    hariPentingAPI
      .getLembagaOptions()
      .then((res) => {
        if (cancelled) return
        const d = res?.data
        setHpLembagaOptions(Array.isArray(d) ? d : [])
      })
      .catch(() => {
        if (!cancelled) setHpLembagaOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [tab, showForm])

  useEffect(() => {
    if (
      tab !== 'hari-penting' ||
      filterTargetJenisHariPenting !== 'user' ||
      !isFilterHariPentingOpen
    ) {
      setFilterHpUserHits([])
      return undefined
    }
    const q = (filterHpUserQuery || '').trim()
    if (q.length < 2) {
      setFilterHpUserHits([])
      return undefined
    }
    if (filterHpUserSearchTimer.current) clearTimeout(filterHpUserSearchTimer.current)
    filterHpUserSearchTimer.current = setTimeout(() => {
      setFilterHpUserLoading(true)
      hariPentingAPI
        .getUserPicker({ search: q, limit: 25 })
        .then((res) => {
          setFilterHpUserHits(Array.isArray(res?.data) ? res.data : [])
        })
        .catch(() => setFilterHpUserHits([]))
        .finally(() => setFilterHpUserLoading(false))
    }, 320)
    return () => {
      if (filterHpUserSearchTimer.current) clearTimeout(filterHpUserSearchTimer.current)
    }
  }, [filterHpUserQuery, tab, filterTargetJenisHariPenting, isFilterHariPentingOpen])

  useEffect(() => {
    if (!showForm || formHariPenting.target_global || hpTargetPanel !== 'user') {
      setHpUserHits([])
      return undefined
    }
    const q = (hpUserQuery || '').trim()
    if (q.length < 2) {
      setHpUserHits([])
      return undefined
    }
    if (hpUserSearchTimer.current) clearTimeout(hpUserSearchTimer.current)
    hpUserSearchTimer.current = setTimeout(() => {
      setHpUserLoading(true)
      hariPentingAPI
        .getUserPicker({ search: q, limit: 25 })
        .then((res) => {
          setHpUserHits(Array.isArray(res?.data) ? res.data : [])
        })
        .catch(() => setHpUserHits([]))
        .finally(() => setHpUserLoading(false))
    }, 320)
    return () => {
      if (hpUserSearchTimer.current) clearTimeout(hpUserSearchTimer.current)
    }
  }, [hpUserQuery, showForm, formHariPenting.target_global, hpTargetPanel])

  const toggleHpLembaga = (lembagaId) => {
    const s = String(lembagaId)
    setFormHariPenting((p) => {
      const cur = p.target_lembaga_ids || []
      const set = new Set(cur.map(String))
      if (set.has(s)) set.delete(s)
      else set.add(s)
      return { ...p, target_self: false, target_lembaga_ids: [...set] }
    })
  }

  const addHpUserFromPicker = (row) => {
    const uid = Number(row.id)
    if (!Number.isFinite(uid) || uid <= 0) return
    setFormHariPenting((p) => {
      const cur = p.target_user_ids || []
      if (cur.includes(uid)) return { ...p, target_self: false }
      return { ...p, target_self: false, target_user_ids: [...cur, uid] }
    })
    const label = row.nama || row.pengurus_nama || row.username || `User #${uid}`
    setHpUserLabels((prev) => ({ ...prev, [uid]: label }))
    setHpUserQuery('')
    setHpUserHits([])
  }

  const removeHpUser = (uid) => {
    setFormHariPenting((p) => ({
      ...p,
      target_user_ids: (p.target_user_ids || []).filter((x) => x !== uid)
    }))
  }

  const handleKalenderFieldChange = (index, field, value) => {
    setKalenderRows((prev) => {
      let next = [...prev]
      if (next[index]) next[index] = { ...next[index], [field]: value }
      if (field === 'mulai' && index === 0) next = deriveRowsFromFirstAndDays(next)
      if (field === 'jumlahHari') next = deriveRowsFromFirstAndDays(next)
      return next
    })
  }

  const parseTargetsToForm = useCallback(
    (item) => {
      const targets = item && Array.isArray(item.targets) ? item.targets : []
      if (targets.length === 0) {
        return {
          target_global: true,
          target_self: false,
          target_lembaga_ids: [],
          target_user_ids: [],
          userLabels: {}
        }
      }
      const target_lembaga_ids = []
      const target_user_ids = []
      const userLabels = {}
      for (const t of targets) {
        if (t.id_lembaga != null && String(t.id_lembaga).trim() !== '') {
          target_lembaga_ids.push(String(t.id_lembaga).trim())
        }
        if (t.id_user != null && t.id_user !== '') {
          const uid = Number(t.id_user)
          if (Number.isFinite(uid) && uid > 0) {
            target_user_ids.push(uid)
            const nm = t.user_nama || t.user_username || `User #${uid}`
            userLabels[uid] = nm
          }
        }
      }
      const uq = [...new Set(target_user_ids)]
      const lq = [...new Set(target_lembaga_ids)]
      const onlySelf =
        myUsersId != null &&
        lq.length === 0 &&
        uq.length === 1 &&
        uq[0] === myUsersId
      return {
        target_global: false,
        target_self: onlySelf,
        target_lembaga_ids: lq,
        target_user_ids: uq,
        userLabels
      }
    },
    [myUsersId]
  )

  const openFormHariPenting = (item = null) => {
    setHpUserQuery('')
    setHpUserHits([])
    if (item) {
      const parsed = parseTargetsToForm(item)
      setHpUserLabels(parsed.userLabels)
      setFormHariPenting({
        id: item.id,
        nama_event: item.nama_event || '',
        kategori: item.kategori || 'hijriyah',
        tipe: item.tipe || 'per_tahun',
        hari_pekan: item.hari_pekan ?? '',
        tanggal: item.tanggal ?? '',
        bulan: item.bulan ?? '',
        tahun: item.tahun ?? '',
        tanggal_dari: item.tanggal_dari ?? '',
        tanggal_sampai: item.tanggal_sampai ?? '',
        target_global: parsed.target_global,
        target_self: parsed.target_self,
        target_lembaga_ids: parsed.target_lembaga_ids,
        target_user_ids: parsed.target_user_ids,
        warna_label: item.warna_label || '#3b82f6',
        keterangan: item.keterangan || '',
        ada_jam: !!(item.jam_mulai || item.jam_selesai),
        jam_mulai: apiTimeToTimeInput(item.jam_mulai),
        jam_selesai: apiTimeToTimeInput(item.jam_selesai),
        aktif: item.aktif ?? 1
      })
    } else {
      let target_global = true
      let target_self = false
      let target_user_ids = []
      let initialLabels = {}
      if (useFiturCodes && !bypassHpTargetPolicy) {
        if (canHpTargetGlobal) {
          target_global = true
        } else {
          target_global = false
          if (canHpTargetSelf && myUsersId != null) {
            target_self = true
            target_user_ids = [myUsersId]
            initialLabels = {
              [myUsersId]: authUser?.nama || authUser?.username || `User #${myUsersId}`
            }
          }
        }
      }
      setHpUserLabels(initialLabels)
      setFormHariPenting({
        id: '',
        nama_event: '',
        kategori: 'hijriyah',
        tipe: 'per_tahun',
        hari_pekan: '',
        tanggal: '',
        bulan: '',
        tahun: '',
        tanggal_dari: '',
        tanggal_sampai: '',
        target_global,
        target_self,
        target_lembaga_ids: [],
        target_user_ids,
        warna_label: '#3b82f6',
        keterangan: '',
        ada_jam: false,
        jam_mulai: '',
        jam_selesai: '',
        aktif: 1
      })
    }
    setShowForm(true)
    setHpOffcanvasExiting(false)
    setMessageHariPenting(null)
  }

  const tutupHariPentingOffcanvas = () => {
    setHpOffcanvasExiting(true)
  }

  const handleHariPentingOffcanvasTransitionEnd = (e) => {
    if (e.target !== e.currentTarget) return
    if (hpOffcanvasExiting) {
      setShowForm(false)
      setHpOffcanvasExiting(false)
      setHpOffcanvasEntered(false)
    }
  }

  const saveHariPenting = async () => {
    const isRange = formHariPenting.tipe === 'dari_sampai'
    const useSelf =
      !formHariPenting.target_global && !!formHariPenting.target_self && myUsersId != null
    const payload = {
      ...formHariPenting,
      hari_pekan: isRange ? null : (formHariPenting.hari_pekan === '' ? null : parseInt(formHariPenting.hari_pekan, 10)),
      tanggal: isRange ? null : (formHariPenting.tanggal === '' ? null : parseInt(formHariPenting.tanggal, 10)),
      bulan: isRange ? null : (formHariPenting.bulan === '' ? null : parseInt(formHariPenting.bulan, 10)),
      tahun: isRange ? null : (formHariPenting.tahun === '' ? null : parseInt(formHariPenting.tahun, 10)),
      tanggal_dari: isRange ? (formHariPenting.tanggal_dari || null) : null,
      tanggal_sampai: isRange ? (formHariPenting.tanggal_sampai || null) : null,
      aktif: formHariPenting.aktif ? 1 : 0,
      target_global: !!formHariPenting.target_global,
      target_lembaga_ids: formHariPenting.target_global || useSelf ? [] : [...(formHariPenting.target_lembaga_ids || [])],
      target_user_ids:
        formHariPenting.target_global ? [] : useSelf ? [myUsersId] : [...(formHariPenting.target_user_ids || [])],
      jam_mulai: formHariPenting.ada_jam ? (formHariPenting.jam_mulai || '').trim() : '',
      jam_selesai: formHariPenting.ada_jam ? (formHariPenting.jam_selesai || '').trim() : ''
    }
    delete payload.target_self
    delete payload.ada_jam
    if (payload.id) {
      payload.id = parseInt(payload.id, 10)
    } else {
      delete payload.id
    }
    setSavingHariPenting(true)
    setMessageHariPenting(null)
    try {
      await hariPentingAPI.post(payload)
      setMessageHariPenting('Data berhasil disimpan')
      setShowForm(false)
      setHpOffcanvasEntered(false)
      loadHariPenting()
    } catch (e) {
      setMessageHariPenting(e.message || 'Gagal menyimpan')
    } finally {
      setSavingHariPenting(false)
    }
  }

  const deleteHariPenting = async (id) => {
    if (!window.confirm('Yakin hapus hari penting ini?')) return
    try {
      await hariPentingAPI.delete(id)
      loadHariPenting()
    } catch (e) {
      setMessageHariPenting(e.message || 'Gagal menghapus')
    }
  }

  return (
    <div className="kalender-pengaturan-page h-full min-h-0 flex flex-col overflow-hidden p-4 max-w-4xl mx-auto pb-24 md:pb-4">
      {!canTabBulan && !canTabHariPenting && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2 mb-3">
          Akun Anda tidak memiliki aksi tab Pengaturan kalender (bulan / hari penting). Minta admin menambahkan di Pengaturan → Role &amp; akses.
        </p>
      )}
      {/* Tab Bulan / Hari Penting — per tab bisa diatur lewat action fitur */}
      {canTabBulan && canTabHariPenting && (
        <div className="kalender-page__tabs flex-shrink-0">
          <button
            type="button"
            className={`kalender-page__tab ${tab === 'bulan' ? 'kalender-page__tab--active' : ''}`}
            onClick={() => setTab('bulan')}
          >
            Bulan
          </button>
          <button
            type="button"
            className={`kalender-page__tab ${tab === 'hari-penting' ? 'kalender-page__tab--active' : ''}`}
            onClick={() => setTab('hari-penting')}
          >
            Hari Penting
          </button>
        </div>
      )}

      {/* Area konten di bawah tab – hanya bagian ini yang scroll */}
      <div className="kalender-pengaturan-scroll flex-1 min-h-0 overflow-y-auto">
      {tab === 'bulan' && canTabBulan && (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="number"
              value={tahunHijriyah}
              onChange={(e) => setTahunHijriyah(e.target.value)}
              placeholder="Tahun"
              className="kalender-pengaturan__input-wrap rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 w-24 text-sm"
              aria-label="Tahun Hijriyah"
            />
            <button
              type="button"
              onClick={() => loadKalenderByTahun()}
              disabled={loadingKalender}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary p-2.5"
              title="Muat"
              aria-label="Muat data kalender"
            >
              {loadingKalender ? (
                <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={saveKalenderBulk}
              disabled={savingKalender || kalenderRows.length === 0}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary p-2.5"
              title="Simpan"
              aria-label="Simpan data kalender"
            >
              <svg className={`w-5 h-5 ${savingKalender ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={loadTahunList}
              disabled={loadingTahunList}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary p-2.5"
              title="Cari tahun"
              aria-label="Cari tahun yang sudah ada"
            >
              <svg className={`w-5 h-5 ${loadingTahunList ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
          {messageKalender && (
            <div className="mb-4 p-2 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 text-sm">
              {messageKalender}
            </div>
          )}
          <ul className="kalender-pengaturan-list space-y-3 sm:space-y-0 sm:rounded-xl sm:border sm:border-gray-200 dark:sm:border-gray-700 sm:overflow-hidden sm:bg-white dark:sm:bg-gray-800/50">
            {/* Header baris untuk PC: kolom lurus */}
            <li className="hidden sm:grid kalender-pengaturan-list__header" aria-hidden>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Bulan</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide text-center">Hari</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Mulai</span>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Akhir</span>
            </li>
            {kalenderRows.map((row, index) => {
              const jumlahHari = row.jumlahHari ?? 30
              const isBulanPertama = index === 0
              return (
                <li
                  key={row.id ?? index}
                  className="kalender-pengaturan-list__row bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 transition-shadow hover:shadow-md sm:rounded-none sm:shadow-none sm:border-0 sm:border-b sm:border-gray-200 dark:sm:border-gray-700 sm:hover:bg-gray-50 dark:sm:hover:bg-gray-800/80 last:sm:border-b-0"
                >
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--bulan flex items-center gap-3 min-w-0 mb-3 sm:mb-0">
                    <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {String(row.id_bulan).padStart(2, '0')}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 dark:text-gray-200 text-base sm:text-sm truncate">
                        {getBulanName(row.id_bulan, 'hijriyah_ar')}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 sm:hidden">
                        Tahun {row.tahun}
                      </div>
                    </div>
                  </div>
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--hari flex items-center gap-2 mb-3 sm:mb-0">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 sm:sr-only">Hari</span>
                    <select
                      value={jumlahHari}
                      onChange={(e) => handleKalenderFieldChange(index, 'jumlahHari', Number(e.target.value))}
                      className="kalender-pengaturan-list__select rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 w-16 sm:w-full"
                    >
                      <option value={29}>29</option>
                      <option value={30}>30</option>
                    </select>
                  </div>
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--mulai space-y-1 sm:space-y-0">
                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 sm:hidden">Mulai</span>
                    {isBulanPertama ? (
                      <input
                        type="date"
                        value={row.mulai || ''}
                        onChange={(e) => handleKalenderFieldChange(index, 'mulai', e.target.value)}
                        className="kalender-pengaturan-list__input w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-teal-600 dark:text-teal-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    ) : (
                      <span className="block text-sm font-medium text-teal-600 dark:text-teal-400 sm:py-2">{row.mulai || '-'}</span>
                    )}
                  </div>
                  <div className="kalender-pengaturan-list__cell kalender-pengaturan-list__cell--akhir space-y-1 sm:space-y-0">
                    <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 sm:hidden">Akhir</span>
                    <span className="block text-sm font-medium text-teal-600 dark:text-teal-400 sm:py-2">{row.akhir || '-'}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          <div className="h-24 sm:h-0 flex-shrink-0" aria-hidden />
        </div>
      )}

      {tab === 'hari-penting' && canTabHariPenting && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {filteredHariPentingList.length} hari penting
              {filteredHariPentingList.length !== hariPentingList.length && (
                <span className="text-gray-400 dark:text-gray-500"> dari {hariPentingList.length}</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => openFormHariPenting()}
              disabled={!canTambahHariPenting}
              title={!canTambahHariPenting ? 'Tidak ada izin target hari penting — atur di Role & akses' : undefined}
              className="kalender-pengaturan__btn kalender-pengaturan__btn--primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tambah Hari Penting
            </button>
          </div>
          {messageHariPenting && (
            <div className="mb-4 p-2 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 text-sm">
              {messageHariPenting}
            </div>
          )}

          {/* Cari & Filter – style seperti Data Ijin */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="relative pb-2 px-4 pt-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchHariPenting}
                  onChange={(e) => setSearchHariPenting(e.target.value)}
                  onFocus={() => setIsInputHariPentingFocused(true)}
                  onBlur={() => setIsInputHariPentingFocused(false)}
                  className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                  placeholder="Cari nama event atau keterangan..."
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setIsFilterHariPentingOpen((v) => !v)}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                    title={isFilterHariPentingOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {isFilterHariPentingOpen ? (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={loadHariPenting}
                    className="bg-teal-100 hover:bg-teal-200 dark:bg-teal-700 dark:hover:bg-teal-600 text-teal-700 dark:text-teal-200 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                    title="Refresh"
                    disabled={loadingHariPenting}
                  >
                    <svg className={`w-4 h-4 ${loadingHariPenting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputHariPentingFocused ? 'opacity-100' : 'opacity-0'}`} />
            </div>

            <div
              className={`overflow-hidden transition-all duration-200 ease-out border-t border-gray-200 dark:border-gray-700 ${
                isFilterHariPentingOpen ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0 border-t-0'
              }`}
            >
              <div className="px-4 py-2 flex flex-wrap gap-2 bg-gray-50 dark:bg-gray-700/50 max-h-72 overflow-y-auto">
                <select
                  value={filterKategoriHariPenting}
                  onChange={(e) => setFilterKategoriHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Kategori</option>
                  {KATEGORI_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={filterTipeHariPenting}
                  onChange={(e) => setFilterTipeHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Tipe</option>
                  {TIPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={filterTahunHariPenting}
                  onChange={(e) => setFilterTahunHariPenting(e.target.value)}
                  placeholder="Tahun"
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 w-20 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                  title="Filter Tahun"
                  aria-label="Filter tahun"
                />
                <select
                  value={filterBulanHariPenting}
                  onChange={(e) => setFilterBulanHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                  title="Filter Bulan"
                >
                  <option value="">Bulan</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
                <select
                  value={filterTanggalHariPenting}
                  onChange={(e) => setFilterTanggalHariPenting(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                  title="Filter Tanggal"
                >
                  <option value="">Tanggal</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
                <div className="w-full border-t border-gray-200 dark:border-gray-600 pt-2 mt-1 flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Target audiens
                  </span>
                  <div className="flex flex-wrap gap-2 items-start">
                    <select
                      value={filterTargetJenisHariPenting}
                      onChange={(e) => {
                        const v = e.target.value
                        setFilterTargetJenisHariPenting(v)
                        setFilterHpLembagaId('')
                        setFilterHpUserId('')
                        setFilterHpUserLabel('')
                        setFilterHpUserQuery('')
                        setFilterHpUserHits([])
                      }}
                      className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-[10rem] text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                      title="Filter target"
                    >
                      <option value="">Semua target</option>
                      <option value="global">Global (semua pengguna)</option>
                      <option value="lembaga">Lembaga tertentu</option>
                      <option value="user">Pengguna tertentu</option>
                    </select>
                    {filterTargetJenisHariPenting === 'lembaga' && (
                      <select
                        value={filterHpLembagaId}
                        onChange={(e) => setFilterHpLembagaId(e.target.value)}
                        className="border border-gray-300 dark:border-gray-600 rounded p-1.5 h-8 min-w-[12rem] max-w-full flex-1 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 focus:ring-1 focus:ring-teal-400"
                        title="Pilih lembaga"
                      >
                        <option value="">— Pilih lembaga —</option>
                        {hpLembagaOptions.map((lb) => (
                          <option key={String(lb.id)} value={String(lb.id)}>
                            {lb.nama || lb.id}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {filterTargetJenisHariPenting === 'user' && (
                    <div className="w-full space-y-1.5">
                      {filterHpUserId ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100 text-xs">
                            {filterHpUserLabel || `User #${filterHpUserId}`}
                            <button
                              type="button"
                              className="p-0.5 rounded-full hover:bg-teal-200 dark:hover:bg-teal-800"
                              aria-label="Hapus filter pengguna"
                              onClick={() => {
                                setFilterHpUserId('')
                                setFilterHpUserLabel('')
                                setFilterHpUserQuery('')
                                setFilterHpUserHits([])
                              }}
                            >
                              ×
                            </button>
                          </span>
                        </div>
                      ) : (
                        <>
                          <input
                            type="search"
                            value={filterHpUserQuery}
                            onChange={(e) => setFilterHpUserQuery(e.target.value)}
                            placeholder="Cari nama / username (min. 2 huruf)"
                            className="w-full max-w-md rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs"
                          />
                          {filterHpUserLoading && (
                            <p className="text-[11px] text-gray-500">Mencari…</p>
                          )}
                          {filterHpUserHits.length > 0 && (
                            <ul className="max-h-32 overflow-y-auto rounded border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                              {filterHpUserHits.map((row) => (
                                <li key={row.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700"
                                    onClick={() => {
                                      const uid = String(row.id)
                                      setFilterHpUserId(uid)
                                      setFilterHpUserLabel(row.nama || row.username || `User #${uid}`)
                                      setFilterHpUserQuery('')
                                      setFilterHpUserHits([])
                                    }}
                                  >
                                    <span className="font-medium text-gray-800 dark:text-gray-100">
                                      {row.nama || row.username}
                                    </span>
                                    {row.username && (
                                      <span className="text-gray-500 ml-1">@{row.username}</span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  )}
                  {filterTargetJenisHariPenting === 'lembaga' && !filterHpLembagaId && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">Pilih lembaga untuk menyaring daftar.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {loadingHariPenting ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent" />
            </div>
          ) : (
            <ul className="space-y-2">
              {filteredHariPentingList.map((item) => {
                let dateInfo = null
                if (item.tipe === 'dari_sampai' && item.tanggal_dari && item.tanggal_sampai) {
                  dateInfo =
                    item.kategori === 'hijriyah'
                      ? `${formatHijriDateDisplay(item.tanggal_dari)} – ${formatHijriDateDisplay(item.tanggal_sampai)}`
                      : `${formatYmdMasehiTampil(item.tanggal_dari)} – ${formatYmdMasehiTampil(item.tanggal_sampai)}`
                } else {
                  const parts = []
                  if (item.tanggal != null && item.tanggal !== '') parts.push(`Tgl ${item.tanggal}`)
                  if (item.bulan != null && item.bulan !== '') parts.push(item.kategori === 'hijriyah' ? getBulanName(Number(item.bulan), 'hijriyah_ar') : `Bulan ${item.bulan}`)
                  if (item.tahun != null && item.tahun !== '') parts.push(item.tahun)
                  dateInfo = parts.length ? parts.join(' · ') : null
                }
                return (
                  <li
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openFormHariPenting(item)}
                    onKeyDown={(e) => e.key === 'Enter' && openFormHariPenting(item)}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/80 transition-colors"
                  >
                    {item.warna_label && (
                      <span
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: item.warna_label }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="font-medium block truncate">{item.nama_event}</span>
                      <span className="text-xs text-gray-500 block truncate">
                        {[dateInfo, formatJamRangeLabel(item), item.tipe, formatTargetRingkas(item, myUsersId)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Form Hari Penting: offcanvas kanan via portal (seperti Data Ijin) */}
        </div>
      )}
      </div>

      {/* Offcanvas kanan Hari Penting: tambah/edit form + Hapus di dalam (seperti Data Ijin) */}
      {createPortal(
        showForm ? (
          <>
            <div
              className={`fixed inset-0 z-[99998] bg-black/40 transition-opacity duration-300 ease-out ${
                hpOffcanvasEntered && !hpOffcanvasExiting ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
              onClick={tutupHariPentingOffcanvas}
            />
            <div
              className={`fixed top-0 right-0 bottom-0 z-[99999] w-full max-w-md bg-white dark:bg-gray-800 shadow-xl flex flex-col transition-transform duration-300 ease-out ${
                hpOffcanvasEntered && !hpOffcanvasExiting ? 'translate-x-0' : 'translate-x-full'
              }`}
              role="dialog"
              aria-label={formHariPenting.id ? 'Edit Hari Penting' : 'Tambah Hari Penting'}
              onTransitionEnd={handleHariPentingOffcanvasTransitionEnd}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {formHariPenting.id ? 'Edit Hari Penting' : 'Tambah Hari Penting'}
                </h2>
                <button
                  type="button"
                  onClick={tutupHariPentingOffcanvas}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="kalender-pengaturan-scroll flex-1 overflow-y-auto p-4 space-y-3">
                {messageHariPenting && (
                  <div className="p-2 rounded bg-teal-50 dark:bg-teal-900/20 text-teal-800 dark:text-teal-200 text-sm">
                    {messageHariPenting}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Nama Event</label>
                  <input
                    type="text"
                    value={formHariPenting.nama_event}
                    onChange={(e) => setFormHariPenting((p) => ({ ...p, nama_event: e.target.value }))}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Kategori</label>
                  <select
                    value={formHariPenting.kategori}
                    onChange={(e) =>
                      setFormHariPenting((p) => ({
                        ...p,
                        kategori: e.target.value,
                        ...(p.tipe === 'dari_sampai' ? { tanggal_dari: '', tanggal_sampai: '' } : {})
                      }))
                    }
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    {KATEGORI_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tipe</label>
                  <select
                    value={formHariPenting.tipe}
                    onChange={(e) => {
                      const tipe = e.target.value
                      setFormHariPenting((p) => ({
                        ...p,
                        tipe,
                        ...(tipe === 'dari_sampai'
                          ? { tanggal: '', bulan: '', tahun: '', hari_pekan: '' }
                          : { tanggal_dari: '', tanggal_sampai: '' }),
                        ...(tipe === 'per_tahun' ? { tahun: '' } : {}),
                        ...(tipe === 'per_bulan' ? { bulan: '' } : {})
                      }))
                    }}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    {TIPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    formHariPenting.tipe === 'dari_sampai' ? 'max-h-0 opacity-0' : 'max-h-[12rem] opacity-100'
                  }`}
                >
                  <div className="grid grid-cols-3 gap-2">
                    <div className="min-w-0">
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tanggal</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={formHariPenting.tanggal}
                        onChange={(e) => setFormHariPenting((p) => ({ ...p, tanggal: e.target.value }))}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                      />
                    </div>
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-out min-w-0 ${
                        formHariPenting.tipe === 'per_bulan'
                          ? 'max-h-0 opacity-0'
                          : 'max-h-[4.5rem] opacity-100'
                      }`}
                    >
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Bulan</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={formHariPenting.bulan}
                        onChange={(e) => setFormHariPenting((p) => ({ ...p, bulan: e.target.value }))}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                      />
                    </div>
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-out min-w-0 ${
                        formHariPenting.tipe === 'per_tahun'
                          ? 'max-h-0 opacity-0'
                          : 'max-h-[4.5rem] opacity-100'
                      }`}
                    >
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tahun</label>
                      <input
                        type="number"
                        value={formHariPenting.tahun}
                        onChange={(e) => setFormHariPenting((p) => ({ ...p, tahun: e.target.value }))}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
                      />
                    </div>
                  </div>
                </div>
                {formHariPenting.tipe === 'dari_sampai' && (
                  <div className="space-y-3 pt-1">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Tanggal disimpan sebagai Y-m-d sesuai kategori (Masehi atau Hijriyah).
                    </p>
                    {formHariPenting.kategori === 'masehi' ? (
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Dari (Masehi)</label>
                          <input
                            type="date"
                            value={formHariPenting.tanggal_dari || ''}
                            onChange={(e) => setFormHariPenting((p) => ({ ...p, tanggal_dari: e.target.value }))}
                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Sampai (Masehi)</label>
                          <input
                            type="date"
                            value={formHariPenting.tanggal_sampai || ''}
                            min={formHariPenting.tanggal_dari || undefined}
                            onChange={(e) => setFormHariPenting((p) => ({ ...p, tanggal_sampai: e.target.value }))}
                            className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Dari (Hijriyah)</label>
                          <PickDateHijri
                            value={formHariPenting.tanggal_dari || null}
                            onChange={(ymd) => setFormHariPenting((p) => ({ ...p, tanggal_dari: ymd || '' }))}
                            max={formHariPenting.tanggal_sampai || undefined}
                            placeholder="Pilih tanggal awal"
                            className="w-full"
                            inputClassName="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Sampai (Hijriyah)</label>
                          <PickDateHijri
                            value={formHariPenting.tanggal_sampai || null}
                            onChange={(ymd) => setFormHariPenting((p) => ({ ...p, tanggal_sampai: ymd || '' }))}
                            min={formHariPenting.tanggal_dari || undefined}
                            placeholder="Pilih tanggal akhir"
                            className="w-full"
                            inputClassName="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Warna Label</label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {(() => {
                      const current = formHariPenting.warna_label || '#3b82f6'
                      const dipakai = WARNA_LABEL_OPTIONS.includes(current)
                        ? WARNA_LABEL_OPTIONS
                        : [current, ...WARNA_LABEL_OPTIONS]
                      return dipakai.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setFormHariPenting((p) => ({ ...p, warna_label: hex }))}
                          className={`w-8 h-8 rounded-lg border-2 transition-all shrink-0 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                            (formHariPenting.warna_label || '#3b82f6') === hex
                              ? 'border-gray-900 dark:border-white scale-110'
                              : 'border-gray-300 dark:border-gray-600 hover:border-gray-500'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex}
                          aria-label={`Pilih warna ${hex}`}
                        />
                      ))
                    })()}
                    <input
                      ref={colorPickerInputRef}
                      type="color"
                      value={formHariPenting.warna_label || '#3b82f6'}
                      onChange={(e) => setFormHariPenting((p) => ({ ...p, warna_label: e.target.value }))}
                      className="sr-only"
                      aria-hidden="true"
                      tabIndex={-1}
                    />
                    <button
                      type="button"
                      onClick={() => colorPickerInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Tambah warna manual
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Keterangan</label>
                  <textarea
                    value={formHariPenting.keterangan}
                    onChange={(e) => setFormHariPenting((p) => ({ ...p, keterangan: e.target.value }))}
                    rows={2}
                    className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2"
                  />
                </div>
                <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3 bg-gray-50/80 dark:bg-gray-900/30">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!formHariPenting.ada_jam}
                      onChange={(e) =>
                        setFormHariPenting((p) => ({
                          ...p,
                          ada_jam: e.target.checked,
                          ...(!e.target.checked ? { jam_mulai: '', jam_selesai: '' } : {})
                        }))
                      }
                      className="mt-0.5"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Cantumkan jam acara
                      <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                        Tampil di kalender sebagai jam mulai–selesai (opsional).
                      </span>
                    </span>
                  </label>
                  {formHariPenting.ada_jam && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">Jam mulai</label>
                        <input
                          type="time"
                          value={formHariPenting.jam_mulai || ''}
                          onChange={(e) => setFormHariPenting((p) => ({ ...p, jam_mulai: e.target.value }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600 dark:text-gray-400">Jam selesai</label>
                        <input
                          type="time"
                          value={formHariPenting.jam_selesai || ''}
                          onChange={(e) => setFormHariPenting((p) => ({ ...p, jam_selesai: e.target.value }))}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!formHariPenting.aktif}
                    onChange={(e) => setFormHariPenting((p) => ({ ...p, aktif: e.target.checked ? 1 : 0 }))}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Aktif</span>
                </label>

                <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-3 bg-gray-50/80 dark:bg-gray-900/30">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">Target audiens</div>
                  {useFiturCodes && !bypassHpTargetPolicy && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                      Opsi di bawah mengikuti aksi fitur role Anda (global / lembaga / pengguna selembaga / hanya saya).
                    </p>
                  )}
                  {(canHpTargetGlobal || !!formHariPenting.target_global) && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!formHariPenting.target_global}
                        onChange={(e) => {
                          const on = e.target.checked
                          if (!canHpTargetGlobal && on) return
                          setFormHariPenting((p) => ({
                            ...p,
                            target_global: on,
                            ...(on
                              ? { target_lembaga_ids: [], target_user_ids: [], target_self: false }
                              : {})
                          }))
                        }}
                        className="mt-0.5"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        Semua pengguna (global)
                        <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                          Jika tidak dicentang, pilih hanya saya, satu atau lebih lembaga, dan/atau pengguna (akun terhubung
                          pengurus).
                        </span>
                      </span>
                    </label>
                  )}
                  {!formHariPenting.target_global && (
                    <>
                      {(canHpTargetSelf || !!formHariPenting.target_self) && myUsersId != null && (
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!formHariPenting.target_self}
                            onChange={(e) => {
                              const on = e.target.checked
                              if (!canHpTargetSelf && on) return
                              setFormHariPenting((p) => {
                                if (!on) {
                                  return { ...p, target_self: false }
                                }
                                const selfLabel =
                                  authUser?.nama || authUser?.username || `User #${myUsersId}`
                                setHpUserLabels((prev) => ({ ...prev, [myUsersId]: selfLabel }))
                                return {
                                  ...p,
                                  target_self: true,
                                  target_lembaga_ids: [],
                                  target_user_ids: [myUsersId]
                                }
                              })
                            }}
                            className="mt-0.5"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Hanya saya (pembuat)
                            <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal mt-0.5">
                              Hanya akun login Anda yang melihat event ini. Otomatis menargetkan users.id Anda.
                            </span>
                          </span>
                        </label>
                      )}
                      {myUsersId == null && !formHariPenting.target_global && (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          Token tidak memuat users_id — opsi &quot;Hanya saya&quot; tidak tersedia.
                        </p>
                      )}

                      {!formHariPenting.target_self && (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {canHpTargetLembaga && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHpTargetPanel('lembaga')
                                  setFormHariPenting((p) => ({ ...p, target_self: false }))
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                Pilih lembaga
                                {(formHariPenting.target_lembaga_ids || []).length > 0 && (
                                  <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                                    ({(formHariPenting.target_lembaga_ids || []).length})
                                  </span>
                                )}
                              </button>
                            )}
                            {canHpTargetUserSelembaga && (
                              <button
                                type="button"
                                onClick={() => {
                                  setHpTargetPanel('user')
                                  setFormHariPenting((p) => ({ ...p, target_self: false }))
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                Pilih pengguna
                                {(formHariPenting.target_user_ids || []).length > 0 && (
                                  <span className="text-xs font-semibold text-teal-600 dark:text-teal-400">
                                    ({(formHariPenting.target_user_ids || []).length})
                                  </span>
                                )}
                              </button>
                            )}
                          </div>
                          {!canHpTargetLembaga &&
                            !canHpTargetUserSelembaga &&
                            !(formHariPenting.target_lembaga_ids || []).length &&
                            !(formHariPenting.target_user_ids || []).length && (
                              <p className="text-xs text-gray-500 dark:text-gray-400">
                                Gunakan &quot;Hanya saya&quot; atau minta admin menambahkan aksi target lembaga / pengguna.
                              </p>
                            )}
                          {(formHariPenting.target_lembaga_ids || []).length > 0 && (
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              <span className="font-medium text-gray-700 dark:text-gray-300">Lembaga terpilih: </span>
                              {(formHariPenting.target_lembaga_ids || [])
                                .map((id) => {
                                  const lb = hpLembagaOptions.find((x) => String(x.id) === String(id))
                                  return lb?.nama || id
                                })
                                .join(', ')}
                            </div>
                          )}
                          {(formHariPenting.target_user_ids || []).length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {(formHariPenting.target_user_ids || []).map((uid) => (
                                <span
                                  key={uid}
                                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100 text-xs"
                                >
                                  {hpUserLabels[uid] || `User #${uid}`}
                                  <button
                                    type="button"
                                    className="p-0.5 rounded-full hover:bg-teal-200 dark:hover:bg-teal-800"
                                    aria-label={`Hapus ${uid}`}
                                    onClick={() => removeHpUser(uid)}
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                      {formHariPenting.target_self && myUsersId != null && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 rounded-md bg-white/60 dark:bg-gray-800/60 px-2 py-1.5">
                          Mode pribadi:{' '}
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {authUser?.nama || authUser?.username || `User #${myUsersId}`}
                          </span>
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={saveHariPenting}
                  disabled={
                    savingHariPenting ||
                    hpFormTargetViolatesPolicy ||
                    !formHariPenting.nama_event.trim() ||
                    (formHariPenting.tipe === 'dari_sampai' &&
                      (!formHariPenting.tanggal_dari || !formHariPenting.tanggal_sampai)) ||
                    (!formHariPenting.target_global &&
                      !(
                        (formHariPenting.target_self && myUsersId != null) ||
                        (formHariPenting.target_lembaga_ids || []).length > 0 ||
                        (formHariPenting.target_user_ids || []).length > 0
                      )) ||
                    (!!formHariPenting.target_self && myUsersId == null) ||
                    (!!formHariPenting.ada_jam &&
                      (!formHariPenting.jam_mulai?.trim() || !formHariPenting.jam_selesai?.trim()))
                  }
                  title={
                    hpFormTargetViolatesPolicy
                      ? 'Kombinasi target tidak diizinkan untuk role Anda'
                      : undefined
                  }
                  className="kalender-pengaturan__btn kalender-pengaturan__btn--primary"
                >
                  {savingHariPenting ? 'Menyimpan...' : 'Simpan'}
                </button>
                <button
                  type="button"
                  onClick={tutupHariPentingOffcanvas}
                  className="kalender-pengaturan__btn kalender-pengaturan__btn--secondary"
                >
                  Batal
                </button>
                {formHariPenting.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Yakin hapus hari penting ini?')) {
                        deleteHariPenting(formHariPenting.id)
                        setShowForm(false)
                        setHpOffcanvasEntered(false)
                      }
                    }}
                    className="kalender-pengaturan__btn kalender-pengaturan__btn--danger"
                  >
                    Hapus
                  </button>
                )}
              </div>
            </div>
          </>
        ) : null,
        document.body
      )}

      {createPortal(
        showForm && hpTargetPanel ? (
          <>
            <div
              className={`fixed inset-0 z-[100000] bg-black/45 transition-opacity duration-300 ease-out ${
                hpTargetPanelEntered && !hpTargetPanelExiting ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
              onClick={tutupHpTargetPanel}
            />
            <div
              className={`fixed top-0 right-0 bottom-0 z-[100001] w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
                hpTargetPanelEntered && !hpTargetPanelExiting ? 'translate-x-0' : 'translate-x-full'
              }`}
              role="dialog"
              aria-label={hpTargetPanel === 'lembaga' ? 'Pilih lembaga' : 'Pilih pengguna'}
              onTransitionEnd={handleHpTargetPanelTransitionEnd}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {hpTargetPanel === 'lembaga' ? 'Pilih lembaga' : 'Pilih pengguna'}
                </h2>
                <button
                  type="button"
                  onClick={tutupHpTargetPanel}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="kalender-pengaturan-scroll flex-1 overflow-y-auto p-4 min-h-0">
                {hpTargetPanel === 'lembaga' && (
                  <>
                    {hpLembagaOptions.length === 0 ? (
                      <p className="text-sm text-gray-500">Memuat lembaga…</p>
                    ) : (
                      <ul className="space-y-1">
                        {hpLembagaOptions.map((lb) => {
                          const id = String(lb.id)
                          const checked = (formHariPenting.target_lembaga_ids || []).map(String).includes(id)
                          return (
                            <li key={id}>
                              <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/80">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleHpLembaga(id)}
                                  className="rounded border-gray-300 dark:border-gray-500 shrink-0"
                                />
                                <span className="text-sm text-gray-800 dark:text-gray-100">{lb.nama || id}</span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
                )}
                {hpTargetPanel === 'user' && (
                  <div className="space-y-3">
                    <input
                      type="search"
                      value={hpUserQuery}
                      onChange={(e) => setHpUserQuery(e.target.value)}
                      placeholder="Cari nama / username / email (min. 2 huruf)"
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                      autoFocus
                    />
                    {hpUserLoading && <p className="text-xs text-gray-500">Mencari…</p>}
                    {(formHariPenting.target_user_ids || []).length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Terpilih</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(formHariPenting.target_user_ids || []).map((uid) => (
                            <span
                              key={uid}
                              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-900 dark:text-teal-100 text-xs"
                            >
                              {hpUserLabels[uid] || `User #${uid}`}
                              <button
                                type="button"
                                className="p-0.5 rounded-full hover:bg-teal-200 dark:hover:bg-teal-800"
                                aria-label={`Hapus ${uid}`}
                                onClick={() => removeHpUser(uid)}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {hpUserHits.length > 0 && (
                      <ul className="rounded-lg border border-gray-200 dark:border-gray-600 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden">
                        {hpUserHits.map((row) => {
                          const uid = Number(row.id)
                          const picked = (formHariPenting.target_user_ids || []).includes(uid)
                          return (
                            <li key={row.id}>
                              <button
                                type="button"
                                className={`w-full text-left px-3 py-2.5 text-sm ${
                                  picked
                                    ? 'bg-teal-50 dark:bg-teal-900/20 text-teal-900 dark:text-teal-100'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100'
                                }`}
                                onClick={() => addHpUserFromPicker(row)}
                              >
                                <span className="font-medium">{row.nama || row.username}</span>
                                {row.username && <span className="text-gray-500 ml-1">@{row.username}</span>}
                                {picked && (
                                  <span className="ml-2 text-xs text-teal-600 dark:text-teal-400">✓ terpilih</span>
                                )}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {hpUserQuery.trim().length >= 2 && !hpUserLoading && hpUserHits.length === 0 && (
                      <p className="text-xs text-gray-500">Tidak ada hasil.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <button
                  type="button"
                  onClick={tutupHpTargetPanel}
                  className="w-full kalender-pengaturan__btn kalender-pengaturan__btn--primary"
                >
                  Selesai
                </button>
              </div>
            </div>
          </>
        ) : null,
        document.body
      )}

      {/* Offcanvas kanan: render di elemen terluar (document.body) seperti Cari Santri */}
      {createPortal(
        showCariOffcanvas ? (
          <>
            <div
              className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-out ${
                cariOffcanvasEntered && !cariOffcanvasExiting ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden
              onClick={tutupCariOffcanvas}
            />
            <div
              className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-white dark:bg-gray-800 shadow-xl flex flex-col transition-transform duration-300 ease-out ${
                cariOffcanvasEntered && !cariOffcanvasExiting ? 'translate-x-0' : 'translate-x-full'
              }`}
              role="dialog"
              aria-label="Cari tahun"
              onTransitionEnd={handleCariOffcanvasTransitionEnd}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Tahun yang ada</h2>
                <button
                  type="button"
                  onClick={tutupCariOffcanvas}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Tutup"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="kalender-pengaturan-scroll flex-1 overflow-y-auto p-4">
                {loadingTahunList ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-600 border-t-transparent" />
                  </div>
                ) : tahunList.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Belum ada data tahun.</p>
                ) : (
                  <ul className="space-y-1">
                    {tahunList.map(({ tahun, count }) => (
                      <li key={tahun}>
                        <button
                          type="button"
                          onClick={() => pilihTahunDariCari(tahun)}
                          className="w-full text-left px-4 py-3 rounded-lg flex items-center justify-between gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          <span className="font-medium text-gray-800 dark:text-gray-200">Tahun {tahun}</span>
                          <span
                            className={`text-sm font-medium shrink-0 ${
                              count === 12
                                ? 'text-teal-600 dark:text-teal-400'
                                : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {count}/12
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        ) : null,
        document.body
      )}
    </div>
  )
}

export default KalenderPengaturan
