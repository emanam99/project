import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { pelanggaranAdminAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useDomisiliPelanggaranFiturAccess } from '../../hooks/useDomisiliPelanggaranFiturAccess'

const KATEGORI_OPTIONS = [
  { value: 'ringan', label: 'Ringan' },
  { value: 'sedang', label: 'Sedang' },
  { value: 'berat', label: 'Berat' },
  { value: 'buku_hitam', label: 'Buku Hitam' }
]

function labelKategori(v) {
  const row = KATEGORI_OPTIONS.find((x) => x.value === v)
  return row ? row.label : v != null ? String(v) : '–'
}

const normalizeStatus = (s) => {
  const t = String(s || '').trim().toLowerCase()
  if (t === '1' || t === 'aktif' || t === 'true') return 'aktif'
  return 'nonaktif'
}

function Pelanggaran() {
  const { showNotification } = useNotification()
  const { fiturReady, canLoadMasterList, canCreate, canEdit, canSetStatus } = useDomisiliPelanggaranFiturAccess()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('aktif')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [offcanvasOpen, setOffcanvasOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [formData, setFormData] = useState({
    kategori: 'ringan',
    nama: '',
    urutan: 0,
    aktif: true
  })

  const loadRows = useCallback(async () => {
    if (!canLoadMasterList) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      setError('')
      const res = await pelanggaranAdminAPI.getAll()
      if (res?.success) {
        setRows(Array.isArray(res.data) ? res.data : [])
      } else {
        setError(res?.message || 'Gagal memuat data')
        setRows([])
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal memuat data')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [canLoadMasterList])

  useEffect(() => {
    if (!fiturReady) return
    loadRows()
  }, [fiturReady, loadRows])

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
      if (statusFilter) {
        const st = normalizeStatus(r?.aktif) === 'aktif' ? 'aktif' : 'nonaktif'
        if (st !== statusFilter) return false
      }
      if (!q) return true
      return (
        String(r?.nama || '').toLowerCase().includes(q) ||
        String(r?.kategori || '').toLowerCase().includes(q)
      )
    })
  }, [rows, searchQuery, kategoriFilter, statusFilter])

  const openAdd = () => {
    if (!canCreate) return
    setEditingRow(null)
    setFormData({ kategori: 'ringan', nama: '', urutan: 0, aktif: true })
    setError('')
    setOffcanvasOpen(true)
  }

  const openEdit = (row) => {
    if (!canEdit) return
    setEditingRow(row)
    setFormData({
      kategori: String(row?.kategori || 'ringan'),
      nama: row?.nama || '',
      urutan: row?.urutan != null ? Number(row.urutan) : 0,
      aktif: normalizeStatus(row?.aktif) === 'aktif'
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
    const nama = String(formData.nama || '').trim()
    if (!nama) {
      showNotification('Nama pelanggaran wajib diisi', 'error')
      return
    }
    const payload = {
      kategori: formData.kategori,
      nama,
      urutan: Number(formData.urutan) || 0,
      aktif: formData.aktif ? 1 : 0
    }
    try {
      setSaving(true)
      setError('')
      const res = editingRow
        ? await pelanggaranAdminAPI.update(editingRow.id, payload)
        : await pelanggaranAdminAPI.create(payload)
      if (res?.success) {
        showNotification(editingRow ? 'Data diperbarui' : 'Jenis pelanggaran ditambahkan', 'success')
        setOffcanvasOpen(false)
        setEditingRow(null)
        await loadRows()
        return
      }
      setError(res?.message || 'Gagal menyimpan')
    } catch (err) {
      setError(err?.response?.data?.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (row) => {
    if (!canSetStatus) return
    const next = normalizeStatus(row?.aktif) === 'aktif' ? 0 : 1
    try {
      const res = await pelanggaranAdminAPI.setStatus(row.id, next === 1)
      if (res?.success) {
        showNotification(res?.message || 'Status diubah', 'success')
        await loadRows()
      } else {
        showNotification(res?.message || 'Gagal mengubah status', 'error')
      }
    } catch (_) {
      showNotification('Gagal mengubah status', 'error')
    }
  }

  if (!fiturReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    )
  }

  if (!canLoadMasterList) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-800 dark:bg-amber-900/25 dark:text-amber-100">
          <h1 className="text-lg font-semibold">Pelanggaran</h1>
          <p className="mt-2 text-sm">
            Anda tidak memiliki akses ke halaman ini. Minta administrator untuk menugaskan menu Domisili → Pelanggaran
            atau aksi «Pelanggaran · Akses halaman» pada peran Anda (Pengaturan → Fitur).
          </p>
        </div>
      </div>
    )
  }

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
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
                placeholder="Cari nama atau kategori..."
              />
              <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                  title={isFilterOpen ? 'Sembunyikan filter' : 'Filter'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => loadRows()}
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
                className="overflow-hidden border-t bg-gray-50 dark:bg-gray-700/50"
              >
                <div className="px-4 py-2 flex flex-wrap gap-2">
                  <select
                    value={kategoriFilter}
                    onChange={(e) => setKategoriFilter(e.target.value)}
                    className="border rounded p-1.5 h-8 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  >
                    <option value="">Semua kategori</option>
                    {kategoriOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {labelKategori(o.value)} ({o.count})
                      </option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border rounded p-1.5 h-8 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
                  >
                    <option value="">Semua status</option>
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
            {canCreate ? (
              <button
                type="button"
                onClick={openAdd}
                className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Tambah
              </button>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400">Tanpa akses tambah</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 pb-6 max-w-7xl">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            {filteredRows.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">Tidak ada data yang cocok</div>
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
                        disabled={!canEdit}
                        onClick={() => openEdit(row)}
                        className={`text-left flex-1 min-w-0 ${canEdit ? 'hover:opacity-80' : 'cursor-default opacity-70'}`}
                      >
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.nama}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {labelKategori(row.kategori)} · urutan {row.urutan ?? 0}
                        </p>
                      </button>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                            normalizeStatus(row.aktif) === 'aktif'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          }`}
                        >
                          {normalizeStatus(row.aktif) === 'aktif' ? 'Aktif' : 'Nonaktif'}
                        </span>
                        {canSetStatus ? (
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(row)}
                            className="px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            {normalizeStatus(row.aktif) === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                          </button>
                        ) : null}
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

      {createPortal(
        <AnimatePresence>
          {offcanvasOpen && (
            <>
              <motion.div
                key="pelanggaran-offcanvas-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeOffcanvas}
                className="fixed inset-0 bg-black/50 z-[200]"
              />
              <motion.div
                key="pelanggaran-offcanvas-panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'tween', duration: 0.2 }}
                className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-[201] flex flex-col"
              >
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                  {editingRow ? 'Ubah pelanggaran' : 'Tambah pelanggaran'}
                </h3>
                <button
                  type="button"
                  onClick={closeOffcanvas}
                  className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kategori *</label>
                    <select
                      value={formData.kategori}
                      onChange={(e) => setFormData((prev) => ({ ...prev, kategori: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                    >
                      {KATEGORI_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nama *</label>
                    <input
                      type="text"
                      value={formData.nama}
                      onChange={(e) => setFormData((prev) => ({ ...prev, nama: e.target.value }))}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                      placeholder="Contoh: Terlambat kegiatan"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Urutan</label>
                    <input
                      type="number"
                      value={formData.urutan}
                      onChange={(e) => setFormData((prev) => ({ ...prev, urutan: parseInt(e.target.value, 10) || 0 }))}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Status</label>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {formData.aktif ? 'Aktif' : 'Tidak aktif'}
                      </span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={formData.aktif}
                        onClick={() => setFormData((prev) => ({ ...prev, aktif: !prev.aktif }))}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                          formData.aktif ? 'bg-teal-600' : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                            formData.aktif ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
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
                  <button
                    type="button"
                    onClick={closeOffcanvas}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 text-sm"
                  >
                    {saving ? 'Menyimpan…' : editingRow ? 'Simpan' : 'Tambah'}
                  </button>
                </div>
              </form>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

export default Pelanggaran
