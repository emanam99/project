import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { statusSantriMasterAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'

const normalizeStatus = (s) => {
  const t = String(s || '').trim().toLowerCase()
  if (t === 'aktif' || t === 'active') return 'aktif'
  if (t === 'nonaktif' || t === 'inactive') return 'nonaktif'
  return t
}

function StatusSantri() {
  const { showNotification } = useNotification()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [formData, setFormData] = useState({
    status_santri: '',
    kategori: '',
    status: 'aktif',
  })

  const loadRows = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const res = await statusSantriMasterAPI.getAll()
      if (res?.success) {
        setRows(Array.isArray(res.data) ? res.data : [])
      } else {
        setError(res?.message || 'Gagal memuat data status santri')
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal memuat data status santri')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRows()
  }, [loadRows])

  const kategoriOptions = useMemo(() => {
    const map = {}
    rows.forEach((r) => {
      const k = String(r?.kategori || '').trim()
      if (!k) return
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, 'id', { sensitivity: 'base' }))
  }, [rows])

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return rows.filter((r) => {
      if (kategoriFilter && String(r?.kategori || '') !== kategoriFilter) return false
      if (statusFilter && normalizeStatus(r?.status) !== normalizeStatus(statusFilter)) return false
      if (!q) return true
      return (
        String(r?.status_santri || '').toLowerCase().includes(q) ||
        String(r?.kategori || '').toLowerCase().includes(q)
      )
    })
  }, [rows, searchQuery, kategoriFilter, statusFilter])

  const openAdd = () => {
    setEditingRow(null)
    setFormData({ status_santri: '', kategori: '', status: 'aktif' })
    setError('')
    setOffcanvasOpen(true)
  }

  const openEdit = (row) => {
    setEditingRow(row)
    setFormData({
      status_santri: row?.status_santri || '',
      kategori: row?.kategori || '',
      status: normalizeStatus(row?.status) === 'nonaktif' ? 'nonaktif' : 'aktif',
    })
    setError('')
    setOffcanvasOpen(true)
  }

  const closeOffcanvas = () => {
    if (saving) return
    setOffcanvasOpen(false)
    setEditingRow(null)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      status_santri: String(formData.status_santri || '').trim(),
      kategori: String(formData.kategori || '').trim(),
      status: formData.status === 'nonaktif' ? 'nonaktif' : 'aktif',
    }
    if (!payload.status_santri) {
      showNotification('Status santri wajib diisi', 'error')
      return
    }
    if (!payload.kategori) {
      showNotification('Kategori wajib diisi', 'error')
      return
    }

    try {
      setSaving(true)
      setError('')
      const res = editingRow
        ? await statusSantriMasterAPI.update(editingRow.id, payload)
        : await statusSantriMasterAPI.create(payload)
      if (res?.success) {
        showNotification(editingRow ? 'Status santri berhasil diupdate' : 'Status santri berhasil ditambahkan', 'success')
        setOffcanvasOpen(false)
        setEditingRow(null)
        await loadRows()
        return
      }
      setError(res?.message || 'Gagal menyimpan data')
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal menyimpan data')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (row) => {
    const nextStatus = normalizeStatus(row?.status) === 'aktif' ? 'nonaktif' : 'aktif'
    try {
      const res = await statusSantriMasterAPI.setStatus(row.id, nextStatus)
      if (res?.success) {
        showNotification(res?.message || 'Status berhasil diubah', 'success')
        await loadRows()
      } else {
        showNotification(res?.message || 'Gagal mengubah status', 'error')
      }
    } catch (_) {
      showNotification('Gagal mengubah status', 'error')
    }
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-hidden flex flex-col">
      <div className="container mx-auto px-4 py-6 max-w-7xl flex-shrink-0">
        {error && !offcanvasOpen && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            {error}
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
                placeholder="Cari status santri, kategori..."
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
                </button>
                <button type="button" onClick={() => loadRows()} className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto" title="Refresh">
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
                className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="px-4 py-2 flex flex-wrap gap-2">
                  <select
                    value={kategoriFilter}
                    onChange={(e) => setKategoriFilter(e.target.value)}
                    className="border rounded p-1.5 h-8 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  >
                    <option value="">Semua Kategori</option>
                    {kategoriOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.value} ({o.count})</option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border rounded p-1.5 h-8 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  >
                    <option value="">Semua Status</option>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Total: <span className="font-semibold text-gray-800 dark:text-gray-200">{filteredRows.length}</span>
            </span>
            <button type="button" onClick={openAdd} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Tambah Status
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {filteredRows.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Belum ada data status santri</div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredRows.map((row, index) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: index * 0.02 }}
                    className="p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="text-left flex-1 min-w-0 hover:opacity-80 transition-opacity"
                      >
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.status_santri}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Kategori: {row.kategori || '-'}</p>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                          normalizeStatus(row.status) === 'aktif'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {normalizeStatus(row.status) === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(row)}
                          className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          {normalizeStatus(row.status) === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
          <div className="h-20 sm:h-0" aria-hidden="true" />
        </div>
      </div>

      <AnimatePresence>
        {offcanvasOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeOffcanvas}
              className="fixed inset-0 bg-black/50 z-[200]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
            >
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {editingRow ? 'Edit Status Santri' : 'Tambah Status Santri'}
                </h3>
                <button type="button" onClick={closeOffcanvas} className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status Santri *</label>
                    <input
                      type="text"
                      value={formData.status_santri}
                      onChange={(e) => setFormData((prev) => ({ ...prev, status_santri: e.target.value }))}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Contoh: Mukim"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kategori *</label>
                    <input
                      type="text"
                      value={formData.kategori}
                      onChange={(e) => setFormData((prev) => ({ ...prev, kategori: e.target.value }))}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Contoh: Banin"
                    />
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
                        onClick={() => setFormData((prev) => ({ ...prev, status: prev.status === 'aktif' ? 'nonaktif' : 'aktif' }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          formData.status === 'aktif' ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          formData.status === 'aktif' ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </button>
                    </div>
                  </div>
                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
                      {error}
                    </div>
                  )}
                </div>
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-2">
                  <button type="button" onClick={closeOffcanvas} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                    Batal
                  </button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm">
                    {saving ? 'Menyimpan...' : (editingRow ? 'Simpan Perubahan' : 'Tambah')}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

export default StatusSantri
