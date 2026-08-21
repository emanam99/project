import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { jabatanAPI } from '../../services/api'
import api from '../../services/api'
import Modal from '../../components/Modal/Modal'
import { useNotification } from '../../contexts/NotificationContext'
import { useLembagaFilterAccess } from '../../hooks/useLembagaFilterAccess'
import { LEMBAGA_FILTER_ACTION_CODES } from '../../config/lembagaFilterFiturCodes'
import MultiSelectFilter from '../Pembayaran/components/MultiSelectFilter'

function rowMatchesMultiFilter(value, selected) {
  if (!selected?.length) return true
  return selected.includes(String(value ?? ''))
}

function lembagaKategoriOf(j) {
  return String(j.lembaga_kategori ?? j.kategori ?? '').trim()
}

/** Nilai filter untuk jabatan tanpa tipe terisi. */
const TIPE_FILTER_EMPTY = '__tanpa_tipe__'

function jabatanTipeFilterValue(j) {
  const t = String(j.tipe ?? '').trim()
  return t !== '' ? t : TIPE_FILTER_EMPTY
}

/** Hindari setState bila isi array filter tidak berubah (cegah loop render). */
function pruneMultiFilterSelection(prev, validSet) {
  const next = prev.filter((v) => validSet.has(v))
  if (next.length === prev.length && next.every((v, i) => v === prev[i])) {
    return prev
  }
  return next
}

const stripHtmlToText = (html) => {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatRpJabatan(n) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n))
}

function parseMoneyFormValue(val) {
  if (val === '' || val == null) return null
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

const defaultBulkJabatanForm = () => ({
  applyTipe: false,
  tipeClear: false,
  tipe: '',
  applyLembaga: false,
  lembagaClear: false,
  lembaga_id: '',
  applyStatus: false,
  status: 'aktif',
  applyUrutan: false,
  urutan: 0,
  applyBonus: false,
  bonusClear: false,
  bonus: '',
  applyPerJp: false,
  perJpClear: false,
  per_jp: ''
})

function buildBulkJabatanPayload(form) {
  const payload = {}
  if (form.applyTipe) {
    payload.tipe = form.tipeClear ? null : (String(form.tipe || '').trim() || null)
  }
  if (form.applyLembaga) {
    payload.lembaga_id = form.lembagaClear ? null : form.lembaga_id || null
  }
  if (form.applyStatus) payload.status = form.status
  if (form.applyUrutan) payload.urutan = parseInt(String(form.urutan), 10) || 0
  if (form.applyBonus) {
    payload.bonus = form.bonusClear ? null : parseMoneyFormValue(form.bonus)
  }
  if (form.applyPerJp) {
    payload.per_jp = form.perJpClear ? null : parseMoneyFormValue(form.per_jp)
  }
  return payload
}

function ManageJabatan() {
  const { showNotification } = useNotification()
  const [jabatanList, setJabatanList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState([])
  const [tipeFilter, setTipeFilter] = useState([])
  const [lembagaFilter, setLembagaFilter] = useState([])
  const [statusFilter, setStatusFilter] = useState([])
  const [openFilterKey, setOpenFilterKey] = useState(null)
  const [filterPosition, setFilterPosition] = useState({ top: 0, left: 0, width: 200 })
  const filterContainerRef = useRef(null)
  const filterDropdownRef = useRef(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingJabatan, setEditingJabatan] = useState(null)
  const [lembagaList, setLembagaList] = useState([])
  const [formData, setFormData] = useState({
    nama: '',
    tipe: '',
    lembaga_id: '',
    deskripsi: '',
    urutan: 0,
    bonus: '',
    per_jp: '',
    status: 'aktif'
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState([])
  const [bulkOffcanvasOpen, setBulkOffcanvasOpen] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, currentJabatan: null })
  const [bulkForm, setBulkForm] = useState(defaultBulkJabatanForm)
  const lembagaAccess = useLembagaFilterAccess(LEMBAGA_FILTER_ACTION_CODES.jabatanSemua)
  const deskripsiEditorRef = useRef(null)
  const savedSelectionRef = useRef(null)
  const [deskripsiFormat, setDeskripsiFormat] = useState({ bold: false, italic: false, underline: false, bulletList: false, numberedList: false })
  const navigate = useNavigate()

  const updateDeskripsiFormatState = useCallback(() => {
    const el = deskripsiEditorRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) {
      setDeskripsiFormat((prev) => (prev.bold || prev.italic || prev.underline || prev.bulletList || prev.numberedList ? { bold: false, italic: false, underline: false, bulletList: false, numberedList: false } : prev))
      return
    }
    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) return
    const bold = document.queryCommandState('bold')
    const italic = document.queryCommandState('italic')
    const underline = document.queryCommandState('underline')
    let node = range.commonAncestorContainer
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
    else if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement
    let bulletList = false
    let numberedList = false
    while (node && node !== el) {
      const tag = node.tagName ? node.tagName.toUpperCase() : ''
      if (tag === 'UL') { bulletList = true; break }
      if (tag === 'OL') { numberedList = true; break }
      node = node.parentElement
    }
    setDeskripsiFormat((prev) => {
      if (prev.bold === bold && prev.italic === italic && prev.underline === underline && prev.bulletList === bulletList && prev.numberedList === numberedList) return prev
      return { bold, italic, underline, bulletList, numberedList }
    })
  }, [lembagaAccess.allowedLembagaIds])

  const saveDeskripsiSelection = useCallback(() => {
    const el = deskripsiEditorRef.current
    const sel = window.getSelection()
    if (!el || !sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (el.contains(range.commonAncestorContainer)) savedSelectionRef.current = range.cloneRange()
  }, [])

  const applyDeskripsiListCommand = useCallback((isBullet) => {
    const el = deskripsiEditorRef.current
    if (!el) return
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      if (el.contains(range.commonAncestorContainer)) savedSelectionRef.current = range.cloneRange()
    }
    const listHtml = isBullet ? '<ul><li>\u200B</li></ul>' : '<ol><li>\u200B</li></ol>'
    setTimeout(() => {
      el.focus()
      const sel2 = window.getSelection()
      if (savedSelectionRef.current) {
        try {
          sel2.removeAllRanges()
          sel2.addRange(savedSelectionRef.current)
        } catch (_) {}
      }
      document.execCommand('insertHTML', false, listHtml)
      setTimeout(updateDeskripsiFormatState, 0)
    }, 0)
  }, [updateDeskripsiFormatState])

  useEffect(() => {
    loadLembaga()
  }, [lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    if (offcanvasOpen && deskripsiEditorRef.current) {
      deskripsiEditorRef.current.innerHTML = formData.deskripsi || ''
    }
    if (!offcanvasOpen) setDeskripsiFormat({ bold: false, italic: false, underline: false, bulletList: false, numberedList: false })
  }, [offcanvasOpen])

  useEffect(() => {
    if (!offcanvasOpen) return
    const onSelectionChange = () => {
      const el = deskripsiEditorRef.current
      if (el && document.activeElement === el) updateDeskripsiFormatState()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [offcanvasOpen, updateDeskripsiFormatState])

  const loadLembaga = async () => {
    try {
      const response = await api.get('/lembaga')
      if (response.data.success) {
        const rows = response.data.data || []
        if (lembagaAccess.allowedLembagaIds?.length) {
          const allowedSet = new Set(lembagaAccess.allowedLembagaIds.map(String))
          setLembagaList(rows.filter((row) => allowedSet.has(String(row.id))))
        } else {
          setLembagaList(rows)
        }
      }
    } catch (err) {
      console.error('Error loading lembaga:', err)
    }
  }

  const loadJabatan = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const response = await jabatanAPI.getAll({
        limit: 1000,
        lembaga_ids: lembagaAccess.allowedLembagaIds?.length ? lembagaAccess.allowedLembagaIds.join(',') : undefined,
      })
      if (response.success) {
        setJabatanList(response.data?.jabatan || [])
      } else {
        setError(response.message || 'Gagal memuat data jabatan')
      }
    } catch (err) {
      console.error('Error loading jabatan:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data jabatan')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJabatan()
  }, [loadJabatan])

  const normalizeStatus = useCallback((s) => {
    if (!s) return ''
    const t = String(s).toLowerCase().trim()
    if (t === 'aktif' || t === 'active') return 'aktif'
    if (t === 'nonaktif' || t === 'inactive' || t === 'tidak aktif') return 'nonaktif'
    return t
  }, [])

  const dataAfterFilters = useMemo(() => {
    let base = jabatanList
    if (lembagaAccess.allowedLembagaIds?.length) {
      const allowedSet = new Set(lembagaAccess.allowedLembagaIds.map(String))
      base = base.filter((j) => allowedSet.has(String(j.lembaga_id || '')))
    }
    return base.filter(
      (j) =>
        rowMatchesMultiFilter(lembagaKategoriOf(j), kategoriFilter) &&
        rowMatchesMultiFilter(jabatanTipeFilterValue(j), tipeFilter) &&
        rowMatchesMultiFilter(String(j.lembaga_id || ''), lembagaFilter) &&
        rowMatchesMultiFilter(normalizeStatus(j.status), statusFilter)
    )
  }, [jabatanList, kategoriFilter, tipeFilter, lembagaFilter, statusFilter, lembagaAccess.allowedLembagaIds, normalizeStatus])

  const filteredJabatan = useMemo(() => {
    if (!searchQuery.trim()) return dataAfterFilters
    const q = searchQuery.trim().toLowerCase()
    return dataAfterFilters.filter(
      (j) =>
        (j.nama && j.nama.toLowerCase().includes(q)) ||
        (j.tipe && String(j.tipe).toLowerCase().includes(q)) ||
        (j.deskripsi && j.deskripsi.toLowerCase().includes(q)) ||
        (j.lembaga_nama && j.lembaga_nama.toLowerCase().includes(q))
    )
  }, [dataAfterFilters, searchQuery])

  const statusLabel = useCallback((value) => (value === 'aktif' ? 'Aktif' : value === 'nonaktif' ? 'Nonaktif' : value), [])

  const { kategoriOptions, tipeOptions, lembagaFilterGroups, statusOptions } = useMemo(() => {
    const base = jabatanList
    const allowedSet = lembagaAccess.allowedLembagaIds?.length
      ? new Set(lembagaAccess.allowedLembagaIds.map(String))
      : null

    const passesLembagaScope = (j) => !allowedSet || allowedSet.has(String(j.lembaga_id || ''))
    const passesKategori = (j) => rowMatchesMultiFilter(lembagaKategoriOf(j), kategoriFilter)
    const passesTipe = (j) => rowMatchesMultiFilter(jabatanTipeFilterValue(j), tipeFilter)
    const passesLembaga = (j) => rowMatchesMultiFilter(String(j.lembaga_id || ''), lembagaFilter)
    const passesStatus = (j) => rowMatchesMultiFilter(normalizeStatus(j.status), statusFilter)

    const dataForKategori = base.filter(
      (j) => passesLembagaScope(j) && passesTipe(j) && passesLembaga(j) && passesStatus(j)
    )
    const kategoriCounts = {}
    dataForKategori.forEach((j) => {
      const k = lembagaKategoriOf(j)
      if (k) kategoriCounts[k] = (kategoriCounts[k] || 0) + 1
    })
    const kategoriOptions = Object.entries(kategoriCounts)
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const dataForTipe = base.filter(
      (j) => passesLembagaScope(j) && passesKategori(j) && passesLembaga(j) && passesStatus(j)
    )
    const tipeCounts = {}
    dataForTipe.forEach((j) => {
      const t = jabatanTipeFilterValue(j)
      tipeCounts[t] = (tipeCounts[t] || 0) + 1
    })
    const tipeOptions = Object.entries(tipeCounts)
      .map(([value, count]) => ({
        value,
        label: value === TIPE_FILTER_EMPTY ? '(Tanpa tipe)' : value,
        count
      }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || '', 'id'))

    const dataForLembaga = base.filter(
      (j) => passesLembagaScope(j) && passesKategori(j) && passesTipe(j) && passesStatus(j)
    )
    const byKategori = new Map()
    dataForLembaga.forEach((j) => {
      const id = j.lembaga_id != null ? String(j.lembaga_id) : ''
      if (id === '') return
      const kat = lembagaKategoriOf(j) || '(Tanpa kategori)'
      if (!byKategori.has(kat)) byKategori.set(kat, new Map())
      const m = byKategori.get(kat)
      if (!m.has(id)) m.set(id, { value: id, label: j.lembaga_nama || id, count: 0 })
      m.get(id).count += 1
    })
    const lembagaFilterGroups = [...byKategori.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'id'))
      .map(([label, lems]) => ({
        label,
        options: [...lems.values()].sort((a, b) => (a.label || '').localeCompare(b.label || '', 'id'))
      }))

    const dataForStatus = base.filter(
      (j) => passesLembagaScope(j) && passesKategori(j) && passesTipe(j) && passesLembaga(j)
    )
    const statusCounts = {}
    dataForStatus.forEach((j) => {
      const s = normalizeStatus(j.status)
      if (!s) return
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })
    const statusOptions = Object.entries(statusCounts)
      .map(([value, count]) => ({ value, label: statusLabel(value), count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    return { kategoriOptions, tipeOptions, lembagaFilterGroups, statusOptions }
  }, [jabatanList, kategoriFilter, tipeFilter, lembagaFilter, statusFilter, normalizeStatus, statusLabel, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    const allowed = lembagaAccess.allowedLembagaIds
    if (!allowed?.length || allowed.length !== 1) return
    const only = String(allowed[0])
    setLembagaFilter((prev) => {
      if (prev.length === 1 && prev[0] === only) return prev
      return [only]
    })
  }, [lembagaAccess.allowedLembagaIds])

  const kategoriOptionKey = useMemo(
    () => kategoriOptions.map((o) => o.value).join('\u0001'),
    [kategoriOptions]
  )

  const tipeOptionKey = useMemo(
    () => tipeOptions.map((o) => o.value).join('\u0001'),
    [tipeOptions]
  )

  const lembagaOptionKey = useMemo(
    () =>
      lembagaFilterGroups
        .flatMap((g) => g.options.map((o) => o.value))
        .join('\u0001'),
    [lembagaFilterGroups]
  )

  const statusOptionKey = useMemo(
    () => statusOptions.map((o) => o.value).join('\u0001'),
    [statusOptions]
  )

  useEffect(() => {
    const valid = new Set(kategoriOptionKey ? kategoriOptionKey.split('\u0001') : [])
    setKategoriFilter((prev) => pruneMultiFilterSelection(prev, valid))
  }, [kategoriOptionKey])

  useEffect(() => {
    const valid = new Set(tipeOptionKey ? tipeOptionKey.split('\u0001') : [])
    setTipeFilter((prev) => pruneMultiFilterSelection(prev, valid))
  }, [tipeOptionKey])

  useEffect(() => {
    const valid = new Set(lembagaOptionKey ? lembagaOptionKey.split('\u0001') : [])
    if (lembagaAccess.allowedLembagaIds?.length === 1) {
      valid.add(String(lembagaAccess.allowedLembagaIds[0]))
    }
    setLembagaFilter((prev) => pruneMultiFilterSelection(prev, valid))
  }, [lembagaOptionKey, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    const valid = new Set(statusOptionKey ? statusOptionKey.split('\u0001') : [])
    setStatusFilter((prev) => pruneMultiFilterSelection(prev, valid))
  }, [statusOptionKey])

  const handleFilterOpen = useCallback((key, rect) => {
    setOpenFilterKey(key)
    if (rect) {
      setFilterPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width || 200, 220)
      })
    }
  }, [])

  useEffect(() => {
    if (!openFilterKey) return
    const handleClickOutside = (e) => {
      const inDropdown = filterDropdownRef.current?.contains(e.target)
      const inContainer = filterContainerRef.current?.contains(e.target)
      if (!inDropdown && !inContainer) setOpenFilterKey(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openFilterKey])

  const toggleSelectMode = useCallback(() => {
    setSelectMode((on) => {
      if (on) setSelectedIds([])
      return !on
    })
  }, [])

  const toggleJabatanSelected = useCallback((id) => {
    const nid = Number(id)
    if (!Number.isFinite(nid) || nid <= 0) return
    setSelectedIds((prev) => (prev.includes(nid) ? prev.filter((x) => x !== nid) : [...prev, nid]))
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelectedIds(
      filteredJabatan.map((j) => Number(j.id)).filter((id) => Number.isFinite(id) && id > 0)
    )
  }, [filteredJabatan])

  const clearSelection = useCallback(() => setSelectedIds([]), [])

  const closeBulkOffcanvas = useCallback(() => {
    if (bulkSaving) return
    setBulkOffcanvasOpen(false)
  }, [bulkSaving])

  const jabatanNameById = useMemo(() => {
    const m = new Map()
    for (const j of jabatanList) {
      const id = Number(j.id)
      if (Number.isFinite(id) && id > 0) {
        m.set(id, j.nama || `Jabatan #${id}`)
      }
    }
    return m
  }, [jabatanList])

  const openBulkOffcanvas = useCallback(() => {
    if (selectedIds.length === 0) return
    setBulkForm(defaultBulkJabatanForm())
    setBulkProgress({ current: 0, total: 0, currentJabatan: null })
    setBulkOffcanvasOpen(true)
  }, [selectedIds.length])

  const submitBulkUpdate = async () => {
    const payload = buildBulkJabatanPayload(bulkForm)
    if (Object.keys(payload).length === 0) {
      showNotification('Centang minimal satu field yang ingin diubah', 'error')
      return
    }
    const total = selectedIds.length
    setBulkSaving(true)
    setBulkProgress({ current: 0, total, currentJabatan: null })
    let ok = 0
    let fail = 0
    try {
      for (let i = 0; i < selectedIds.length; i++) {
        const id = selectedIds[i]
        const label = jabatanNameById.get(Number(id)) || `ID ${id}`
        setBulkProgress({ current: i + 1, total, currentJabatan: label })
        try {
          const res = await jabatanAPI.update(id, payload)
          if (res?.success) ok += 1
          else fail += 1
        } catch {
          fail += 1
        }
      }
      if (fail === 0) {
        showNotification(`Berhasil mengubah ${ok} jabatan`, 'success')
      } else if (ok > 0) {
        showNotification(`${ok} berhasil, ${fail} gagal`, 'info')
      } else {
        showNotification('Gagal mengubah jabatan terpilih', 'error')
      }
      setBulkOffcanvasOpen(false)
      setSelectMode(false)
      setSelectedIds([])
      loadJabatan()
    } catch {
      showNotification('Terjadi kesalahan saat mengubah jabatan', 'error')
    } finally {
      setBulkSaving(false)
      setBulkProgress({ current: 0, total: 0, currentJabatan: null })
    }
  }

  const handleOpenAdd = () => {
    setEditingJabatan(null)
    setFormData({
      nama: '',
      tipe: '',
      lembaga_id: '',
      deskripsi: '',
      urutan: 0,
      bonus: '',
      per_jp: '',
      status: 'aktif'
    })
    setError('')
    setOffcanvasOpen(true)
  }

  const handleOpenEdit = (jabatan) => {
    setEditingJabatan(jabatan)
    setFormData({
      nama: jabatan.nama || '',
      tipe: jabatan.tipe || '',
      lembaga_id: jabatan.lembaga_id || '',
      deskripsi: jabatan.deskripsi || '',
      urutan: jabatan.urutan || 0,
      bonus: jabatan.bonus != null && jabatan.bonus !== '' ? String(jabatan.bonus) : '',
      per_jp: jabatan.per_jp != null && jabatan.per_jp !== '' ? String(jabatan.per_jp) : '',
      status: (jabatan.status || 'aktif').toLowerCase() === 'nonaktif' ? 'nonaktif' : 'aktif'
    })
    setError('')
    setOffcanvasOpen(true)
  }

  const handleRowActivate = (jabatan, event) => {
    if (selectMode) {
      event?.stopPropagation?.()
      toggleJabatanSelected(jabatan.id)
      return
    }
    handleOpenEdit(jabatan)
  }

  const handleCloseOffcanvas = () => {
    setOffcanvasOpen(false)
    setEditingJabatan(null)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const deskripsiHtml = deskripsiEditorRef.current?.innerHTML ?? formData.deskripsi ?? ''
      const tipeTrim = String(formData.tipe || '').trim()
      const data = {
        ...formData,
        tipe: tipeTrim || null,
        deskripsi: deskripsiHtml,
        lembaga_id: formData.lembaga_id || null,
        urutan: parseInt(formData.urutan, 10) || 0,
        bonus: parseMoneyFormValue(formData.bonus),
        per_jp: parseMoneyFormValue(formData.per_jp)
      }

      let response
      if (editingJabatan) {
        response = await jabatanAPI.update(editingJabatan.id, data)
      } else {
        response = await jabatanAPI.create(data)
      }

      if (response.success) {
        showNotification(editingJabatan ? 'Jabatan berhasil diperbarui' : 'Jabatan berhasil dibuat', 'success')
        setTimeout(() => {
          handleCloseOffcanvas()
          loadJabatan()
        }, 500)
      } else {
        setError(response.message || 'Gagal menyimpan jabatan')
      }
    } catch (err) {
      console.error('Error saving jabatan:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat menyimpan jabatan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (jabatan) => {
    setEditingJabatan(jabatan)
    setDeleteConfirmId('')
    setError('')
    setShowDeleteModal(true)
  }

  const handleConfirmDelete = async () => {
    if (deleteConfirmId.trim() !== String(editingJabatan?.id)) {
      setError('ID yang dimasukkan tidak sesuai')
      return
    }

    setDeleting(true)
    setError('')

    try {
      const response = await jabatanAPI.delete(editingJabatan.id)
      if (response.success) {
        showNotification('Jabatan berhasil dihapus', 'success')
        setShowDeleteModal(false)
        setEditingJabatan(null)
        setOffcanvasOpen(false)
        loadJabatan()
      } else {
        setError(response.message || 'Gagal menghapus jabatan')
      }
    } catch (err) {
      console.error('Error deleting jabatan:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat menghapus jabatan')
    } finally {
      setDeleting(false)
    }
  }

  const getKategoriColor = (kategori) => {
    const n = String(kategori || '').toLowerCase()
    if (n.includes('diniyah')) {
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    }
    if (n.includes('formal')) {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
    }
    if (n.includes('keamanan') || n.includes('struktur')) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }


  if (loading && jabatanList.length === 0) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto page-content-scroll" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Search & Filter — sticky seperti Pengurus/Santri */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
              <div className="relative pb-2 px-4 pt-3">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full p-2 pr-12 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    placeholder="Cari"
                  />
                  <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                    <button
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                      title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                      </svg>
                      {isFilterOpen ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
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
                    <div className="px-4 py-2" ref={filterContainerRef}>
                      <div className="flex flex-wrap gap-2">
                        <MultiSelectFilter
                          filterKey="kategori"
                          label="Kategori"
                          options={kategoriOptions}
                          selected={kategoriFilter}
                          onChange={setKategoriFilter}
                          isOpen={openFilterKey === 'kategori'}
                          onOpen={handleFilterOpen}
                          dropdownPosition={openFilterKey === 'kategori' ? filterPosition : null}
                          dropdownRef={openFilterKey === 'kategori' ? filterDropdownRef : null}
                        />
                        <MultiSelectFilter
                          filterKey="tipe"
                          label="Tipe"
                          options={tipeOptions}
                          selected={tipeFilter}
                          onChange={setTipeFilter}
                          isOpen={openFilterKey === 'tipe'}
                          onOpen={handleFilterOpen}
                          dropdownPosition={openFilterKey === 'tipe' ? filterPosition : null}
                          dropdownRef={openFilterKey === 'tipe' ? filterDropdownRef : null}
                        />
                        <MultiSelectFilter
                          filterKey="lembaga"
                          label={lembagaAccess.canFilterAllLembaga ? 'Lembaga' : 'Lembaga'}
                          groups={lembagaFilterGroups}
                          selected={lembagaFilter}
                          onChange={setLembagaFilter}
                          isOpen={openFilterKey === 'lembaga'}
                          onOpen={handleFilterOpen}
                          dropdownPosition={openFilterKey === 'lembaga' ? filterPosition : null}
                          dropdownRef={openFilterKey === 'lembaga' ? filterDropdownRef : null}
                        />
                        <MultiSelectFilter
                          filterKey="status"
                          label="Status"
                          options={statusOptions}
                          selected={statusFilter}
                          onChange={setStatusFilter}
                          isOpen={openFilterKey === 'status'}
                          onOpen={handleFilterOpen}
                          dropdownPosition={openFilterKey === 'status' ? filterPosition : null}
                          dropdownRef={openFilterKey === 'status' ? filterDropdownRef : null}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 mt-2 border-t border-gray-200 dark:border-gray-600">
                        <button
                          type="button"
                          onClick={loadJabatan}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          title="Refresh"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                          </svg>
                          Refresh
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setKategoriFilter([])
                            setTipeFilter([])
                            setLembagaFilter(
                              lembagaAccess.allowedLembagaIds?.length === 1
                                ? [String(lembagaAccess.allowedLembagaIds[0])]
                                : []
                            )
                            setStatusFilter([])
                            setSearchQuery('')
                            setOpenFilterKey(null)
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                          title="Reset filter"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"></path>
                          </svg>
                          Reset filter
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Create Button */}
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredJabatan.length}</span>
                  {selectMode && selectedIds.length > 0 ? (
                    <span className="text-teal-700 dark:text-teal-300"> · {selectedIds.length} dipilih</span>
                  ) : null}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectMode}
                    aria-pressed={selectMode}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                      selectMode
                        ? 'border-teal-500 bg-teal-50 text-teal-800 dark:border-teal-500 dark:bg-teal-900/40 dark:text-teal-100'
                        : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      {selectMode ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                      )}
                    </svg>
                    Pilih
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah Jabatan
                  </button>
                </div>
              </div>
            </div>

            {/* Jabatan List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <AnimatePresence initial={false}>
                {selectMode && filteredJabatan.length > 0 ? (
                  <motion.div
                    key="jabatan-bulk-bar"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden border-b border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-gray-50/90 dark:bg-gray-900/40">
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        Pilih semua
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Kosongkan
                      </button>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{selectedIds.length} dipilih</span>
                      <button
                        type="button"
                        disabled={selectedIds.length === 0}
                        onClick={openBulkOffcanvas}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-40 dark:border-teal-700 dark:bg-teal-900/30 dark:text-teal-100"
                      >
                        Ubah masal
                      </button>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {filteredJabatan.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Tidak ada jabatan ditemukan
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredJabatan.map((jabatan, index) => {
                    const checked = selectedIds.includes(Number(jabatan.id))
                    return (
                    <motion.div
                      key={jabatan.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.5) }}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleRowActivate(jabatan, e)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleRowActivate(jabatan, e)
                        }
                      }}
                      className={`p-4 cursor-pointer transition-all duration-200 group ${
                        selectMode && checked
                          ? 'bg-teal-50/80 dark:bg-teal-900/25'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <motion.span
                          className="flex shrink-0 items-center overflow-hidden"
                          initial={false}
                          animate={{
                            width: selectMode ? 28 : 0,
                            opacity: selectMode ? 1 : 0,
                            marginRight: selectMode ? 12 : 0
                          }}
                          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleJabatanSelected(jabatan.id)}
                            className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 dark:border-gray-500"
                            aria-label={`Pilih ${jabatan.nama}`}
                            tabIndex={selectMode ? 0 : -1}
                          />
                        </motion.span>
                        <div className="flex-1 min-w-0 pr-2">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                            {jabatan.nama}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            ID: {jabatan.id}
                          </p>
                          
                          {/* Badges */}
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {lembagaKategoriOf(jabatan) ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getKategoriColor(lembagaKategoriOf(jabatan))}`}>
                                {lembagaKategoriOf(jabatan)}
                              </span>
                            ) : null}
                            {jabatan.tipe ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-700/50 dark:text-slate-300">
                                {jabatan.tipe}
                              </span>
                            ) : null}
                            {jabatan.lembaga_nama && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                {jabatan.lembaga_nama}
                              </span>
                            )}
                          </div>
                          
                          {(jabatan.bonus != null && jabatan.bonus !== '') ||
                          (jabatan.per_jp != null && jabatan.per_jp !== '') ? (
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1.5">
                              {jabatan.bonus != null && jabatan.bonus !== ''
                                ? `Bonus: ${formatRpJabatan(jabatan.bonus)}`
                                : null}
                              {jabatan.bonus != null &&
                              jabatan.bonus !== '' &&
                              jabatan.per_jp != null &&
                              jabatan.per_jp !== ''
                                ? ' · '
                                : null}
                              {jabatan.per_jp != null && jabatan.per_jp !== ''
                                ? `Per JP: ${formatRpJabatan(jabatan.per_jp)}`
                                : null}
                            </p>
                          ) : null}
                          {jabatan.deskripsi && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">
                              {stripHtmlToText(jabatan.deskripsi)}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                            jabatan.status === 'aktif' 
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {jabatan.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                          </span>
                          <svg className="w-5 h-5 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    </motion.div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="h-20 sm:h-0" aria-hidden="true" />
          </motion.div>
        </div>
      </div>

      {/* Offcanvas Tambah/Edit Jabatan */}
      {createPortal(
        <AnimatePresence>
          {offcanvasOpen && (
            <>
              <motion.div
                key="jabatan-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseOffcanvas}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="jabatan-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    {editingJabatan ? 'Edit Jabatan' : 'Tambah Jabatan'}
                  </h3>
                  <button
                    type="button"
                    onClick={handleCloseOffcanvas}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nama Jabatan *</label>
                      <input
                        type="text"
                        value={formData.nama}
                        onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Masukkan nama jabatan"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipe (opsional)</label>
                      <input
                        type="text"
                        value={formData.tipe}
                        onChange={(e) => setFormData({ ...formData, tipe: e.target.value })}
                        maxLength={64}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Mis. struktural, pengajar, pengurus"
                      />
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                        Teks bebas; dipakai di rumus Bisyaroh sebagai <span className="font-mono">@jabatan[tipe]</span>
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {formData.status === 'aktif' ? 'Aktif' : 'Tidak aktif'}
                        </span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={formData.status === 'aktif'}
                          onClick={() => setFormData({ ...formData, status: formData.status === 'aktif' ? 'nonaktif' : 'aktif' })}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Lembaga (Opsional)</label>
                      <select
                        value={formData.lembaga_id}
                        onChange={(e) => setFormData({ ...formData, lembaga_id: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                      >
                        <option value="">-- Pilih Lembaga (Opsional) --</option>
                        {lembagaList
                          .filter((lem) => {
                            if (!lembagaAccess.allowedLembagaIds?.length) return true
                            return new Set(lembagaAccess.allowedLembagaIds.map(String)).has(String(lem.id))
                          })
                          .map((lem) => (
                          <option key={lem.id} value={lem.id}>{lem.nama || lem.id}</option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Urutan</label>
                      <input
                        type="number"
                        value={formData.urutan}
                        onChange={(e) => setFormData({ ...formData, urutan: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="0"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Bonus (Rp)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={formData.bonus}
                          onChange={(e) => setFormData({ ...formData, bonus: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                          placeholder="Kosongkan bila tidak ada"
                        />
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                          Ketentuan Bisyaroh — rumus <span className="font-mono">@jabatan[bonus]</span>
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Per JP (Rp)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={formData.per_jp}
                          onChange={(e) => setFormData({ ...formData, per_jp: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                          placeholder="Kosongkan bila tidak ada"
                        />
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                          Ketentuan Bisyaroh — rumus <span className="font-mono">@jabatan[per_jp]</span>
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Deskripsi</label>
                      <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
                        <div className="flex flex-wrap gap-0.5 p-1 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50">
                          <button
                            type="button"
                            title="Tebal (Bold)"
                            onMouseDown={(e) => { e.preventDefault(); deskripsiEditorRef.current?.focus(); document.execCommand('bold'); setTimeout(updateDeskripsiFormatState, 0) }}
                            className={`p-2 rounded font-bold transition-colors ${deskripsiFormat.bold ? 'bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                          >
                            B
                          </button>
                          <button
                            type="button"
                            title="Miring (Italic)"
                            onMouseDown={(e) => { e.preventDefault(); deskripsiEditorRef.current?.focus(); document.execCommand('italic'); setTimeout(updateDeskripsiFormatState, 0) }}
                            className={`p-2 rounded italic transition-colors ${deskripsiFormat.italic ? 'bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                          >
                            I
                          </button>
                          <button
                            type="button"
                            title="Garis bawah (Underline)"
                            onMouseDown={(e) => { e.preventDefault(); deskripsiEditorRef.current?.focus(); document.execCommand('underline'); setTimeout(updateDeskripsiFormatState, 0) }}
                            className={`p-2 rounded underline transition-colors ${deskripsiFormat.underline ? 'bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                          >
                            U
                          </button>
                          <span className="w-px self-stretch bg-gray-300 dark:bg-gray-500 my-1" />
                          <button
                            type="button"
                            title="Daftar bullet"
                            onMouseDown={(e) => { e.preventDefault(); applyDeskripsiListCommand(true) }}
                            className={`p-2 rounded transition-colors ${deskripsiFormat.bulletList ? 'bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <circle cx="5" cy="6" r="1.5" />
                              <circle cx="5" cy="12" r="1.5" />
                              <circle cx="5" cy="18" r="1.5" />
                              <path d="M10 6h10M10 12h10M10 18h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            title="Daftar nomor"
                            onMouseDown={(e) => { e.preventDefault(); applyDeskripsiListCommand(false) }}
                            className={`p-2 rounded transition-colors ${deskripsiFormat.numberedList ? 'bg-teal-100 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200' : 'hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                              <path d="M8 6h13M8 12h13M8 18h13" />
                              <text x="2" y="7.5" fontSize="5" fontWeight="700" fill="currentColor">1</text>
                              <text x="2" y="13.5" fontSize="5" fontWeight="700" fill="currentColor">2</text>
                              <text x="2" y="19.5" fontSize="5" fontWeight="700" fill="currentColor">3</text>
                            </svg>
                          </button>
                        </div>
                        <div
                          ref={deskripsiEditorRef}
                          contentEditable
                          suppressContentEditableWarning
                          onKeyUp={() => { saveDeskripsiSelection(); updateDeskripsiFormatState() }}
                          onMouseUp={() => { saveDeskripsiSelection(); updateDeskripsiFormatState() }}
                          onBlur={saveDeskripsiSelection}
                          onFocus={updateDeskripsiFormatState}
                          data-placeholder="Masukkan deskripsi jabatan (opsional). Gunakan toolbar untuk bold, italic, underline, bullet, atau numbered list."
                          className="deskripsi-rich-text min-h-[100px] max-h-[200px] overflow-y-auto px-4 py-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 dark:empty:before:text-gray-500"
                        />
                      </div>
                    </div>

                    {error && (
                      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3 flex-shrink-0">
                    {editingJabatan ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOffcanvasOpen(false)
                          handleDelete(editingJabatan)
                        }}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 text-sm"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Hapus
                      </button>
                    ) : (
                      <div />
                    )}
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={handleCloseOffcanvas}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        {saving ? 'Menyimpan...' : (editingJabatan ? 'Simpan Perubahan' : 'Tambah')}
                      </button>
                    </div>
                  </div>
                </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Offcanvas ubah masal */}
      {createPortal(
        <AnimatePresence>
          {bulkOffcanvasOpen && (
            <>
              <motion.div
                key="jabatan-bulk-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeBulkOffcanvas}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="jabatan-bulk-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Ubah masal ({selectedIds.length} jabatan)
                  </h3>
                  <button
                    type="button"
                    onClick={closeBulkOffcanvas}
                    disabled={bulkSaving}
                    className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50"
                    aria-label="Tutup"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Centang field yang ingin disamakan ke semua jabatan terpilih. Field yang tidak dicentang tidak berubah.
                  </p>

                  <fieldset disabled={bulkSaving} className="space-y-4 border-0 p-0 m-0 min-w-0 disabled:opacity-60">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={bulkForm.applyTipe}
              onChange={(e) => setBulkForm({ ...bulkForm, applyTipe: e.target.checked })}
              className="mt-1 rounded border-gray-300 text-teal-600"
            />
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Tipe</span>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  disabled={!bulkForm.applyTipe}
                  checked={bulkForm.tipeClear}
                  onChange={(e) =>
                    setBulkForm({ ...bulkForm, tipeClear: e.target.checked, tipe: e.target.checked ? '' : bulkForm.tipe })
                  }
                />
                Kosongkan tipe
              </label>
              <input
                type="text"
                disabled={!bulkForm.applyTipe || bulkForm.tipeClear}
                value={bulkForm.tipe}
                maxLength={64}
                onChange={(e) => setBulkForm({ ...bulkForm, tipe: e.target.value, tipeClear: false })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50"
                placeholder="Tipe jabatan"
              />
            </div>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={bulkForm.applyLembaga}
              onChange={(e) => setBulkForm({ ...bulkForm, applyLembaga: e.target.checked })}
              className="mt-1 rounded border-gray-300 text-teal-600"
            />
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Lembaga</span>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  disabled={!bulkForm.applyLembaga}
                  checked={bulkForm.lembagaClear}
                  onChange={(e) => setBulkForm({ ...bulkForm, lembagaClear: e.target.checked, lembaga_id: e.target.checked ? '' : bulkForm.lembaga_id })}
                />
                Kosongkan lembaga
              </label>
              <select
                disabled={!bulkForm.applyLembaga || bulkForm.lembagaClear}
                value={bulkForm.lembaga_id}
                onChange={(e) => setBulkForm({ ...bulkForm, lembaga_id: e.target.value, lembagaClear: false })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="">-- Pilih lembaga --</option>
                {lembagaList.map((lem) => (
                  <option key={lem.id} value={lem.id}>
                    {lem.nama || lem.id}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={bulkForm.applyStatus}
              onChange={(e) => setBulkForm({ ...bulkForm, applyStatus: e.target.checked })}
              className="mt-1 rounded border-gray-300 text-teal-600"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Status</span>
              <select
                disabled={!bulkForm.applyStatus}
                value={bulkForm.status}
                onChange={(e) => setBulkForm({ ...bulkForm, status: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50"
              >
                <option value="aktif">Aktif</option>
                <option value="nonaktif">Nonaktif</option>
              </select>
            </div>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={bulkForm.applyUrutan}
              onChange={(e) => setBulkForm({ ...bulkForm, applyUrutan: e.target.checked })}
              className="mt-1 rounded border-gray-300 text-teal-600"
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Urutan</span>
              <input
                type="number"
                disabled={!bulkForm.applyUrutan}
                value={bulkForm.urutan}
                onChange={(e) => setBulkForm({ ...bulkForm, urutan: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50"
              />
            </div>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={bulkForm.applyBonus}
              onChange={(e) => setBulkForm({ ...bulkForm, applyBonus: e.target.checked })}
              className="mt-1 rounded border-gray-300 text-teal-600"
            />
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Bonus (Rp)</span>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  disabled={!bulkForm.applyBonus}
                  checked={bulkForm.bonusClear}
                  onChange={(e) => setBulkForm({ ...bulkForm, bonusClear: e.target.checked })}
                />
                Kosongkan bonus
              </label>
              <input
                type="number"
                min={0}
                disabled={!bulkForm.applyBonus || bulkForm.bonusClear}
                value={bulkForm.bonus}
                onChange={(e) => setBulkForm({ ...bulkForm, bonus: e.target.value, bonusClear: false })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50"
                placeholder="Nilai bonus"
              />
            </div>
          </label>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={bulkForm.applyPerJp}
              onChange={(e) => setBulkForm({ ...bulkForm, applyPerJp: e.target.checked })}
              className="mt-1 rounded border-gray-300 text-teal-600"
            />
            <div className="flex-1 space-y-1">
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Per JP (Rp)</span>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  disabled={!bulkForm.applyPerJp}
                  checked={bulkForm.perJpClear}
                  onChange={(e) => setBulkForm({ ...bulkForm, perJpClear: e.target.checked })}
                />
                Kosongkan per JP
              </label>
              <input
                type="number"
                min={0}
                disabled={!bulkForm.applyPerJp || bulkForm.perJpClear}
                value={bulkForm.per_jp}
                onChange={(e) => setBulkForm({ ...bulkForm, per_jp: e.target.value, perJpClear: false })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-gray-100 disabled:opacity-50"
                placeholder="Nilai per JP"
              />
            </div>
          </label>

                  </fieldset>
                </div>

                {bulkSaving && bulkProgress.total > 0 ? (
                  <div className="px-4 pb-2 flex-shrink-0">
                    <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-teal-800 dark:text-teal-200">Memproses…</span>
                        <span className="text-sm text-teal-700 dark:text-teal-300 tabular-nums">
                          {bulkProgress.current} / {bulkProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-teal-200 dark:bg-teal-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-teal-600 dark:bg-teal-400 h-2 rounded-full transition-all duration-300"
                          style={{
                            width: `${bulkProgress.total ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%`
                          }}
                        />
                      </div>
                      {bulkProgress.currentJabatan ? (
                        <p className="mt-2 text-xs text-teal-700 dark:text-teal-300 truncate" title={bulkProgress.currentJabatan}>
                          Memproses: {bulkProgress.currentJabatan}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 flex-shrink-0">
                  <button
                    type="button"
                    disabled={bulkSaving}
                    onClick={closeBulkOffcanvas}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={bulkSaving}
                    onClick={submitBulkUpdate}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium disabled:opacity-50"
                  >
                    {bulkSaving ? 'Memproses…' : 'Terapkan ke terpilih'}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          if (!deleting) {
            setShowDeleteModal(false)
            setEditingJabatan(null)
            setDeleteConfirmId('')
            setError('')
          }
        }}
        title="Konfirmasi Hapus Jabatan"
        maxWidth="max-w-md"
        closeOnBackdropClick={!deleting}
      >
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Anda akan menghapus jabatan <strong>{editingJabatan?.nama}</strong> (ID: <strong>{editingJabatan?.id}</strong>).
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4 font-medium">
              ⚠️ Tindakan ini tidak dapat dibatalkan!
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Untuk mengonfirmasi, masukkan ID jabatan yang akan dihapus:
            </p>
            <input
              type="text"
              value={deleteConfirmId}
              onChange={(e) => {
                setDeleteConfirmId(e.target.value)
                setError('')
              }}
              placeholder={`Masukkan ID: ${editingJabatan?.id}`}
              disabled={deleting}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setShowDeleteModal(false)
                setEditingJabatan(null)
                setDeleteConfirmId('')
                setError('')
              }}
              disabled={deleting}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting || deleteConfirmId.trim() !== String(editingJabatan?.id)}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {deleting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Menghapus...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Hapus</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ManageJabatan

