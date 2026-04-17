import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { barangAPI } from '../services/api'

function formatRupiah(n) {
  if (n == null || Number.isNaN(Number(n))) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n)
}

export default function Barang() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ nama_barang: '', harga: '', kode_barang: '', keterangan: '' })
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  const loadBarang = async (searchTerm = search) => {
    if (!user?.has_toko) return
    setLoading(true)
    setError('')
    try {
      const res = await barangAPI.getList(searchTerm ? { search: searchTerm } : {})
      if (res.success && Array.isArray(res.data)) setList(res.data)
      else setList([])
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat data barang')
      setList([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user?.has_toko) {
      navigate('/', { replace: true })
      return
    }
    loadBarang()
  }, [user?.has_toko])

  const openTambah = () => {
    setEditing(null)
    setForm({ nama_barang: '', harga: '', kode_barang: '', keterangan: '' })
    setShowForm(true)
  }

  const openEdit = (b) => {
    setEditing(b)
    setForm({
      nama_barang: b.nama_barang || '',
      harga: b.harga != null ? String(b.harga) : '',
      kode_barang: b.kode_barang || '',
      keterangan: b.keterangan || '',
    })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setForm({ nama_barang: '', harga: '', kode_barang: '', keterangan: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nama = (form.nama_barang || '').trim()
    const hargaNum = parseFloat(form.harga)
    if (!nama) {
      setError('Nama barang wajib diisi')
      return
    }
    if (Number.isNaN(hargaNum) || hargaNum < 0) {
      setError('Harga wajib diisi dan tidak boleh negatif')
      return
    }
    const kode = (form.kode_barang || '').trim()
    if (editing && !kode) {
      setError('Kode/QR/barcode wajib diisi')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editing) {
        const res = await barangAPI.update(editing.id, {
          nama_barang: nama,
          harga: hargaNum,
          kode_barang: kode,
          keterangan: (form.keterangan || '').trim() || null,
        })
        if (res.success) {
          setSuccess(res.message || 'Barang berhasil diperbarui')
          closeForm()
          loadBarang()
        } else {
          setError(res.message || 'Gagal memperbarui')
        }
      } else {
        const res = await barangAPI.create({
          nama_barang: nama,
          harga: hargaNum,
          kode_barang: kode || undefined,
          keterangan: (form.keterangan || '').trim() || null,
        })
        if (res.success) {
          setSuccess(res.message || 'Barang berhasil ditambahkan')
          closeForm()
          loadBarang()
        } else {
          setError(res.message || 'Gagal menambahkan')
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Hapus barang ini?')) return
    setDeletingId(id)
    setError('')
    try {
      const res = await barangAPI.delete(id)
      if (res.success) {
        setSuccess(res.message || 'Barang berhasil dihapus')
        closeForm()
        loadBarang()
      } else {
        setError(res.message || 'Gagal menghapus')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal menghapus')
    } finally {
      setDeletingId(null)
    }
  }

  if (!user?.has_toko) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Data Barang</h1>
        <div className="flex gap-2 flex-1 sm:max-w-xs">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadBarang(search)}
            placeholder="Cari nama atau kode/QR/barcode..."
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
          <button
            type="button"
            onClick={() => loadBarang(search)}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Cari
          </button>
        </div>
        <button
          type="button"
          onClick={openTambah}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium shrink-0"
        >
          + Tambah Barang
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 text-sm">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-teal-500 border-t-transparent" />
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {search ? 'Tidak ada barang yang cocok dengan pencarian.' : 'Belum ada barang. Klik "Tambah Barang" untuk menambah.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((b) => (
            <li
              key={b.id}
              role="button"
              tabIndex={0}
              onClick={() => openEdit(b)}
              onKeyDown={(e) => e.key === 'Enter' && openEdit(b)}
              className="rounded-xl bg-white dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{b.nama_barang}</p>
                  {b.kode_barang && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 font-mono">
                      {b.kode_barang}
                    </span>
                  )}
                </div>
                <p className="text-sm text-teal-600 dark:text-teal-400 mt-0.5">{formatRupiah(b.harga)}</p>
                {b.keterangan && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{b.keterangan}</p>
                )}
                {b.aktif === 0 && (
                  <span className="inline-block mt-1 text-xs text-amber-600 dark:text-amber-400">Nonaktif</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Offcanvas bawah: tambah / edit barang */}
      {showForm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={closeForm} aria-hidden="true" />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-gray-800 shadow-2xl safe-area-pb">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? 'Edit Barang' : 'Tambah Barang'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg"
                aria-label="Tutup"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 pb-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nama barang</label>
                  <input
                    type="text"
                    value={form.nama_barang}
                    onChange={(e) => setForm((f) => ({ ...f, nama_barang: e.target.value }))}
                    placeholder="Contoh: Nasi Goreng"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Kode / QR / Barcode {editing ? '' : '(opsional)'}
                  </label>
                  <input
                    type="text"
                    value={form.kode_barang}
                    onChange={(e) => setForm((f) => ({ ...f, kode_barang: e.target.value }))}
                    placeholder={editing ? 'Kode barang' : 'Kosongkan untuk kode otomatis (B0001, B0002, ...)'}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
                    required={!!editing}
                  />
                  {!editing && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Isi jika barang punya QR/barcode; kosongkan agar sistem buat kode otomatis.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Harga (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.harga}
                    onChange={(e) => setForm((f) => ({ ...f, harga: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Keterangan (opsional)</label>
                  <input
                    type="text"
                    value={form.keterangan}
                    onChange={(e) => setForm((f) => ({ ...f, keterangan: e.target.value }))}
                    placeholder="Opsional"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                {editing && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(editing.id)}
                      disabled={saving || deletingId === editing.id}
                      className="w-full px-4 py-2.5 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {deletingId === editing.id ? (
                        <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Hapus Barang
                        </>
                      )}
                    </button>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan...' : editing ? 'Simpan' : 'Tambah'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
