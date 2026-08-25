import { useEffect, useState } from 'react'
import { umrohPengeluaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'

const KATEGORI = ['Tiket Pesawat', 'Hotel', 'Visa', 'Transportasi', 'Makanan', 'Dokumentasi', 'Souvenir', 'Operasional', 'Lainnya']
const SUMBER = ['Cash', 'Transfer', 'Lainnya']
const STATUS_FORM = ['Draft', 'Pending']

function formatRp(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value || 0)
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return value
  }
}

function statusClass(status) {
  if (status === 'Approved') return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  if (status === 'Rejected') return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  if (status === 'Pending') return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
}

const emptyForm = {
  keterangan: '',
  kategori: 'Operasional',
  sumber_uang: 'Cash',
  nominal: '',
  status: 'Draft',
}

function PengeluaranUmroh() {
  const { showNotification } = useNotification()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formData, setFormData] = useState(emptyForm)
  const [filters, setFilters] = useState({ status: '', kategori: '' })
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, total_pages: 0 })

  const fetchList = async (page = pagination.page) => {
    setLoading(true)
    try {
      const result = await umrohPengeluaranAPI.getAll({
        page,
        limit: pagination.limit,
        ...filters,
      })
      if (result.success) {
        setList(result.data || [])
        setPagination(result.pagination || { ...pagination, page })
      } else {
        showNotification(result.message || 'Gagal memuat pengeluaran', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal memuat pengeluaran', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchList(1)
  }, [filters.status, filters.kategori])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const nominal = Number(String(formData.nominal).replace(/\D/g, '')) || 0
    if (!formData.keterangan.trim()) {
      showNotification('Keterangan wajib diisi', 'error')
      return
    }
    if (nominal <= 0) {
      showNotification('Nominal wajib diisi', 'error')
      return
    }
    setSaving(true)
    try {
      const result = await umrohPengeluaranAPI.create({
        keterangan: formData.keterangan.trim(),
        kategori: formData.kategori,
        sumber_uang: formData.sumber_uang,
        nominal,
        status: formData.status,
      })
      if (result.success) {
        showNotification(result.message || 'Pengeluaran berhasil disimpan', 'success')
        setFormOpen(false)
        setFormData(emptyForm)
        fetchList(1)
      } else {
        showNotification(result.message || 'Gagal menyimpan pengeluaran', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menyimpan pengeluaran', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async (id) => {
    try {
      const result = await umrohPengeluaranAPI.approve(id)
      if (result.success) {
        showNotification(result.message || 'Pengeluaran di-approve', 'success')
        fetchList()
      } else {
        showNotification(result.message || 'Gagal approve', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal approve', 'error')
    }
  }

  const handleReject = async (id) => {
    try {
      const result = await umrohPengeluaranAPI.reject(id)
      if (result.success) {
        showNotification(result.message || 'Pengeluaran ditolak', 'success')
        fetchList()
      } else {
        showNotification(result.message || 'Gagal menolak', 'error')
      }
    } catch (err) {
      showNotification(err.response?.data?.message || 'Gagal menolak', 'error')
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Pengeluaran Umroh</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Catat dan setujui pengeluaran operasional umroh.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormData(emptyForm)
              setFormOpen(true)
            }}
            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm"
          >
            Tambah pengeluaran
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap gap-2">
          <select
            value={filters.status}
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="">Semua status</option>
            <option value="Draft">Draft</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select
            value={filters.kategori}
            onChange={(e) => setFilters((prev) => ({ ...prev, kategori: e.target.value }))}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white"
          >
            <option value="">Semua kategori</option>
            {KATEGORI.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        {formOpen && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl border border-teal-200 dark:border-teal-800 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Keterangan *</label>
                <input
                  type="text"
                  value={formData.keterangan}
                  onChange={(e) => setFormData((prev) => ({ ...prev, keterangan: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kategori</label>
                <select
                  value={formData.kategori}
                  onChange={(e) => setFormData((prev) => ({ ...prev, kategori: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                >
                  {KATEGORI.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Sumber uang</label>
                <select
                  value={formData.sumber_uang}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sumber_uang: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                >
                  {SUMBER.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nominal *</label>
                <input
                  type="number"
                  min="0"
                  value={formData.nominal}
                  onChange={(e) => setFormData((prev) => ({ ...prev, nominal: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 dark:text-white"
                >
                  {STATUS_FORM.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
                Batal
              </button>
              <button type="submit" disabled={saving} className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
            </div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Belum ada pengeluaran</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Tanggal</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Kode</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Keterangan</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-300">Nominal</th>
                    <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Status</th>
                    <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-300">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {list.map((row) => (
                    <tr key={row.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{formatDate(row.tanggal_dibuat)}</td>
                      <td className="px-3 py-2">{row.kode_pengeluaran}</td>
                      <td className="px-3 py-2">
                        <div className="text-gray-900 dark:text-white">{row.keterangan}</div>
                        <div className="text-xs text-gray-500">{row.kategori} · {row.sumber_uang}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatRp(row.nominal)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${statusClass(row.status)}`}>{row.status}</span>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {(row.status === 'Draft' || row.status === 'Pending') && (
                          <>
                            <button type="button" onClick={() => handleApprove(row.id)} className="text-xs text-teal-600 dark:text-teal-400 mr-2">
                              Approve
                            </button>
                            <button type="button" onClick={() => handleReject(row.id)} className="text-xs text-red-600 dark:text-red-400">
                              Tolak
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pagination.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between text-sm">
              <button
                type="button"
                disabled={pagination.page === 1}
                onClick={() => fetchList(pagination.page - 1)}
                className="disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                disabled={pagination.page >= pagination.total_pages}
                onClick={() => fetchList(pagination.page + 1)}
                className="disabled:opacity-50"
              >
                Selanjutnya
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PengeluaranUmroh
