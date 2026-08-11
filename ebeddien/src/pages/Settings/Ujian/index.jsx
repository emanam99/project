import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ujianAPI, mapelAPI, rombelAPI, lembagaAPI, kalenderAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useLembagaFilterAccess } from '../../../hooks/useLembagaFilterAccess'
import { LEMBAGA_FILTER_ACTION_CODES } from '../../../config/lembagaFilterFiturCodes'
import Modal from '../../../components/Modal/Modal'
import PickDateHijri from '../../../components/PickDateHijri/PickDateHijri'

/** Scrollbar horizontal tab — sama pola dengan ChatAiLayout */
const tabStripScrollClass =
  'overflow-y-hidden overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [scrollbar-color:rgba(13,148,136,0.22)_transparent] dark:[scrollbar-color:rgba(45,212,191,0.28)_transparent] [&::-webkit-scrollbar]:h-[2px] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-corner]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-teal-600/30 focus-within:[&::-webkit-scrollbar-thumb]:bg-teal-600/30 dark:hover:[&::-webkit-scrollbar-thumb]:bg-teal-400/35 dark:focus-within:[&::-webkit-scrollbar-thumb]:bg-teal-400/35'

const KEHADIRAN_OPTS = [
  { v: 'hadir', l: 'Hadir' },
  { v: 'terlambat', l: 'Terlambat' },
  { v: 'izin', l: 'Izin' },
  { v: 'sakit', l: 'Sakit' },
  { v: 'alpha', l: 'Alpha' }
]

function sortRombelIdStrings(ids) {
  return [...ids].sort((a, b) => Number(a) - Number(b))
}

function emptyJadwalItem() {
  return {
    localKey: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    idLembagaKitab: '',
    tanggalMasehi: new Date().toISOString().slice(0, 10),
    tanggalHijriyah: null,
    jamMulai: '',
    jamSelesai: '',
    rows: []
  }
}

function Ujian() {
  const { showNotification } = useNotification()
  const lembagaAccess = useLembagaFilterAccess(LEMBAGA_FILTER_ACTION_CODES.mapelSemua)

  const [lembagaList, setLembagaList] = useState([])
  const [rombelList, setRombelList] = useState([])
  const [mapelOptions, setMapelOptions] = useState([])

  const [lembagaFilter, setLembagaFilter] = useState('')
  /** Rombel terpilih (multi), array string id */
  const [selectedRombelIds, setSelectedRombelIds] = useState([])

  const [judul, setJudul] = useState('Ujian')
  const [jenis, setJenis] = useState('')
  /** Satu kelompok = banyak sub-jadwal (mapel + tanggal + jam + peserta) */
  const [items, setItems] = useState(() => [emptyJadwalItem()])
  const [editingGrupId, setEditingGrupId] = useState(null)

  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [listLoading, setListLoading] = useState(true)
  const [formBusy, setFormBusy] = useState(false)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [deletingGrupId, setDeletingGrupId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  /** Tab atas: entri lengkap vs nilai (ringkas) */
  const [activeTab, setActiveTab] = useState('entri')

  /** Tab Nilai — filter + daftar ujian + editor ringkas */
  const [hnLembaga, setHnLembaga] = useState('')
  const [hnRombel, setHnRombel] = useState('')
  const [hnMapel, setHnMapel] = useState('')
  const [hnMapelOptions, setHnMapelOptions] = useState([])
  const [hnCari, setHnCari] = useState('')
  const [hnCariDebounced, setHnCariDebounced] = useState('')
  const [hnList, setHnList] = useState([])
  const [hnTotal, setHnTotal] = useState(0)
  const [hnPage, setHnPage] = useState(1)
  const [hnListLoading, setHnListLoading] = useState(false)
  const [hnOpenId, setHnOpenId] = useState(null)
  /** @type {null | { id_lembaga_kitab: number, judul: string, jenis: string | null, tanggal_masehi: string, jam_mulai: string | null, jam_selesai: string | null, kitab_nama?: string | null }} */
  const [hnMeta, setHnMeta] = useState(null)
  const [hnRows, setHnRows] = useState([])
  const [hnOpeningId, setHnOpeningId] = useState(null)
  const [hnSaving, setHnSaving] = useState(false)
  const [hnFilterOpen, setHnFilterOpen] = useState(false)
  const [hnInputFocused, setHnInputFocused] = useState(false)

  const allowedLembagaSet = useMemo(
    () => (lembagaAccess.allowedLembagaIds?.length ? new Set(lembagaAccess.allowedLembagaIds.map(String)) : null),
    [lembagaAccess.allowedLembagaIds]
  )

  /** Rombel hanya aktif setelah lembaga dipilih (bukan placeholder «Semua lembaga»). */
  const lembagaDitetapkan = lembagaFilter !== ''

  const rombelFiltered = useMemo(() => {
    return rombelList.filter((r) => {
      if (lembagaFilter !== '' && String(r.lembaga_id) !== String(lembagaFilter)) return false
      return true
    })
  }, [rombelList, lembagaFilter])

  const hnRombelFiltered = useMemo(() => {
    return rombelList.filter((r) => {
      if (hnLembaga !== '' && String(r.lembaga_id) !== String(hnLembaga)) return false
      return true
    })
  }, [rombelList, hnLembaga])

  const hnLembagaDitetapkan = hnLembaga !== ''

  const hnRowsTampil = useMemo(() => {
    if (!hnOpenId) return []
    const t = hnCari.trim().toLowerCase()
    if (!t) return hnRows
    return hnRows.filter(
      (r) =>
        String(r.nama || '')
          .toLowerCase()
          .includes(t) ||
        String(r.nis || '')
          .toLowerCase()
          .includes(t)
    )
  }, [hnOpenId, hnRows, hnCari])

  const waktuUntukKalenderItem = (jam) => {
    if (jam && /^\d{2}:\d{2}/.test(jam)) return `${jam}:00`.slice(0, 8)
    return '12:00:00'
  }

  const syncHijriForItem = useCallback(async (idx, masehiYmd, jamItem) => {
    if (!masehiYmd || !/^\d{4}-\d{2}-\d{2}$/.test(masehiYmd)) {
      setItems((prev) => {
        const n = [...prev]
        if (n[idx]) n[idx] = { ...n[idx], tanggalHijriyah: null }
        return n
      })
      return
    }
    try {
      const res = await kalenderAPI.get({
        action: 'convert',
        tanggal: masehiYmd,
        waktu: waktuUntukKalenderItem(jamItem)
      })
      const h = res?.hijriyah
      const val = h && h !== '0000-00-00' ? String(h) : null
      setItems((prev) => {
        const n = [...prev]
        if (!n[idx]) return prev
        n[idx] = { ...n[idx], tanggalHijriyah: val }
        return n
      })
    } catch {
      setItems((prev) => {
        const n = [...prev]
        if (n[idx]) n[idx] = { ...n[idx], tanggalHijriyah: null }
        return n
      })
    }
  }, [])

  useEffect(() => {
    const allowed = lembagaAccess.allowedLembagaIds
    if (!allowed || allowed.length !== 1) return
    if (lembagaFilter !== allowed[0]) setLembagaFilter(allowed[0])
  }, [lembagaAccess.allowedLembagaIds, lembagaFilter])

  useEffect(() => {
    const allowed = lembagaAccess.allowedLembagaIds
    if (!allowed || allowed.length !== 1) return
    if (hnLembaga !== allowed[0]) setHnLembaga(allowed[0])
  }, [lembagaAccess.allowedLembagaIds, hnLembaga])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const [lr, le] = await Promise.all([
          rombelAPI.getAll({ limit: 500, page: 1, status: 'aktif' }),
          lembagaAPI.getAll()
        ])
        if (cancelled) return
        if (lr?.success) setRombelList(Array.isArray(lr.data) ? lr.data : [])
        if (le?.success) {
          const rowsLe = Array.isArray(le.data) ? le.data : []
          setLembagaList(!allowedLembagaSet ? rowsLe : rowsLe.filter((l) => allowedLembagaSet.has(String(l.id))))
        }
      } catch (e) {
        console.error(e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [allowedLembagaSet])

  const loadMapelForRombel = useCallback(async () => {
    if (selectedRombelIds.length === 0) {
      setMapelOptions([])
      setItems((prev) => prev.map((it) => ({ ...it, idLembagaKitab: '', rows: [] })))
      return
    }
    try {
      const res = await mapelAPI.getList({
        id_rombel_ids: sortRombelIdStrings(selectedRombelIds).join(','),
        lembaga_id: lembagaFilter || undefined,
        lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
        status: 'aktif',
        page: 1,
        limit: 300
      })
      if (res?.success) {
        const arr = Array.isArray(res.data) ? res.data : []
        setMapelOptions(arr)
        setItems((prev) =>
          prev.map((it) => {
            const ok = it.idLembagaKitab && arr.some((m) => String(m.id) === String(it.idLembagaKitab))
            if (!ok) return { ...it, idLembagaKitab: '', rows: [] }
            return it
          })
        )
      } else {
        setMapelOptions([])
      }
    } catch (e) {
      console.error(e)
      setMapelOptions([])
    }
  }, [selectedRombelIds, lembagaFilter, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    loadMapelForRombel()
  }, [loadMapelForRombel])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!hnRombel) {
        setHnMapelOptions([])
        setHnMapel('')
        return
      }
      try {
        const res = await mapelAPI.getList({
          id_rombel_ids: hnRombel,
          lembaga_id: hnLembaga || undefined,
          lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
          status: 'aktif',
          page: 1,
          limit: 300
        })
        if (cancelled) return
        if (res?.success) {
          const arr = Array.isArray(res.data) ? res.data : []
          setHnMapelOptions(arr)
          setHnMapel((prev) => {
            if (prev && arr.some((m) => String(m.id) === String(prev))) return prev
            return ''
          })
        } else {
          setHnMapelOptions([])
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setHnMapelOptions([])
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [hnRombel, hnLembaga, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    if (!hnMapel) return
    const ok = hnMapelOptions.some((m) => String(m.id) === String(hnMapel))
    if (!ok) setHnMapel('')
  }, [hnMapelOptions, hnMapel])

  const toggleRombel = (id) => {
    const s = String(id)
    setSelectedRombelIds((prev) => {
      if (prev.includes(s)) return sortRombelIdStrings(prev.filter((x) => x !== s))
      return sortRombelIdStrings([...prev, s])
    })
    setItems((prev) => prev.map((it) => ({ ...it, idLembagaKitab: '', rows: [] })))
  }

  const pilihSemuaRombelFilter = () => {
    setSelectedRombelIds(sortRombelIdStrings(rombelFiltered.map((r) => String(r.id))))
    setItems((prev) => prev.map((it) => ({ ...it, idLembagaKitab: '', rows: [] })))
  }

  const kosongkanRombel = () => {
    setSelectedRombelIds([])
    setItems((prev) => prev.map((it) => ({ ...it, idLembagaKitab: '', rows: [] })))
  }

  const onPickHijriForItem = async (idx, hij) => {
    setItems((prev) => {
      const n = [...prev]
      if (!n[idx]) return prev
      n[idx] = { ...n[idx], tanggalHijriyah: hij }
      return n
    })
    if (!hij) return
    try {
      const res = await kalenderAPI.get({ action: 'to_masehi', tanggal: hij })
      if (res?.masehi) {
        const m = String(res.masehi).slice(0, 10)
        setItems((prev) => {
          const n = [...prev]
          if (!n[idx]) return prev
          n[idx] = { ...n[idx], tanggalMasehi: m }
          return n
        })
      }
    } catch {
      /* biarkan Masehi manual */
    }
  }

  const loadList = useCallback(async () => {
    try {
      setListLoading(true)
      const romParams =
        selectedRombelIds.length > 1
          ? { id_rombel_ids: sortRombelIdStrings(selectedRombelIds).join(',') }
          : selectedRombelIds.length === 1
            ? { id_rombel: Number(selectedRombelIds[0]) }
            : {}
      const res = await ujianAPI.getList({
        lembaga_id: lembagaFilter || undefined,
        lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
        ...romParams,
        page,
        limit: 25
      })
      if (res?.success) {
        setList(Array.isArray(res.data) ? res.data : [])
        setTotal(typeof res.total === 'number' ? res.total : 0)
      } else {
        setList([])
        setTotal(0)
      }
    } catch (e) {
      console.error(e)
      setList([])
      setTotal(0)
    } finally {
      setListLoading(false)
    }
  }, [lembagaFilter, selectedRombelIds, page, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    setPage(1)
  }, [lembagaFilter, selectedRombelIds.join(',')])

  useEffect(() => {
    if (hnOpenId) return
    const t = setTimeout(() => setHnCariDebounced(hnCari), 400)
    return () => clearTimeout(t)
  }, [hnCari, hnOpenId])

  useEffect(() => {
    setHnPage(1)
  }, [hnLembaga, hnRombel, hnMapel, hnCariDebounced])

  const loadHnList = useCallback(async () => {
    try {
      setHnListLoading(true)
      const res = await ujianAPI.getList({
        lembaga_id: hnLembaga || undefined,
        lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
        id_rombel: hnRombel ? Number(hnRombel) : undefined,
        id_lembaga_kitab: hnMapel ? Number(hnMapel) : undefined,
        q: hnCariDebounced.trim() || undefined,
        page: hnPage,
        limit: 20
      })
      if (res?.success) {
        setHnList(Array.isArray(res.data) ? res.data : [])
        setHnTotal(typeof res.total === 'number' ? res.total : 0)
      } else {
        setHnList([])
        setHnTotal(0)
      }
    } catch (e) {
      console.error(e)
      setHnList([])
      setHnTotal(0)
    } finally {
      setHnListLoading(false)
    }
  }, [hnLembaga, hnRombel, hnMapel, hnCariDebounced, hnPage, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    if (activeTab !== 'nilai' || hnOpenId) return
    loadHnList()
  }, [activeTab, hnOpenId, loadHnList])

  const mapSantriRows = (santri) =>
    santri.map((s) => ({
      id_santri: s.id,
      nama: s.nama,
      nis: s.nis,
      kehadiran: 'hadir',
      nilai: '',
      catatan: ''
    }))

  const muatSantriItem = async (idx) => {
    const it = items[idx]
    const lk = it?.idLembagaKitab ? Number(it.idLembagaKitab) : 0
    if (lk < 1) {
      showNotification(`Sub #${idx + 1}: pilih mapel (kitab) dulu`, 'error')
      return
    }
    setFormBusy(true)
    try {
      const res = await ujianAPI.getFormData(lk, {
        id_rombel_ids:
          selectedRombelIds.length > 0 ? sortRombelIdStrings(selectedRombelIds).join(',') : undefined
      })
      if (!res?.success) {
        showNotification(res?.message || 'Gagal memuat santri', 'error')
        return
      }
      const santri = Array.isArray(res.data?.santri) ? res.data.santri : []
      setItems((prev) => {
        const n = [...prev]
        if (!n[idx]) return prev
        n[idx] = { ...n[idx], rows: mapSantriRows(santri) }
        return n
      })
      showNotification(`Sub #${idx + 1}: ${santri.length} santri dimuat`, 'success')
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal memuat', 'error')
    } finally {
      setFormBusy(false)
    }
  }

  const muatSemuaSantri = async () => {
    for (let i = 0; i < items.length; i++) {
      if (!items[i]?.idLembagaKitab) continue
      await muatSantriItem(i)
    }
  }

  const bukaEditGrup = async (grupId) => {
    setFormBusy(true)
    try {
      const res = await ujianAPI.getGrup(grupId)
      if (!res?.success || !res.data?.grup) {
        showNotification(res?.message || 'Grup tidak ditemukan', 'error')
        return
      }
      const grup = res.data.grup
      const rawItems = Array.isArray(res.data.items) ? res.data.items : []
      const ids = String(grup.id_rombel_ids || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
      const sorted = sortRombelIdStrings(ids)
      const firstUjian = rawItems[0]?.ujian
      if (firstUjian?.lembaga_id) setLembagaFilter(String(firstUjian.lembaga_id))
      setSelectedRombelIds(sorted)
      setEditingGrupId(Number(grup.id))
      setJudul(grup.judul || 'Ujian')
      setJenis(grup.jenis || '')

      const mapelRes = await mapelAPI.getList({
        id_rombel_ids: sorted.join(','),
        lembaga_id: firstUjian?.lembaga_id ? String(firstUjian.lembaga_id) : lembagaFilter || undefined,
        lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
        status: 'aktif',
        page: 1,
        limit: 300
      })
      const arr = mapelRes?.success && Array.isArray(mapelRes.data) ? mapelRes.data : []
      setMapelOptions(arr)

      const mapped = rawItems.map((it) => {
        const u = it.ujian || {}
        const peserta = Array.isArray(it.peserta) ? it.peserta : []
        const m = String(u.tanggal_masehi || '').slice(0, 10)
        const hj =
          u.tanggal_hijriyah && u.tanggal_hijriyah !== '0000-00-00' ? String(u.tanggal_hijriyah).slice(0, 10) : null
        let lk = String(u.id_lembaga_kitab || '')
        if (lk && !arr.some((mo) => String(mo.id) === lk)) lk = ''
        return {
          localKey: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          idLembagaKitab: lk,
          tanggalMasehi: m || new Date().toISOString().slice(0, 10),
          tanggalHijriyah: hj && /^\d{4}-\d{2}-\d{2}$/.test(hj) ? hj : null,
          jamMulai: u.jam_mulai ? String(u.jam_mulai).slice(0, 5) : '',
          jamSelesai: u.jam_selesai ? String(u.jam_selesai).slice(0, 5) : '',
          rows: peserta.map((p) => ({
            id_santri: p.id_santri,
            nama: p.nama,
            nis: p.nis,
            kehadiran: p.kehadiran || 'hadir',
            nilai: p.nilai != null && p.nilai !== '' ? String(p.nilai) : '',
            catatan: p.catatan || ''
          }))
        }
      })
      setItems(mapped.length > 0 ? mapped : [emptyJadwalItem()])
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal memuat', 'error')
    } finally {
      setFormBusy(false)
    }
  }

  const resetFormBaru = () => {
    setEditingGrupId(null)
    setJudul('Ujian')
    setJenis('')
    setItems([emptyJadwalItem()])
    setSelectedRombelIds([])
  }

  const simpan = async () => {
    if (selectedRombelIds.length === 0) {
      showNotification('Pilih minimal satu rombel', 'error')
      return
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const lk = it.idLembagaKitab ? Number(it.idLembagaKitab) : 0
      if (lk < 1) {
        showNotification(`Sub-jadwal #${i + 1}: pilih mapel`, 'error')
        return
      }
      if (!it.tanggalMasehi || !/^\d{4}-\d{2}-\d{2}$/.test(it.tanggalMasehi)) {
        showNotification(`Sub-jadwal #${i + 1}: tanggal tidak valid`, 'error')
        return
      }
      if (!it.rows || it.rows.length === 0) {
        showNotification(`Sub-jadwal #${i + 1}: muat daftar santri`, 'error')
        return
      }
    }
    const payload = {
      judul: judul.trim() || 'Ujian',
      jenis: jenis.trim() || null,
      id_rombel_ids: sortRombelIdStrings(selectedRombelIds).join(','),
      items: items.map((it) => ({
        id_lembaga_kitab: Number(it.idLembagaKitab),
        tanggal_masehi: it.tanggalMasehi,
        jam_mulai: it.jamMulai || null,
        jam_selesai: it.jamSelesai || null,
        peserta: it.rows.map((r) => ({
          id_santri: r.id_santri,
          kehadiran: r.kehadiran,
          nilai: r.nilai === '' ? null : Number(r.nilai),
          catatan: r.catatan || null
        }))
      }))
    }
    setFormBusy(true)
    try {
      const res = editingGrupId
        ? await ujianAPI.updateGrup(editingGrupId, payload)
        : await ujianAPI.createGrup(payload)
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        resetFormBaru()
        loadList()
      } else {
        showNotification(res?.message || 'Gagal simpan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal simpan', 'error')
    } finally {
      setFormBusy(false)
    }
  }

  const confirmHapus = async () => {
    if (deletingGrupId) {
      const gid = deletingGrupId
      setDeleting(true)
      try {
        const res = await ujianAPI.deleteGrup(gid)
        if (res?.success) {
          showNotification(res.message || 'Kelompok dihapus', 'success')
          setShowDeleteModal(false)
          setDeletingGrupId(null)
          setDeletingId(null)
          if (editingGrupId === gid) resetFormBaru()
          loadList()
          if (activeTab === 'nilai') loadHnList()
        } else {
          showNotification(res?.message || 'Gagal', 'error')
        }
      } catch (e) {
        showNotification(e.response?.data?.message || 'Gagal', 'error')
      } finally {
        setDeleting(false)
      }
      return
    }
    if (!deletingId) return
    setDeleting(true)
    try {
      const res = await ujianAPI.delete(deletingId)
      if (res?.success) {
        showNotification('Jadwal ujian dihapus', 'success')
        setShowDeleteModal(false)
        setDeletingId(null)
        setDeletingGrupId(null)
        loadList()
        if (activeTab === 'nilai') loadHnList()
      } else {
        showNotification(res?.message || 'Gagal', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal', 'error')
    } finally {
      setDeleting(false)
    }
  }

  const tutupHnEditor = () => {
    setHnOpenId(null)
    setHnMeta(null)
    setHnRows([])
    setHnCari('')
    setHnCariDebounced('')
    setHnOpeningId(null)
  }

  const bukaHnUjian = async (id) => {
    setHnOpeningId(id)
    try {
      const res = await ujianAPI.getById(id)
      if (!res?.success || !res.data?.ujian) {
        showNotification(res?.message || 'Data tidak ditemukan', 'error')
        return
      }
      const u = res.data.ujian
      const peserta = Array.isArray(res.data.peserta) ? res.data.peserta : []
      setHnOpenId(id)
      setHnMeta({
        id_lembaga_kitab: Number(u.id_lembaga_kitab),
        judul: u.judul_grup || u.judul || 'Ujian',
        jenis: u.jenis_grup || u.jenis || null,
        tanggal_masehi: String(u.tanggal_masehi || '').slice(0, 10),
        jam_mulai: u.jam_mulai ? String(u.jam_mulai).slice(0, 8) : null,
        jam_selesai: u.jam_selesai ? String(u.jam_selesai).slice(0, 8) : null,
        kitab_nama: u.kitab_nama || null
      })
      setHnRows(
        peserta.map((p) => ({
          id_santri: p.id_santri,
          nama: p.nama,
          nis: p.nis,
          kehadiran: p.kehadiran || 'hadir',
          nilai: p.nilai != null && p.nilai !== '' ? String(p.nilai) : '',
          catatan: p.catatan || ''
        }))
      )
      setHnCari('')
      setHnCariDebounced('')
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal memuat', 'error')
    } finally {
      setHnOpeningId(null)
    }
  }

  const simpanHn = async () => {
    if (!hnOpenId || !hnMeta) {
      showNotification('Buka satu ujian terlebih dahulu', 'error')
      return
    }
    if (hnRows.length === 0) {
      showNotification('Tidak ada peserta', 'error')
      return
    }
    const peserta = hnRows.map((r) => ({
      id_santri: r.id_santri,
      kehadiran: r.kehadiran,
      nilai: r.nilai === '' ? null : Number(r.nilai),
      catatan: r.catatan || null
    }))
    const payload = {
      id_lembaga_kitab: hnMeta.id_lembaga_kitab,
      judul: hnMeta.judul.trim() || 'Ujian',
      jenis: hnMeta.jenis && String(hnMeta.jenis).trim() !== '' ? String(hnMeta.jenis).trim() : null,
      tanggal_masehi: hnMeta.tanggal_masehi,
      jam_mulai: hnMeta.jam_mulai ? String(hnMeta.jam_mulai).slice(0, 5) : null,
      jam_selesai: hnMeta.jam_selesai ? String(hnMeta.jam_selesai).slice(0, 5) : null,
      peserta
    }
    setHnSaving(true)
    try {
      const res = await ujianAPI.update(hnOpenId, payload)
      if (res?.success) {
        showNotification(res.message || 'Tersimpan', 'success')
        tutupHnEditor()
        loadHnList()
        loadList()
      } else {
        showNotification(res?.message || 'Gagal simpan', 'error')
      }
    } catch (e) {
      showNotification(e.response?.data?.message || 'Gagal simpan', 'error')
    } finally {
      setHnSaving(false)
    }
  }

  const updateHnRow = (idSantri, field, val) => {
    setHnRows((prev) => {
      const i = prev.findIndex((x) => String(x.id_santri) === String(idSantri))
      if (i < 0) return prev
      const next = [...prev]
      next[i] = { ...next[i], [field]: val }
      return next
    })
  }

  const updateItemField = (idx, field, val) => {
    setItems((prev) => {
      const n = [...prev]
      if (!n[idx]) return prev
      n[idx] = { ...n[idx], [field]: val }
      return n
    })
  }

  const updateItemRow = (itemIdx, rowIdx, field, val) => {
    setItems((prev) => {
      const n = [...prev]
      if (!n[itemIdx]?.rows) return prev
      const rows = [...n[itemIdx].rows]
      if (!rows[rowIdx]) return prev
      rows[rowIdx] = { ...rows[rowIdx], [field]: val }
      n[itemIdx] = { ...n[itemIdx], rows }
      return n
    })
  }

  const addJadwalItem = () => setItems((prev) => [...prev, emptyJadwalItem()])

  const removeJadwalItem = (idx) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((_, i) => i !== idx)
    })
  }

  const riwayatGroups = useMemo(() => {
    const map = new Map()
    for (const u of list) {
      const gid = u.id_ujian_grup != null && u.id_ujian_grup !== '' ? String(u.id_ujian_grup) : `orphan-${u.id}`
      if (!map.has(gid)) {
        map.set(gid, {
          grupId: u.id_ujian_grup != null && u.id_ujian_grup !== '' ? Number(u.id_ujian_grup) : null,
          judul: u.judul_grup || u.judul || '—',
          jenis: u.jenis_grup || u.jenis || '',
          subs: []
        })
      }
      map.get(gid).subs.push(u)
    }
    return Array.from(map.values()).sort((a, b) => Number(b.grupId || 0) - Number(a.grupId || 0))
  }, [list])

  const totalPages = Math.max(1, Math.ceil(total / 25) || 1)
  const hnTotalPages = Math.max(1, Math.ceil(hnTotal / 20) || 1)

  const rombelDisabled = !lembagaDitetapkan
  const hnRombelDisabled = !hnLembagaDitetapkan

  const ujianTabNavClass = (key) =>
    `shrink-0 whitespace-nowrap px-3 sm:px-4 py-2.5 sm:py-3 text-center text-xs sm:text-sm font-medium border-b-2 transition-colors ${
      activeTab === key
        ? 'border-teal-500 text-teal-600 dark:text-teal-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:border-gray-600'
    }`

  const hnSelectFilterClass =
    'border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400'

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <div className="mb-4 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-200 dark:border-gray-700 sm:rounded-t-lg">
                <div className={tabStripScrollClass}>
                  <nav
                    className="flex w-max min-w-full flex-nowrap items-stretch -mb-px"
                    aria-label="Bagian Ujian"
                  >
                    <button type="button" onClick={() => setActiveTab('entri')} className={ujianTabNavClass('entri')}>
                      Entri lengkap
                    </button>
                    <button type="button" onClick={() => setActiveTab('nilai')} className={ujianTabNavClass('nilai')}>
                      Nilai
                    </button>
                  </nav>
                </div>
              </div>
            </div>

            {activeTab === 'entri' && (
              <>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {editingGrupId ? `Edit kelompok #${editingGrupId}` : 'Entri baru (kelompok)'}
                </h2>
                {editingGrupId && (
                  <button
                    type="button"
                    onClick={resetFormBaru}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Entri baru
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                <label className="block text-xs text-gray-600 dark:text-gray-400">
                  Lembaga
                  <select
                    value={lembagaFilter}
                    onChange={(e) => {
                      setLembagaFilter(e.target.value)
                      setSelectedRombelIds([])
                      setItems((prev) => prev.map((row) => ({ ...row, idLembagaKitab: '', rows: [] })))
                    }}
                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    disabled={lembagaAccess.lembagaFilterLocked && lembagaAccess.allowedLembagaIds?.length === 1}
                  >
                    <option value="">{lembagaAccess.canFilterAllLembaga ? 'Semua lembaga' : 'Pilih'}</option>
                    {lembagaList.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nama || l.id}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  className={`sm:col-span-2 lg:col-span-2 ${rombelDisabled ? 'opacity-50 pointer-events-none select-none' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Rombel {rombelDisabled ? '(pilih lembaga terlebih dahulu)' : '(bisa lebih dari satu)'}
                    </span>
                    {!rombelDisabled && rombelFiltered.length > 0 && (
                      <div className="flex gap-2">
                        <button type="button" onClick={pilihSemuaRombelFilter} className="text-[11px] text-primary-600 dark:text-primary-400 hover:underline">
                          Pilih semua
                        </button>
                        <button type="button" onClick={kosongkanRombel} className="text-[11px] text-gray-600 dark:text-gray-400 hover:underline">
                          Kosongkan
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-1 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-2 space-y-1.5 bg-gray-50/80 dark:bg-gray-900/30">
                    {rombelFiltered.length === 0 ? (
                      <p className="text-xs text-gray-500 px-1 py-2">Tidak ada rombel untuk lembaga ini.</p>
                    ) : (
                      rombelFiltered.map((r) => (
                        <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-white dark:hover:bg-gray-800">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 dark:border-gray-600"
                            checked={selectedRombelIds.includes(String(r.id))}
                            onChange={() => toggleRombel(r.id)}
                            disabled={rombelDisabled}
                          />
                          <span className="text-gray-800 dark:text-gray-100">
                            {r.kelas || '—'}
                            {r.kel ? ` ${r.kel}` : ''}
                            <span className="text-gray-400 text-xs ml-1">#{r.id}</span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 sm:col-span-2">
                    Judul kelompok
                    <input
                      value={judul}
                      onChange={(e) => setJudul(e.target.value)}
                      className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </label>
                  <label className="block text-xs text-gray-600 dark:text-gray-400">
                    Jenis (opsional)
                    <input
                      value={jenis}
                      onChange={(e) => setJenis(e.target.value)}
                      placeholder="UTS, harian, …"
                      className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-3">
                <button
                  type="button"
                  onClick={addJadwalItem}
                  disabled={formBusy || selectedRombelIds.length === 0}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50"
                >
                  Tambah jadwal (sub)
                </button>
                <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums self-center">
                  Total: <strong className="font-semibold text-gray-800 dark:text-gray-200">{items.length}</strong> sub
                </span>
                <button
                  type="button"
                  onClick={muatSemuaSantri}
                  disabled={formBusy || selectedRombelIds.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 text-white text-sm dark:bg-gray-600 disabled:opacity-50"
                >
                  Muat santri semua sub
                </button>
              </div>

              <div className="space-y-6">
                {items.map((it, idx) => (
                  <div
                    key={it.localKey}
                    className="rounded-lg border border-gray-200 dark:border-gray-600 p-3 bg-gray-50/50 dark:bg-gray-900/20"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-200">Sub-jadwal #{idx + 1}</span>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => muatSantriItem(idx)}
                          disabled={formBusy || !it.idLembagaKitab}
                          className="text-xs px-2 py-1 rounded bg-primary-600 text-white disabled:opacity-50"
                        >
                          Muat santri
                        </button>
                        <button
                          type="button"
                          onClick={() => removeJadwalItem(idx)}
                          disabled={items.length <= 1}
                          className="text-xs px-2 py-1 rounded text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 disabled:opacity-40"
                        >
                          Hapus sub
                        </button>
                      </div>
                    </div>

                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-3">
                      Mapel (kitab)
                      <select
                        value={it.idLembagaKitab}
                        onChange={(e) => {
                          const v = e.target.value
                          setItems((prev) => {
                            const n = [...prev]
                            if (!n[idx]) return prev
                            n[idx] = { ...n[idx], idLembagaKitab: v, rows: [] }
                            return n
                          })
                        }}
                        disabled={selectedRombelIds.length === 0}
                        className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 disabled:opacity-50"
                      >
                        <option value="">{selectedRombelIds.length === 0 ? 'Pilih rombel dulu' : 'Pilih mapel'}</option>
                        {mapelOptions.map((m) => (
                          <option key={m.id} value={m.id}>
                            {(m.kitab_nama || m.id) +
                              ` — Kelas ${m.kelas || '—'}${m.kel ? ` ${m.kel}` : ''} (rombel #${m.id_rombel ?? m.rombel_id ?? ''})`}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="flex flex-row gap-3 items-end mb-3">
                      <div className="flex-1 min-w-0">
                        <span className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tanggal Hijriyah</span>
                        <PickDateHijri
                          value={it.tanggalHijriyah}
                          onChange={(hij) => onPickHijriForItem(idx, hij)}
                          placeholder="Pilih tanggal Hijriyah"
                          className="w-full"
                          inputClassName="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-left text-sm"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Tanggal Masehi</label>
                        <input
                          type="date"
                          value={it.tanggalMasehi}
                          onChange={(e) => {
                            const v = e.target.value
                            updateItemField(idx, 'tanggalMasehi', v)
                            syncHijriForItem(idx, v, it.jamMulai)
                          }}
                          className="w-full border rounded-lg px-2 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:max-w-md gap-3 mb-3">
                      <label className="block text-xs text-gray-600 dark:text-gray-400">
                        Jam mulai
                        <input
                          type="time"
                          value={it.jamMulai}
                          onChange={(e) => {
                            const v = e.target.value
                            updateItemField(idx, 'jamMulai', v)
                            syncHijriForItem(idx, it.tanggalMasehi, v)
                          }}
                          className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        />
                      </label>
                      <label className="block text-xs text-gray-600 dark:text-gray-400">
                        Jam selesai
                        <input
                          type="time"
                          value={it.jamSelesai}
                          onChange={(e) => updateItemField(idx, 'jamSelesai', e.target.value)}
                          className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                        />
                      </label>
                    </div>

                    {it.rows.length > 0 && (
                      <div className="overflow-x-auto border border-gray-200 dark:border-gray-600 rounded-lg">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700/80">
                            <tr>
                              <th className="text-left px-2 py-2">Santri</th>
                              <th className="text-left px-2 py-2 w-36">Kehadiran</th>
                              <th className="text-left px-2 py-2 w-24">Nilai</th>
                              <th className="text-left px-2 py-2">Catatan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {it.rows.map((r, ridx) => (
                              <tr key={r.id_santri} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="px-2 py-1.5">
                                  <div className="font-medium text-gray-900 dark:text-gray-100">{r.nama}</div>
                                  <div className="text-xs text-gray-500">NIS {r.nis}</div>
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    value={r.kehadiran}
                                    onChange={(e) => updateItemRow(idx, ridx, 'kehadiran', e.target.value)}
                                    className="w-full border rounded px-1 py-1 text-xs dark:bg-gray-700 dark:border-gray-600"
                                  >
                                    {KEHADIRAN_OPTS.map((o) => (
                                      <option key={o.v} value={o.v}>
                                        {o.l}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.01}
                                    value={r.nilai}
                                    onChange={(e) => updateItemRow(idx, ridx, 'nilai', e.target.value)}
                                    className="w-full border rounded px-1 py-1 text-xs dark:bg-gray-700 dark:border-gray-600"
                                  />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    value={r.catatan}
                                    onChange={(e) => updateItemRow(idx, ridx, 'catatan', e.target.value)}
                                    className="w-full border rounded px-1 py-1 text-xs dark:bg-gray-700 dark:border-gray-600"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={simpan}
                disabled={formBusy || items.length === 0}
                className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {formBusy ? 'Menyimpan…' : editingGrupId ? 'Perbarui kelompok' : 'Simpan kelompok ujian'}
              </button>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2 mb-3">
                <h2 className="text-sm font-medium text-gray-800 dark:text-gray-200">Riwayat ujian</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-xl">
                    Filter memakai lembaga + rombel terpilih di atas (kosongkan centang rombel untuk semua rombel lembaga).
                  </p>
                  <button
                    type="button"
                    onClick={() => loadList()}
                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 shrink-0"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {listLoading ? (
                <div className="py-8 text-center text-gray-500">Memuat…</div>
              ) : list.length === 0 ? (
                <div className="py-6 text-center text-gray-500 text-sm">Belum ada data</div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {riwayatGroups.map((g) => (
                      <div key={g.grupId ?? g.subs[0]?.id} className="py-4 first:pt-0">
                        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{g.judul}</div>
                            {g.jenis ? (
                              <div className="text-[11px] text-gray-500 dark:text-gray-400">{g.jenis}</div>
                            ) : null}
                          </div>
                          {g.grupId != null ? (
                            <div className="flex flex-wrap gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => bukaEditGrup(g.grupId)}
                                className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                              >
                                Edit kelompok
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeletingGrupId(g.grupId)
                                  setDeletingId(null)
                                  setShowDeleteModal(true)
                                }}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline"
                              >
                                Hapus kelompok
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <ul className="space-y-2 pl-0 sm:pl-3 border-l-0 sm:border-l-2 border-gray-200 dark:border-gray-600">
                          {g.subs.map((u) => (
                            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <div>
                                <div className="text-gray-800 dark:text-gray-100">{u.kitab_nama || '—'}</div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  {u.tanggal_masehi}
                                  {u.tanggal_hijriyah && u.tanggal_hijriyah !== '0000-00-00' ? ` · Hj. ${u.tanggal_hijriyah}` : ''}
                                  {' · '}
                                  {u.lembaga_nama || ''} kelas {u.kelas}
                                  {u.kel ? ` ${u.kel}` : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeletingId(u.id)
                                  setDeletingGrupId(null)
                                  setShowDeleteModal(true)
                                }}
                                className="text-xs text-red-600 dark:text-red-400 hover:underline shrink-0"
                              >
                                Hapus jadwal
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                      <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="px-2 py-1 text-sm border rounded disabled:opacity-50"
                      >
                        ‹
                      </button>
                      <span className="text-sm text-gray-600 py-1">
                        {page} / {totalPages}
                      </span>
                      <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="px-2 py-1 text-sm border rounded disabled:opacity-50"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
              </>
            )}

            {activeTab === 'nilai' && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 mb-0">
                  {!hnOpenId ? (
                    <>
                      <div className="relative pb-2 px-4 pt-3">
                        <div className="relative">
                          <input
                            type="text"
                            value={hnCari}
                            onChange={(e) => setHnCari(e.target.value)}
                            onFocus={() => setHnInputFocused(true)}
                            onBlur={() => setHnInputFocused(false)}
                            className="w-full p-2 pr-12 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                            placeholder="Cari judul atau jenis…"
                          />
                          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                            <button
                              type="button"
                              onClick={() => setHnFilterOpen(!hnFilterOpen)}
                              className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                              title={hnFilterOpen ? 'Sembunyikan filter' : 'Tampilkan filter'}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                                />
                              </svg>
                              {hnFilterOpen ? (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                        <div
                          className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${hnInputFocused ? 'opacity-100' : 'opacity-0'}`}
                        />
                      </div>

                      <AnimatePresence>
                        {hnFilterOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
                          >
                            <div className="px-4 py-2">
                              <div className="flex flex-wrap gap-2">
                                <select
                                  value={hnLembaga}
                                  onChange={(e) => {
                                    setHnLembaga(e.target.value)
                                    setHnRombel('')
                                    setHnMapel('')
                                  }}
                                  disabled={lembagaAccess.lembagaFilterLocked && lembagaAccess.allowedLembagaIds?.length === 1}
                                  className={`${hnSelectFilterClass} max-w-[200px]`}
                                >
                                  <option value="">{lembagaAccess.canFilterAllLembaga ? 'Semua lembaga' : 'Lembaga'}</option>
                                  {lembagaList.map((l) => (
                                    <option key={l.id} value={l.id}>
                                      {l.nama || l.id}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={hnRombel}
                                  onChange={(e) => {
                                    setHnRombel(e.target.value)
                                    setHnMapel('')
                                  }}
                                  disabled={hnRombelDisabled}
                                  className={`${hnSelectFilterClass} max-w-[200px] disabled:opacity-50`}
                                  title={hnRombelDisabled ? 'Pilih lembaga dulu' : ''}
                                >
                                  <option value="">{hnRombelDisabled ? 'Pilih lembaga dulu' : 'Semua rombel'}</option>
                                  {hnRombelFiltered.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.kelas || '—'}
                                      {r.kel ? ` ${r.kel}` : ''} · #{r.id}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={hnMapel}
                                  onChange={(e) => setHnMapel(e.target.value)}
                                  disabled={!hnRombel}
                                  className={`${hnSelectFilterClass} max-w-[220px] disabled:opacity-50`}
                                >
                                  <option value="">{hnRombel ? 'Semua mapel' : 'Pilih rombel dulu'}</option>
                                  {hnMapelOptions.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {(m.kitab_nama || m.id) +
                                        ` — ${m.kelas || '—'}${m.kel ? ` ${m.kel}` : ''}`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                                <button
                                  type="button"
                                  onClick={() => loadHnList()}
                                  disabled={hnListLoading || !!hnOpenId}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth="2"
                                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                  Refresh
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : (
                    <div className="relative pb-2 px-4 pt-3">
                      <div className="relative">
                        <input
                          type="text"
                          value={hnCari}
                          onChange={(e) => setHnCari(e.target.value)}
                          onFocus={() => setHnInputFocused(true)}
                          onBlur={() => setHnInputFocused(false)}
                          className="w-full p-2 pr-3 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-sm"
                          placeholder="Cari nama atau NIS…"
                        />
                      </div>
                      <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600" />
                      <div
                        className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${hnInputFocused ? 'opacity-100' : 'opacity-0'}`}
                      />
                    </div>
                  )}
                </div>

                <div className="p-4 pt-3">
                {hnOpenId && hnMeta ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-3 border-b border-gray-200 dark:border-gray-600">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{hnMeta.judul}</div>
                        {hnMeta.kitab_nama ? (
                          <div className="text-xs text-gray-500 dark:text-gray-400">{hnMeta.kitab_nama}</div>
                        ) : null}
                        <div className="text-xs text-gray-500">{hnMeta.tanggal_masehi}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => tutupHnEditor()}
                        disabled={hnSaving}
                        className="text-xs text-teal-600 dark:text-teal-400 hover:underline disabled:opacity-50"
                      >
                        ← Kembali ke daftar
                      </button>
                    </div>
                    {hnRowsTampil.length === 0 ? (
                      <p className="text-sm text-gray-500 py-4">Tidak ada santri cocok dengan pencarian.</p>
                    ) : (
                      <div className="overflow-x-auto border border-gray-200 dark:border-gray-600 rounded-lg mb-4">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700/80">
                            <tr>
                              <th className="text-left px-2 py-2">Santri</th>
                              <th className="text-left px-2 py-2 w-36">Kehadiran</th>
                              <th className="text-left px-2 py-2 w-28">Nilai</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hnRowsTampil.map((r) => (
                              <tr key={r.id_santri} className="border-t border-gray-100 dark:border-gray-700">
                                <td className="px-2 py-1.5">
                                  <div className="font-medium text-gray-900 dark:text-gray-100">{r.nama}</div>
                                  <div className="text-xs text-gray-500">NIS {r.nis}</div>
                                </td>
                                <td className="px-2 py-1.5">
                                  <select
                                    value={r.kehadiran}
                                    onChange={(e) => updateHnRow(r.id_santri, 'kehadiran', e.target.value)}
                                    disabled={hnSaving}
                                    className="w-full border rounded p-1 h-7 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
                                  >
                                    {KEHADIRAN_OPTS.map((o) => (
                                      <option key={o.v} value={o.v}>
                                        {o.l}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.01}
                                    value={r.nilai}
                                    onChange={(e) => updateHnRow(r.id_santri, 'nilai', e.target.value)}
                                    disabled={hnSaving}
                                    className="w-full border rounded p-1 h-7 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {!hnSaving && hnRows.length > 0 && (
                      <button
                        type="button"
                        onClick={simpanHn}
                        disabled={hnSaving}
                        className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 dark:hover:bg-teal-500 disabled:opacity-50"
                      >
                        {hnSaving ? 'Menyimpan…' : 'Simpan nilai'}
                      </button>
                    )}
                  </>
                ) : hnListLoading ? (
                  <div className="py-8 text-center text-gray-500">Memuat daftar…</div>
                ) : hnList.length === 0 ? (
                  <div className="py-6 text-center text-gray-500 text-sm">Tidak ada ujian sesuai filter.</div>
                ) : (
                  <>
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 mb-4">
                      {hnList.map((u) => (
                        <li key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {u.judul_grup || u.judul}
                              <span className="font-normal text-gray-500 dark:text-gray-400 text-xs ml-1">
                                — {u.kitab_nama || '—'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400">
                              {u.tanggal_masehi}
                              {u.tanggal_hijriyah && u.tanggal_hijriyah !== '0000-00-00' ? ` · Hj. ${u.tanggal_hijriyah}` : ''}
                              {' · '}
                              {u.lembaga_nama || ''} kelas {u.kelas}
                              {u.kel ? ` ${u.kel}` : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => bukaHnUjian(u.id)}
                            disabled={hnOpeningId != null}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 dark:hover:bg-teal-500 disabled:opacity-50"
                          >
                            {hnOpeningId === u.id ? 'Memuat…' : 'Buka'}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {hnTotalPages > 1 && (
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          disabled={hnPage <= 1}
                          onClick={() => setHnPage((p) => Math.max(1, p - 1))}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 disabled:opacity-50"
                        >
                          ‹
                        </button>
                        <span className="text-sm text-gray-600 py-1">
                          {hnPage} / {hnTotalPages}
                        </span>
                        <button
                          type="button"
                          disabled={hnPage >= hnTotalPages}
                          onClick={() => setHnPage((p) => p + 1)}
                          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 disabled:opacity-50"
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </>
                )}
                </div>
              </div>
            )}

          </motion.div>
        </div>
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteModal(false)
            setDeletingId(null)
            setDeletingGrupId(null)
          }
        }}
        title={deletingGrupId ? 'Hapus kelompok ujian' : 'Hapus jadwal ujian'}
        maxWidth="max-w-sm"
      >
        <div className="p-4">
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            {deletingGrupId
              ? 'Hapus seluruh kelompok beserta semua sub-jadwal dan nilai peserta?'
              : 'Hapus jadwal (sub) ini beserta nilai semua peserta? Jika ini satu-satunya sub dalam kelompok, grup ikut kosong.'}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setShowDeleteModal(false)
                setDeletingId(null)
                setDeletingGrupId(null)
              }}
              className="px-3 py-1.5 text-sm border rounded"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={confirmHapus}
              className="px-3 py-1.5 text-sm bg-red-600 text-white rounded disabled:opacity-50"
            >
              {deleting ? 'Menghapus…' : 'Hapus'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default Ujian
