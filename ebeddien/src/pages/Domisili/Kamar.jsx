import { useState, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { daerahAPI, daerahKamarAPI, daerahKetuaKamarAPI, santriAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'

const normalizeStatus = (s) => {
  if (!s) return ''
  const t = String(s).toLowerCase().trim()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

function Kamar() {
  const { showNotification } = useNotification()
  const { options: tahunAjaranOptions } = useTahunAjaranStore()
  const [kamarList, setKamarList] = useState([])
  const [daerahList, setDaerahList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingKamar, setEditingKamar] = useState(null)
  const [formData, setFormData] = useState({
    id_daerah: '',
    kamar: '',
    keterangan: '',
    status: 'aktif'
  })
  const [filterDaerah, setFilterDaerah] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ketuaList, setKetuaList] = useState([])
  const [ketuaOffcanvasOpen, setKetuaOffcanvasOpen] = useState(false)
  const [editingKetua, setEditingKetua] = useState(null)
  const [ketuaFormData, setKetuaFormData] = useState({
    id_ketua_kamar: '',
    tahun_ajaran: '',
    status: 'aktif',
    keterangan: ''
  })
  const [santriList, setSantriList] = useState([])
  const [savingKetua, setSavingKetua] = useState(false)

  useEffect(() => {
    loadDaerah()
  }, [])

  useEffect(() => {
    loadKamar()
  }, [])

  const loadDaerah = async () => {
    try {
      const res = await daerahAPI.getAll({})
      if (res.success && res.data) setDaerahList(res.data)
    } catch (err) {
      console.error('Error loading daerah:', err)
    }
  }

  const loadKamar = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await daerahKamarAPI.getAll({})
      if (response.success) {
        setKamarList(response.data || [])
      } else {
        setError(response.message || 'Gagal memuat data kamar')
      }
    } catch (err) {
      console.error('Error loading kamar:', err)
      setError('Terjadi kesalahan saat memuat data kamar')
    } finally {
      setLoading(false)
    }
  }

  const matchByDaerah = useCallback((k, val) => !val || String(k.id_daerah) === String(val), [])
  const matchByStatus = useCallback((k, val) => !val || normalizeStatus(k.status) === normalizeStatus(val), [])

  const dataAfterFilters = useMemo(() => {
    return kamarList.filter(
      (k) => matchByDaerah(k, filterDaerah) && matchByStatus(k, filterStatus)
    )
  }, [kamarList, filterDaerah, filterStatus, matchByDaerah, matchByStatus])

  const filteredKamar = useMemo(() => {
    if (!searchQuery.trim()) return dataAfterFilters
    const q = searchQuery.trim().toLowerCase()
    return dataAfterFilters.filter(
      (k) =>
        (k.kamar && k.kamar.toLowerCase().includes(q)) ||
        (k.daerah_nama && k.daerah_nama.toLowerCase().includes(q)) ||
        (k.daerah_kategori && k.daerah_kategori.toLowerCase().includes(q)) ||
        (k.keterangan && k.keterangan.toLowerCase().includes(q))
    )
  }, [dataAfterFilters, searchQuery])

  const statusLabel = useCallback((v) => (v === 'aktif' ? 'Aktif' : v === 'nonaktif' ? 'Nonaktif' : v), [])

  const { daerahOptions, statusOptions } = useMemo(() => {
    const base = kamarList
    const daerahCounts = {}
    base.forEach((k) => {
      const id = k.id_daerah != null ? String(k.id_daerah) : ''
      if (id === '') return
      if (!daerahCounts[id]) daerahCounts[id] = { count: 0, nama: k.daerah_nama ? `${k.daerah_kategori || ''} — ${k.daerah_nama}` : id }
      daerahCounts[id].count += 1
    })
    const daerahOptions = Object.entries(daerahCounts)
      .map(([value, o]) => ({ value, label: o.nama || value, count: o.count }))
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''))

    const statusCounts = {}
    base.forEach((k) => {
      const s = normalizeStatus(k.status) || '(tanpa status)'
      statusCounts[s] = (statusCounts[s] || 0) + 1
    })
    const statusOptions = Object.entries(statusCounts)
      .filter(([value]) => value !== '(tanpa status)' && value !== '')
      .map(([value, count]) => ({ value, label: statusLabel(value), count }))

    return { daerahOptions, statusOptions }
  }, [kamarList, statusLabel])

  const loadKetuaKamar = useCallback(async (idDaerahKamar) => {
    if (!idDaerahKamar) return
    try {
      const res = await daerahKetuaKamarAPI.getAll({ id_daerah_kamar: idDaerahKamar })
      if (res.success && res.data) {
        setKetuaList(res.data)
      }
    } catch (err) {
      console.error('Error loading ketua kamar:', err)
    }
  }, [])

  useEffect(() => {
    if (offcanvasOpen && editingKamar?.id) {
      loadKetuaKamar(editingKamar.id)
    } else {
      setKetuaList([])
    }
  }, [offcanvasOpen, editingKamar?.id, loadKetuaKamar])

  const handleOpenOffcanvas = (kamar = null) => {
    if (kamar) {
      setEditingKamar(kamar)
      setFormData({
        id_daerah: String(kamar.id_daerah || ''),
        kamar: kamar.kamar || '',
        keterangan: kamar.keterangan || '',
        status: kamar.status || 'aktif'
      })
    } else {
      setEditingKamar(null)
      setFormData({
        id_daerah: filterDaerah || '',
        kamar: '',
        keterangan: '',
        status: 'aktif'
      })
    }
    setOffcanvasOpen(true)
  }

  const handleCloseOffcanvas = () => {
    setOffcanvasOpen(false)
    setEditingKamar(null)
    setKetuaOffcanvasOpen(false)
    setKetuaList([])
    setFormData({ id_daerah: '', kamar: '', keterangan: '', status: 'aktif' })
  }

  const handleOpenKetuaOffcanvas = () => {
    setEditingKetua(null)
    setKetuaFormData({
      id_ketua_kamar: '',
      tahun_ajaran: '',
      status: 'aktif',
      keterangan: ''
    })
    ;(async () => {
      try {
        const st = await santriAPI.getAll()
        if (st?.data) setSantriList(Array.isArray(st.data) ? st.data : [])
      } catch (_) {}
    })()
    setKetuaOffcanvasOpen(true)
  }

  const handleEditKetuaOffcanvas = (row) => {
    setEditingKetua(row)
    setKetuaFormData({
      id_ketua_kamar: String(row.id_ketua_kamar || ''),
      tahun_ajaran: row.tahun_ajaran || '',
      status: row.status || 'aktif',
      keterangan: row.keterangan || ''
    })
    ;(async () => {
      try {
        const st = await santriAPI.getAll()
        if (st?.data) setSantriList(Array.isArray(st.data) ? st.data : [])
      } catch (_) {}
    })()
    setKetuaOffcanvasOpen(true)
  }

  const handleCloseKetuaOffcanvas = () => {
    setKetuaOffcanvasOpen(false)
    setEditingKetua(null)
    if (editingKamar?.id) loadKetuaKamar(editingKamar.id)
  }

  const handleSubmitKetua = async (e) => {
    e.preventDefault()
    if (!editingKamar?.id) return
    if (!ketuaFormData.id_ketua_kamar) {
      showNotification('Santri (ketua kamar) wajib dipilih', 'error')
      return
    }
    setSavingKetua(true)
    try {
      const payload = {
        id_daerah_kamar: editingKamar.id,
        id_ketua_kamar: Number(ketuaFormData.id_ketua_kamar),
        tahun_ajaran: ketuaFormData.tahun_ajaran || null,
        status: ketuaFormData.status || 'aktif',
        keterangan: ketuaFormData.keterangan || null
      }
      if (editingKetua?.id) {
        const res = await daerahKetuaKamarAPI.update(editingKetua.id, payload)
        if (res.success) {
          showNotification('Ketua kamar berhasil diupdate', 'success')
          handleCloseKetuaOffcanvas()
          loadKetuaKamar(editingKamar.id)
        } else {
          showNotification(res.message || 'Gagal mengupdate ketua kamar', 'error')
        }
      } else {
        const res = await daerahKetuaKamarAPI.create(payload)
        if (res.success) {
          showNotification('Ketua kamar berhasil ditambahkan', 'success')
          handleCloseKetuaOffcanvas()
          loadKetuaKamar(editingKamar.id)
        } else {
          showNotification(res.message || 'Gagal menambahkan ketua kamar', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving ketua kamar:', err)
      showNotification('Terjadi kesalahan saat menyimpan', 'error')
    } finally {
      setSavingKetua(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.id_daerah) {
      showNotification('Daerah wajib diisi', 'error')
      return
    }
    if (!formData.kamar?.trim()) {
      showNotification('Nama kamar wajib diisi', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        id_daerah: Number(formData.id_daerah),
        kamar: formData.kamar.trim(),
        keterangan: formData.keterangan || null,
        status: formData.status || 'aktif'
      }
      if (editingKamar) {
        const response = await daerahKamarAPI.update(editingKamar.id, payload)
        if (response.success) {
          showNotification('Kamar berhasil diupdate', 'success')
          handleCloseOffcanvas()
          loadKamar()
        } else {
          showNotification(response.message || 'Gagal mengupdate kamar', 'error')
        }
      } else {
        const response = await daerahKamarAPI.create(payload)
        if (response.success) {
          showNotification('Kamar berhasil ditambahkan', 'success')
          handleCloseOffcanvas()
          loadKamar()
        } else {
          showNotification(response.message || 'Gagal menambahkan kamar', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving kamar:', err)
      showNotification('Terjadi kesalahan saat menyimpan data', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSetStatusKetua = async (id, status) => {
    try {
      const res = await daerahKetuaKamarAPI.setStatus(id, status)
      if (res.success) {
        showNotification(res.message || 'Status diubah', 'success')
        if (editingKamar?.id) loadKetuaKamar(editingKamar.id)
      } else {
        showNotification(res.message || 'Gagal mengubah status', 'error')
      }
    } catch (err) {
      showNotification('Gagal mengubah status', 'error')
    }
  }

  const ketuaAktif = useMemo(() => ketuaList.filter((k) => normalizeStatus(k.status) === 'aktif'), [ketuaList])
  const ketuaLain = useMemo(() => ketuaList.filter((k) => normalizeStatus(k.status) !== 'aktif'), [ketuaList])
  const ketuaSorted = useMemo(() => [...ketuaAktif, ...ketuaLain], [ketuaAktif, ketuaLain])

  if (loading && kamarList.length === 0) {
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
                placeholder="Cari daerah, kamar..."
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
                <button type="button" onClick={loadKamar} className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto" title="Refresh">
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
                    <span className="text-xs text-gray-600 dark:text-gray-400">Daerah:</span>
                    <select
                      value={filterDaerah}
                      onChange={(e) => setFilterDaerah(e.target.value)}
                      className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[200px]"
                    >
                      <option value="">Semua</option>
                      {daerahOptions.map((o) => (
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
              Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredKamar.length}</span>
            </span>
            <button type="button" onClick={() => handleOpenOffcanvas()} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Kamar
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence>
              {filteredKamar.map((kamar, index) => (
                <motion.div
                  key={kamar.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.03 }}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleOpenOffcanvas(kamar)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenOffcanvas(kamar) } }}
                  className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 border cursor-pointer hover:shadow-lg transition-all ${
                    kamar.status === 'nonaktif' ? 'border-gray-200 dark:border-gray-700 opacity-75' : 'border-gray-200 dark:border-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                        {kamar.daerah_nama ? `${kamar.daerah_kategori || ''} — ${kamar.daerah_nama}` : `Daerah #${kamar.id_daerah}`} — {kamar.kamar}
                      </h3>
                      <span
                        className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                          kamar.status === 'aktif' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-400'
                        }`}
                      >
                        {kamar.status === 'aktif' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  {kamar.keterangan && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">{kamar.keterangan}</p>
                  )}
                  {kamar.tanggal_dibuat && (
                    <p className="text-xs text-gray-500 dark:text-gray-500">Dibuat: {new Date(kamar.tanggal_dibuat).toLocaleDateString('id-ID')}</p>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredKamar.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery || filterDaerah || filterStatus ? 'Tidak ada kamar yang sesuai filter' : 'Belum ada data kamar'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Offcanvas Kamar */}
      {createPortal(
        <AnimatePresence>
          {offcanvasOpen && (
            <>
              <motion.div key="kamar-offcanvas-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseOffcanvas} className="fixed inset-0 bg-black/50 z-[200]" />
              <motion.div
                key="kamar-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{editingKamar ? 'Edit Kamar' : 'Tambah Kamar'}</h3>
                  <button type="button" onClick={handleCloseOffcanvas} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" aria-label="Tutup">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Daerah <span className="text-red-500">*</span></label>
                      <select
                        value={formData.id_daerah}
                        onChange={(e) => setFormData({ ...formData, id_daerah: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                      >
                        <option value="">Pilih Daerah</option>
                        {daerahList.map((d) => (
                          <option key={d.id} value={d.id}>{d.kategori} — {d.daerah}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kamar <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={formData.kamar}
                        onChange={(e) => setFormData({ ...formData, kamar: e.target.value })}
                        required
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                        placeholder="Nama kamar"
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

                    {editingKamar?.id && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ketua Kamar</h4>
                          <button type="button" onClick={handleOpenKetuaOffcanvas} className="px-2 py-1.5 text-xs bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Tambah
                          </button>
                        </div>
                        <ul className="space-y-0">
                          {ketuaSorted.map((kk, idx) => {
                            const isAktif = kk.status === 'aktif'
                            const bgClass = isAktif ? 'bg-gray-50 dark:bg-gray-700/50' : 'bg-gray-100 dark:bg-gray-700'
                            return (
                              <li
                                key={kk.id}
                                role="button"
                                tabIndex={0}
                                onClick={() => handleEditKetuaOffcanvas(kk)}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEditKetuaOffcanvas(kk) } }}
                                className={`relative flex items-start gap-3 pl-2 -ml-px py-2 rounded cursor-pointer hover:ring-1 hover:ring-teal-500/50 ${bgClass}`}
                              >
                                <span className="relative z-10 mt-1.5 h-3 w-3 shrink-0 rounded-full bg-teal-500 dark:bg-teal-400 border-2 border-white dark:border-gray-800" aria-hidden />
                                <div className="min-w-0 flex-1 pt-0.5">
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{kk.tahun_ajaran || '–'}</p>
                                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{kk.ketua_nama || '(Belum diisi)'}</p>
                                  {isAktif && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Aktif</span>
                                  )}
                                  {!isAktif && (
                                    <button type="button" onClick={(ev) => { ev.stopPropagation(); handleSetStatusKetua(kk.id, 'aktif') }} className="text-xs text-teal-600 hover:underline mt-0.5">Aktifkan</button>
                                  )}
                                </div>
                              </li>
                            )
                          })}
                        </ul>
                        {ketuaList.length === 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 py-2">Belum ada ketua kamar.</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2 flex-shrink-0">
                    <button type="button" onClick={handleCloseOffcanvas} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm">Batal</button>
                    <button type="submit" disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm">
                      {saving ? 'Menyimpan...' : (editingKamar ? 'Simpan Perubahan' : 'Tambah')}
                    </button>
                  </div>
                </form>
              </motion.div>

              {/* Offcanvas Tambah/Edit Ketua Kamar */}
              <AnimatePresence>
                {ketuaOffcanvasOpen && (
                  <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseKetuaOffcanvas} className="fixed inset-0 bg-black/50 z-[202]" />
                    <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.2 }} className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[203] flex flex-col">
                      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{editingKetua ? 'Edit Ketua Kamar' : 'Tambah Ketua Kamar'}</h3>
                        <button type="button" onClick={handleCloseKetuaOffcanvas} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400" aria-label="Tutup">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <form onSubmit={handleSubmitKetua} className="flex-1 flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tahun Ajaran</label>
                            <select
                              value={ketuaFormData.tahun_ajaran}
                              onChange={(e) => setKetuaFormData({ ...ketuaFormData, tahun_ajaran: e.target.value })}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Tahun Ajaran --</option>
                              {tahunAjaranOptions.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ketua Kamar (Santri) <span className="text-red-500">*</span></label>
                            <select
                              value={ketuaFormData.id_ketua_kamar}
                              onChange={(e) => setKetuaFormData({ ...ketuaFormData, id_ketua_kamar: e.target.value })}
                              required
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                            >
                              <option value="">-- Pilih Santri --</option>
                              {santriList.slice(0, 300).map((s) => (
                                <option key={s.id} value={s.id}>{s.nama || `NIS ${s.nis}`}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-gray-600 dark:text-gray-400">{ketuaFormData.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span>
                              <button
                                type="button"
                                onClick={() => setKetuaFormData({ ...ketuaFormData, status: ketuaFormData.status === 'aktif' ? 'nonaktif' : 'aktif' })}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${ketuaFormData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-200 dark:bg-gray-600'}`}
                              >
                                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${ketuaFormData.status === 'aktif' ? 'translate-x-5' : 'translate-x-1'}`} />
                              </button>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Keterangan</label>
                            <textarea
                              value={ketuaFormData.keterangan}
                              onChange={(e) => setKetuaFormData({ ...ketuaFormData, keterangan: e.target.value })}
                              rows={2}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:text-gray-200"
                              placeholder="Opsional"
                            />
                          </div>
                        </div>
                        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 flex-shrink-0">
                          <button type="button" onClick={handleCloseKetuaOffcanvas} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">Batal</button>
                          <button type="submit" disabled={savingKetua} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm">
                            {savingKetua ? 'Menyimpan...' : (editingKetua ? 'Simpan Perubahan' : 'Simpan')}
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

export default Kamar
