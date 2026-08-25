import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { umrohJamaahAPI } from '../../services/api'

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

function LaporanUmroh() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState(null)
  const [filters, setFilters] = useState({
    tanggal_dari: '',
    tanggal_sampai: '',
    paket_umroh: '',
  })

  const loadLaporan = async (nextFilters = filters) => {
    setLoading(true)
    setError('')
    try {
      const result = await umrohJamaahAPI.getLaporan(nextFilters)
      if (result.success) {
        setData(result.data)
      } else {
        setError(result.message || 'Gagal memuat laporan umroh')
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gagal memuat laporan umroh')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLaporan()
  }, [])

  const ringkasan = data?.ringkasan || {}
  const cards = [
    { title: 'Jamaah', value: ringkasan.jamaah || 0 },
    { title: 'Setoran', value: formatRp(ringkasan.setoran) },
    { title: 'Penarikan', value: formatRp(ringkasan.penarikan) },
    { title: 'Saldo', value: formatRp(ringkasan.saldo) },
    { title: 'Pengeluaran', value: formatRp(ringkasan.pengeluaran) },
  ]

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <style>{`
        @media print {
          nav, header, aside, .no-print { display: none !important; }
          body { background: white !important; }
          .print-area { box-shadow: none !important; border: none !important; }
        }
      `}</style>
      <div className="h-full overflow-y-auto print-area" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 space-y-4">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Laporan Umroh</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ringkasan transaksi tabungan dan pengeluaran.</p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="no-print inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-teal-600 text-white hover:bg-teal-700"
            >
              Cetak
            </button>
          </motion.div>

          <div className="no-print bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Dari</label>
                <input
                  type="date"
                  value={filters.tanggal_dari}
                  onChange={(e) => setFilters((prev) => ({ ...prev, tanggal_dari: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Sampai</label>
                <input
                  type="date"
                  value={filters.tanggal_sampai}
                  onChange={(e) => setFilters((prev) => ({ ...prev, tanggal_sampai: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Paket</label>
                <select
                  value={filters.paket_umroh}
                  onChange={(e) => setFilters((prev) => ({ ...prev, paket_umroh: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-700 dark:text-white min-w-[160px]"
                >
                  <option value="">Semua paket</option>
                  {(data?.paket_options || []).map((paket) => (
                    <option key={paket} value={paket}>{paket}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => loadLaporan(filters)}
                className="px-3 py-1.5 rounded-lg text-sm bg-teal-600 text-white hover:bg-teal-700"
              >
                Terapkan
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
            </div>
          ) : error ? (
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {cards.map((card) => (
                  <div key={card.title} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                    <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{card.title}</p>
                    <p className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mt-1">{card.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold text-gray-900 dark:text-white">Transaksi tabungan</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Tanggal</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Jamaah</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Jenis</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-300">Nominal</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {(data.transaksi || []).length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">Tidak ada transaksi</td>
                        </tr>
                      ) : (
                        data.transaksi.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{formatDate(row.tanggal_dibuat)}</td>
                            <td className="px-3 py-2 text-gray-900 dark:text-white">{row.nama_lengkap || '-'} <span className="text-xs text-gray-400">{row.kode_jamaah || ''}</span></td>
                            <td className="px-3 py-2">{row.jenis}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatRp(row.nominal)}</td>
                            <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{row.keterangan || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="font-semibold text-gray-900 dark:text-white">Pengeluaran</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Tanggal</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Kode</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Kategori</th>
                        <th className="px-3 py-2 text-right text-xs text-gray-500 dark:text-gray-300">Nominal</th>
                        <th className="px-3 py-2 text-left text-xs text-gray-500 dark:text-gray-300">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {(data.pengeluaran || []).length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-3 py-6 text-center text-gray-500 dark:text-gray-400">Tidak ada pengeluaran</td>
                        </tr>
                      ) : (
                        data.pengeluaran.map((row) => (
                          <tr key={row.id}>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">{formatDate(row.tanggal_dibuat)}</td>
                            <td className="px-3 py-2">{row.kode_pengeluaran}</td>
                            <td className="px-3 py-2">{row.kategori || row.keterangan || '-'}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatRp(row.nominal)}</td>
                            <td className="px-3 py-2">{row.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default LaporanUmroh
