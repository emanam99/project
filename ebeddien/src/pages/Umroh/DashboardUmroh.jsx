import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { umrohJamaahAPI } from '../../services/api'

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(value || 0)
}

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

function DashboardUmroh() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)

  const loadDashboard = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await umrohJamaahAPI.getDashboard()
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.message || 'Gagal memuat dashboard umroh')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat dashboard umroh')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const stats = data?.stats || {}
  const cards = [
    { title: 'Total Jamaah', value: formatNumber(stats.total_jamaah), text: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-200 dark:border-teal-800' },
    { title: 'Aktif', value: formatNumber(stats.aktif), text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
    { title: 'Belum Berangkat', value: formatNumber(stats.belum_berangkat), text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800' },
    { title: 'Lunas', value: formatNumber(stats.lunas), text: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800' },
    { title: 'Total Tabungan', value: formatRp(stats.total_tabungan), text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800' },
    { title: 'Pengeluaran Approved', value: formatRp(stats.pengeluaran_approved), text: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800' },
  ]

  const shortcuts = [
    { to: '/umroh/jamaah', label: 'Jamaah', desc: 'Data & biodata' },
    { to: '/umroh/tabungan', label: 'Tabungan', desc: 'Setoran & penarikan' },
    { to: '/umroh/pengeluaran', label: 'Pengeluaran', desc: 'Draft & approve' },
    { to: '/laporan-umroh', label: 'Laporan', desc: 'Ringkasan & print' },
  ]

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 space-y-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Dashboard Umroh</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ringkasan jamaah, tabungan, dan pengeluaran.</p>
              </div>
              <button
                type="button"
                onClick={loadDashboard}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Refresh
              </button>
            </div>
          </motion.div>

          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {cards.map((card, index) => (
                  <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={`${card.bg} border ${card.border} rounded-xl p-3 sm:p-4`}
                  >
                    <p className={`text-[10px] sm:text-xs font-medium ${card.text}`}>{card.title}</p>
                    <p className={`text-sm sm:text-lg font-bold mt-1 ${card.text}`}>{card.value}</p>
                  </motion.div>
                ))}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {shortcuts.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-teal-400 dark:hover:border-teal-500 transition-colors"
                  >
                    <p className="font-semibold text-gray-900 dark:text-white">{item.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.desc}</p>
                  </Link>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 dark:text-white">Jamaah terbaru</h2>
                    <Link to="/umroh/jamaah" className="text-xs text-teal-600 dark:text-teal-400">Lihat semua</Link>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {(data.jamaah_terbaru || []).length === 0 ? (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Belum ada jamaah</p>
                    ) : (
                      data.jamaah_terbaru.map((row) => (
                        <Link
                          key={row.id}
                          to={`/umroh/jamaah/${row.id}/edit`}
                          className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{row.nama_lengkap}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{row.kode_jamaah || '-'} · {row.paket_umroh || 'Tanpa paket'}</p>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{formatRp(row.total_tabungan)}</span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 className="font-semibold text-gray-900 dark:text-white">Setoran terbaru</h2>
                    <Link to="/umroh/tabungan" className="text-xs text-teal-600 dark:text-teal-400">Buka tabungan</Link>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {(data.transaksi_terbaru || []).length === 0 ? (
                      <p className="p-4 text-sm text-gray-500 dark:text-gray-400">Belum ada transaksi</p>
                    ) : (
                      data.transaksi_terbaru.map((row) => (
                        <div key={row.id} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{row.nama_lengkap || '-'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{row.jenis} · {formatDate(row.tanggal_dibuat)}</p>
                            </div>
                            <span className={`text-sm font-semibold ${row.jenis === 'Penarikan' ? 'text-red-600 dark:text-red-400' : 'text-teal-600 dark:text-teal-400'}`}>
                              {row.jenis === 'Penarikan' ? '-' : '+'}{formatRp(row.nominal)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default DashboardUmroh
