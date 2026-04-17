import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { daerahAPI, daerahPengurusAPI, daerahKamarAPI, jabatanAPI } from '../../services/api'
import { getDomisiliSnapshot } from '../../services/domisiliIndexedDb'
import { fetchAndPersistDomisiliCache, DOMISILI_CACHE_EVENT } from '../../services/domisiliCacheSync'
import CariPengurusOffcanvas from '../../components/CariPengurusOffcanvas'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { SantriPerKamarOffcanvas } from './SantriPerKamarOffcanvas'
import { registerDomisiliPopstateLayer, DOMISILI_POP_PRIORITY } from '../../history/domisiliPopstateStack'
import { KamarEditOffcanvas } from './KamarEditOffcanvas'
import { kategoriBadgeClass } from './kategoriBadgeClass'

const normalizeStatus = (s) => {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

const KATEGORI_OPTIONS = [
  { value: 'Banin', label: 'Banin' },
  { value: 'Banat', label: 'Banat' }
]

function Daerah() {
  const { showNotification } = useNotification()
  const { options: tahunAjaranOptions, tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const [daerahList, setDaerahList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingDaerah, setEditingDaerah] = useState(null)
  const [formData, setFormData] = useState({
    kategori: 'Banin',
    daerah: '',
    keterangan: '',
    status: 'aktif'
  })
  const [filterKategori, setFilterKategori] = useState('')
  const [filterStatus, setFilterStatus] = useState('aktif')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pengurusOffcanvasOpen, setPengurusOffcanvasOpen] = useState(false)
  const [editingPengurus, setEditingPengurus] = useState(null)
  const [pengurusFormData, setPengurusFormData] = useState({
    id_pengurus: '',
    id_jabatan: '',
    tahun_ajaran: '',
    status: 'aktif',
    keterangan: ''
  })
  const [pengurusDaerahList, setPengurusDaerahList] = useState([])
  const [kamarList, setKamarList] = useState([])
  const [kamarOffcanvasOpen, setKamarOffcanvasOpen] = useState(false)
  const [kamarOffcanvasDaerah, setKamarOffcanvasDaerah] = useState(null)
  const [kamarOffcanvasLoading, setKamarOffcanvasLoading] = useState(false)
  const [kamarOffcanvasList, setKamarOffcanvasList] = useState([])
  /** Filter status di offcanvas list kamar ('' = semua), default aktif */
  const [kamarOffcanvasFilterStatus, setKamarOffcanvasFilterStatus] = useState('aktif')
  const [santriMasterList, setSantriMasterList] = useState([])
  const [santriOffcanvasOpen, setSantriOffcanvasOpen] = useState(false)
  const [santriOffcanvasKamar, setSantriOffcanvasKamar] = useState(null)
  const [kamarEditOpen, setKamarEditOpen] = useState(false)
  const [kamarEditingRow, setKamarEditingRow] = useState(null)
  const [jabatanMaster, setJabatanMaster] = useState([])
  const [pengurusPickerOpen, setPengurusPickerOpen] = useState(false)
  const [pengurusPickMeta, setPengurusPickMeta] = useState(null)
  const [savingPengurus, setSavingPengurus] = useState(false)

  const panelHistoryCountRef = useRef(0)
  const isProgrammaticBackRef = useRef(false)

  const getPanelHistoryUrl = useCallback(() => {
    return window.location.pathname + window.location.search + (window.location.hash || '')
  }, [])

  const pushPanelHistory = useCallback(
    (tag) => {
      if (typeof window === 'undefined' || !window.history) return
      window.history.pushState({ daerahPanel: tag }, '', getPanelHistoryUrl())
      panelHistoryCountRef.current += 1
    },
    [getPanelHistoryUrl]
  )

  /** Sinkronkan stack history saat menutup beberapa lapisan tanpa popstate dari user (mis. tutup kamar+santri sekaligus). */
  const syncHistoryGo = useCallback((steps) => {
    const s = Number(steps)
    const stepsOk = Number.isFinite(s) && s > 0 ? Math.floor(s) : 0
    const n = Math.min(panelHistoryCountRef.current, stepsOk)
    if (n <= 0 || typeof window === 'undefined' || !window.history) return
    isProgrammaticBackRef.current = true
    window.history.go(-n)
  }, [])

  const applyDomisiliSnapshot = useCallback((snap) => {
    if (!snap) return
    setDaerahList(Array.isArray(snap.daerah) ? snap.daerah : [])
    setKamarList(Array.isArray(snap.kamar) ? snap.kamar : [])
    setSantriMasterList(Array.isArray(snap.santri) ? snap.santri : [])
  }, [])

  const loadDaerah = useCallback(async (opts = {}) => {
    const background = opts.background === true
    try {
      if (!background) {
        setLoading(true)
        setError(null)
        const snap = await getDomisiliSnapshot()
        if (snap && (snap.daerah.length > 0 || snap.kamar.length > 0)) {
          applyDomisiliSnapshot(snap)
          setLoading(false)
        }
      }
      const { daerah, kamar, santri, daerahOk } = await fetchAndPersistDomisiliCache({ notify: false })
      setDaerahList(daerah)
      setKamarList(kamar)
      setSantriMasterList(santri)
      if (daerah.length > 0 || daerahOk) setError(null)
      if (!daerahOk && daerah.length === 0 && !background) {
        setError('Gagal memuat data daerah')
      }
    } catch (err) {
      console.error('Error loading daerah:', err)
      if (!background) setError('Terjadi kesalahan saat memuat data daerah')
    } finally {
      if (!background) setLoading(false)
    }
  }, [applyDomisiliSnapshot])

  useEffect(() => {
    loadDaerah()
  }, [loadDaerah])

  useEffect(() => {
    const onDomisiliUpdated = async () => {
      const snap = await getDomisiliSnapshot()
      if (snap) applyDomisiliSnapshot(snap)
    }
    window.addEventListener(DOMISILI_CACHE_EVENT, onDomisiliUpdated)
    return () => window.removeEventListener(DOMISILI_CACHE_EVENT, onDomisiliUpdated)
  }, [applyDomisiliSnapshot])

  const matchByKategori = useCallback((d, val) => !val || String(d.kategori || '') === String(val), [])
  const matchByStatus = useCallback((d, val) => !val || normalizeStatus(d.status) === normalizeStatus(val), [])

  const dataAfterFilters = useMemo(() => {
    return daerahList.filter(
      (d) => matchByKategori(d, filterKategori) && matchByStatus(d, filterStatus)
    )
  }, [daerahList, filterKategori, filterStatus, matchByKategori, matchByStatus])

  const filteredDaerah = useMemo(() => {
    const qRaw = searchQuery.trim()
    const rows = !qRaw
      ? dataAfterFilters
      : dataAfterFilters.filter(
          (d) =>
            (d.kategori && d.kategori.toLowerCase().includes(qRaw.toLowerCase())) ||
            (d.daerah && d.daerah.toLowerCase().includes(qRaw.toLowerCase())) ||
            (d.keterangan && d.keterangan.toLowerCase().includes(qRaw.toLowerCase()))
        )
    const rankKategori = (k) => {
      const idx = KATEGORI_OPTIONS.findIndex((o) => o.value === String(k ?? '').trim())
      return idx === -1 ? 99 : idx
    }
    return [...rows].sort((a, b) => {
      const rk = rankKategori(a.kategori) - rankKategori(b.kategori)
      if (rk !== 0) return rk
      return String(a.daerah ?? '').localeCompare(String(b.daerah ?? ''), 'id', { sensitivity: 'base', numeric: true })
    })
  }, [dataAfterFilters, searchQuery])

  const kamarCountByDaerah = useMemo(() => {
    const counts = {}
    kamarList.forEach((k) => {
      const id = k?.id_daerah != null ? String(k.id_daerah) : ''
      if (!id) return
      counts[id] = (counts[id] || 0) + 1
    })
    return counts
  }, [kamarList])

  /** Hanya santri status Mukim (per kamar), untuk badge di offcanvas list kamar */
  const santriMukimCountByKamar = useMemo(() => {
    const counts = {}
    santriMasterList.forEach((s) => {
      const id = s.id_kamar != null && s.id_kamar !== '' ? String(s.id_kamar) : ''
      if (!id) return
      const st = String(s.status_santri ?? '').trim().toLowerCase()
      if (st !== 'mukim') return
      counts[id] = (counts[id] || 0) + 1
    })
    return counts
  }, [santriMasterList])

  const santriOffcanvasRows = useMemo(() => {
    if (!santriOffcanvasKamar?.id) return []
    const kid = String(santriOffcanvasKamar.id)
    return santriMasterList.filter((s) => s.id_kamar != null && String(s.id_kamar) === kid)
  }, [santriMasterList, santriOffcanvasKamar])

  const statusLabel = useCallback((v) => (v === 'aktif' ? 'Aktif' : v === 'nonaktif' ? 'Nonaktif' : v), [])

  const kamarOffcanvasFiltered = useMemo(() => {
    const rows =
      kamarOffcanvasFilterStatus === ''
        ? kamarOffcanvasList
        : kamarOffcanvasList.filter(
            (k) => normalizeStatus(k.status) === normalizeStatus(kamarOffcanvasFilterStatus)
          )
    const rankKategori = (kat) => {
      const idx = KATEGORI_OPTIONS.findIndex((o) => o.value === String(kat ?? '').trim())
      return idx === -1 ? 99 : idx
    }
    return [...rows].sort((a, b) => {
      const rk =
        rankKategori(a.daerah_kategori ?? kamarOffcanvasDaerah?.kategori) -
        rankKategori(b.daerah_kategori ?? kamarOffcanvasDaerah?.kategori)
      if (rk !== 0) return rk
      const rd = String(a.daerah_nama ?? '').localeCompare(String(b.daerah_nama ?? ''), 'id', {
        sensitivity: 'base',
        numeric: true
      })
      if (rd !== 0) return rd
      return String(a.kamar ?? '').localeCompare(String(b.kamar ?? ''), 'id', { sensitivity: 'base', numeric: true })
    })
  }, [kamarOffcanvasList, kamarOffcanvasFilterStatus, kamarOffcanvasDaerah])

  const kamarOffcanvasStatusCounts = useMemo(() => {
    let aktif = 0
    let nonaktif = 0
    kamarOffcanvasList.forEach((k) => {
      const s = normalizeStatus(k.status)
      if (s === 'aktif') aktif += 1
      else if (s === 'nonaktif') nonaktif += 1
    })
    return { aktif, nonaktif }
  }, [kamarOffcanvasList])

  const { kategoriOptions, statusOptions } = useMemo(() => {
    const base = daerahList
    const kategoriCounts = {}
    base.forEach((d) => {
      const k = d.kategori != null ? String(d.kategori) : ''
      if (k === '') return
      kategoriCounts[k] = (kategoriCounts[k] || 0) + 1
    })
    const kategoriOptions = Object.entries(kategoriCounts)
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const statusCounts = {}
    base.forEach((d) => {
      const s = normalizeStatus(d.status) || '(tanpa status)'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })
    const statusOptions = Object.entries(statusCounts)
      .filter(([value]) => value !== '(tanpa status)' && value !== '')
      .map(([value, count]) => ({ value, label: statusLabel(value), count }))

    return { kategoriOptions, statusOptions }
  }, [daerahList, statusLabel])

  const loadPengurusDaerah = useCallback(async (idDaerah) => {
    if (!idDaerah) return
    try {
      const res = await daerahPengurusAPI.getAll({ id_daerah: idDaerah })
      if (res.success && res.data) {
        setPengurusDaerahList(res.data)
      }
    } catch (err) {
      console.error('Error loading pengurus daerah:', err)
    }
  }, [])

  useEffect(() => {
    if (offcanvasOpen && editingDaerah?.id) {
      loadPengurusDaerah(editingDaerah.id)
    } else {
      setPengurusDaerahList([])
    }
  }, [offcanvasOpen, editingDaerah?.id, loadPengurusDaerah])

  const handleOpenOffcanvas = (daerah = null, options = {}) => {
    const keepKamarOpen = options.keepKamarOpen === true
    const hadKamar = kamarOffcanvasOpen
    const hadSantri = santriOffcanvasOpen
    if (!keepKamarOpen) {
      handleCloseKamarOffcanvas({ fromPopstate: true, skipHistorySync: true })
      if (hadKamar) syncHistoryGo(hadSantri ? 2 : 1)
    } else {
      handleCloseSantriOffcanvas()
      if (hadSantri) syncHistoryGo(1)
    }
    if (daerah) {
      setEditingDaerah(daerah)
      setFormData({
        kategori: daerah.kategori || 'Banin',
        daerah: daerah.daerah || '',
        keterangan: daerah.keterangan || '',
        status: daerah.status || 'aktif'
      })
    } else {
      setEditingDaerah(null)
      setFormData({
        kategori: filterKategori || 'Banin',
        daerah: '',
        keterangan: '',
        status: 'aktif'
      })
    }
    const wasOffcanvasOpen = offcanvasOpen
    setOffcanvasOpen(true)
    if (!wasOffcanvasOpen) pushPanelHistory('daerah')
  }

  const handleCloseOffcanvas = (fromProgrammatic = false) => {
    setOffcanvasOpen(false)
    setEditingDaerah(null)
    setPengurusOffcanvasOpen(false)
    setPengurusPickerOpen(false)
    setPengurusPickMeta(null)
    setPengurusDaerahList([])
    setFormData({ kategori: 'Banin', daerah: '', keterangan: '', status: 'aktif' })
    if (
      fromProgrammatic &&
      typeof window !== 'undefined' &&
      window.history &&
      panelHistoryCountRef.current > 0
    ) {
      isProgrammaticBackRef.current = true
      window.history.go(-1)
    }
  }

  const handleCloseSantriOffcanvas = () => {
    setSantriOffcanvasOpen(false)
    setSantriOffcanvasKamar(null)
  }

  const handleToggleSantriFromKamarList = (kamar) => {
    if (!kamar?.id) return
    const same = santriOffcanvasOpen && String(santriOffcanvasKamar?.id) === String(kamar.id)
    if (same) {
      handleCloseSantriOffcanvas()
      syncHistoryGo(1)
      return
    }
    setSantriOffcanvasKamar(kamar)
    setSantriOffcanvasOpen(true)
    pushPanelHistory('santri')
  }

  const handleCloseKamarOffcanvas = (opts = {}) => {
    const fromPopstate = opts.fromPopstate === true
    const skipHistorySync = opts.skipHistorySync === true
    const hadSantri = santriOffcanvasOpen
    handleCloseSantriOffcanvas()
    setKamarOffcanvasOpen(false)
    setKamarOffcanvasDaerah(null)
    setKamarOffcanvasList([])
    setKamarOffcanvasLoading(false)
    setKamarOffcanvasFilterStatus('aktif')
    if (fromPopstate || skipHistorySync) return
    if (typeof window !== 'undefined' && window.history && panelHistoryCountRef.current > 0) {
      const n = Math.min(panelHistoryCountRef.current, hadSantri ? 2 : 1)
      if (n > 0) syncHistoryGo(n)
    }
  }

  const handleToggleKamarOffcanvas = async (daerah) => {
    if (!daerah?.id) return
    const sameDaerah = kamarOffcanvasOpen && String(kamarOffcanvasDaerah?.id) === String(daerah.id)
    if (sameDaerah) {
      handleCloseKamarOffcanvas()
      return
    }
    const introducingKamarLayer = !kamarOffcanvasOpen
    const hadSantri = santriOffcanvasOpen
    handleCloseSantriOffcanvas()
    if (hadSantri) syncHistoryGo(1)
    setKamarOffcanvasFilterStatus('aktif')
    setKamarOffcanvasDaerah(daerah)
    setKamarOffcanvasOpen(true)
    if (introducingKamarLayer) pushPanelHistory('kamar')
    setKamarOffcanvasLoading(true)
    try {
      const res = await daerahKamarAPI.getAll({ id_daerah: daerah.id })
      if (res?.success) {
        setKamarOffcanvasList(Array.isArray(res.data) ? res.data : [])
      } else {
        setKamarOffcanvasList([])
      }
    } catch (_) {
      setKamarOffcanvasList([])
    } finally {
      setKamarOffcanvasLoading(false)
    }
  }

  const handleOpenPengurusOffcanvas = () => {
    setEditingPengurus(null)
    setPengurusPickMeta(null)
    setPengurusPickerOpen(false)
    setPengurusFormData({
      id_pengurus: '',
      id_jabatan: '',
      tahun_ajaran: '',
      status: 'aktif',
      keterangan: ''
    })
    ;(async () => {
      try {
        const jb = await jabatanAPI.getList({})
        if (jb?.data) setJabatanMaster(Array.isArray(jb.data) ? jb.data : [])
      } catch (_) {}
    })()
    if (!pengurusOffcanvasOpen) pushPanelHistory('pengurus')
    setPengurusOffcanvasOpen(true)
  }

  const handleEditPengurusOffcanvas = (row) => {
    setEditingPengurus(row)
    setPengurusPickerOpen(false)
    setPengurusFormData({
      id_pengurus: row.id_pengurus != null ? String(row.id_pengurus) : '',
      id_jabatan: row.id_jabatan != null ? String(row.id_jabatan) : '',
      tahun_ajaran: row.tahun_ajaran || '',
      status: row.status || 'aktif',
      keterangan: row.keterangan || ''
    })
    setPengurusPickMeta({
      id: row.id_pengurus,
      nama: row.pengurus_nama,
      nip: row.pengurus_nip != null && row.pengurus_nip !== '' ? String(row.pengurus_nip) : null
    })
    ;(async () => {
      try {
        const jb = await jabatanAPI.getList({})
        if (jb?.data) setJabatanMaster(Array.isArray(jb.data) ? jb.data : [])
      } catch (_) {}
    })()
    if (!pengurusOffcanvasOpen) pushPanelHistory('pengurus')
    setPengurusOffcanvasOpen(true)
  }

  const handlePickPengurusFromOffcanvas = useCallback((p) => {
    if (p == null || p.id == null) return
    setPengurusFormData((prev) => ({ ...prev, id_pengurus: String(p.id) }))
    setPengurusPickMeta({
      id: p.id,
      nama: p.nama,
      nip: p.nip != null && p.nip !== '' ? String(p.nip) : null
    })
    setPengurusPickerOpen(false)
  }, [])

  const handleClosePengurusOffcanvas = () => {
    setPengurusOffcanvasOpen(false)
    setPengurusPickerOpen(false)
    setPengurusPickMeta(null)
    setEditingPengurus(null)
    if (editingDaerah?.id) loadPengurusDaerah(editingDaerah.id)
  }

  const daerahPanelUiRef = useRef({
    pengurusOpen: false,
    santriOpen: false,
    offcanvasOpen: false,
    kamarOpen: false
  })
  const daerahPanelCloseRef = useRef({
    pengurus: () => {},
    santri: () => {},
    offcanvas: () => {},
    kamar: () => {}
  })
  daerahPanelUiRef.current = {
    pengurusOpen: pengurusOffcanvasOpen,
    santriOpen: santriOffcanvasOpen,
    offcanvasOpen,
    kamarOpen: kamarOffcanvasOpen
  }
  daerahPanelCloseRef.current = {
    pengurus: handleClosePengurusOffcanvas,
    santri: () => handleCloseSantriOffcanvas(),
    offcanvas: () => handleCloseOffcanvas(),
    kamar: () => handleCloseKamarOffcanvas({ fromPopstate: true })
  }

  useEffect(() => {
    return registerDomisiliPopstateLayer('daerah-panels', DOMISILI_POP_PRIORITY.daerahPanels, () => {
      if (isProgrammaticBackRef.current) {
        panelHistoryCountRef.current = Math.max(0, panelHistoryCountRef.current - 1)
        if (panelHistoryCountRef.current <= 0) isProgrammaticBackRef.current = false
        return true
      }
      if (panelHistoryCountRef.current <= 0) return false
      panelHistoryCountRef.current = Math.max(0, panelHistoryCountRef.current - 1)
      const u = daerahPanelUiRef.current
      const c = daerahPanelCloseRef.current
      if (u.pengurusOpen) c.pengurus()
      else if (u.santriOpen) c.santri()
      else if (u.offcanvasOpen) c.offcanvas()
      else if (u.kamarOpen) c.kamar()
      return true
    })
  }, [])

  const handleSubmitPengurus = async (e) => {
    e.preventDefault()
    if (!editingDaerah?.id) return
    if (!pengurusFormData.id_pengurus) {
      showNotification('Pengurus wajib dipilih', 'error')
      return
    }
    setSavingPengurus(true)
    try {
      const payload = {
        id_daerah: editingDaerah.id,
        id_pengurus: pengurusFormData.id_pengurus || null,
        id_jabatan: pengurusFormData.id_jabatan || null,
        tahun_ajaran: pengurusFormData.tahun_ajaran || null,
        status: pengurusFormData.status || 'aktif',
        keterangan: pengurusFormData.keterangan || null
      }
      if (editingPengurus?.id) {
        const res = await daerahPengurusAPI.update(editingPengurus.id, payload)
        if (res.success) {
          showNotification('Pengurus daerah berhasil diupdate', 'success')
          handleClosePengurusOffcanvas()
          if (panelHistoryCountRef.current > 0) {
            isProgrammaticBackRef.current = true
            window.history.back()
          }
          loadPengurusDaerah(editingDaerah.id)
        } else {
          showNotification(res.message || 'Gagal mengupdate pengurus daerah', 'error')
        }
      } else {
        const res = await daerahPengurusAPI.create(payload)
        if (res.success) {
          showNotification('Pengurus daerah berhasil ditambahkan', 'success')
          handleClosePengurusOffcanvas()
          if (panelHistoryCountRef.current > 0) {
            isProgrammaticBackRef.current = true
            window.history.back()
          }
          loadPengurusDaerah(editingDaerah.id)
        } else {
          showNotification(res.message || 'Gagal menambahkan pengurus daerah', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving pengurus daerah:', err)
      showNotification('Terjadi kesalahan saat menyimpan', 'error')
    } finally {
      setSavingPengurus(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.daerah?.trim()) {
      showNotification('Daerah wajib diisi', 'error')
      return
    }
    setSaving(true)
    try {
      if (editingDaerah) {
        const response = await daerahAPI.update(editingDaerah.id, formData)
        if (response.success) {
          showNotification('Daerah berhasil diupdate', 'success')
          handleCloseOffcanvas(true)
          loadDaerah({ background: true })
        } else {
          showNotification(response.message || 'Gagal mengupdate daerah', 'error')
        }
      } else {
        const response = await daerahAPI.create(formData)
        if (response.success) {
          showNotification('Daerah berhasil ditambahkan', 'success')
          handleCloseOffcanvas(true)
          loadDaerah({ background: true })
        } else {
          showNotification(response.message || 'Gagal menambahkan daerah', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving daerah:', err)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSetStatusDaerah = async (id, status) => {
    try {
      const res = await daerahAPI.setStatus(id, status)
      if (res.success) {
        showNotification(res.message || 'Status diubah', 'success')
        loadDaerah({ background: true })
        if (editingDaerah?.id === id) {
          setEditingDaerah((prev) => (prev ? { ...prev, status } : null))
        }
      } else {
        showNotification(res.message || 'Gagal mengubah status', 'error')
      }
    } catch (err) {
      showNotification('Gagal mengubah status', 'error')
    }
  }

  const handleSetStatusPengurus = async (id, status) => {
    try {
      const res = await daerahPengurusAPI.setStatus(id, status)
      if (res.success) {
        showNotification(res.message || 'Status diubah', 'success')
        if (editingDaerah?.id) loadPengurusDaerah(editingDaerah.id)
      } else {
        showNotification(res.message || 'Gagal mengubah status', 'error')
      }
    } catch (err) {
      showNotification('Gagal mengubah status', 'error')
    }
  }

  const pengurusAktif = useMemo(() => pengurusDaerahList.filter((p) => normalizeStatus(p.status) === 'aktif'), [pengurusDaerahList])
  const pengurusRiwayat = useMemo(() => pengurusDaerahList.filter((p) => normalizeStatus(p.status) !== 'aktif'), [pengurusDaerahList])

  const pengurusFormLabel = useMemo(() => {
    const id = pengurusFormData.id_pengurus
    if (!id) return ''
    if (pengurusPickMeta != null && String(pengurusPickMeta.id) === String(id)) {
      const n = pengurusPickMeta.nama || '—'
      const nip = pengurusPickMeta.nip != null && pengurusPickMeta.nip !== '' ? ` — NIP ${pengurusPickMeta.nip}` : ''
      return `${n}${nip}`
    }
    return `Pengurus #${id}`
  }, [pengurusFormData.id_pengurus, pengurusPickMeta])

  const onHistoryBackOrElse = (fallback) => {
    if (panelHistoryCountRef.current > 0) window.history.back()
    else fallback()
  }

  const onCloseKamarChrome = () => {
    if (santriOffcanvasOpen) handleCloseKamarOffcanvas()
    else onHistoryBackOrElse(handleCloseKamarOffcanvas)
  }

  const handleEditKamarFromSantriOffcanvas = useCallback(() => {
    if (!santriOffcanvasKamar?.id) return
    setKamarEditingRow(santriOffcanvasKamar)
    setKamarEditOpen(true)
  }, [santriOffcanvasKamar])

  const handleCloseKamarEdit = useCallback(() => {
    setKamarEditOpen(false)
    setKamarEditingRow(null)
  }, [])

  const handleKamarEditSaved = async () => {
    await loadDaerah({ background: true })
    if (kamarOffcanvasOpen && kamarOffcanvasDaerah?.id) {
      try {
        const res = await daerahKamarAPI.getAll({ id_daerah: kamarOffcanvasDaerah.id })
        if (res?.success) {
          const list = Array.isArray(res.data) ? res.data : []
          setKamarOffcanvasList(list)
          setSantriOffcanvasKamar((prev) => {
            if (!prev?.id) return prev
            const u = list.find((k) => String(k.id) === String(prev.id))
            return u || prev
          })
        }
      } catch (_) {}
    }
  }

  if (loading && daerahList.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="container mx-auto px-4 py-6 max-w-7xl flex-shrink-0">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
          <div className="relative pb-2 px-4 pt-3">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Cari kategori, daerah..."
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
                <button type="button" onClick={loadDaerah} className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto" title="Refresh">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
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
                className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="px-4 py-2">
                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-xs text-gray-600 dark:text-gray-400">Kategori:</span>
                    <select
                      value={filterKategori}
                      onChange={(e) => setFilterKategori(e.target.value)}
                      className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[140px]"
                    >
                      <option value="">Semua</option>
                      {kategoriOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Status:</span>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">Semua</option>
                      {statusOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                      ))}
                    </select>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredDaerah.length}</span>
            </span>
            <button type="button" onClick={() => handleOpenOffcanvas()} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Daerah
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="grid grid-cols-1 min-[900px]:grid-cols-2 xl:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredDaerah.map((daerah, index) => (
                <motion.div
                  key={daerah.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.03 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggleKamarOffcanvas(daerah)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleKamarOffcanvas(daerah) } }}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border cursor-pointer hover:shadow-lg transition-all ${
                    daerah.status === 'nonaktif' ? 'border-gray-200 dark:border-gray-700 opacity-75' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="grid min-w-0 flex-1 grid-cols-2 grid-rows-[auto_auto] gap-x-0 gap-y-2">
                      <div className="row-span-2 flex min-w-0 items-center border-r border-gray-200 pr-3 dark:border-gray-600">
                        <h3 className="w-full min-w-0 text-xl font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-50 sm:text-2xl">
                          {daerah.daerah}
                        </h3>
                      </div>
                      <div className="col-start-2 flex min-w-0 justify-end">
                        <span className={kategoriBadgeClass(daerah.kategori)}>
                          {daerah.kategori || '–'}
                        </span>
                      </div>
                      <div className="col-start-2 flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                        {filterStatus === '' && (
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              daerah.status === 'aktif' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                            }`}
                          >
                            {daerah.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h18M5 7v11a2 2 0 002 2h10a2 2 0 002-2V7m-9 4h4" />
                          </svg>
                          {Number(kamarCountByDaerah[String(daerah.id)] || 0)} kamar
                        </span>
                      </div>
                    </div>
                    <svg className="w-5 h-5 shrink-0 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {daerah.keterangan && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{daerah.keterangan}</p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredDaerah.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery || filterKategori || filterStatus ? 'Tidak ada daerah yang sesuai filter' : 'Belum ada data daerah'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Offcanvas Daerah */}
      {createPortal(
        <AnimatePresence>
          {offcanvasOpen && (
            <>
              <motion.div key="daerah-offcanvas-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onHistoryBackOrElse(handleCloseOffcanvas)} className="fixed inset-0 bg-black/50 z-[200]" />
              <motion.div
                key="daerah-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between flex-shrink-0 gap-2">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onHistoryBackOrElse(handleCloseOffcanvas)}
                      className="mb-1 inline-flex items-center gap-1 text-sm text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                      </svg>
                      Kembali
                    </button>
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{editingDaerah ? 'Edit Daerah' : 'Tambah Daerah'}</h3>
                  </div>
                  <button type="button" onClick={() => onHistoryBackOrElse(handleCloseOffcanvas)} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 shrink-0" aria-label="Tutup">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kategori</label>
                      <select
                        value={formData.kategori}
                        onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                      >
                        {KATEGORI_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Daerah <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.daerah}
                        onChange={(e) => setFormData({ ...formData, daerah: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Nama daerah"
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
                        <span className="text-sm text-gray-600 dark:text-gray-400">{formData.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={formData.status === 'aktif'}
                          onClick={() => setFormData({ ...formData, status: formData.status === 'aktif' ? 'nonaktif' : 'aktif' })}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${formData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${formData.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </div>
                    </div>

                    {editingDaerah?.id && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Pengurus Daerah</h4>
                          <button type="button" onClick={handleOpenPengurusOffcanvas} className="px-2 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah
                          </button>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/20 p-2">
                            <p className="text-xs font-medium text-green-800 dark:text-green-300 mb-1.5">Pengurus Aktif</p>
                            {pengurusAktif.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada.</p>
                            ) : (
                              <ul className="space-y-1">
                                {pengurusAktif.map((p) => (
                                  <li
                                    key={p.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={(ev) => { ev.stopPropagation(); handleEditPengurusOffcanvas(p) }}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEditPengurusOffcanvas(p) } }}
                                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-green-100 dark:hover:bg-green-800/30 cursor-pointer text-sm"
                                  >
                                    <span className="text-gray-800 dark:text-gray-200">{p.pengurus_nama || '(Tanpa nama)'} — {p.jabatan_nama || '-'}</span>
                                    <button type="button" onClick={(ev) => { ev.stopPropagation(); handleSetStatusPengurus(p.id, 'nonaktif') }} className="text-xs text-amber-600 hover:underline">Nonaktifkan</button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-700/30 p-2">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Riwayat</p>
                            {pengurusRiwayat.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400">Tidak ada.</p>
                            ) : (
                              <ul className="space-y-1">
                                {pengurusRiwayat.map((p) => (
                                  <li
                                    key={p.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleEditPengurusOffcanvas(p)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEditPengurusOffcanvas(p) } }}
                                    className="flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-600/50 cursor-pointer text-sm text-gray-600 dark:text-gray-400"
                                  >
                                    <span>{p.pengurus_nama || '-'} — {p.jabatan_nama || '-'} ({p.tahun_ajaran || '-'})</span>
                                    <button type="button" onClick={(ev) => { ev.stopPropagation(); handleSetStatusPengurus(p.id, 'aktif') }} className="text-xs text-teal-600 hover:underline">Aktifkan</button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 flex-shrink-0">
                    <button type="button" onClick={() => onHistoryBackOrElse(handleCloseOffcanvas)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm">Batal</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
                      {saving ? 'Menyimpan...' : (editingDaerah ? 'Simpan Perubahan' : 'Tambah')}
                    </button>
                  </div>
                </form>
              </motion.div>

              {/* Offcanvas Tambah/Edit Pengurus Daerah */}
              <AnimatePresence>
                {pengurusOffcanvasOpen && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onHistoryBackOrElse(handleClosePengurusOffcanvas)} className="fixed inset-0 bg-black/50 z-[202]" />
                    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.2 }} className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[203] flex flex-col">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{editingPengurus ? 'Edit Pengurus Daerah' : 'Tambah Pengurus Daerah'}</h3>
                        <button type="button" onClick={() => onHistoryBackOrElse(handleClosePengurusOffcanvas)} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" aria-label="Tutup">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <form onSubmit={handleSubmitPengurus} className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tahun Ajaran</label>
                            <select
                              value={pengurusFormData.tahun_ajaran}
                              onChange={(e) => setPengurusFormData({ ...pengurusFormData, tahun_ajaran: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Tahun Ajaran --</option>
                              {tahunAjaranOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pengurus</label>
                            <div className="flex flex-wrap items-stretch gap-2">
                              <div className="min-h-[42px] min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700">
                                {pengurusFormData.id_pengurus ? (
                                  <span className="text-gray-900 dark:text-gray-100">{pengurusFormLabel}</span>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">Belum dipilih — buka Cari pengurus</span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => setPengurusPickerOpen(true)}
                                className="shrink-0 rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-100 dark:border-teal-500 dark:bg-teal-900/30 dark:text-teal-200 dark:hover:bg-teal-900/50"
                              >
                                Cari pengurus
                              </button>
                              {pengurusFormData.id_pengurus ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPengurusFormData({ ...pengurusFormData, id_pengurus: '' })
                                    setPengurusPickMeta(null)
                                  }}
                                  className="shrink-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                                >
                                  Hapus
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Jabatan</label>
                            <select
                              value={pengurusFormData.id_jabatan}
                              onChange={(e) => setPengurusFormData({ ...pengurusFormData, id_jabatan: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Jabatan --</option>
                              {jabatanMaster.map((j) => (
                                <option key={j.id} value={j.id}>{j.nama || `ID ${j.id}`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-gray-600 dark:text-gray-400">{pengurusFormData.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span>
                              <button
                                type="button"
                                onClick={() => setPengurusFormData({ ...pengurusFormData, status: pengurusFormData.status === 'aktif' ? 'nonaktif' : 'aktif' })}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${pengurusFormData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                              >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${pengurusFormData.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'}`} />
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keterangan</label>
                            <textarea
                              value={pengurusFormData.keterangan}
                              onChange={(e) => setPengurusFormData({ ...pengurusFormData, keterangan: e.target.value })}
                              rows={2}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                              placeholder="Opsional"
                            />
                          </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 flex-shrink-0">
                          <button type="button" onClick={() => onHistoryBackOrElse(handleClosePengurusOffcanvas)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">Batal</button>
                          <button type="submit" disabled={savingPengurus} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm">
                            {savingPengurus ? 'Menyimpan...' : (editingPengurus ? 'Simpan Perubahan' : 'Simpan')}
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

      {/* Offcanvas Daftar Kamar per Daerah */}
      {createPortal(
        <AnimatePresence>
          {kamarOffcanvasOpen && (
            <>
              <motion.div key="daerah-kamar-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCloseKamarChrome} className="fixed inset-0 bg-black/50 z-[190]" />
              <motion.div
                key="daerah-kamar-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[191] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3 flex-shrink-0">
                  <h3 className="min-w-0 flex-1 text-2xl font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
                    {kamarOffcanvasDaerah?.daerah || 'Daerah'}
                  </h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={kategoriBadgeClass(kamarOffcanvasDaerah?.kategori)}>
                      {kamarOffcanvasDaerah?.kategori || '–'}
                    </span>
                    <button type="button" onClick={onCloseKamarChrome} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" aria-label="Tutup">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="text-gray-600 dark:text-gray-400">Total kamar</span>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{kamarOffcanvasFiltered.length}</span>
                    {kamarOffcanvasList.length > 0 && kamarOffcanvasFiltered.length !== kamarOffcanvasList.length && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">(dari {kamarOffcanvasList.length})</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      value={kamarOffcanvasFilterStatus}
                      onChange={(e) => setKamarOffcanvasFilterStatus(e.target.value)}
                      aria-label="Filter status kamar"
                      className="rounded border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 min-w-[7.5rem]"
                    >
                      <option value="">Semua ({kamarOffcanvasList.length})</option>
                      <option value="aktif">Aktif ({kamarOffcanvasStatusCounts.aktif})</option>
                      <option value="nonaktif">Nonaktif ({kamarOffcanvasStatusCounts.nonaktif})</option>
                    </select>
                    {kamarOffcanvasDaerah && (
                      <button
                        type="button"
                        onClick={() => handleOpenOffcanvas(kamarOffcanvasDaerah, { keepKamarOpen: true })}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {kamarOffcanvasLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent" />
                    </div>
                  ) : kamarOffcanvasList.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-6">Belum ada kamar pada daerah ini.</p>
                  ) : kamarOffcanvasFiltered.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-6">Tidak ada kamar yang sesuai filter status.</p>
                  ) : (
                    <ul className="space-y-2">
                      {kamarOffcanvasFiltered.map((kamar) => (
                        <li
                          key={kamar.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleToggleSantriFromKamarList(kamar)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              handleToggleSantriFromKamarList(kamar)
                            }
                          }}
                          className="cursor-pointer rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2 transition-colors hover:border-teal-300 hover:bg-teal-50/50 dark:border-gray-700 dark:bg-gray-700/30 dark:hover:border-teal-700 dark:hover:bg-teal-900/20"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                              {(kamarOffcanvasDaerah?.daerah || 'Daerah').trim()}.{String(kamar.kamar || '-').trim()}
                            </p>
                            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-300">
                                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                </svg>
                                {Number(santriMukimCountByKamar[String(kamar.id)] || 0)} mukim
                              </span>
                              {kamarOffcanvasFilterStatus === '' && (
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    normalizeStatus(kamar.status) === 'aktif'
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                                  }`}
                                >
                                  {normalizeStatus(kamar.status) === 'aktif' ? 'Aktif' : 'Nonaktif'}
                                </span>
                              )}
                            </div>
                          </div>
                          {kamar.keterangan && (
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{kamar.keterangan}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      <SantriPerKamarOffcanvas
        variant="daerah"
        open={santriOffcanvasOpen}
        kamar={santriOffcanvasKamar}
        rows={santriOffcanvasRows}
        onClose={() => onHistoryBackOrElse(handleCloseSantriOffcanvas)}
        onEditKamar={handleEditKamarFromSantriOffcanvas}
        daerahList={daerahList}
        kamarList={kamarList}
        onSantriListChanged={() => loadDaerah({ background: true })}
        tahunAjaranHijriyah={tahunAjaran}
        tahunAjaranMasehi={tahunAjaranMasehi}
      />

      <KamarEditOffcanvas
        host="daerah"
        open={kamarEditOpen}
        onClose={handleCloseKamarEdit}
        editingKamar={kamarEditingRow}
        defaultDaerahId=""
        daerahList={daerahList}
        tahunAjaranOptions={tahunAjaranOptions}
        onSaved={handleKamarEditSaved}
      />

      <CariPengurusOffcanvas
        isOpen={pengurusPickerOpen}
        onClose={() => setPengurusPickerOpen(false)}
        onSelect={handlePickPengurusFromOffcanvas}
        title="Cari Pengurus"
      />
    </div>
  )
}

export default Daerah
