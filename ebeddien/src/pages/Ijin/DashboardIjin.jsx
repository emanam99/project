import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ijinAPI } from '../../services/api'
import { useIjinTahunAjaran } from '../../hooks/useIjinTahunAjaran'
import { EBEDDIEN_IJIN_HINT, ijinHintMatches } from '../../services/ijinLiveEvents'
import { labelKategoriPelanggaran } from '../Domisili/components/PelanggaranMasterFormOffcanvas'

function monthBarList(rows, colorClass) {
  if (!rows || rows.length === 0) {
    return <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-xs">Tidak ada data</p>
  }
  const slice = rows.slice(0, 6)
  const maxValue = Math.max(...rows.map((i) => parseInt(i.jumlah, 10) || 0), 0)
  return (
    <div className="space-y-2.5">
      {slice.map((item, index) => {
        const jumlah = parseInt(item.jumlah, 10) || 0
        const percentage = maxValue > 0 ? (jumlah / maxValue) * 100 : 0
        return (
          <div key={`${item.bulan}-${index}`} className="flex items-center gap-2.5">
            <div className="w-16 text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate">{item.bulan}</div>
            <div className="flex-1">
              <div className="h-4 md:h-5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colorClass} rounded-full transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
            <div className="w-10 text-right text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300">
              {jumlah}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DashboardIjin() {
  const tahunAjaran = useIjinTahunAjaran()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboardData, setDashboardData] = useState(null)

  useEffect(() => {
    loadDashboardData()
  }, [tahunAjaran])

  const loadDashboardData = async (opts = {}) => {
    const quiet = opts?.quiet === true
    if (!quiet) {
      setLoading(true)
      setError('')
    }
    try {
      const result = await ijinAPI.getDashboard(tahunAjaran)
      if (result.success) {
        setDashboardData(result.data)
      } else if (!quiet) {
        setError(result.message || 'Gagal memuat data dashboard')
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err)
      if (!quiet) {
        setError(err.message || 'Terjadi kesalahan saat memuat data')
      }
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  const loadDashboardRef = useRef(loadDashboardData)
  loadDashboardRef.current = loadDashboardData
  const tahunAjaranRef = useRef(tahunAjaran)
  tahunAjaranRef.current = tahunAjaran

  useEffect(() => {
    const onHint = (e) => {
      const d = e?.detail || {}
      if (!ijinHintMatches(d, null, tahunAjaranRef.current)) return
      void loadDashboardRef.current({ quiet: true })
    }
    window.addEventListener(EBEDDIEN_IJIN_HINT, onHint)
    return () => window.removeEventListener(EBEDDIEN_IJIN_HINT, onHint)
  }, [])

  const formatNumber = (value) => {
    if (!value && value !== 0) return '0'
    return new Intl.NumberFormat('id-ID').format(value)
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('id-ID', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
              {error}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!dashboardData) return null

  const stats = [
    {
      title: 'Total Ijin',
      value: dashboardData.ijin?.total || 0,
      textColor: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800',
    },
    {
      title: 'Santri dengan Ijin',
      value: dashboardData.ijin?.total_santri || 0,
      textColor: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
      border: 'border-teal-200 dark:border-teal-800',
    },
    {
      title: 'Total Pelanggaran',
      value: dashboardData.pelanggaran?.total || 0,
      textColor: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
    },
    {
      title: 'Pelanggaran Hari Ini',
      value: dashboardData.pelanggaran?.hari_ini || 0,
      textColor: 'text-orange-600 dark:text-orange-400',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-200 dark:border-orange-800',
    },
    {
      title: `Boyong Tahun Ini (${tahunAjaran || '-'})`,
      value: dashboardData.boyong?.tahun_ini ?? 0,
      textColor: 'text-sky-600 dark:text-sky-400',
      bgColor: 'bg-sky-50 dark:bg-sky-900/20',
      border: 'border-sky-200 dark:border-sky-800',
    },
    {
      title: 'Boyong Hari Ini',
      value: dashboardData.boyong?.hari_ini ?? 0,
      textColor: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800',
    },
    {
      title: 'Daerah Aktif',
      value: dashboardData.domisili?.jumlah_daerah ?? 0,
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    {
      title: 'Kamar Aktif',
      value: dashboardData.domisili?.jumlah_kamar ?? 0,
      textColor: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
      border: 'border-indigo-200 dark:border-indigo-800',
    },
  ]

  const topDaerah = Array.isArray(dashboardData.domisili?.top_daerah)
    ? dashboardData.domisili.top_daerah
    : []
  const maxDaerah = Math.max(...topDaerah.map((d) => parseInt(d.jumlah_santri, 10) || 0), 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Domisili</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Ringkasan ijin, pelanggaran, boyong, daerah, dan kamar.
              </p>
              {tahunAjaran && (
                <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                  Tahun Ajaran Aktif: <span className="font-semibold">{tahunAjaran}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => loadDashboardData()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              disabled={loading}
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + index * 0.05 }}
              className={`${stat.bgColor} border ${stat.border} rounded-xl p-3 md:p-4`}
            >
              <p className={`text-[10px] md:text-xs font-medium ${stat.textColor}`}>{stat.title}</p>
              <p className={`text-sm md:text-lg font-bold mt-1 ${stat.textColor}`}>
                {typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value}
              </p>
            </motion.div>
          ))}
        </div>

        {(dashboardData.domisili?.kamar_terisi != null || dashboardData.domisili?.kamar_kosong != null) && (
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
            Kamar Mukim: terisi {formatNumber(dashboardData.domisili?.kamar_terisi ?? 0)} · kosong{' '}
            {formatNumber(dashboardData.domisili?.kamar_kosong ?? 0)}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 mb-3">Ijin Per Bulan</h3>
            {monthBarList(dashboardData.ijin?.per_bulan, 'bg-blue-500')}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              Pelanggaran Per Bulan
            </h3>
            {monthBarList(dashboardData.pelanggaran?.per_bulan, 'bg-red-500')}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 mb-3">Boyong Per Bulan</h3>
            {monthBarList(dashboardData.boyong?.per_bulan, 'bg-amber-500')}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 mb-3">
              Top Daerah (Santri Mukim)
            </h3>
            {topDaerah.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-xs">Tidak ada data</p>
            ) : (
              <div className="space-y-2.5">
                {topDaerah.map((row, index) => {
                  const n = parseInt(row.jumlah_santri, 10) || 0
                  const pct = maxDaerah > 0 ? (n / maxDaerah) * 100 : 0
                  return (
                    <div key={row.id || index} className="flex items-center gap-2.5">
                      <div className="w-24 text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate">
                        {row.nama}
                      </div>
                      <div className="flex-1">
                        <div className="h-4 md:h-5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-10 text-right text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {n}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">Ijin Terbaru</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {dashboardData.ijin?.terbaru?.length > 0 ? (
                dashboardData.ijin.terbaru.map((ijin, index) => (
                  <div key={ijin.id || index} className="px-4 py-2.5">
                    <p className="text-xs md:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {ijin.nama_santri || `NIS: ${ijin.nis ?? ijin.id_santri}`}
                    </p>
                    <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                      {ijin.alasan || 'Tidak ada alasan'}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                      {formatDate(ijin.tanggal_dibuat)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-xs">
                  Tidak ada data ijin terbaru
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">Pelanggaran Terbaru</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {dashboardData.pelanggaran?.terbaru?.length > 0 ? (
                dashboardData.pelanggaran.terbaru.map((row, index) => (
                  <div key={row.id || index} className="px-4 py-2.5">
                    <p className="text-xs md:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {row.nama_santri || `NIS: ${row.nis ?? ''}`}
                    </p>
                    <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                      {row.pelanggaran_nama || '—'}
                      {row.pelanggaran_kategori
                        ? ` · ${labelKategoriPelanggaran(row.pelanggaran_kategori)}`
                        : ''}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                      {formatDate(row.tanggal_dibuat)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-xs">
                  Tidak ada data pelanggaran terbaru
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">Boyong Terbaru</h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {dashboardData.boyong?.terbaru?.length > 0 ? (
                dashboardData.boyong.terbaru.map((row, index) => (
                  <div key={row.id || index} className="px-4 py-2.5">
                    <p className="text-xs md:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {row.nama_santri || `NIS: ${row.nis ?? ''}`}
                    </p>
                    <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                      TA {row.tahun_hijriyah || '—'}
                      {[row.diniyah, row.formal].filter(Boolean).length
                        ? ` · ${[row.diniyah, row.formal].filter(Boolean).join(' / ')}`
                        : ''}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                      {formatDate(row.tanggal_dibuat)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-xs">
                  Tidak ada data boyong terbaru
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default DashboardIjin
