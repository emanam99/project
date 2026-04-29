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

const stripHtmlToText = (html) => {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function ManageJabatan() {
  const { showNotification } = useNotification()
  const [jabatanList, setJabatanList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingJabatan, setEditingJabatan] = useState(null)
  const [lembagaList, setLembagaList] = useState([])
  const [formData, setFormData] = useState({
    nama: '',
    kategori: 'struktural',
    lembaga_id: '',
    deskripsi: '',
    urutan: 0,
    status: 'aktif'
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
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
        limit: 10000,
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

  const matchByKategori = useCallback((j, val) => !val || String(j.kategori || '').trim() === String(val).trim(), [])
  const matchByLembaga = useCallback((j, val) => !val || String(j.lembaga_id || '') === String(val), [])
  const matchByStatus = useCallback((j, val) => !val || normalizeStatus(j.status) === normalizeStatus(val), [normalizeStatus])

  const dataAfterFilters = useMemo(() => {
    let base = jabatanList
    if (lembagaAccess.allowedLembagaIds?.length) {
      const allowedSet = new Set(lembagaAccess.allowedLembagaIds.map(String))
      base = base.filter((j) => allowedSet.has(String(j.lembaga_id || '')))
    }
    return base.filter(
      (j) =>
        matchByKategori(j, kategoriFilter) &&
        matchByLembaga(j, lembagaFilter) &&
        matchByStatus(j, statusFilter)
    )
  }, [jabatanList, kategoriFilter, lembagaFilter, statusFilter, matchByKategori, matchByLembaga, matchByStatus, lembagaAccess.allowedLembagaIds])

  const filteredJabatan = useMemo(() => {
    if (!searchQuery.trim()) return dataAfterFilters
    const q = searchQuery.trim().toLowerCase()
    return dataAfterFilters.filter(
      (j) =>
        (j.nama && j.nama.toLowerCase().includes(q)) ||
        (j.deskripsi && j.deskripsi.toLowerCase().includes(q)) ||
        (j.lembaga_nama && j.lembaga_nama.toLowerCase().includes(q))
    )
  }, [dataAfterFilters, searchQuery])

  const statusLabel = useCallback((value) => (value === 'aktif' ? 'Aktif' : value === 'nonaktif' ? 'Nonaktif' : value), [])

  const { kategoriOptions, lembagaOptions, statusOptions } = useMemo(() => {
    const base = jabatanList

    const dataForKategori = base.filter((j) => matchByLembaga(j, lembagaFilter) && matchByStatus(j, statusFilter))
    const kategoriCounts = {}
    dataForKategori.forEach((j) => {
      const k = String(j.kategori || '').trim()
      if (k) kategoriCounts[k] = (kategoriCounts[k] || 0) + 1
    })
    const kategoriLabel = (v) => (v === 'struktural' ? 'Struktural' : v === 'diniyah' ? 'Diniyah' : v === 'formal' ? 'Formal' : v)
    const kategoriOptions = Object.entries(kategoriCounts)
      .map(([value, count]) => ({ value, label: kategoriLabel(value), count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const dataForLembaga = base
      .filter((j) => {
        if (!lembagaAccess.allowedLembagaIds?.length) return true
        return new Set(lembagaAccess.allowedLembagaIds.map(String)).has(String(j.lembaga_id || ''))
      })
      .filter((j) => matchByKategori(j, kategoriFilter) && matchByStatus(j, statusFilter))
    const lembagaCounts = {}
    dataForLembaga.forEach((j) => {
      const id = j.lembaga_id != null ? String(j.lembaga_id) : ''
      if (id === '') return
      if (!lembagaCounts[id]) lembagaCounts[id] = { count: 0, nama: j.lembaga_nama || id }
      lembagaCounts[id].count += 1
    })
    const lembagaOptions = Object.entries(lembagaCounts)
      .map(([value, o]) => ({ value, label: o.nama || value, count: o.count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const dataForStatus = base.filter((j) => matchByKategori(j, kategoriFilter) && matchByLembaga(j, lembagaFilter))
    const statusCounts = {}
    dataForStatus.forEach((j) => {
      const s = normalizeStatus(j.status) || '(tanpa status)'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })
    const statusOptions = Object.entries(statusCounts)
      .filter(([value]) => value !== '(tanpa status)' && value !== '')
      .map(([value, count]) => ({ value, label: statusLabel(value), count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    return { kategoriOptions, lembagaOptions, statusOptions }
  }, [jabatanList, kategoriFilter, lembagaFilter, statusFilter, matchByKategori, matchByLembaga, matchByStatus, normalizeStatus, statusLabel, lembagaAccess.allowedLembagaIds])

  useEffect(() => {
    const allowed = lembagaAccess.allowedLembagaIds
    if (!allowed || allowed.length === 0) return
    if (allowed.length === 1 && lembagaFilter !== allowed[0]) {
      setLembagaFilter(allowed[0])
    }
  }, [lembagaAccess.allowedLembagaIds, lembagaFilter])

  useEffect(() => {
    const validKategori = new Set(['', ...kategoriOptions.map((o) => o.value)])
    if (kategoriFilter && !validKategori.has(kategoriFilter)) setKategoriFilter('')
  }, [kategoriFilter, kategoriOptions])
  useEffect(() => {
    const validLembaga = new Set(['', ...lembagaOptions.map((o) => o.value)])
    if (lembagaFilter && !validLembaga.has(lembagaFilter)) setLembagaFilter('')
  }, [lembagaFilter, lembagaOptions])
  useEffect(() => {
    const validStatus = new Set(['', ...statusOptions.map((o) => o.value)])
    if (statusFilter && !validStatus.has(statusFilter)) setStatusFilter('')
  }, [statusFilter, statusOptions])

  const handleOpenAdd = () => {
    setEditingJabatan(null)
    setFormData({
      nama: '',
      kategori: 'struktural',
      lembaga_id: '',
      deskripsi: '',
      urutan: 0,
      status: 'aktif'
    })
    setError('')
    setOffcanvasOpen(true)
  }

  const handleOpenEdit = (jabatan) => {
    setEditingJabatan(jabatan)
    setFormData({
      nama: jabatan.nama || '',
      kategori: jabatan.kategori || 'struktural',
      lembaga_id: jabatan.lembaga_id || '',
      deskripsi: jabatan.deskripsi || '',
      urutan: jabatan.urutan || 0,
      status: (jabatan.status || 'aktif').toLowerCase() === 'nonaktif' ? 'nonaktif' : 'aktif'
    })
    setError('')
    setOffcanvasOpen(true)
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
      const data = {
        ...formData,
        deskripsi: deskripsiHtml,
        lembaga_id: formData.lembaga_id || null,
        urutan: parseInt(formData.urutan) || 0
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
    switch (kategori) {
      case 'struktural':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'diniyah':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'formal':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getKategoriLabel = (kategori) => {
    switch (kategori) {
      case 'struktural':
        return 'Struktural'
      case 'diniyah':
        return 'Diniyah'
      case 'formal':
        return 'Formal'
      default:
        return kategori
    }
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
                    <div className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={kategoriFilter}
                          onChange={(e) => setKategoriFilter(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                        >
                          <option value="">Kategori</option>
                          {kategoriOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                          ))}
                        </select>
                        <select
                          value={lembagaFilter}
                          onChange={(e) => setLembagaFilter(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[180px]"
                          disabled={lembagaAccess.lembagaFilterLocked && (lembagaAccess.allowedLembagaIds?.length === 1)}
                        >
                          <option value="">{lembagaAccess.canFilterAllLembaga ? 'Semua Lembaga' : 'Lembaga'}</option>
                          {lembagaOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                          ))}
                        </select>
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
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
                            setKategoriFilter('')
                            setLembagaFilter(lembagaAccess.allowedLembagaIds?.length === 1 ? lembagaAccess.allowedLembagaIds[0] : '')
                            setStatusFilter('')
                            setSearchQuery('')
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
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredJabatan.length}</span>
                </span>
                <button
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

            {/* Jabatan List */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              {filteredJabatan.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  Tidak ada jabatan ditemukan
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredJabatan.map((jabatan, index) => (
                    <motion.div
                      key={jabatan.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      onClick={() => handleOpenEdit(jabatan)}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-all duration-200 group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 pr-4">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                            {jabatan.nama}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            ID: {jabatan.id}
                          </p>
                          
                          {/* Badges */}
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getKategoriColor(jabatan.kategori)}`}>
                              {getKategoriLabel(jabatan.kategori)}
                            </span>
                            {jabatan.lembaga_nama && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                {jabatan.lembaga_nama}
                              </span>
                            )}
                          </div>
                          
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
                  ))}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kategori *</label>
                      <select
                        value={formData.kategori}
                        onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                      >
                        <option value="struktural">Struktural</option>
                        <option value="diniyah">Diniyah</option>
                        <option value="formal">Formal</option>
                      </select>
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

