import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { rombelAPI, lembagaAPI, waliKelasAPI, pengurusAPI, santriAPI, lulusanAPI, tahunAjaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { useAuthStore } from '../../store/authStore'
import OffcanvasPindahRombel from '../../components/Modal/OffcanvasPindahRombel'
import { useOffcanvasBackClose } from '../../hooks/useOffcanvasBackClose'

const normalizeStatus = (s) => {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

function Rombel() {
  const { showNotification } = useNotification()
  const { options: tahunAjaranOptions } = useTahunAjaranStore()
  const isSuperAdmin = useAuthStore((s) => (s.user?.role_key || s.user?.level || '').toLowerCase() === 'super_admin')
  const [rombelList, setRombelList] = useState([])
  const [lembagaMaster, setLembagaMaster] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingRombel, setEditingRombel] = useState(null)
  const [formData, setFormData] = useState({
    lembaga_id: '',
    kelas: '',
    kel: '',
    keterangan: '',
    status: 'aktif'
  })
  const [filterLembaga, setFilterLembaga] = useState('')
  const [filterKelas, setFilterKelas] = useState('')
  const [filterStatus, setFilterStatus] = useState('aktif')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [waliKelasList, setWaliKelasList] = useState([])
  const [waliOffcanvasOpen, setWaliOffcanvasOpen] = useState(false)
  const [editingWali, setEditingWali] = useState(null)
  const [waliFormData, setWaliFormData] = useState({
    id_pengurus: '',
    id_ketua: '',
    id_wakil: '',
    id_sekretaris: '',
    id_bendahara: '',
    tahun_ajaran: '',
    gedung: '',
    ruang: '',
    status: 'aktif'
  })
  const [pengurusList, setPengurusList] = useState([])
  const [santriList, setSantriList] = useState([])
  const [savingWali, setSavingWali] = useState(false)
  const [santriOffcanvasOpen, setSantriOffcanvasOpen] = useState(false)
  const [santriOffcanvasRombel, setSantriOffcanvasRombel] = useState(null)
  const [santriOffcanvasList, setSantriOffcanvasList] = useState([])
  const [santriOffcanvasLoading, setSantriOffcanvasLoading] = useState(false)
  const [rombelSameLembaga, setRombelSameLembaga] = useState([])
  const [moveLoadingId, setMoveLoadingId] = useState(null)
  const [selectedSantriIds, setSelectedSantriIds] = useState(() => new Set())
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false)
  const [deletingRombel, setDeletingRombel] = useState(false)
  const [deleteRombelModalOpen, setDeleteRombelModalOpen] = useState(false)
  const [pindahModalOpen, setPindahModalOpen] = useState(false)
  const [pindahModalBulk, setPindahModalBulk] = useState(false)
  const [pindahModalSantri, setPindahModalSantri] = useState(null)
  const [lulusModalOpen, setLulusModalOpen] = useState(false)
  const [lulusTahunAjaran, setLulusTahunAjaran] = useState('')
  const [lulusTahunAjaranList, setLulusTahunAjaranList] = useState([])
  const [lulusSubmitting, setLulusSubmitting] = useState(false)
  const panelHistoryCountRef = useRef(0)
  const isProgrammaticBackRef = useRef(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  /** Semua data rombel untuk menghitung opsi filter + jumlah (tanpa pagination) */
  const [filterSourceData, setFilterSourceData] = useState([])

  /** Nama lembaga kanonik: trim supaya grouping satu nama satu opsi (atasi lembaga_id beda tapi nama sama) */
  const canonicalLembagaNama = useCallback((v) => {
    if (v == null || v === '') return ''
    return String(v).trim()
  }, [])

  const matchByLembaga = useCallback((r, val) => !val || canonicalLembagaNama(r.lembaga_nama) === canonicalLembagaNama(val), [canonicalLembagaNama])
  const matchByStatus = useCallback((r, val) => !val || normalizeStatus(r.status) === normalizeStatus(val), [])
  const matchByKelas = useCallback((r, val) => {
    if (!val) return true
    const k = String(r.kelas || '').trim()
    return k === String(val).trim()
  }, [])
  const statusLabel = useCallback((v) => (v === 'aktif' ? 'Aktif' : v === 'nonaktif' ? 'Nonaktif' : v), [])

  const { lembagaOptions, kelasOptions, statusOptions } = useMemo(() => {
    const base = filterSourceData
    const dataForLembaga = base.filter((r) => matchByStatus(r, filterStatus) && matchByKelas(r, filterKelas))
    const lembagaCounts = {}
    dataForLembaga.forEach((r) => {
      const namaKey = canonicalLembagaNama(r.lembaga_nama || r.lembaga_id)
      if (namaKey === '') return
      if (!lembagaCounts[namaKey]) lembagaCounts[namaKey] = { count: 0, nama: r.lembaga_nama || r.lembaga_id || namaKey }
      lembagaCounts[namaKey].count += 1
    })
    const lembagaOptions = Object.entries(lembagaCounts)
      .map(([value, o]) => ({ value, label: o.nama || value, count: o.count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const dataForKelas = base.filter((r) => matchByLembaga(r, filterLembaga) && matchByStatus(r, filterStatus))
    const kelasCounts = {}
    dataForKelas.forEach((r) => {
      const k = String(r.kelas || '').trim()
      const key = k === '' ? '__kosong__' : k
      if (!kelasCounts[key]) kelasCounts[key] = { count: 0, label: k === '' ? '(kosong)' : k }
      kelasCounts[key].count += 1
    })
    const kelasOptions = Object.entries(kelasCounts)
      .map(([value, o]) => ({ value: value === '__kosong__' ? '' : value, label: o.label, count: o.count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const dataForStatus = base.filter((r) => matchByLembaga(r, filterLembaga) && matchByKelas(r, filterKelas))
    const statusCounts = {}
    dataForStatus.forEach((r) => {
      const s = normalizeStatus(r.status) || '(tanpa status)'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })
    const statusOptions = Object.entries(statusCounts)
      .filter(([value]) => value !== '(tanpa status)' && value !== '')
      .map(([value, count]) => ({ value, label: statusLabel(value), count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    return { lembagaOptions, kelasOptions, statusOptions }
  }, [filterSourceData, filterLembaga, filterStatus, filterKelas, matchByLembaga, matchByStatus, matchByKelas, statusLabel, canonicalLembagaNama])

  useEffect(() => {
    const validLembaga = new Set(['', ...lembagaOptions.map((o) => o.value)])
    if (filterLembaga && !validLembaga.has(filterLembaga)) setFilterLembaga('')
  }, [filterLembaga, lembagaOptions])
  useEffect(() => {
    const validKelas = new Set(['', ...kelasOptions.map((o) => o.value)])
    if (filterKelas !== '' && !validKelas.has(filterKelas)) setFilterKelas('')
  }, [filterKelas, kelasOptions])
  useEffect(() => {
    const validStatus = new Set(['', ...statusOptions.map((o) => o.value)])
    if (filterStatus && !validStatus.has(filterStatus)) setFilterStatus('')
  }, [filterStatus, statusOptions])

  const loadLembaga = async () => {
    try {
      const res = await lembagaAPI.getAll()
      if (res.success && res.data) {
        setLembagaMaster(res.data)
      }
    } catch (err) {
      console.error('Error loading lembaga:', err)
    }
  }

  /** Ambil semua data rombel (limit besar) hanya untuk opsi filter + jumlah */
  const loadFilterData = useCallback(async () => {
    try {
      const res = await rombelAPI.getAll({ page: 1, limit: 9999 })
      if (res.success && Array.isArray(res.data)) {
        setFilterSourceData(res.data)
      }
    } catch (err) {
      console.error('Error loading filter data:', err)
    }
  }, [])

  useEffect(() => {
    loadLembaga()
  }, [])

  useEffect(() => {
    loadFilterData()
  }, [loadFilterData])

  const loadRombel = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await rombelAPI.getAll({
        page,
        limit,
        lembaga_nama: (filterLembaga || '').trim() || undefined,
        status: filterStatus || undefined,
        kelas: (filterKelas || '').trim() || undefined,
        search: (searchQuery || '').trim() || undefined
      })
      if (response.success) {
        setRombelList(response.data || [])
        setTotal(response.total != null ? Number(response.total) : 0)
      } else {
        setError(response.message || 'Gagal memuat data rombel')
      }
    } catch (err) {
      console.error('Error loading rombel:', err)
      setError('Terjadi kesalahan saat memuat data rombel')
    } finally {
      setLoading(false)
    }
  }, [page, limit, filterLembaga, filterStatus, filterKelas, searchQuery])

  useEffect(() => {
    loadRombel()
  }, [loadRombel])

  const handleFilterChange = (setter, value) => {
    setter(value)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  const getPanelHistoryUrl = useCallback(() => {
    return window.location.pathname + window.location.search + (window.location.hash || '')
  }, [])

  const handleOpenOffcanvas = (rombel = null) => {
    if (rombel) {
      setEditingRombel(rombel)
      setFormData({
        lembaga_id: rombel.lembaga_id || '',
        kelas: rombel.kelas || '',
        kel: rombel.kel || '',
        keterangan: rombel.keterangan || '',
        status: rombel.status || 'aktif'
      })
    } else {
      setEditingRombel(null)
      const resolvedId = (filterLembaga && lembagaMaster?.length)
        ? (lembagaMaster.find((l) => canonicalLembagaNama(l.nama) === canonicalLembagaNama(filterLembaga))?.id ?? '')
        : ''
      setFormData({
        lembaga_id: resolvedId || '',
        kelas: '',
        kel: '',
        keterangan: '',
        status: 'aktif'
      })
    }
    setOffcanvasOpen(true)
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ rombelPanel: 'edit' }, '', getPanelHistoryUrl())
      panelHistoryCountRef.current += 1
    }
  }

  const handleCloseOffcanvas = (fromProgrammatic = false) => {
    setOffcanvasOpen(false)
    setEditingRombel(null)
    setWaliOffcanvasOpen(false)
    setWaliKelasList([])
    setFormData({
      lembaga_id: '',
      kelas: '',
      kel: '',
      keterangan: '',
      status: 'aktif'
    })
    if (fromProgrammatic && typeof window !== 'undefined' && window.history && panelHistoryCountRef.current > 0) {
      isProgrammaticBackRef.current = true
      // Hanya mundur 1 langkah agar tidak sampai ke route lain (mis. Santri) saat menghapus rombel berurutan
      window.history.go(-1)
    }
  }

  const loadWaliKelas = useCallback(async (idKelas) => {
    if (!idKelas) return
    try {
      const res = await waliKelasAPI.getAll({ id_kelas: idKelas })
      if (res.success && res.data) {
        setWaliKelasList(res.data)
      }
    } catch (err) {
      console.error('Error loading wali kelas:', err)
    }
  }, [])

  useEffect(() => {
    if (offcanvasOpen && editingRombel?.id) {
      loadWaliKelas(editingRombel.id)
    } else {
      setWaliKelasList([])
    }
  }, [offcanvasOpen, editingRombel?.id, loadWaliKelas])

  const handleOpenWaliOffcanvas = () => {
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ rombelPanel: 'wali' }, '', getPanelHistoryUrl())
      panelHistoryCountRef.current += 1
    }
    setEditingWali(null)
    setWaliFormData({
      id_pengurus: '',
      id_ketua: '',
      id_wakil: '',
      id_sekretaris: '',
      id_bendahara: '',
      tahun_ajaran: '',
      gedung: '',
      ruang: '',
      status: 'aktif'
    })
    setPengurusList([])
    setSantriList([])
    const lembagaId = editingRombel?.lembaga_id || ''
    ;(async () => {
      try {
        const prParams = lembagaId ? { lembaga_id: lembagaId } : {}
        const [pr, st] = await Promise.all([pengurusAPI.getList(prParams), santriAPI.getAll()])
        if (pr?.data) setPengurusList(Array.isArray(pr.data) ? pr.data : [])
        if (st?.data) setSantriList(Array.isArray(st.data) ? st.data : [])
      } catch (_) {}
    })()
    setWaliOffcanvasOpen(true)
  }

  const handleEditWaliOffcanvas = (wk) => {
    if (typeof window !== 'undefined' && window.history) {
      window.history.pushState({ rombelPanel: 'wali' }, '', getPanelHistoryUrl())
      panelHistoryCountRef.current += 1
    }
    setEditingWali(wk)
    setWaliFormData({
      id_pengurus: wk.id_pengurus != null ? String(wk.id_pengurus) : '',
      id_ketua: wk.id_ketua != null ? String(wk.id_ketua) : '',
      id_wakil: wk.id_wakil != null ? String(wk.id_wakil) : '',
      id_sekretaris: wk.id_sekretaris != null ? String(wk.id_sekretaris) : '',
      id_bendahara: wk.id_bendahara != null ? String(wk.id_bendahara) : '',
      tahun_ajaran: (wk.tahun_ajaran != null && String(wk.tahun_ajaran).trim() !== '') ? String(wk.tahun_ajaran).trim() : '',
      gedung: wk.gedung || '',
      ruang: wk.ruang || '',
      status: wk.status || 'aktif'
    })
    setPengurusList([])
    setSantriList([])
    const lembagaId = editingRombel?.lembaga_id || ''
    ;(async () => {
      try {
        const prParams = lembagaId ? { lembaga_id: lembagaId } : {}
        const [pr, st] = await Promise.all([pengurusAPI.getList(prParams), santriAPI.getAll()])
        if (pr?.data) setPengurusList(Array.isArray(pr.data) ? pr.data : [])
        if (st?.data) setSantriList(Array.isArray(st.data) ? st.data : [])
      } catch (_) {}
    })()
    setWaliOffcanvasOpen(true)
  }

  const handleCloseWaliOffcanvas = () => {
    setWaliOffcanvasOpen(false)
    setEditingWali(null)
    if (editingRombel?.id) loadWaliKelas(editingRombel.id)
  }

  useEffect(() => {
    const onPopState = (e) => {
      if (isProgrammaticBackRef.current) {
        panelHistoryCountRef.current = Math.max(0, panelHistoryCountRef.current - 1)
        if (panelHistoryCountRef.current <= 0) isProgrammaticBackRef.current = false
        return
      }
      panelHistoryCountRef.current = Math.max(0, panelHistoryCountRef.current - 1)
      if (waliOffcanvasOpen) {
        handleCloseWaliOffcanvas()
      } else if (offcanvasOpen) {
        handleCloseOffcanvas()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [offcanvasOpen, waliOffcanvasOpen])

  const handleOpenSantriOffcanvas = async (e, rombel) => {
    e.stopPropagation()
    e.preventDefault()
    if (!rombel?.id) return
    setSantriOffcanvasRombel(rombel)
    setSantriOffcanvasOpen(true)
    setSantriOffcanvasList([])
    setRombelSameLembaga([])
    setSelectedSantriIds(new Set())
    setPindahModalOpen(false)
    setSantriOffcanvasLoading(true)
    try {
      const [resSantri, resRombel] = await Promise.all([
        santriAPI.getByRombelId(rombel.id),
        rombel.lembaga_id != null && rombel.lembaga_id !== ''
          ? rombelAPI.getAll({ lembaga_id: rombel.lembaga_id, limit: 500 })
          : Promise.resolve({ success: false, data: [] })
      ])
      if (resSantri?.success && Array.isArray(resSantri.data)) {
        setSantriOffcanvasList(resSantri.data)
      }
      if (resRombel?.success && Array.isArray(resRombel.data)) {
        setRombelSameLembaga(resRombel.data.filter((r) => r.id !== rombel.id))
      }
    } catch (err) {
      console.error('Error loading santri by rombel:', err)
      showNotification('Gagal memuat daftar santri', 'error')
    } finally {
      setSantriOffcanvasLoading(false)
    }
  }

  const handleCloseSantriOffcanvas = useOffcanvasBackClose(santriOffcanvasOpen, () => {
    setSantriOffcanvasOpen(false)
    setSantriOffcanvasRombel(null)
    setSantriOffcanvasList([])
    setRombelSameLembaga([])
    setSelectedSantriIds(new Set())
    setPindahModalOpen(false)
    setLulusModalOpen(false)
  })

  /** Update jumlah_santri rombel terkait di list & filter source agar tetap valid setelah lulus/pindah */
  const updateRombelJumlahSantri = useCallback((rombelId, delta) => {
    if (rombelId == null) return
    setRombelList((prev) =>
      prev.map((r) =>
        r.id === rombelId ? { ...r, jumlah_santri: Math.max(0, (r.jumlah_santri ?? 0) + delta) } : r
      )
    )
    setFilterSourceData((prev) =>
      prev.map((r) =>
        r.id === rombelId ? { ...r, jumlah_santri: Math.max(0, (r.jumlah_santri ?? 0) + delta) } : r
      )
    )
  }, [])

  const handleOpenLulusModal = async () => {
    setLulusModalOpen(true)
    setLulusTahunAjaran('')
    try {
      const res = await tahunAjaranAPI.getAll()
      const raw = (res?.success && Array.isArray(res?.data)) ? res.data : []
      setLulusTahunAjaranList(raw.map((row) => ({
        value: row.tahun_ajaran ?? row.id ?? '',
        label: row.tahun_ajaran ?? row.id ?? '–'
      })).filter((o) => o.value))
    } catch (_) {
      setLulusTahunAjaranList([])
    }
  }

  const handleSubmitLulus = async (e) => {
    e.preventDefault()
    if (!lulusTahunAjaran || !santriOffcanvasRombel?.lembaga_id) {
      showNotification('Pilih tahun ajaran', 'warning')
      return
    }
    const ids = Array.from(selectedSantriIds)
    if (ids.length === 0) {
      showNotification('Pilih minimal satu santri', 'warning')
      return
    }
    setLulusSubmitting(true)
    try {
      const res = await lulusanAPI.createBulk({
        id_rombel: santriOffcanvasRombel.id,
        tahun_ajaran: lulusTahunAjaran,
        id_santri_list: ids
      })
      if (res?.success) {
        showNotification(res?.message ?? 'Berhasil mencatat lulusan', 'success')
        setLulusModalOpen(false)
        setSelectedSantriIds(new Set())
        updateRombelJumlahSantri(santriOffcanvasRombel?.id, -ids.length)
      } else {
        showNotification(res?.message ?? 'Gagal mencatat lulusan', 'error')
      }
    } catch (err) {
      console.error('Error create lulusan:', err)
      showNotification('Gagal mencatat lulusan', 'error')
    } finally {
      setLulusSubmitting(false)
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
    if (selectedSantriIds.size >= santriOffcanvasList.length) {
      setSelectedSantriIds(new Set())
    } else {
      setSelectedSantriIds(new Set(santriOffcanvasList.map((s) => s.id)))
    }
  }

  const handleBulkMoveToRombel = async (targetRombelId, tahunAjaran = '') => {
    const ids = Array.from(selectedSantriIds)
    if (ids.length === 0) return
    const santriToMove = santriOffcanvasList.filter((s) => ids.includes(s.id))
    if (santriToMove.length === 0) return
    setPindahModalOpen(false)
    setBulkMoveLoading(true)
    const ta = (tahunAjaran || '').trim()
    let ok = 0
    let fail = 0
    for (const s of santriToMove) {
      const role = s.role_rombel
      const payload = {}
      if (role === 'diniyah' || role === 'diniyah & formal') payload.id_diniyah = targetRombelId
      if (role === 'formal' || role === 'diniyah & formal') payload.id_formal = targetRombelId
      if (ta) {
        if (role === 'diniyah' || role === 'diniyah & formal') payload.tahun_ajaran_diniyah = ta
        if (role === 'formal' || role === 'diniyah & formal') payload.tahun_ajaran_formal = ta
      }
      if (Object.keys(payload).length === 0) continue
      try {
        const res = await santriAPI.update(s.id, payload)
        if (res?.success) ok += 1
        else fail += 1
      } catch (_) {
        fail += 1
      }
    }
    setBulkMoveLoading(false)
    setSelectedSantriIds(new Set())
    if (ok > 0) {
      showNotification(`${ok} santri berhasil dipindah${fail > 0 ? `, ${fail} gagal` : ''}`, fail > 0 ? 'warning' : 'success')
      const resRefresh = await santriAPI.getByRombelId(santriOffcanvasRombel.id)
      if (resRefresh?.success && Array.isArray(resRefresh.data)) setSantriOffcanvasList(resRefresh.data)
      updateRombelJumlahSantri(santriOffcanvasRombel.id, -ok)
      updateRombelJumlahSantri(targetRombelId, ok)
    } else {
      showNotification('Gagal memindah santri', 'error')
    }
  }

  const handleMoveSantriToRombel = async (santri, targetRombelId, tahunAjaran = '') => {
    const role = santri.role_rombel
    let payload = {}
    if (role === 'diniyah' || role === 'diniyah & formal') payload.id_diniyah = targetRombelId
    if (role === 'formal' || role === 'diniyah & formal') payload.id_formal = targetRombelId
    const ta = (tahunAjaran || '').trim()
    if (ta) {
      if (role === 'diniyah' || role === 'diniyah & formal') payload.tahun_ajaran_diniyah = ta
      if (role === 'formal' || role === 'diniyah & formal') payload.tahun_ajaran_formal = ta
    }
    if (Object.keys(payload).length === 0) return
    setPindahModalOpen(false)
    setMoveLoadingId(santri.id)
    try {
      const res = await santriAPI.update(santri.id, payload)
      if (res?.success) {
        showNotification('Santri berhasil dipindah ke rombel baru', 'success')
        const resRefresh = await santriAPI.getByRombelId(santriOffcanvasRombel.id)
        if (resRefresh?.success && Array.isArray(resRefresh.data)) {
          setSantriOffcanvasList(resRefresh.data)
        }
        updateRombelJumlahSantri(santriOffcanvasRombel.id, -1)
        updateRombelJumlahSantri(targetRombelId, 1)
      } else {
        showNotification(res?.message || 'Gagal memindah santri', 'error')
      }
    } catch (err) {
      console.error('Error moving santri:', err)
      showNotification('Gagal memindah santri', 'error')
    } finally {
      setMoveLoadingId(null)
    }
  }

  const handleOpenDeleteRombelModal = () => {
    if (!editingRombel?.id) return
    const jumlah = Number(editingRombel.jumlah_santri ?? 0)
    if (jumlah > 0) {
      showNotification('Rombel tidak dapat dihapus karena masih ada santri di dalamnya', 'error')
      return
    }
    setDeleteRombelModalOpen(true)
  }

  const handleConfirmDeleteRombel = async () => {
    if (!editingRombel?.id) return
    setDeletingRombel(true)
    try {
      const res = await rombelAPI.delete(editingRombel.id)
      if (res?.success) {
        showNotification('Rombel berhasil dihapus', 'success')
        setDeleteRombelModalOpen(false)
        handleCloseOffcanvas(true)
        loadRombel()
      } else {
        showNotification(res?.message || 'Gagal menghapus rombel', 'error')
      }
    } catch (err) {
      console.error('Error deleting rombel:', err)
      showNotification('Gagal menghapus rombel', 'error')
    } finally {
      setDeletingRombel(false)
    }
  }

  const handleSubmitWali = async (e) => {
    e.preventDefault()
    if (!editingRombel?.id) return
    setSavingWali(true)
    try {
      const tahunAjaranValue = (waliFormData.tahun_ajaran != null && String(waliFormData.tahun_ajaran).trim() !== '')
        ? String(waliFormData.tahun_ajaran).trim()
        : null
      const payload = {
        id_kelas: editingRombel.id,
        id_pengurus: waliFormData.id_pengurus || null,
        id_ketua: waliFormData.id_ketua || null,
        id_wakil: waliFormData.id_wakil || null,
        id_sekretaris: waliFormData.id_sekretaris || null,
        id_bendahara: waliFormData.id_bendahara || null,
        tahun_ajaran: tahunAjaranValue,
        gedung: waliFormData.gedung || null,
        ruang: waliFormData.ruang || null,
        status: waliFormData.status || 'aktif'
      }
      if (editingWali?.id) {
        const res = await waliKelasAPI.update(editingWali.id, payload)
        if (res.success) {
          showNotification('Wali kelas berhasil diupdate', 'success')
          handleCloseWaliOffcanvas()
          if (panelHistoryCountRef.current > 0) {
            isProgrammaticBackRef.current = true
            window.history.back()
          }
          loadWaliKelas(editingRombel.id)
        } else {
          showNotification(res.message || 'Gagal mengupdate wali kelas', 'error')
        }
      } else {
        const res = await waliKelasAPI.create(payload)
        if (res.success) {
          showNotification('Wali kelas berhasil ditambahkan', 'success')
          handleCloseWaliOffcanvas()
          if (panelHistoryCountRef.current > 0) {
            isProgrammaticBackRef.current = true
            window.history.back()
          }
          loadWaliKelas(editingRombel.id)
        } else {
          showNotification(res.message || 'Gagal menambahkan wali kelas', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving wali kelas:', err)
      showNotification('Terjadi kesalahan saat menyimpan', 'error')
    } finally {
      setSavingWali(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.lembaga_id) {
      showNotification('Lembaga wajib diisi', 'error')
      return
    }
    const kelasTrim = (formData.kelas || '').trim()
    const kelTrim = (formData.kel || '').trim()
    if (!kelasTrim) {
      showNotification('Kelas wajib diisi', 'error')
      return
    }
    if (!kelTrim) {
      showNotification('Kel wajib diisi', 'error')
      return
    }

    setSaving(true)
    try {
      const payload = { ...formData, kelas: kelasTrim, kel: kelTrim }
      if (editingRombel) {
        const response = await rombelAPI.update(editingRombel.id, payload)
        if (response.success) {
          showNotification('Rombel berhasil diupdate', 'success')
          handleCloseOffcanvas(true)
          loadRombel()
        } else {
          showNotification(response.message || 'Gagal mengupdate rombel', 'error')
        }
      } else {
        const response = await rombelAPI.create(payload)
        if (response.success) {
          showNotification('Rombel berhasil ditambahkan', 'success')
          handleCloseOffcanvas(true)
          loadRombel()
        } else {
          showNotification(response.message || 'Gagal menambahkan rombel', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving rombel:', err)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && rombelList.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Search & Filter — sticky seperti Lembaga */}
          <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
            <div className="relative pb-2 px-4 pt-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                  onFocus={() => setIsInputFocused(true)}
                  onBlur={() => setIsInputFocused(false)}
                  className="w-full p-2 pr-12 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Cari"
                />
                <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                    title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                    </svg>
                    {isFilterOpen ? (
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
              <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`} />
            </div>

            <AnimatePresence>
              {isFilterOpen && (
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
                        value={filterLembaga}
                        onChange={(e) => handleFilterChange(setFilterLembaga, e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[180px]"
                      >
                        <option value="">Lembaga</option>
                        {lembagaOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                        ))}
                      </select>
                      <select
                        value={filterKelas}
                        onChange={(e) => handleFilterChange(setFilterKelas, e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[120px]"
                      >
                        <option value="">Kelas</option>
                        {kelasOptions.map((o) => (
                          <option key={o.value === '' ? '__kosong__' : o.value} value={o.value}>{o.label} ({o.count})</option>
                        ))}
                      </select>
                      <select
                        value={filterStatus}
                        onChange={(e) => handleFilterChange(setFilterStatus, e.target.value)}
                        className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                      >
                        <option value="">Status</option>
                        {statusOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                      <button
                        type="button"
                        onClick={() => { loadFilterData(); loadRombel() }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                        title="Refresh"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFilterLembaga('')
                          setFilterKelas('')
                          setFilterStatus('')
                          setSearchQuery('')
                          setPage(1)
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                        title="Reset filter"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                        </svg>
                        Reset filter
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="px-3 py-1.5 sm:px-4 sm:py-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-gray-800 dark:text-gray-200">{from}</span>–<span className="font-medium">{to}</span> dari <span className="font-medium">{total}</span>
              {total > 0 && (
                <select
                  value={limit}
                  onChange={(e) => { setLimit(Number(e.target.value)); setPage(1) }}
                  className="border rounded px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  aria-label="Jumlah per halaman"
                >
                  {[50, 100, 200].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              )}
            </span>
            <button
              type="button"
              onClick={() => handleOpenOffcanvas()}
              className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Rombel
            </button>
          </div>
        </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence>
              {rombelList.map((rombel, index) => (
                <motion.div
                  key={rombel.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ delay: index * 0.02 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenOffcanvas(rombel)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenOffcanvas(rombel) } }}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow p-3 sm:p-4 border cursor-pointer hover:shadow-md transition-all ${
                    rombel.status === 'nonaktif'
                      ? 'border-gray-200 dark:border-gray-700 opacity-75'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 truncate">
                        {rombel.kelas || '-'}
                        {rombel.kel ? ` (${rombel.kel})` : ''}
                      </h3>
                      {rombel.wali_aktif_nama && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                          Wali: {rombel.wali_aktif_nama}
                        </p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {rombel.keterangan && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-1.5">
                      {rombel.keterangan}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={(e) => handleOpenSantriOffcanvas(e, rombel)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs sm:text-sm font-medium bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors"
                      title="Lihat daftar santri"
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      {Number(rombel.jumlah_santri ?? 0)} santri
                    </button>
                    <span
                      className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${
                        rombel.status === 'aktif'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                      }`}
                    >
                      {rombel.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {rombelList.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery || filterLembaga || filterStatus || filterKelas
                  ? 'Tidak ada rombel yang sesuai filter'
                  : 'Belum ada data rombel'}
              </p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Sebelumnya
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Halaman <span className="font-semibold">{page}</span> dari <span className="font-semibold">{totalPages}</span>
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Selanjutnya
              </button>
            </div>
          )}
          <div className="h-20 sm:h-0" aria-hidden="true" />
        </div>
      </div>

      {/* Offcanvas Tambah/Edit Rombel — kanan, sama seperti Jabatan */}
      {createPortal(
        <AnimatePresence>
          {offcanvasOpen && (
            <>
              <motion.div
                key="rombel-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { if (panelHistoryCountRef.current > 0) window.history.back() }}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="rombel-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {editingRombel ? 'Edit Rombel' : 'Tambah Rombel'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => { if (panelHistoryCountRef.current > 0) window.history.back() }}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Lembaga <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={formData.lembaga_id}
                        onChange={(e) => setFormData({ ...formData, lembaga_id: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                      >
                        <option value="">Pilih Lembaga</option>
                        {lembagaMaster.map((l) => (
                          <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Kelas <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.kelas}
                        onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Contoh: 1, 2, 3"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Kel <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.kel}
                        onChange={(e) => setFormData({ ...formData, kel: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Contoh: A, B"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keterangan</label>
                      <textarea
                        value={formData.keterangan}
                        onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Opsional"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formData.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={formData.status === 'aktif'}
                          onClick={() => setFormData({ ...formData, status: formData.status === 'aktif' ? 'nonaktif' : 'aktif' })}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
                            formData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                              formData.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Section Wali Kelas — hanya saat edit, 3 terakhir, style timeline semakin gelap */}
                    {editingRombel?.id && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Wali Kelas</h4>
                          <button
                            type="button"
                            onClick={handleOpenWaliOffcanvas}
                            className="px-2 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah
                          </button>
                        </div>
                        <ul className="space-y-0">
                          {waliKelasList.slice(0, 3).map((wk, idx) => {
                            const isLast = idx === Math.min(3, waliKelasList.length) - 1
                            const isAktif = wk.status === 'aktif'
                            const bgClass = idx === 0
                              ? 'bg-gray-50 dark:bg-gray-700/50'
                              : idx === 1
                                ? 'bg-gray-100 dark:bg-gray-700'
                                : 'bg-gray-200 dark:bg-gray-600'
                            return (
                              <li
                                key={wk.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleEditWaliOffcanvas(wk)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEditWaliOffcanvas(wk) } }}
                                className={`relative flex items-start gap-3 pl-2 -ml-px py-2 rounded cursor-pointer hover:ring-1 hover:ring-teal-500/50 ${bgClass}`}
                              >
                                {!isLast && (
                                  <span
                                    className="absolute left-[13px] top-8 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-500 rounded-full"
                                    aria-hidden
                                  />
                                )}
                                <span
                                  className="relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full bg-teal-500 dark:bg-teal-400 border-2 border-white dark:border-gray-800"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1 pt-0.5">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{wk.tahun_ajaran || '–'}</p>
                                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                    {wk.wali_nama || '(Belum diisi)'}
                                  </p>
                                  {isAktif && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                      Aktif
                                    </span>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                        {waliKelasList.length === 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Belum ada data wali kelas.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-3 sm:p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2 flex-shrink-0">
                    <div>
                      {editingRombel?.id && isSuperAdmin && Number(editingRombel.jumlah_santri ?? 0) === 0 && (
                        <button
                          type="button"
                          onClick={handleOpenDeleteRombelModal}
                          disabled={deletingRombel}
                          className="px-3 py-1.5 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 text-sm"
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { if (panelHistoryCountRef.current > 0) window.history.back() }}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {saving ? '...' : 'Simpan'}
                      </button>
                    </div>
                  </div>
                </form>
              </motion.div>

              {/* Modal konfirmasi hapus rombel */}
              <AnimatePresence>
                {deleteRombelModalOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => !deletingRombel && setDeleteRombelModalOpen(false)}
                      className="fixed inset-0 bg-black/50 z-[210]"
                    />
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="fixed inset-0 z-[211] flex items-center justify-center p-4 pointer-events-none"
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="w-full max-w-sm max-h-[85vh] overflow-hidden flex flex-col bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 pointer-events-auto"
                      >
                      <div className="p-5 sm:p-6">
                        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30">
                          <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-center text-gray-900 dark:text-white mb-2">
                          Hapus Rombel?
                        </h3>
                        <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6">
                          Rombel <span className="font-medium text-gray-800 dark:text-gray-200">{editingRombel?.kelas || ''} {editingRombel?.kel ? `(${editingRombel.kel})` : ''}</span> akan dihapus. Tindakan ini tidak dapat dibatalkan.
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            onClick={() => !deletingRombel && setDeleteRombelModalOpen(false)}
                            disabled={deletingRombel}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium text-sm disabled:opacity-50"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmDeleteRombel}
                            disabled={deletingRombel}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 font-medium text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {deletingRombel ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : null}
                            Hapus
                          </button>
                        </div>
                      </div>
                      </motion.div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Offcanvas Tambah Wali Kelas — layer kedua */}
              <AnimatePresence>
                {waliOffcanvasOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => { if (panelHistoryCountRef.current > 0) window.history.back() }}
                      className="fixed inset-0 bg-black/50 z-[202]"
                    />
                    <motion.div
                      initial={{ x: '100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '100%' }}
                      transition={{ type: 'tween', duration: 0.2 }}
                      className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[203] flex flex-col"
                    >
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                          {editingWali ? 'Edit Wali Kelas' : 'Tambah Wali Kelas'}
                        </h3>
                        <button
                          type="button"
                          onClick={() => { if (panelHistoryCountRef.current > 0) window.history.back() }}
                          className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                          aria-label="Tutup"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <form onSubmit={handleSubmitWali} className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tahun Ajaran</label>
                            <select
                              value={waliFormData.tahun_ajaran}
                              onChange={(e) => setWaliFormData({ ...waliFormData, tahun_ajaran: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Tahun Ajaran --</option>
                              {tahunAjaranOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Wali Kelas (Pengurus)</label>
                            <select
                              value={waliFormData.id_pengurus}
                              onChange={(e) => setWaliFormData({ ...waliFormData, id_pengurus: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Pengurus --</option>
                              {pengurusList.map((p) => (
                                <option key={p.id} value={p.id}>{p.nama || `ID ${p.id}`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ketua (Santri)</label>
                            <select
                              value={waliFormData.id_ketua}
                              onChange={(e) => setWaliFormData({ ...waliFormData, id_ketua: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Santri --</option>
                              {santriList.slice(0, 200).map((s) => (
                                <option key={s.id} value={s.id}>{s.nama || `NIS ${s.nis}`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Wakil (Santri)</label>
                            <select
                              value={waliFormData.id_wakil}
                              onChange={(e) => setWaliFormData({ ...waliFormData, id_wakil: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Santri --</option>
                              {santriList.slice(0, 200).map((s) => (
                                <option key={s.id} value={s.id}>{s.nama || `NIS ${s.nis}`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sekretaris (Santri)</label>
                            <select
                              value={waliFormData.id_sekretaris}
                              onChange={(e) => setWaliFormData({ ...waliFormData, id_sekretaris: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Santri --</option>
                              {santriList.slice(0, 200).map((s) => (
                                <option key={s.id} value={s.id}>{s.nama || `NIS ${s.nis}`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Bendahara (Santri)</label>
                            <select
                              value={waliFormData.id_bendahara}
                              onChange={(e) => setWaliFormData({ ...waliFormData, id_bendahara: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Santri --</option>
                              {santriList.slice(0, 200).map((s) => (
                                <option key={s.id} value={s.id}>{s.nama || `NIS ${s.nis}`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Gedung</label>
                            <input
                              type="text"
                              value={waliFormData.gedung}
                              onChange={(e) => setWaliFormData({ ...waliFormData, gedung: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                              placeholder="Gedung"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ruang</label>
                            <input
                              type="text"
                              value={waliFormData.ruang}
                              onChange={(e) => setWaliFormData({ ...waliFormData, ruang: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                              placeholder="Ruang"
                            />
                          </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => { if (panelHistoryCountRef.current > 0) window.history.back() }}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={savingWali}
                            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
                          >
                            {savingWali ? 'Menyimpan...' : (editingWali ? 'Simpan Perubahan' : 'Simpan')}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Offcanvas Daftar Santri per Rombel — kanan */}
      {createPortal(
        <AnimatePresence>
          {santriOffcanvasOpen && (
            <>
              <motion.div
                key="santri-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseSantriOffcanvas}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="santri-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Santri — {santriOffcanvasRombel ? `${santriOffcanvasRombel.lembaga_nama || santriOffcanvasRombel.lembaga_id} ${santriOffcanvasRombel.kelas || ''} ${santriOffcanvasRombel.kel ? `(${santriOffcanvasRombel.kel})` : ''}`.trim() || 'Rombel' : '–'}
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseSantriOffcanvas}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {!santriOffcanvasLoading && santriOffcanvasList.length > 0 && (
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-2 flex-shrink-0">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={selectedSantriIds.size === santriOffcanvasList.length && santriOffcanvasList.length > 0}
                        onChange={toggleSelectAllSantri}
                        className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                      />
                      Centang semua
                    </label>
                    {selectedSantriIds.size > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={handleOpenLulusModal}
                          className="px-2.5 py-1.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 flex items-center gap-1.5"
                          title="Catat sebagai lulusan lembaga"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
                          </svg>
                          Luluskan ({selectedSantriIds.size})
                        </button>
                        <button
                          type="button"
                          disabled={bulkMoveLoading}
                          onClick={() => {
                            setPindahModalBulk(true)
                            setPindahModalSantri(null)
                            setPindahModalOpen(true)
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {bulkMoveLoading ? (
                            <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                          )}
                          Pindah ({selectedSantriIds.size})
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className="flex-1 overflow-y-auto p-4">
                  {santriOffcanvasLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                    </div>
                  ) : santriOffcanvasList.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Tidak ada santri di rombel ini.</p>
                  ) : (
                    <ul className="space-y-1">
                      {santriOffcanvasList.map((s) => (
                        <li
                          key={s.id}
                          className="relative flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-100 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSantriIds.has(s.id)}
                            onChange={() => toggleSantriSelection(s.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="text-sm font-mono text-gray-600 dark:text-gray-400 w-20 shrink-0">{s.nis ?? '–'}</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1 min-w-0">{s.nama || '–'}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 hidden sm:inline">{s.status_santri || '–'}</span>
                          {moveLoadingId === s.id ? (
                            <span className="shrink-0 w-8 h-8 flex items-center justify-center">
                              <span className="animate-spin rounded-full h-4 w-4 border-2 border-teal-500 border-t-transparent" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setPindahModalSantri(s)
                                setPindahModalBulk(false)
                                setPindahModalOpen(true)
                              }}
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20"
                              title="Pindah rombel"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                              </svg>
                              Pindah
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>

              {/* Offcanvas bawah Pindah Rombel — tahun ajaran + pilih rombel */}
              <OffcanvasPindahRombel
                isOpen={pindahModalOpen && !!santriOffcanvasRombel?.lembaga_id}
                onClose={() => setPindahModalOpen(false)}
                title={pindahModalBulk ? `Pindah (${selectedSantriIds.size})` : 'Pindah Rombel'}
                lembagaId={santriOffcanvasRombel?.lembaga_id}
                excludeRombelId={santriOffcanvasRombel?.id}
                skipConfirmAfterSelect={false}
                onSelect={(targetRombelId, tahunAjaran) => {
                  if (pindahModalBulk) handleBulkMoveToRombel(targetRombelId, tahunAjaran)
                  else if (pindahModalSantri) handleMoveSantriToRombel(pindahModalSantri, targetRombelId, tahunAjaran)
                }}
              />

              {/* Offcanvas bawah Catat Lulusan — pilih tahun ajaran */}
              <AnimatePresence>
                {lulusModalOpen && (
                  <>
                    <motion.div
                      key="lulus-backdrop"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      onClick={() => setLulusModalOpen(false)}
                      className="fixed inset-0 bg-black/50 z-[210]"
                    />
                    <motion.div
                      key="lulus-panel"
                      initial={{ y: '100%' }}
                      animate={{ y: 0 }}
                      exit={{ y: '100%' }}
                      transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      className="fixed bottom-0 left-0 right-0 z-[211] flex flex-col max-h-[85vh] w-full rounded-t-xl bg-white dark:bg-gray-800 shadow-xl border-t border-gray-200 dark:border-gray-700 sm:left-auto sm:right-0 sm:w-[28rem] sm:max-w-[100vw]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex-shrink-0 flex justify-center pt-2 pb-1 sm:pt-3">
                        <span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden="true" />
                      </div>
                      <div className="px-4 pb-2 flex items-center justify-between flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Catat Lulusan
                        </h3>
                        <button
                          type="button"
                          onClick={() => setLulusModalOpen(false)}
                          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-400"
                          aria-label="Tutup"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <form onSubmit={handleSubmitLulus} className="flex flex-col flex-1 min-h-0">
                        <div className="flex-1 overflow-y-auto p-4 pb-6 sm:pb-4">
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            {selectedSantriIds.size} santri akan dicatat lulus dari lembaga ini. Pilih tahun ajaran kelulusan:
                          </p>
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              Tahun Ajaran
                            </label>
                            <select
                              value={lulusTahunAjaran}
                              onChange={(e) => setLulusTahunAjaran(e.target.value)}
                              required
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                            >
                              <option value="">— Pilih Tahun Ajaran —</option>
                              {lulusTahunAjaranList.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex-shrink-0 p-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setLulusModalOpen(false)}
                            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            Batal
                          </button>
                          <button
                            type="submit"
                            disabled={lulusSubmitting}
                            className="px-3 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                          >
                            {lulusSubmitting ? 'Menyimpan...' : 'Simpan'}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

export default Rombel
