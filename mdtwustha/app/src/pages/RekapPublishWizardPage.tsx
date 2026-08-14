import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  absenRekapToUnifiedBaris,
  createRekapPublish,
  getAbsenRekap,
  getKelas,
  getNilaiRekap,
  getRekapPublish,
  getRekapPublishOccupied,
  updateRekapPublish,
  type KelasRow,
  type MapelRow,
  type NilaiRekapRow,
  type NilaiRekapTampil,
  type RekapPublishAbsenBaris,
} from '../api/apiClient'
import PickDateHijriMasehi, {
  type DualDateValue,
  compareMasehiYmd,
  formatHijriDateDisplay,
  formatMasehiDateDisplay,
  masehiMaxRekap,
  todayMasehi,
} from '../components/PickDateHijri/PickDateHijriMasehi'
import MaterialIcon from '../components/MaterialIcon'
import OffcanvasUrutanFan from '../components/OffcanvasUrutanFan'
import { getStoredUser } from '../utils/auth'
import {
  applyFanOrder,
  buildFanColumns,
  cellForFan,
  enrichMapelKelasIds,
  reorderMapelByFanOrder,
} from '../utils/nilaiFanColumns'

export type RekapPublishNavState = {
  kelas_ids?: string[]
  from?: 'nilai' | 'absen'
  nilai_dari?: DualDateValue | null
  nilai_sampai?: DualDateValue | null
  absen_dari?: DualDateValue | null
  absen_sampai?: DualDateValue | null
  tampil_nilai?: NilaiRekapTampil
}

const STEPS = [
  { id: 1, label: 'Kelas' },
  { id: 2, label: 'Nilai' },
  { id: 3, label: 'Absen' },
  { id: 4, label: 'Judul & jadwal' },
  { id: 5, label: 'Validasi' },
] as const

function isAdminAkses(akses?: string) {
  return akses === 'super_admin' || akses === 'admin'
}

function formatKelasLabel(nama?: string | null, kel?: string | null) {
  if (!nama) return '—'
  return kel ? `${nama} · ${kel}` : nama
}

function toDatetimeLocalValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function datesInRange(awal: string, akhir: string): string[] {
  const out: string[] = []
  const cur = new Date(awal + 'T12:00:00')
  const end = new Date(akhir + 'T12:00:00')
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function firstDayOfMonthMasehi() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function defaultDual(): DualDateValue {
  return { masehi: firstDayOfMonthMasehi(), hijri: '' }
}

function todayDual(): DualDateValue {
  return { masehi: todayMasehi(), hijri: '' }
}

function KelasFilterBar({
  options,
  value,
  onChange,
}: {
  options: KelasRow[]
  value: string
  onChange: (id: string) => void
}) {
  if (options.length <= 1) return null
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-[11px] ui-text-muted shrink-0">Filter kelas:</span>
      <button
        type="button"
        onClick={() => onChange('')}
        className={`px-2 py-1 text-[11px] rounded-md border transition ${
          value === ''
            ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
            : 'ui-divider ui-text-muted'
        }`}
      >
        Semua
      </button>
      {options.map((k) => (
        <button
          key={k.id}
          type="button"
          onClick={() => onChange(String(k.id))}
          className={`px-2 py-1 text-[11px] rounded-md border transition truncate max-w-[9rem] ${
            value === String(k.id)
              ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
              : 'ui-divider ui-text-muted'
          }`}
          title={formatKelasLabel(k.nama_kelas, k.kel)}
        >
          {formatKelasLabel(k.nama_kelas, k.kel)}
        </button>
      ))}
    </div>
  )
}

export default function RekapPublishWizardPage() {
  const { id: editId } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const navState = (location.state || {}) as RekapPublishNavState
  const user = getStoredUser()
  const akses = user?.akses || ''
  const isAdmin = isAdminAkses(akses)
  const masehiMax = masehiMaxRekap()
  const isEdit = Boolean(editId)

  const [step, setStep] = useState(1)
  const [kelasList, setKelasList] = useState<KelasRow[]>([])
  const [selectedKelasIds, setSelectedKelasIds] = useState<string[]>([])
  const [filterNilaiKelasId, setFilterNilaiKelasId] = useState('')
  const [filterAbsenKelasId, setFilterAbsenKelasId] = useState('')
  const [nilaiDari, setNilaiDari] = useState<DualDateValue | null>(null)
  const [nilaiSampai, setNilaiSampai] = useState<DualDateValue | null>(null)
  const [absenDari, setAbsenDari] = useState<DualDateValue | null>(null)
  const [absenSampai, setAbsenSampai] = useState<DualDateValue | null>(null)
  const [tampilNilai, setTampilNilai] = useState<NilaiRekapTampil>('nilai')
  const [mapel, setMapel] = useState<MapelRow[]>([])
  const [fanOrder, setFanOrder] = useState<string[]>([])
  const [urutanFanOpen, setUrutanFanOpen] = useState(false)
  const [barisNilai, setBarisNilai] = useState<NilaiRekapRow[]>([])
  const [barisAbsen, setBarisAbsen] = useState<RekapPublishAbsenBaris[]>([])
  const [judul, setJudul] = useState('')
  const [catatan, setCatatan] = useState('')
  const [publishAt, setPublishAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [occupied, setOccupied] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [bootstrapped, setBootstrapped] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true })
      return
    }
    if (!isAdmin) {
      navigate('/rekap/hasil', { replace: true })
    }
  }, [user, isAdmin, navigate])

  useEffect(() => {
    getKelas().then((res) => {
      if (res.success) setKelasList(res.data)
    })
  }, [])

  useEffect(() => {
    if (bootstrapped || !akses) return
    let cancelled = false
    const boot = async () => {
      if (editId) {
        setLoading(true)
        const res = await getRekapPublish(editId, akses)
        if (cancelled) return
        setLoading(false)
        if (!res.success || !res.data) {
          setError(res.message || 'Gagal memuat publish')
          setBootstrapped(true)
          return
        }
        const d = res.data
        setSelectedKelasIds((d.kelas_ids || []).map(String))
        setJudul(d.judul)
        setCatatan(d.catatan || '')
        setTampilNilai((d.tampil_nilai as NilaiRekapTampil) || 'nilai')
        setNilaiDari({ masehi: d.nilai_tanggal_awal, hijri: d.nilai_hijri_awal || '' })
        setNilaiSampai({ masehi: d.nilai_tanggal_akhir, hijri: d.nilai_hijri_akhir || '' })
        setAbsenDari({ masehi: d.absen_tanggal_awal, hijri: d.absen_hijri_awal || '' })
        setAbsenSampai({ masehi: d.absen_tanggal_akhir, hijri: d.absen_hijri_akhir || '' })
        setPublishAt(toDatetimeLocalValue(new Date(d.publish_at.replace(' ', 'T'))))
        setMapel(res.mapel || [])
        setFanOrder(buildFanColumns(res.mapel || [], '').map((c) => c.key))
        setBarisNilai(res.baris_nilai || [])
        setBarisAbsen(res.baris_absen || [])
        setStep(1)
        setBootstrapped(true)
        return
      }

      const ids = (navState.kelas_ids || []).filter(Boolean).map(String)
      setSelectedKelasIds(ids)
      if (navState.from === 'nilai') {
        setNilaiDari(navState.nilai_dari || defaultDual())
        setNilaiSampai(navState.nilai_sampai || todayDual())
        setAbsenDari(navState.absen_dari || navState.nilai_dari || defaultDual())
        setAbsenSampai(navState.absen_sampai || navState.nilai_sampai || todayDual())
        setTampilNilai(navState.tampil_nilai || 'nilai')
      } else if (navState.from === 'absen') {
        setAbsenDari(navState.absen_dari || defaultDual())
        setAbsenSampai(navState.absen_sampai || todayDual())
        setNilaiDari(navState.nilai_dari || navState.absen_dari || defaultDual())
        setNilaiSampai(navState.nilai_sampai || navState.absen_sampai || todayDual())
      } else {
        setNilaiDari(defaultDual())
        setNilaiSampai(todayDual())
        setAbsenDari(defaultDual())
        setAbsenSampai(todayDual())
      }
      setStep(1)
      setBootstrapped(true)
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [akses, editId, navState, bootstrapped])

  useEffect(() => {
    if (!bootstrapped || !akses || selectedKelasIds.length === 0) {
      setOccupied([])
      return
    }
    let cancelled = false
    getRekapPublishOccupied(akses, selectedKelasIds, editId).then((res) => {
      if (cancelled) return
      setOccupied(res.success ? res.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [bootstrapped, akses, selectedKelasIds, editId])

  // Reset filter hanya jika kelasnya memang tidak lagi terpilih (bandingkan sebagai string)
  useEffect(() => {
    const selected = new Set(selectedKelasIds.map(String))
    if (filterNilaiKelasId && !selected.has(String(filterNilaiKelasId))) {
      setFilterNilaiKelasId('')
    }
    if (filterAbsenKelasId && !selected.has(String(filterAbsenKelasId))) {
      setFilterAbsenKelasId('')
    }
  }, [selectedKelasIds, filterNilaiKelasId, filterAbsenKelasId])

  const selectedKelasOptions = useMemo(
    () => {
      const selected = new Set(selectedKelasIds.map(String))
      return kelasList.filter((k) => selected.has(String(k.id)))
    },
    [kelasList, selectedKelasIds]
  )

  const kelasLabel = useMemo(
    () => selectedKelasOptions.map((k) => formatKelasLabel(k.nama_kelas, k.kel)).join(', ') || '—',
    [selectedKelasOptions]
  )

  const barisNilaiTampil = useMemo(() => {
    if (!filterNilaiKelasId) return barisNilai
    const fid = String(filterNilaiKelasId)
    return barisNilai.filter((b) => String(b.kelas_id || '') === fid)
  }, [barisNilai, filterNilaiKelasId])

  const barisAbsenTampil = useMemo(() => {
    if (!filterAbsenKelasId) return barisAbsen
    const fid = String(filterAbsenKelasId)
    return barisAbsen.filter((b) => String(b.kelas_id || '') === fid)
  }, [barisAbsen, filterAbsenKelasId])

  const mapelEnrich = useMemo(
    () => enrichMapelKelasIds(mapel, barisNilai),
    [mapel, barisNilai]
  )

  const fanColumnsAll = useMemo(
    () => applyFanOrder(buildFanColumns(mapelEnrich, ''), fanOrder),
    [mapelEnrich, fanOrder]
  )

  const fanColumns = useMemo(
    () => applyFanOrder(buildFanColumns(mapelEnrich, filterNilaiKelasId), fanOrder),
    [mapelEnrich, filterNilaiKelasId, fanOrder]
  )

  const unionOverlap = useMemo(() => {
    const dates = new Set<string>()
    if (nilaiDari?.masehi && nilaiSampai?.masehi && compareMasehiYmd(nilaiDari.masehi, nilaiSampai.masehi) <= 0) {
      datesInRange(nilaiDari.masehi, nilaiSampai.masehi).forEach((d) => dates.add(d))
    }
    if (absenDari?.masehi && absenSampai?.masehi && compareMasehiYmd(absenDari.masehi, absenSampai.masehi) <= 0) {
      datesInRange(absenDari.masehi, absenSampai.masehi).forEach((d) => dates.add(d))
    }
    return occupied.filter((d) => dates.has(d))
  }, [occupied, nilaiDari, nilaiSampai, absenDari, absenSampai])

  const toggleKelas = (id: string) => {
    const kid = String(id)
    setSelectedKelasIds((prev) => {
      const asStr = prev.map(String)
      const next = asStr.includes(kid) ? asStr.filter((x) => x !== kid) : [...asStr, kid]
      return next
    })
    setBarisNilai([])
    setBarisAbsen([])
    setMapel([])
    setFanOrder([])
  }

  const selectAllKelas = () => {
    setSelectedKelasIds(kelasList.map((k) => String(k.id)))
    setBarisNilai([])
    setBarisAbsen([])
    setMapel([])
    setFanOrder([])
  }

  const clearKelas = () => {
    setSelectedKelasIds([])
    setBarisNilai([])
    setBarisAbsen([])
    setMapel([])
    setFanOrder([])
  }

  const loadNilai = useCallback(async (): Promise<NilaiRekapRow[] | null> => {
    if (!selectedKelasIds.length || !nilaiDari?.masehi || !nilaiSampai?.masehi) {
      setError('Pilih kelas dan rentang tanggal nilai')
      return null
    }
    if (compareMasehiYmd(nilaiDari.masehi, nilaiSampai.masehi) > 0) {
      setError('Tanggal nilai: awal tidak boleh setelah akhir')
      return null
    }
    setLoading(true)
    setError('')
    const res = await getNilaiRekap(selectedKelasIds, nilaiDari.masehi, nilaiSampai.masehi)
    setLoading(false)
    if (!res.success) {
      setError(res.message || 'Gagal memuat rekap nilai')
      return null
    }
    const rows = res.data || []
    const mapelRows = res.mapel || []
    setMapel(mapelRows)
    setFanOrder(buildFanColumns(enrichMapelKelasIds(mapelRows, rows), '').map((c) => c.key))
    setBarisNilai(rows)
    return rows
  }, [selectedKelasIds, nilaiDari, nilaiSampai])

  const loadAbsen = useCallback(async (): Promise<RekapPublishAbsenBaris[] | null> => {
    if (!selectedKelasIds.length || !absenDari?.masehi || !absenSampai?.masehi) {
      setError('Pilih kelas dan rentang tanggal absen')
      return null
    }
    if (compareMasehiYmd(absenDari.masehi, absenSampai.masehi) > 0) {
      setError('Tanggal absen: awal tidak boleh setelah akhir')
      return null
    }
    setLoading(true)
    setError('')
    const merged: RekapPublishAbsenBaris[] = []
    for (const kid of selectedKelasIds) {
      const k = kelasList.find((x) => x.id === kid)
      const res = await getAbsenRekap(kid, absenDari.masehi, absenSampai.masehi)
      if (!res.success) {
        setLoading(false)
        setError(res.message || `Gagal memuat absen kelas ${kid}`)
        return null
      }
      merged.push(
        ...absenRekapToUnifiedBaris(res.data || [], kid, k?.nama_kelas, k?.kel).map((b, i) => ({
          ...b,
          urutan: merged.length + i + 1,
        }))
      )
    }
    setLoading(false)
    setBarisAbsen(merged)
    return merged
  }, [selectedKelasIds, absenDari, absenSampai, kelasList])

  const handleLanjut = async () => {
    setError('')
    if (step === 1) {
      if (selectedKelasIds.length === 0) {
        setError('Pilih minimal satu kelas')
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      if (unionOverlap.length > 0) {
        setError(`Tanggal bentrok: ${unionOverlap.slice(0, 5).join(', ')}${unionOverlap.length > 5 ? '…' : ''}`)
        return
      }
      const rows = barisNilai.length > 0 ? barisNilai : await loadNilai()
      if (rows === null) return
      if (rows.length === 0) {
        setError('Belum ada data nilai')
        return
      }
      setStep(3)
      return
    }
    if (step === 3) {
      if (unionOverlap.length > 0) {
        setError(`Tanggal bentrok: ${unionOverlap.slice(0, 5).join(', ')}${unionOverlap.length > 5 ? '…' : ''}`)
        return
      }
      const rows = barisAbsen.length > 0 ? barisAbsen : await loadAbsen()
      if (rows === null) return
      if (rows.length === 0) {
        setError('Belum ada data absen')
        return
      }
      setStep(4)
      return
    }
    if (step === 4) {
      if (!judul.trim()) {
        setError('Judul wajib')
        return
      }
      if (!publishAt) {
        setError('Tanggal & jam publish wajib')
        return
      }
      setStep(5)
    }
  }

  const handlePublish = async () => {
    if (!judul.trim() || !nilaiDari?.masehi || !nilaiSampai?.masehi || !absenDari?.masehi || !absenSampai?.masehi) {
      setError('Data belum lengkap')
      return
    }
    if (unionOverlap.length > 0) {
      setError('Rentang tanggal bentrok')
      return
    }
    setSaving(true)
    setError('')
    const payload = {
      judul: judul.trim(),
      catatan: catatan.trim() || undefined,
      kelas_ids: selectedKelasIds,
      nilai_tanggal_awal: nilaiDari.masehi,
      nilai_tanggal_akhir: nilaiSampai.masehi,
      nilai_hijri_awal: nilaiDari.hijri || undefined,
      nilai_hijri_akhir: nilaiSampai.hijri || undefined,
      absen_tanggal_awal: absenDari.masehi,
      absen_tanggal_akhir: absenSampai.masehi,
      absen_hijri_awal: absenDari.hijri || undefined,
      absen_hijri_akhir: absenSampai.hijri || undefined,
      tampil_nilai: tampilNilai,
      publish_at: publishAt,
      published_by: user?.id,
      akses,
      mapel: reorderMapelByFanOrder(mapel, fanOrder),
      baris_nilai: barisNilai,
      baris_absen: barisAbsen,
    }
    if (isEdit) {
      const res = await updateRekapPublish(editId!, payload)
      setSaving(false)
      if (!res.success) {
        setError(res.message || 'Gagal menyimpan')
        return
      }
      navigate(`/rekap/hasil/${editId}`, { replace: true })
      return
    }
    const res = await createRekapPublish(payload)
    setSaving(false)
    if (!res.success) {
      setError(res.message || 'Gagal menyimpan')
      return
    }
    const newId = String(res.data?.id || '')
    navigate(newId ? `/rekap/hasil/${newId}` : '/rekap/hasil', { replace: true })
  }

  const updateNilaiCell = (santriId: string, kelasId: string, mapelId: string, nilai: number | null) => {
    setBarisNilai((prev) =>
      prev.map((b) => {
        if (String(b.santri_id) !== String(santriId) || String(b.kelas_id || '') !== String(kelasId)) {
          return b
        }
        const prevCell = b.cells?.[mapelId]
        return {
          ...b,
          cells: {
            ...b.cells,
            [mapelId]: {
              nilai,
              absen: prevCell?.absen || 'H',
              tanggal: prevCell?.tanggal || nilaiDari?.masehi || '',
            },
          },
        }
      })
    )
  }

  const updateAbsenCell = (santriId: string, kelasId: string, key: 'h' | 's' | 'i' | 'a', value: number) => {
    setBarisAbsen((prev) =>
      prev.map((b) =>
        String(b.santri_id) === String(santriId) && String(b.kelas_id) === String(kelasId)
          ? { ...b, [key]: Math.max(0, value) }
          : b
      )
    )
  }

  const showKelasColNilai = selectedKelasIds.length > 1 && !filterNilaiKelasId
  const showKelasColAbsen = selectedKelasIds.length > 1 && !filterAbsenKelasId

  if (!bootstrapped) {
    return <p className="text-sm ui-text-muted p-4">Memuat…</p>
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4 max-w-5xl"
    >
      <div>
        <Link to="/rekap/hasil" className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 mb-1">
          <MaterialIcon name="arrow_back" size={14} /> Hasil Rekap
        </Link>
        <h1 className="ui-title-lg">{isEdit ? 'Edit Publish Rekap' : 'Publish Rekap'}</h1>
        <p className="ui-subtitle mt-1 text-sm">Nilai + absen santri, satu judul & satu jadwal tayang.</p>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Langkah publish">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => s.id < step && setStep(s.id)}
            className={`px-2.5 py-1.5 text-xs rounded-md border transition ${
              step === s.id
                ? 'border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 font-medium'
                : step > s.id
                  ? 'ui-divider text-slate-700 dark:text-slate-200'
                  : 'ui-divider ui-text-muted opacity-60'
            }`}
          >
            {s.id}. {s.label}
          </button>
        ))}
      </nav>

      {step > 1 && selectedKelasIds.length > 0 && (
        <div className="text-xs ui-text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            Kelas terpilih ({selectedKelasIds.length}):{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">{kelasLabel}</span>
          </span>
          <button
            type="button"
            className="text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => setStep(1)}
          >
            Ubah kelas
          </button>
        </div>
      )}

      {error && <div className="ui-error-box px-3 py-2 text-sm">{error}</div>}
      {step >= 2 && unionOverlap.length > 0 && (
        <div className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          Tanggal bentrok (union nilai∪absen): {unionOverlap.slice(0, 10).join(', ')}
          {unionOverlap.length > 10 ? '…' : ''}
        </div>
      )}

      {/* Step 1 Kelas */}
      {step === 1 && (
        <div className="ui-card p-4 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-100 m-0">1. Pilih kelas</h2>
              <p className="text-xs ui-text-muted m-0 mt-1">
                Centang satu atau beberapa kelas. Pilihan ini dipakai untuk muat nilai dan absen.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={selectAllKelas} className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted">
                Pilih semua
              </button>
              <button type="button" onClick={clearKelas} className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted">
                Kosongkan
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[min(60vh,28rem)] overflow-y-auto">
            {kelasList.map((k) => {
              const checked = selectedKelasIds.map(String).includes(String(k.id))
              return (
                <label
                  key={k.id}
                  className={`flex items-center gap-2 text-sm px-2.5 py-2 rounded-lg cursor-pointer border transition ${
                    checked
                      ? 'border-blue-500/40 bg-blue-500/10'
                      : 'ui-divider hover:bg-slate-500/5'
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleKelas(String(k.id))} />
                  <span>{formatKelasLabel(k.nama_kelas, k.kel)}</span>
                </label>
              )
            })}
          </div>
          {kelasList.length === 0 && (
            <p className="text-sm ui-text-muted m-0">Belum ada data kelas.</p>
          )}
          <p className="text-xs ui-text-muted m-0">
            {selectedKelasIds.length} kelas dipilih
          </p>
        </div>
      )}

      {/* Step 2 Nilai */}
      {step === 2 && (
        <div className="ui-card p-4 space-y-3">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 m-0">2. Rekap Nilai</h2>
          <KelasFilterBar
            options={selectedKelasOptions}
            value={filterNilaiKelasId}
            onChange={setFilterNilaiKelasId}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PickDateHijriMasehi
              id="wiz-nilai-dari"
              label="Dari tanggal (nilai)"
              value={nilaiDari}
              onChange={(v) => {
                setNilaiDari(v)
                setBarisNilai([])
                if (v && nilaiSampai && compareMasehiYmd(nilaiSampai.masehi, v.masehi) < 0) setNilaiSampai(v)
              }}
              masehiMax={nilaiSampai?.masehi || masehiMax}
            />
            <PickDateHijriMasehi
              id="wiz-nilai-sampai"
              label="Sampai tanggal (nilai)"
              value={nilaiSampai}
              onChange={(v) => {
                setNilaiSampai(v)
                setBarisNilai([])
              }}
              hijriMin={nilaiDari?.hijri || undefined}
              masehiMax={masehiMax}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadNilai()}
              disabled={loading || selectedKelasIds.length === 0}
              className="px-3 py-1.5 text-xs ui-btn-secondary rounded-md disabled:opacity-50"
            >
              {loading ? 'Memuat…' : 'Muat nilai'}
            </button>
            <button
              type="button"
              onClick={() => setUrutanFanOpen(true)}
              disabled={fanColumnsAll.length === 0}
              className="px-3 py-1.5 text-xs ui-btn-secondary rounded-md disabled:opacity-50 inline-flex items-center gap-1"
            >
              <MaterialIcon name="reorder" size={14} /> Ubah urutan fan
            </button>
            <span className="text-xs ui-text-muted self-center">
              Tampil {barisNilaiTampil.length}
              {filterNilaiKelasId ? ` / ${barisNilai.length}` : ''} santri · {fanColumns.length} fan
              {mapel.length !== fanColumns.length ? ` (${mapel.length} mapel)` : ''}
            </span>
          </div>
          {barisNilai.length > 0 && fanColumns.length === 0 && (
            <p className="text-xs ui-text-muted m-0">
              Tidak ada mapel untuk filter kelas ini.
            </p>
          )}
          {barisNilai.length > 0 && fanColumns.length > 0 && (
            <div className="overflow-x-auto rounded-xl border ui-divider">
              <table className="w-full text-[11px] min-w-[400px]">
                <thead className="ui-table-head">
                  <tr>
                    <th className="px-2 py-1.5 text-left sticky left-0 bg-inherit z-[1]">Nama</th>
                    {showKelasColNilai && <th className="px-2 py-1.5 text-left">Kelas</th>}
                    {fanColumns.map((col) => (
                      <th
                        key={col.key}
                        className="px-1 py-1.5 text-center truncate max-w-[4.5rem]"
                        title={col.mapelIds.length > 1 ? `${col.label} (${col.mapelIds.length} mapel)` : col.label}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="ui-table-body">
                  {barisNilaiTampil.map((b) => (
                    <tr key={`${b.santri_id}-${b.kelas_id}`} className="ui-table-row">
                      <td className="px-2 py-1 font-medium truncate max-w-[8rem] sticky left-0 bg-inherit z-[1]">
                        {b.nama}
                      </td>
                      {showKelasColNilai && (
                        <td className="px-2 py-1 ui-text-muted truncate max-w-[6rem]">
                          {formatKelasLabel(b.nama_kelas, b.kel)}
                        </td>
                      )}
                      {fanColumns.map((col) => {
                        const { mapelId, cell } = cellForFan(b, col, mapelEnrich)
                        return (
                          <td key={col.key} className="px-0.5 py-0.5">
                            <input
                              type="number"
                              step="0.1"
                              value={cell?.nilai ?? ''}
                              onChange={(e) =>
                                updateNilaiCell(
                                  b.santri_id,
                                  b.kelas_id || '',
                                  mapelId,
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              className="ui-input !px-0.5 !py-0.5 text-center w-11"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step 3 Absen */}
      {step === 3 && (
        <div className="ui-card p-4 space-y-3">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 m-0">3. Rekap Absen</h2>
          <KelasFilterBar
            options={selectedKelasOptions}
            value={filterAbsenKelasId}
            onChange={setFilterAbsenKelasId}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PickDateHijriMasehi
              id="wiz-absen-dari"
              label="Dari tanggal (absen)"
              value={absenDari}
              onChange={(v) => {
                setAbsenDari(v)
                setBarisAbsen([])
                if (v && absenSampai && compareMasehiYmd(absenSampai.masehi, v.masehi) < 0) setAbsenSampai(v)
              }}
              masehiMax={absenSampai?.masehi || masehiMax}
            />
            <PickDateHijriMasehi
              id="wiz-absen-sampai"
              label="Sampai tanggal (absen)"
              value={absenSampai}
              onChange={(v) => {
                setAbsenSampai(v)
                setBarisAbsen([])
              }}
              hijriMin={absenDari?.hijri || undefined}
              masehiMax={masehiMax}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadAbsen()}
              disabled={loading || selectedKelasIds.length === 0}
              className="px-3 py-1.5 text-xs ui-btn-secondary rounded-md disabled:opacity-50"
            >
              {loading ? 'Memuat…' : 'Muat absen'}
            </button>
            <span className="text-xs ui-text-muted self-center">
              Tampil {barisAbsenTampil.length}
              {filterAbsenKelasId ? ` / ${barisAbsen.length}` : ''} santri
            </span>
          </div>
          {barisAbsen.length > 0 && (
            <div className="overflow-x-auto rounded-xl border ui-divider">
              <table className="w-full text-xs min-w-[360px]">
                <thead className="ui-table-head">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Nama</th>
                    {showKelasColAbsen && <th className="px-2 py-1.5 text-left">Kelas</th>}
                    <th className="px-1 py-1.5 text-center">H</th>
                    <th className="px-1 py-1.5 text-center">S</th>
                    <th className="px-1 py-1.5 text-center">I</th>
                    <th className="px-1 py-1.5 text-center">A</th>
                  </tr>
                </thead>
                <tbody className="ui-table-body">
                  {barisAbsenTampil.map((b) => (
                    <tr key={`${b.santri_id}-${b.kelas_id}`} className="ui-table-row">
                      <td className="px-2 py-1 font-medium truncate max-w-[9rem]">{b.nama}</td>
                      {showKelasColAbsen && (
                        <td className="px-2 py-1 ui-text-muted truncate max-w-[6rem]">
                          {formatKelasLabel(b.nama_kelas, b.kel)}
                        </td>
                      )}
                      {(['h', 's', 'i', 'a'] as const).map((k) => (
                        <td key={k} className="px-0.5 py-0.5">
                          <input
                            type="number"
                            min={0}
                            value={b[k]}
                            onChange={(e) =>
                              updateAbsenCell(b.santri_id, b.kelas_id, k, Number(e.target.value) || 0)
                            }
                            className="ui-input !px-0.5 !py-0.5 text-center w-11"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step 4 Meta */}
      {step === 4 && (
        <div className="ui-card p-4 space-y-3">
          <h2 className="font-semibold text-slate-800 dark:text-slate-100 m-0">4. Judul, catatan & jadwal</h2>
          <div>
            <label className="ui-label mb-1.5 block">Judul *</label>
            <input
              type="text"
              value={judul}
              onChange={(e) => setJudul(e.target.value)}
              className="ui-input w-full"
              placeholder="Contoh: Rekap Nilai & Absen Shofar 1447"
            />
          </div>
          <div>
            <label className="ui-label mb-1.5 block">Catatan</label>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              className="ui-input w-full resize-none"
              rows={2}
            />
          </div>
          <div>
            <label className="ui-label mb-1.5 block">Tanggal & jam publish *</label>
            <input
              type="datetime-local"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              className="ui-input w-full max-w-xs"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => setPublishAt(toDatetimeLocalValue(new Date()))}
                className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted"
              >
                Sekarang
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date()
                  d.setDate(d.getDate() + 1)
                  d.setHours(7, 0, 0, 0)
                  setPublishAt(toDatetimeLocalValue(d))
                }}
                className="px-2 py-1 text-[11px] rounded-md border ui-divider ui-text-muted"
              >
                Besok 07:00
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 5 Validasi */}
      {step === 5 && (
        <div className="space-y-3">
          <div className="ui-card p-4 space-y-2 text-sm">
            <h2 className="font-semibold text-slate-800 dark:text-slate-100 m-0">{judul || '—'}</h2>
            <p className="m-0 text-xs ui-text-muted">Kelas: {kelasLabel}</p>
            {catatan && <p className="m-0 text-xs">{catatan}</p>}
            <p className="m-0 text-xs">
              <span className="ui-text-muted">Periode nilai:</span>{' '}
              {nilaiDari && nilaiSampai
                ? `${formatMasehiDateDisplay(nilaiDari.masehi)} — ${formatMasehiDateDisplay(nilaiSampai.masehi)}`
                : '—'}
              {nilaiDari?.hijri && nilaiSampai?.hijri
                ? ` (${formatHijriDateDisplay(nilaiDari.hijri)} — ${formatHijriDateDisplay(nilaiSampai.hijri)})`
                : ''}
            </p>
            <p className="m-0 text-xs">
              <span className="ui-text-muted">Periode absen:</span>{' '}
              {absenDari && absenSampai
                ? `${formatMasehiDateDisplay(absenDari.masehi)} — ${formatMasehiDateDisplay(absenSampai.masehi)}`
                : '—'}
              {absenDari?.hijri && absenSampai?.hijri
                ? ` (${formatHijriDateDisplay(absenDari.hijri)} — ${formatHijriDateDisplay(absenSampai.hijri)})`
                : ''}
            </p>
            <p className="m-0 text-sm font-medium text-amber-800 dark:text-amber-200 pt-2 border-t ui-divider">
              Tayang pada:{' '}
              {(() => {
                try {
                  return new Date(publishAt).toLocaleString('id-ID')
                } catch {
                  return publishAt
                }
              })()}
            </p>
          </div>

          <div className="ui-card p-3">
            <h3 className="text-sm font-semibold m-0 mb-2">Nilai ({barisNilai.length} santri · {fanColumnsAll.length} fan)</h3>
            <div className="overflow-x-auto text-[11px]">
              <table className="w-full min-w-[320px]">
                <thead className="ui-table-head">
                  <tr>
                    <th className="px-2 py-1 text-left">Nama</th>
                    {selectedKelasIds.length > 1 && <th className="px-2 py-1 text-left">Kelas</th>}
                    {fanColumnsAll.map((col) => (
                      <th key={col.key} className="px-1 py-1 text-center truncate max-w-[4rem]">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="ui-table-body">
                  {barisNilai.map((b) => (
                    <tr key={`v-${b.santri_id}-${b.kelas_id}`} className="ui-table-row">
                      <td className="px-2 py-1">{b.nama}</td>
                      {selectedKelasIds.length > 1 && (
                        <td className="px-2 py-1 ui-text-muted">{formatKelasLabel(b.nama_kelas, b.kel)}</td>
                      )}
                      {fanColumnsAll.map((col) => {
                        const { cell } = cellForFan(b, col, mapelEnrich)
                        return (
                          <td key={col.key} className="px-1 py-1 text-center tabular-nums">
                            {cell?.nilai ?? '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ui-card p-3">
            <h3 className="text-sm font-semibold m-0 mb-2">Absen ({barisAbsen.length} santri)</h3>
            <div className="overflow-x-auto text-xs">
              <table className="w-full min-w-[280px]">
                <thead className="ui-table-head">
                  <tr>
                    <th className="px-2 py-1 text-left">Nama</th>
                    {selectedKelasIds.length > 1 && <th className="px-2 py-1 text-left">Kelas</th>}
                    <th className="px-2 py-1 text-center">H</th>
                    <th className="px-2 py-1 text-center">S</th>
                    <th className="px-2 py-1 text-center">I</th>
                    <th className="px-2 py-1 text-center">A</th>
                  </tr>
                </thead>
                <tbody className="ui-table-body">
                  {barisAbsen.slice(0, 20).map((b) => (
                    <tr key={`a-${b.santri_id}-${b.kelas_id}`} className="ui-table-row">
                      <td className="px-2 py-1">{b.nama}</td>
                      {selectedKelasIds.length > 1 && (
                        <td className="px-2 py-1 ui-text-muted">{formatKelasLabel(b.nama_kelas, b.kel)}</td>
                      )}
                      <td className="px-2 py-1 text-center">{b.h}</td>
                      <td className="px-2 py-1 text-center">{b.s}</td>
                      <td className="px-2 py-1 text-center">{b.i}</td>
                      <td className="px-2 py-1 text-center">{b.a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-between pt-2">
        <button
          type="button"
          onClick={() => (step > 1 ? setStep((s) => s - 1) : navigate(-1))}
          className="px-4 py-2.5 text-sm ui-btn-secondary"
        >
          {step > 1 ? 'Kembali' : 'Batal'}
        </button>
        {step < 5 ? (
          <button
            type="button"
            onClick={() => void handleLanjut()}
            disabled={loading || (step === 1 && selectedKelasIds.length === 0)}
            className="px-4 py-2.5 text-sm ui-btn-primary disabled:opacity-50"
          >
            Lanjut
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={saving || unionOverlap.length > 0}
            className="px-4 py-2.5 text-sm ui-btn-primary disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : isEdit ? 'Perbarui Publish' : 'Publish'}
          </button>
        )}
      </div>

      <OffcanvasUrutanFan
        open={urutanFanOpen}
        onClose={() => setUrutanFanOpen(false)}
        fans={fanColumnsAll}
        onApply={(keys) => {
          setFanOrder(keys)
          setMapel((prev) => reorderMapelByFanOrder(prev, keys))
        }}
      />
    </motion.div>
  )
}
