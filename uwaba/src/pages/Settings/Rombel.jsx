import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { rombelAPI, lembagaAPI, waliKelasAPI, pengurusAPI, santriAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'

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
  const [filterStatus, setFilterStatus] = useState('')
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

  useEffect(() => {
    loadLembaga()
  }, [])

  useEffect(() => {
    loadRombel()
  }, [])

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

  const loadRombel = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await rombelAPI.getAll({})
      if (response.success) {
        setRombelList(response.data || [])
      } else {
        setError(response.message || 'Gagal memuat data rombel')
      }
    } catch (err) {
      console.error('Error loading rombel:', err)
      setError('Terjadi kesalahan saat memuat data rombel')
    } finally {
      setLoading(false)
    }
  }

  const matchByLembaga = useCallback((r, val) => !val || String(r.lembaga_id || '') === String(val), [])
  const matchByStatus = useCallback((r, val) => !val || normalizeStatus(r.status) === normalizeStatus(val), [])
  const matchByKelas = useCallback((r, val) => {
    if (!val) return true
    const k = String(r.kelas || '').trim()
    return k === String(val).trim()
  }, [])

  const dataAfterFilters = useMemo(() => {
    return rombelList.filter(
      (r) =>
        matchByLembaga(r, filterLembaga) &&
        matchByStatus(r, filterStatus) &&
        matchByKelas(r, filterKelas)
    )
  }, [rombelList, filterLembaga, filterStatus, filterKelas, matchByLembaga, matchByStatus, matchByKelas])

  const filteredRombel = useMemo(() => {
    if (!searchQuery.trim()) return dataAfterFilters
    const q = searchQuery.trim().toLowerCase()
    return dataAfterFilters.filter(
      (r) =>
        (r.lembaga_id && r.lembaga_id.toLowerCase().includes(q)) ||
        (r.lembaga_nama && r.lembaga_nama.toLowerCase().includes(q)) ||
        (r.kelas && r.kelas.toLowerCase().includes(q)) ||
        (r.kel && r.kel.toLowerCase().includes(q)) ||
        (r.keterangan && r.keterangan.toLowerCase().includes(q))
    )
  }, [dataAfterFilters, searchQuery])

  const statusLabel = useCallback((v) => (v === 'aktif' ? 'Aktif' : v === 'nonaktif' ? 'Nonaktif' : v), [])

  const { lembagaOptions, kelasOptions, statusOptions } = useMemo(() => {
    const base = rombelList
    const dataForLembaga = base.filter((r) => matchByStatus(r, filterStatus) && matchByKelas(r, filterKelas))
    const lembagaCounts = {}
    dataForLembaga.forEach((r) => {
      const id = r.lembaga_id != null ? String(r.lembaga_id) : ''
      if (id === '') return
      if (!lembagaCounts[id]) lembagaCounts[id] = { count: 0, nama: r.lembaga_nama || id }
      lembagaCounts[id].count += 1
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
  }, [rombelList, filterLembaga, filterStatus, filterKelas, matchByLembaga, matchByStatus, matchByKelas, statusLabel])

  useEffect(() => {
    const valid = new Set(['', ...lembagaOptions.map((o) => o.value)])
    if (filterLembaga && !valid.has(filterLembaga)) setFilterLembaga('')
  }, [filterLembaga, lembagaOptions])
  useEffect(() => {
    const valid = new Set(['', ...kelasOptions.map((o) => o.value)])
    if (filterKelas !== '' && !valid.has(filterKelas)) setFilterKelas('')
  }, [filterKelas, kelasOptions])
  useEffect(() => {
    const valid = new Set(['', ...statusOptions.map((o) => o.value)])
    if (filterStatus && !valid.has(filterStatus)) setFilterStatus('')
  }, [filterStatus, statusOptions])

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
      setFormData({
        lembaga_id: filterLembaga || '',
        kelas: '',
        kel: '',
        keterangan: '',
        status: 'aktif'
      })
    }
    setOffcanvasOpen(true)
  }

  const handleCloseOffcanvas = () => {
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
    setEditingWali(wk)
    setWaliFormData({
      id_pengurus: wk.id_pengurus != null ? String(wk.id_pengurus) : '',
      id_ketua: wk.id_ketua != null ? String(wk.id_ketua) : '',
      id_wakil: wk.id_wakil != null ? String(wk.id_wakil) : '',
      id_sekretaris: wk.id_sekretaris != null ? String(wk.id_sekretaris) : '',
      id_bendahara: wk.id_bendahara != null ? String(wk.id_bendahara) : '',
      tahun_ajaran: wk.tahun_ajaran || '',
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

  const handleSubmitWali = async (e) => {
    e.preventDefault()
    if (!editingRombel?.id) return
    setSavingWali(true)
    try {
      const payload = {
        id_kelas: editingRombel.id,
        id_pengurus: waliFormData.id_pengurus || null,
        id_ketua: waliFormData.id_ketua || null,
        id_wakil: waliFormData.id_wakil || null,
        id_sekretaris: waliFormData.id_sekretaris || null,
        id_bendahara: waliFormData.id_bendahara || null,
        tahun_ajaran: waliFormData.tahun_ajaran || null,
        gedung: waliFormData.gedung || null,
        ruang: waliFormData.ruang || null,
        status: waliFormData.status || 'aktif'
      }
      if (editingWali?.id) {
        const res = await waliKelasAPI.update(editingWali.id, payload)
        if (res.success) {
          showNotification('Wali kelas berhasil diupdate', 'success')
          handleCloseWaliOffcanvas()
          loadWaliKelas(editingRombel.id)
        } else {
          showNotification(res.message || 'Gagal mengupdate wali kelas', 'error')
        }
      } else {
        const res = await waliKelasAPI.create(payload)
        if (res.success) {
          showNotification('Wali kelas berhasil ditambahkan', 'success')
          handleCloseWaliOffcanvas()
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

    setSaving(true)
    try {
      if (editingRombel) {
        const response = await rombelAPI.update(editingRombel.id, formData)
        if (response.success) {
          showNotification('Rombel berhasil diupdate', 'success')
          handleCloseOffcanvas()
          loadRombel()
        } else {
          showNotification(response.message || 'Gagal mengupdate rombel', 'error')
        }
      } else {
        const response = await rombelAPI.create(formData)
        if (response.success) {
          showNotification('Rombel berhasil ditambahkan', 'success')
          handleCloseOffcanvas()
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
    <div className="h-full overflow-hidden flex flex-col">
      <div className="container mx-auto px-4 py-6 max-w-7xl flex-shrink-0">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Search and Filter — sama dengan page Jabatan */}
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
                placeholder="Cari lembaga, kelas, kel..."
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
                <button
                  type="button"
                  onClick={loadRombel}
                  className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                  title="Refresh"
                >
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
                    <span className="text-xs text-gray-600 dark:text-gray-400">Lembaga:</span>
                    <select
                      value={filterLembaga}
                      onChange={(e) => setFilterLembaga(e.target.value)}
                      className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[180px]"
                    >
                      <option value="">Semua</option>
                      {lembagaOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label} ({o.count})</option>
                      ))}
                    </select>
                    <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Kelas:</span>
                    <select
                      value={filterKelas}
                      onChange={(e) => setFilterKelas(e.target.value)}
                      className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[120px]"
                    >
                      <option value="">Semua</option>
                      {kelasOptions.map((o) => (
                        <option key={o.value === '' ? '__kosong__' : o.value} value={o.value}>{o.label} ({o.count})</option>
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
              Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredRombel.length}</span>
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
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredRombel.map((rombel, index) => (
                <motion.div
                  key={rombel.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.03 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenOffcanvas(rombel)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenOffcanvas(rombel) } }}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border cursor-pointer hover:shadow-lg transition-all ${
                    rombel.status === 'nonaktif'
                      ? 'border-gray-200 dark:border-gray-700 opacity-75'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        {rombel.lembaga_nama || rombel.lembaga_id} — {rombel.kelas || '-'}
                        {rombel.kel ? ` (${rombel.kel})` : ''}
                      </h3>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                          rombel.status === 'aktif'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {rombel.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                      </span>
                      {rombel.wali_aktif_nama && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5">
                          Wali: {rombel.wali_aktif_nama}
                        </p>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {rombel.keterangan && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                      {rombel.keterangan}
                    </p>
                  )}
                  {rombel.tanggal_dibuat && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                      Dibuat: {new Date(rombel.tanggal_dibuat).toLocaleDateString('id-ID')}
                    </p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredRombel.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery || filterLembaga || filterStatus || filterKelas
                  ? 'Tidak ada rombel yang sesuai filter'
                  : 'Belum ada data rombel'}
              </p>
            </div>
          )}
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
                onClick={handleCloseOffcanvas}
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kelas</label>
                      <input
                        type="text"
                        value={formData.kelas}
                        onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Contoh: 1, 2, 3"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kel</label>
                      <input
                        type="text"
                        value={formData.kel}
                        onChange={(e) => setFormData({ ...formData, kel: e.target.value })}
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

                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 flex-shrink-0">
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
                      {saving ? 'Menyimpan...' : (editingRombel ? 'Simpan Perubahan' : 'Tambah')}
                    </button>
                  </div>
                </form>
              </motion.div>

              {/* Offcanvas Tambah Wali Kelas — layer kedua */}
              <AnimatePresence>
                {waliOffcanvasOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={handleCloseWaliOffcanvas}
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
                          onClick={handleCloseWaliOffcanvas}
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
                            onClick={handleCloseWaliOffcanvas}
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
    </div>
  )
}

export default Rombel
