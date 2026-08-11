import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  lttqTingkatanAPI,
  lttqMualimAPI,
  santriAPI,
  tahunAjaranAPI
} from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useSantriDetailOffcanvas } from '../../contexts/SantriDetailOffcanvasContext'
import { useActiveHijriyahTahunAjaran } from '../../hooks/useActiveTahunAjaran'
import { useLttqScopeAccess } from '../../hooks/useLttqScopeAccess'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'
import SearchOffcanvas from '../../components/Biodata/SearchOffcanvas'
import CariPengurusOffcanvas from '../../components/CariPengurusOffcanvas'
import OffcanvasPindahLttq from './OffcanvasPindahLttq'
import OffcanvasTetapkanMualimLttq from './OffcanvasTetapkanMualimLttq'
import {
  parseKelompok,
  formatTingkatanLabel,
  buildKelasOptionsFromList,
  buildKelOptionsFromList
} from './lttqKelompokUtils'

const LEMBAGA_LTTQ_ID = 'LTTQ'

/** Lapisan cari santri/pengurus di atas offcanvas mualim (213) dan santri (201). */
const Z_LTTQ_PICKER_BACKDROP = 214
const Z_LTTQ_PICKER_PANEL = 215
import { useAuthStore } from '../../store/authStore'
import { LTTQ_ACTION_CODES } from '../../config/lttqFiturCodes'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'

const TINGKATAN_OPTIONS = [
  'Asfal',
  'Ibtidaiyah',
  'Tsanawiyah',
  'Aliyah',
  'Mualim',
  'Ngaji Kitab',
  'Tidak Mengaji'
]

const normalizeStatus = (s) => {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

export default function TingkatanLttq() {
  const { showNotification } = useNotification()
  const { openSantriDetail } = useSantriDetailOffcanvas()
  const tahunAjaranHijriyah = useActiveHijriyahTahunAjaran()
  const { options: tahunAjaranStoreOptions } = useTahunAjaranStore()
  const lttqScope = useLttqScopeAccess()
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const canMualim = Array.isArray(fiturMenuCodes) && fiturMenuCodes.includes(LTTQ_ACTION_CODES.tingkatanMualim)
  const canPindah = Array.isArray(fiturMenuCodes) && fiturMenuCodes.includes(LTTQ_ACTION_CODES.santriPindah)
  const canLulus = Array.isArray(fiturMenuCodes) && fiturMenuCodes.includes(LTTQ_ACTION_CODES.santriLulus)

  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTingkatan, setFilterTingkatan] = useState('')
  const [filterKelas, setFilterKelas] = useState('')
  const [filterKel, setFilterKel] = useState('')
  const [filterStatus, setFilterStatus] = useState('aktif')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)

  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ tingkatan: '', kelompok: '', keterangan: '', status: 'aktif' })
  const [saving, setSaving] = useState(false)

  const [santriOffcanvasOpen, setSantriOffcanvasOpen] = useState(false)
  const [santriOffcanvasTingkatan, setSantriOffcanvasTingkatan] = useState(null)
  const [santriOffcanvasList, setSantriOffcanvasList] = useState([])
  const [santriOffcanvasLoading, setSantriOffcanvasLoading] = useState(false)
  const [santriOffcanvasSearch, setSantriOffcanvasSearch] = useState('')
  const [santriSelectMode, setSantriSelectMode] = useState(false)
  const [selectedSantriIds, setSelectedSantriIds] = useState(() => new Set())
  const [santriBulkSheet, setSantriBulkSheet] = useState(null)
  const [santriRowSheet, setSantriRowSheet] = useState(null)
  const [santriRowSheetSantri, setSantriRowSheetSantri] = useState(null)
  const [lulusTahunAjaran, setLulusTahunAjaran] = useState('')
  const [lulusTahunAjaranList, setLulusTahunAjaranList] = useState([])
  const [lulusSubmitting, setLulusSubmitting] = useState(false)
  const [pindahModalOpen, setPindahModalOpen] = useState(false)
  const [pindahModalBulk, setPindahModalBulk] = useState(false)
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false)
  const [santriTambahSearchOpen, setSantriTambahSearchOpen] = useState(false)
  const [santriTambahSubmitting, setSantriTambahSubmitting] = useState(false)

  const [mualimOpen, setMualimOpen] = useState(false)
  const [mualimTipe, setMualimTipe] = useState('pengurus')
  const [mualimPengurusId, setMualimPengurusId] = useState('')
  const [mualimPengurusNama, setMualimPengurusNama] = useState('')
  const [searchMualimSantriOpen, setSearchMualimSantriOpen] = useState(false)
  const [searchMualimPengurusOpen, setSearchMualimPengurusOpen] = useState(false)

  const panelHistoryCountRef = useRef(0)
  const isProgrammaticBackRef = useRef(false)

  const handleCloseOffcanvas = useOffcanvasBackClose(offcanvasOpen, () => {
    setOffcanvasOpen(false)
    setEditing(null)
    setMualimOpen(false)
  })

  const handleCloseSantriOffcanvas = useOffcanvasBackClose(santriOffcanvasOpen, () => {
    setSantriOffcanvasOpen(false)
    setSantriOffcanvasTingkatan(null)
    setSantriOffcanvasList([])
    setSantriOffcanvasSearch('')
    setSantriSelectMode(false)
    setSantriBulkSheet(null)
    setSantriRowSheet(null)
    setSantriRowSheetSantri(null)
    setSelectedSantriIds(new Set())
    setPindahModalOpen(false)
    setSantriTambahSearchOpen(false)
    setMualimOpen(false)
    setSearchMualimSantriOpen(false)
    setSearchMualimPengurusOpen(false)
  })

  useOffcanvasBackClose(mualimOpen, () => {
    setMualimOpen(false)
    setSearchMualimSantriOpen(false)
    setSearchMualimPengurusOpen(false)
  })
  useOffcanvasBackClose(pindahModalOpen, () => setPindahModalOpen(false))

  const loadList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await lttqTingkatanAPI.getAll({
        lembaga_id: 'LTTQ',
        limit: 500,
        search: searchQuery.trim() || undefined,
        status: filterStatus || undefined
      })
      setList(res?.success && Array.isArray(res.data) ? res.data : [])
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery, filterStatus])

  useEffect(() => {
    loadList()
  }, [loadList])

  const { tingkatanOptions, filterKelasOptions, filterKelOptions, statusOptions, filteredAll, total, paginatedList, totalPages, from, to } =
    useMemo(() => {
      const q = searchQuery.trim().toLowerCase()
      let rows = list
      if (filterTingkatan) {
        rows = rows.filter((r) => String(r.tingkatan || '').trim() === filterTingkatan)
      }
      if (filterKelas) {
        rows = rows.filter((r) => parseKelompok(r.kelompok).kelas === filterKelas)
      }
      if (filterKel) {
        rows = rows.filter((r) => parseKelompok(r.kelompok).kel === filterKel)
      }
      if (filterStatus) {
        rows = rows.filter((r) => normalizeStatus(r.status) === normalizeStatus(filterStatus))
      }
      if (q) {
        rows = rows.filter((r) => {
          const label = `${r.tingkatan || ''} ${r.kelompok || ''} ${r.keterangan || ''}`.toLowerCase()
          return label.includes(q)
        })
      }

      const tingkatanMap = new Map()
      const statusMap = new Map()
      list.forEach((r) => {
        const tk = String(r.tingkatan || '').trim()
        if (tk) tingkatanMap.set(tk, (tingkatanMap.get(tk) || 0) + 1)
        const st = normalizeStatus(r.status)
        if (st) statusMap.set(st, (statusMap.get(st) || 0) + 1)
      })

      const tot = rows.length
      const tp = Math.max(1, Math.ceil(tot / limit))
      const p = Math.min(page, tp)
      const start = (p - 1) * limit
      const slice = rows.slice(start, start + limit)

      return {
        tingkatanOptions: [...tingkatanMap.entries()].map(([value, count]) => ({ value, label: value, count })),
        filterKelasOptions: buildKelasOptionsFromList(list, filterTingkatan),
        filterKelOptions: buildKelOptionsFromList(list, filterTingkatan, filterKelas),
        statusOptions: [...statusMap.entries()].map(([value, count]) => ({
          value,
          label: value === 'aktif' ? 'Aktif' : value === 'nonaktif' ? 'Nonaktif' : value,
          count
        })),
        filteredAll: rows,
        total: tot,
        paginatedList: slice,
        totalPages: tp,
        from: tot === 0 ? 0 : start + 1,
        to: Math.min(start + limit, tot)
      }
    }, [list, searchQuery, filterTingkatan, filterKelas, filterKel, filterStatus, page, limit])

  useEffect(() => {
    if (!filterTingkatan) {
      if (filterKelas) setFilterKelas('')
      if (filterKel) setFilterKel('')
      return
    }
    if (filterKelas && !filterKelasOptions.some((o) => o.value === filterKelas)) {
      setFilterKelas('')
    }
  }, [filterTingkatan, filterKelas, filterKel, filterKelasOptions])

  useEffect(() => {
    if (!filterKelas) {
      if (filterKel) setFilterKel('')
      return
    }
    if (filterKel && !filterKelOptions.some((o) => o.value === filterKel)) {
      setFilterKel('')
    }
  }, [filterKelas, filterKel, filterKelOptions])

  const filteredSantriOffcanvasList = useMemo(() => {
    const q = santriOffcanvasSearch.trim().toLowerCase()
    if (!q) return santriOffcanvasList
    return santriOffcanvasList.filter((s) => {
      const nama = (s.nama && String(s.nama).toLowerCase()) || ''
      const nis = s.nis != null ? String(s.nis).toLowerCase() : ''
      return nama.includes(q) || nis.includes(q)
    })
  }, [santriOffcanvasList, santriOffcanvasSearch])

  const refreshSantriOffcanvasList = useCallback(async () => {
    const tid = santriOffcanvasTingkatan?.id
    if (tid == null) return
    try {
      const res = await santriAPI.getByLttqTingkatanId(tid)
      if (res?.success && Array.isArray(res.data)) setSantriOffcanvasList(res.data)
    } catch {
      /* abaikan */
    }
  }, [santriOffcanvasTingkatan?.id])

  const updateTingkatanJumlahSantri = useCallback((tingkatanId, delta) => {
    if (tingkatanId == null) return
    setList((prev) =>
      prev.map((r) =>
        r.id === tingkatanId ? { ...r, jumlah_santri: Math.max(0, (r.jumlah_santri ?? 0) + delta) } : r
      )
    )
  }, [])

  const pushPanelHistory = useCallback(() => {
    panelHistoryCountRef.current += 1
    isProgrammaticBackRef.current = true
    window.history.pushState({ tingkatanLttqPanel: true }, '')
    requestAnimationFrame(() => {
      isProgrammaticBackRef.current = false
    })
  }, [])

  const handleOpenOffcanvas = (row = null) => {
    setEditing(row)
    if (row) {
      setForm({
        tingkatan: row.tingkatan || '',
        kelompok: String(row.kelompok ?? '').trim(),
        keterangan: row.keterangan || '',
        status: normalizeStatus(row.status) || 'aktif'
      })
    } else {
      setForm({ tingkatan: '', kelompok: '', keterangan: '', status: 'aktif' })
    }
    setOffcanvasOpen(true)
    pushPanelHistory()
  }

  const handleOpenSantriOffcanvas = async (e, tingkatan) => {
    e?.stopPropagation?.()
    e?.preventDefault?.()
    if (!tingkatan?.id) return
    setSantriOffcanvasTingkatan(tingkatan)
    setSantriOffcanvasOpen(true)
    setSantriOffcanvasList([])
    setSantriOffcanvasSearch('')
    setSantriSelectMode(false)
    setSantriBulkSheet(null)
    setSantriRowSheet(null)
    setSantriRowSheetSantri(null)
    setSelectedSantriIds(new Set())
    setSantriOffcanvasLoading(true)
    pushPanelHistory()
    try {
      const res = await santriAPI.getByLttqTingkatanId(tingkatan.id)
      if (res?.success && Array.isArray(res.data)) setSantriOffcanvasList(res.data)
    } catch {
      showNotification('Gagal memuat daftar santri', 'error')
    } finally {
      setSantriOffcanvasLoading(false)
    }
  }

  const saveForm = async (e) => {
    e?.preventDefault?.()
    if (!form.tingkatan.trim()) {
      showNotification('Tingkatan wajib diisi', 'error')
      return
    }
    if (!String(form.kelompok ?? '').trim()) {
      showNotification('Kelompok wajib diisi', 'error')
      return
    }
    const payload = {
      lembaga_id: 'LTTQ',
      tingkatan: form.tingkatan.trim(),
      kelompok: form.kelompok.trim(),
      keterangan: form.keterangan || null,
      status: form.status
    }
    setSaving(true)
    try {
      const res = editing
        ? await lttqTingkatanAPI.update(editing.id, payload)
        : await lttqTingkatanAPI.create(payload)
      if (res?.success) {
        showNotification(editing ? 'Tingkatan diperbarui' : 'Tingkatan ditambahkan', 'success')
        if (panelHistoryCountRef.current > 0) window.history.back()
        else handleCloseOffcanvas()
        loadList()
      } else {
        showNotification(res?.message || 'Gagal menyimpan', 'error')
      }
    } catch {
      showNotification('Gagal menyimpan tingkatan', 'error')
    } finally {
      setSaving(false)
    }
  }

  const mualimTingkatanLabel = useMemo(() => {
    const row = editing || santriOffcanvasTingkatan
    return row ? formatTingkatanLabel(row) : ''
  }, [editing, santriOffcanvasTingkatan])

  const handleOpenMualimOffcanvas = () => {
    if (!editing?.id && !santriOffcanvasTingkatan?.id) return
    setMualimTipe('pengurus')
    setMualimPengurusId('')
    setMualimPengurusNama('')
    setSearchMualimSantriOpen(false)
    setSearchMualimPengurusOpen(false)
    setMualimOpen(true)
  }

  const patchMualimAktifNama = useCallback((tingkatanId, nama) => {
    const label = String(nama ?? '').trim()
    if (!tingkatanId) return
    setEditing((prev) => (prev?.id === tingkatanId ? { ...prev, mualim_aktif_nama: label } : prev))
    setSantriOffcanvasTingkatan((prev) => (prev?.id === tingkatanId ? { ...prev, mualim_aktif_nama: label } : prev))
    setList((prev) => prev.map((r) => (r.id === tingkatanId ? { ...r, mualim_aktif_nama: label } : r)))
  }, [])

  const assignMualim = async (payload, mualimNamaDisplay = '') => {
    const tid = editing?.id || santriOffcanvasTingkatan?.id
    if (!tid) return
    try {
      const res = await lttqMualimAPI.create({
        id_lttq_tingkatan: tid,
        tahun_ajaran: tahunAjaranHijriyah || null,
        ...payload
      })
      if (res?.success) {
        showNotification('Mualim ditetapkan', 'success')
        setMualimOpen(false)
        const nama =
          String(mualimNamaDisplay ?? '').trim() ||
          String(mualimPengurusNama ?? '').trim()
        if (nama) patchMualimAktifNama(tid, nama)
        await loadList()
      } else {
        showNotification(res?.message || 'Gagal', 'error')
      }
    } catch {
      showNotification('Gagal menetapkan mualim', 'error')
    }
  }

  const handlePindahSelect = async (targetId, tahunAjaran) => {
    const ta = tahunAjaran || tahunAjaranHijriyah
    const isBulk = pindahModalBulk
    const ids = isBulk
      ? Array.from(selectedSantriIds)
      : santriRowSheetSantri?.id
        ? [santriRowSheetSantri.id]
        : []
    if (ids.length === 0 || !targetId) return
    setPindahModalOpen(false)
    if (isBulk) setBulkMoveLoading(true)
    let ok = 0
    for (const id of ids) {
      try {
        const res = await santriAPI.update(id, {
          id_lttq_tingkatan: targetId,
          tahun_ajaran_lttq: ta
        })
        if (res?.success) ok++
      } catch {
        /* lanjut */
      }
    }
    if (isBulk) setBulkMoveLoading(false)
    if (ok > 0) {
      showNotification(`${ok} santri dipindahkan`, 'success')
      setSelectedSantriIds(new Set())
      setSantriBulkSheet(null)
      setSantriRowSheet(null)
      setSantriRowSheetSantri(null)
      updateTingkatanJumlahSantri(santriOffcanvasTingkatan?.id, -ok)
      if (String(targetId) !== String(santriOffcanvasTingkatan?.id)) {
        updateTingkatanJumlahSantri(Number(targetId), ok)
      }
      void refreshSantriOffcanvasList()
      loadList()
    } else {
      showNotification('Gagal memindahkan santri', 'error')
    }
  }

  const loadLulusTahunAjaranOptions = useCallback(async () => {
    setLulusTahunAjaran(tahunAjaranHijriyah || '')
    try {
      const res = await tahunAjaranAPI.getAll()
      const raw = res?.success && Array.isArray(res?.data) ? res.data : []
      const opts = raw
        .map((row) => ({
          value: row.tahun_ajaran ?? row.id ?? '',
          label: row.tahun_ajaran ?? row.id ?? '–'
        }))
        .filter((o) => o.value)
      setLulusTahunAjaranList(opts.length > 0 ? opts : tahunAjaranStoreOptions || [])
    } catch {
      setLulusTahunAjaranList(tahunAjaranStoreOptions || [])
    }
  }, [tahunAjaranHijriyah, tahunAjaranStoreOptions])

  const handleSubmitLulus = async (e) => {
    e?.preventDefault?.()
    if (!lulusTahunAjaran.trim()) {
      showNotification('Pilih tahun ajaran', 'warning')
      return
    }
    const isRow = santriRowSheet === 'lulus' && santriRowSheetSantri?.id != null
    const ids = isRow ? [santriRowSheetSantri.id] : Array.from(selectedSantriIds)
    if (ids.length === 0) {
      showNotification(isRow ? 'Santri tidak valid' : 'Pilih minimal satu santri', 'warning')
      return
    }
    setLulusSubmitting(true)
    try {
      const res = await lttqTingkatanAPI.lulusBulk({
        id_lttq_tingkatan: santriOffcanvasTingkatan.id,
        tahun_ajaran: lulusTahunAjaran.trim(),
        id_santri_list: ids
      })
      if (res?.success) {
        showNotification(res?.message ?? 'Berhasil meluluskan santri', 'success')
        setSantriBulkSheet(null)
        setSantriRowSheet(null)
        setSantriRowSheetSantri(null)
        setSelectedSantriIds(new Set())
        updateTingkatanJumlahSantri(santriOffcanvasTingkatan?.id, -ids.length)
        void refreshSantriOffcanvasList()
        loadList()
      } else {
        showNotification(res?.message ?? 'Gagal meluluskan', 'error')
      }
    } catch {
      showNotification('Gagal meluluskan santri', 'error')
    } finally {
      setLulusSubmitting(false)
    }
  }

  const handleTambahSantri = async (s) => {
    if (!s?.id || !santriOffcanvasTingkatan?.id) return
    setSantriTambahSubmitting(true)
    try {
      const res = await santriAPI.update(s.id, {
        id_lttq_tingkatan: santriOffcanvasTingkatan.id,
        tahun_ajaran_lttq: tahunAjaranHijriyah
      })
      if (res?.success) {
        showNotification('Santri ditambahkan ke tingkatan', 'success')
        updateTingkatanJumlahSantri(santriOffcanvasTingkatan.id, 1)
        void refreshSantriOffcanvasList()
        loadList()
      } else {
        showNotification(res?.message || 'Gagal menambahkan santri', 'error')
      }
    } catch {
      showNotification('Gagal menambahkan santri', 'error')
    } finally {
      setSantriTambahSubmitting(false)
      setSantriTambahSearchOpen(false)
    }
  }

  const toggleSantriSelection = (id) => {
    setSelectedSantriIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllSantri = () => {
    const ids = filteredSantriOffcanvasList.map((s) => s.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedSantriIds.has(id))
    if (allSelected) {
      setSelectedSantriIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedSantriIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const openRowOpsMenu = (s, e) => {
    e?.stopPropagation?.()
    setSantriBulkSheet(null)
    setSantriRowSheetSantri(s)
    setSantriRowSheet('menu')
  }

  return (
    <motion.div className="h-full overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <motion.div className="container mx-auto px-4 py-6 max-w-7xl">
          {lttqScope.applyBertugasFilter && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/80 dark:border-teal-800 dark:bg-teal-900/20 px-3 py-2 mb-4 text-sm text-teal-900 dark:text-teal-100">
              Anda memiliki akses <strong>tingkatan bertugas</strong>: hanya tingkatan tempat Anda mualim aktif. Master
              tingkatan (tambah/ubah) tidak tersedia.
            </div>
          )}

          <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="relative pb-2 px-4 pt-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-12 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500"
                placeholder="Cari tingkatan / kelompok"
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center pr-1">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs"
                  title={isFilterOpen ? 'Sembunyikan filter' : 'Tampilkan filter'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                    />
                  </svg>
                </button>
              </div>
              <motion.div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
              <motion.div
                className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}
              />
            </div>

            <AnimatePresence>
              {isFilterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
                >
                  <div className="px-4 py-2 flex flex-wrap gap-2">
                    <select
                      value={filterTingkatan}
                      onChange={(e) => {
                        setFilterTingkatan(e.target.value)
                        setFilterKelas('')
                        setFilterKel('')
                        setPage(1)
                      }}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[180px]"
                    >
                      <option value="">Semua tingkatan</option>
                      {tingkatanOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} ({o.count})
                        </option>
                      ))}
                    </select>
                    <AnimatePresence mode="wait">
                      {filterTingkatan && (
                        <motion.div
                          key="filter-kelas-kel"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -12 }}
                          transition={{ duration: 0.2 }}
                          className="inline-flex items-center gap-2 shrink-0"
                        >
                          <select
                            value={filterKelas}
                            onChange={(e) => {
                              setFilterKelas(e.target.value)
                              setFilterKel('')
                              setPage(1)
                            }}
                            className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[120px]"
                          >
                            <option value="">Kelas</option>
                            {filterKelasOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label} ({o.count})
                              </option>
                            ))}
                          </select>
                          {filterKelas && (
                            <select
                              value={filterKel}
                              onChange={(e) => {
                                setFilterKel(e.target.value)
                                setPage(1)
                              }}
                              className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[100px]"
                            >
                              <option value="">Kel</option>
                              {filterKelOptions.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label} ({o.count})
                                </option>
                              ))}
                            </select>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <select
                      value={filterStatus}
                      onChange={(e) => {
                        setFilterStatus(e.target.value)
                        setPage(1)
                      }}
                      className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Semua status</option>
                      {statusOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label} ({o.count})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setFilterTingkatan('')
                        setFilterKelas('')
                        setFilterKel('')
                        setFilterStatus('aktif')
                        setSearchQuery('')
                        setPage(1)
                        loadList()
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
                    >
                      Reset filter
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="px-3 py-1.5 sm:px-4 sm:py-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-1.5">
                <span className="font-medium text-gray-800 dark:text-gray-200">{from}</span>
                <span>–</span>
                <span className="font-medium">{to}</span>
                <span>dari</span>
                <span className="font-medium">{total}</span>
                {total > 0 && (
                  <select
                    value={limit}
                    onChange={(e) => {
                      setLimit(Number(e.target.value))
                      setPage(1)
                    }}
                    className="ml-2 border rounded px-1 text-xs dark:bg-gray-700"
                  >
                    {[50, 100, 200].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </span>
              {!lttqScope.tingkatanFormReadOnly && (
                <button
                  type="button"
                  onClick={() => handleOpenOffcanvas()}
                  className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Tambah Tingkatan
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Memuat tingkatan...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginatedList.map((row, index) => (
                <motion.div
                  key={row.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.02 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenOffcanvas(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleOpenOffcanvas(row)
                    }
                  }}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border cursor-pointer hover:shadow-md transition-all ${
                    row.status === 'nonaktif' ? 'opacity-75' : ''
                  } border-gray-200 dark:border-gray-700`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {formatTingkatanLabel(row)}
                      </h3>
                      {row.mualim_aktif_nama && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                          Mualim: {row.mualim_aktif_nama}
                        </p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {row.keterangan && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1.5">{row.keterangan}</p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleOpenSantriOffcanvas(e, row)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700 hover:bg-teal-100"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                        />
                      </svg>
                      {Number(row.jumlah_santri ?? 0)} santri
                    </button>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                        row.status === 'aktif'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {row.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {!loading && filteredAll.length === 0 && (
            <p className="text-center py-12 text-gray-500">Belum ada tingkatan yang sesuai filter.</p>
          )}

          {totalPages > 1 && (
            <motion.div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <span className="text-sm text-gray-600 self-center">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50"
              >
                Selanjutnya
              </button>
            </motion.div>
          )}
          <div className="h-20" aria-hidden="true" />
        </motion.div>
      </div>

      {/* Offcanvas form tingkatan — kanan */}
      {createPortal(
        <AnimatePresence>
          {offcanvasOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  if (panelHistoryCountRef.current > 0) window.history.back()
                }}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <motion.div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {lttqScope.tingkatanFormReadOnly && editing
                      ? 'Tingkatan (lihat)'
                      : editing
                        ? 'Ubah Tingkatan'
                        : 'Tambah Tingkatan'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (panelHistoryCountRef.current > 0) window.history.back()
                    }}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
                <form onSubmit={saveForm} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tingkatan *
                      </label>
                      <select
                        value={form.tingkatan}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, tingkatan: e.target.value, kelompok: '' }))
                        }
                        disabled={lttqScope.tingkatanFormReadOnly}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
                        required
                      >
                        <option value="">Pilih</option>
                        {TINGKATAN_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <AnimatePresence mode="wait">
                      {form.tingkatan && (
                        <motion.div
                          key="form-kelompok"
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                        >
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Kelompok *
                          </label>
                          <input
                            type="text"
                            value={form.kelompok}
                            onChange={(e) => setForm((f) => ({ ...f, kelompok: e.target.value }))}
                            disabled={lttqScope.tingkatanFormReadOnly}
                            placeholder="Contoh: 7-A"
                            className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
                            required
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Catatan</label>
                      <textarea
                        value={form.keterangan || ''}
                        onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                        disabled={lttqScope.tingkatanFormReadOnly}
                        rows={3}
                        className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {form.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={form.status === 'aktif'}
                          disabled={lttqScope.tingkatanFormReadOnly}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              status: f.status === 'aktif' ? 'nonaktif' : 'aktif'
                            }))
                          }
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed ${
                            form.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                              form.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                    {editing && (
                      <div className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-600 dark:bg-gray-900/40">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Mualim aktif
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {String(editing.mualim_aktif_nama ?? '').trim() || 'Belum ditetapkan'}
                        </p>
                        {canMualim && !lttqScope.tingkatanFormReadOnly && (
                          <button
                            type="button"
                            onClick={handleOpenMualimOffcanvas}
                            className="mt-3 w-full py-2 text-sm border border-teal-600 text-teal-700 rounded-lg hover:bg-teal-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-900/30"
                          >
                            {editing.mualim_aktif_nama ? 'Ubah Mualim' : 'Tetapkan Mualim'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (panelHistoryCountRef.current > 0) window.history.back()
                      }}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                    >
                      Batal
                    </button>
                    {!lttqScope.tingkatanFormReadOnly && (
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
                      >
                        {saving ? 'Menyimpan...' : 'Simpan'}
                      </button>
                    )}
                  </div>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Offcanvas daftar santri */}
      {createPortal(
        <AnimatePresence>
          {santriOffcanvasOpen && santriOffcanvasTingkatan && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  if (santriRowSheet) {
                    setSantriRowSheet(null)
                    setSantriRowSheetSantri(null)
                  } else if (santriBulkSheet) setSantriBulkSheet(null)
                  else handleCloseSantriOffcanvas()
                }}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 z-[201] flex h-full w-full max-w-md flex-col overflow-hidden bg-white shadow-xl dark:bg-gray-800"
              >
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex-shrink-0 border-b border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="min-w-0 flex-1 text-sm font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-50 sm:text-base">
                      Santri · {formatTingkatanLabel(santriOffcanvasTingkatan)}
                    </h3>
                    <div className="flex shrink-0 items-center gap-2">
                      {canMualim && !lttqScope.tingkatanFormReadOnly && (
                        <button
                          type="button"
                          onClick={handleOpenMualimOffcanvas}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:border-teal-500 dark:text-teal-300 dark:hover:bg-teal-900/30"
                        >
                          Mualim
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setSantriTambahSearchOpen(true)}
                        disabled={santriTambahSubmitting}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:hover:bg-teal-600"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        Tambah
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (santriRowSheet) {
                            setSantriRowSheet(null)
                            setSantriRowSheetSantri(null)
                          } else if (santriBulkSheet) setSantriBulkSheet(null)
                          else handleCloseSantriOffcanvas()
                        }}
                        className="shrink-0 rounded-lg p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                        aria-label="Tutup"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {!santriOffcanvasLoading && santriOffcanvasList.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 text-sm dark:border-gray-700">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-gray-600 dark:text-gray-400">Total santri</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {filteredSantriOffcanvasList.length}
                      </span>
                      {santriOffcanvasSearch.trim() && filteredSantriOffcanvasList.length !== santriOffcanvasList.length && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          (dari {santriOffcanvasList.length})
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSantriSelectMode((v) => {
                            if (v) {
                              setSelectedSantriIds(new Set())
                              setSantriBulkSheet(null)
                              setSantriRowSheet(null)
                              setSantriRowSheetSantri(null)
                            }
                            return !v
                          })
                        }}
                        aria-pressed={santriSelectMode}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                          santriSelectMode
                            ? 'border-teal-500 bg-teal-50 text-teal-800 ring-1 ring-teal-400/60 dark:border-teal-500 dark:bg-teal-900/40 dark:text-teal-100 dark:ring-teal-500/40'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        Pilih
                      </button>
                      {santriSelectMode && selectedSantriIds.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setSantriBulkSheet('menu')}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
                        >
                          Aksi ({selectedSantriIds.size})
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </span>
                    <input
                      type="search"
                      value={santriOffcanvasSearch}
                      onChange={(e) => setSantriOffcanvasSearch(e.target.value)}
                      placeholder="Cari nama / NIS"
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto relative">
                  {santriOffcanvasLoading ? (
                    <p className="p-4 text-sm text-gray-500 text-center">Memuat santri...</p>
                  ) : filteredSantriOffcanvasList.length === 0 ? (
                    <p className="p-4 text-sm text-gray-500 text-center">Belum ada santri di tingkatan ini.</p>
                  ) : (
                    <ul className="divide-y dark:divide-gray-700">
                      {santriSelectMode && (
                        <li className="px-4 py-2 flex items-center gap-2 bg-gray-50 dark:bg-gray-900/40">
                          <input
                            type="checkbox"
                            checked={
                              filteredSantriOffcanvasList.length > 0 &&
                              filteredSantriOffcanvasList.every((s) => selectedSantriIds.has(s.id))
                            }
                            onChange={toggleSelectAllSantri}
                          />
                          <span className="text-xs text-gray-500">Pilih semua</span>
                        </li>
                      )}
                      {filteredSantriOffcanvasList.map((s) => (
                        <li
                          key={s.id}
                          className={`px-4 py-3 flex items-center gap-2 ${
                            selectedSantriIds.has(s.id) ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                          }`}
                        >
                          {santriSelectMode && (
                            <input
                              type="checkbox"
                              checked={selectedSantriIds.has(s.id)}
                              onChange={() => toggleSantriSelection(s.id)}
                            />
                          )}
                          <button
                            type="button"
                            className="flex-1 text-left text-sm min-w-0"
                            onClick={() => {
                              if (santriSelectMode) toggleSantriSelection(s.id)
                              else if (s?.id) openSantriDetail(s, { onEditSaved: refreshSantriOffcanvasList })
                            }}
                          >
                            <span className="font-medium dark:text-gray-100">{s.nama || '–'}</span>
                            <span className="text-gray-400 ml-1">({s.nis || s.id})</span>
                          </button>
                          {!santriSelectMode && (canPindah || canLulus) && (
                            <button
                              type="button"
                              onClick={(e) => openRowOpsMenu(s, e)}
                              className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                              aria-label="Opsi"
                            >
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 4a2 2 0 110-4 2 2 0 010 4zm0 4a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Sheet opsi per baris */}
                  <AnimatePresence>
                    {santriRowSheet === 'menu' && santriRowSheetSantri && (
                      <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700 rounded-t-xl p-4 shadow-lg z-10"
                      >
                        <p className="text-sm font-medium mb-3 dark:text-gray-100">{santriRowSheetSantri.nama}</p>
                        <motion.div className="flex flex-col gap-2">
                          {canPindah && (
                            <button
                              type="button"
                              onClick={() => {
                                setPindahModalBulk(false)
                                setPindahModalOpen(true)
                              }}
                              className="w-full py-2.5 text-sm border rounded-lg dark:border-gray-600"
                            >
                              Pindah tingkatan
                            </button>
                          )}
                          {canLulus && (
                            <button
                              type="button"
                              onClick={async () => {
                                setSantriRowSheet('lulus')
                                await loadLulusTahunAjaranOptions()
                              }}
                              className="w-full py-2.5 text-sm border border-amber-300 text-amber-800 rounded-lg dark:border-amber-700 dark:text-amber-200"
                            >
                              Luluskan
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSantriRowSheet(null)
                              setSantriRowSheetSantri(null)
                            }}
                            className="w-full py-2 text-sm text-gray-500"
                          >
                            Batal
                          </button>
                        </motion.div>
                      </motion.div>
                    )}
                    {santriRowSheet === 'lulus' && (
                      <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-800 border-t p-4 rounded-t-xl shadow-lg z-10"
                      >
                        <form onSubmit={handleSubmitLulus} className="space-y-3">
                          <p className="text-sm font-medium dark:text-gray-100">Luluskan · {santriRowSheetSantri?.nama}</p>
                          <select
                            value={lulusTahunAjaran}
                            onChange={(e) => setLulusTahunAjaran(e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-700"
                            required
                          >
                            <option value="">Pilih tahun ajaran</option>
                            {lulusTahunAjaranList.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSantriRowSheet('menu')}
                              className="flex-1 py-2 border rounded-lg text-sm"
                            >
                              Kembali
                            </button>
                            <button
                              type="submit"
                              disabled={lulusSubmitting}
                              className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50"
                            >
                              {lulusSubmitting ? '...' : 'Luluskan'}
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    )}
                    {santriBulkSheet === 'menu' && (
                      <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-800 border-t p-4 rounded-t-xl shadow-lg z-10"
                      >
                        <p className="text-sm font-medium mb-3">{selectedSantriIds.size} santri terpilih</p>
                        <div className="flex flex-col gap-2">
                          {canPindah && (
                            <button
                              type="button"
                              disabled={bulkMoveLoading}
                              onClick={() => {
                                setPindahModalBulk(true)
                                setPindahModalOpen(true)
                              }}
                              className="w-full py-2.5 text-sm border rounded-lg"
                            >
                              Pindah tingkatan
                            </button>
                          )}
                          {canLulus && (
                            <button
                              type="button"
                              onClick={async () => {
                                setSantriBulkSheet('lulus')
                                await loadLulusTahunAjaranOptions()
                              }}
                              className="w-full py-2.5 text-sm border border-amber-300 text-amber-800 rounded-lg"
                            >
                              Luluskan
                            </button>
                          )}
                          <button type="button" onClick={() => setSantriBulkSheet(null)} className="text-sm text-gray-500 py-2">
                            Batal
                          </button>
                        </div>
                      </motion.div>
                    )}
                    {santriBulkSheet === 'lulus' && (
                      <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        className="absolute inset-x-0 bottom-0 bg-white dark:bg-gray-800 border-t p-4 rounded-t-xl shadow-lg z-10"
                      >
                        <form onSubmit={handleSubmitLulus} className="space-y-3">
                          <p className="text-sm font-medium">Luluskan {selectedSantriIds.size} santri</p>
                          <select
                            value={lulusTahunAjaran}
                            onChange={(e) => setLulusTahunAjaran(e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded-lg dark:bg-gray-700"
                            required
                          >
                            <option value="">Pilih tahun ajaran</option>
                            {lulusTahunAjaranList.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <motion.div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setSantriBulkSheet('menu')}
                              className="flex-1 py-2 border rounded-lg text-sm"
                            >
                              Kembali
                            </button>
                            <button
                              type="submit"
                              disabled={lulusSubmitting}
                              className="flex-1 py-2 bg-amber-600 text-white rounded-lg text-sm disabled:opacity-50"
                            >
                              {lulusSubmitting ? '...' : 'Luluskan'}
                            </button>
                          </motion.div>
                        </form>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      <OffcanvasTetapkanMualimLttq
        isOpen={mualimOpen}
        onClose={() => {
          setMualimOpen(false)
          setSearchMualimSantriOpen(false)
          setSearchMualimPengurusOpen(false)
        }}
        tingkatanLabel={mualimTingkatanLabel}
        mualimTipe={mualimTipe}
        setMualimTipe={setMualimTipe}
        mualimPengurusId={mualimPengurusId}
        mualimPengurusNama={mualimPengurusNama}
        onOpenSearchPengurus={() => setSearchMualimPengurusOpen(true)}
        onOpenSearchSantri={() => setSearchMualimSantriOpen(true)}
        onSavePengurus={async () => {
          if (mualimTipe === 'pengurus' && mualimPengurusId) {
            await assignMualim(
              { id_pengurus: Number(mualimPengurusId), id_santri: null },
              mualimPengurusNama
            )
          }
        }}
      />

      {createPortal(
        <SearchOffcanvas
          isOpen={santriTambahSearchOpen}
          onClose={() => setSantriTambahSearchOpen(false)}
          onSelectSantriRecord={handleTambahSantri}
          zIndex={Z_LTTQ_PICKER_PANEL}
        />,
        document.body
      )}
      {createPortal(
        <SearchOffcanvas
          isOpen={searchMualimSantriOpen}
          onClose={() => setSearchMualimSantriOpen(false)}
          onSelectSantriRecord={async (s) => {
            setSearchMualimSantriOpen(false)
            if (s?.id) await assignMualim({ id_santri: s.id, id_pengurus: null }, s.nama || '')
          }}
          zIndex={Z_LTTQ_PICKER_PANEL}
        />,
        document.body
      )}
      <CariPengurusOffcanvas
        isOpen={searchMualimPengurusOpen}
        onClose={() => setSearchMualimPengurusOpen(false)}
        title="Cari Pengurus"
        onSelect={(p) => {
          setSearchMualimPengurusOpen(false)
          if (p?.id) {
            setMualimPengurusId(String(p.id))
            setMualimPengurusNama(p.nama || p.nama_pengurus || '')
          }
        }}
        zIndexBackdrop={Z_LTTQ_PICKER_BACKDROP}
        zIndexPanel={Z_LTTQ_PICKER_PANEL}
      />

      <OffcanvasPindahLttq
        isOpen={pindahModalOpen}
        onClose={() => setPindahModalOpen(false)}
        excludeTingkatanId={santriOffcanvasTingkatan?.id}
        onSelect={handlePindahSelect}
      />
    </motion.div>
  )
}
