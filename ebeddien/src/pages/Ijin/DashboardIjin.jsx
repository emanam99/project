import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { ijinAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { EBEDDIEN_IJIN_HINT, ijinHintMatches } from '../../services/ijinLiveEvents'

function DashboardIjin() {
  const { tahunAjaran } = useTahunAjaranStore()
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
      } else {
        if (!quiet) {
          setError(result.message || 'Gagal memuat data dashboard')
        }
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err)
      if (!quiet) {
        setError(err.message || 'Terjadi kesalahan saat memuat data')
      }
    } finally {
      if (!quiet) {
        setLoading(false)
      }
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
        day: 'numeric'
      })
    } catch (e) {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
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
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Santri dengan Ijin',
      value: dashboardData.ijin?.total_santri || 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      color: 'bg-teal-500',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
      textColor: 'text-teal-600 dark:text-teal-400'
    },
    {
      title: 'Shohifah Terisi',
      value: dashboardData.shohifah?.total || 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      ),
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      textColor: 'text-purple-600 dark:text-purple-400'
    },
    {
      title: 'Persentase Shohifah',
      value: `${dashboardData.shohifah?.persentase || 0}%`,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      textColor: 'text-orange-600 dark:text-orange-400'
    },
    {
      title: `Boyong Tahun Ini (${tahunAjaran || '-'})`,
      value: dashboardData.boyong?.tahun_ini ?? 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-sky-500',
      bgColor: 'bg-sky-50 dark:bg-sky-900/20',
      textColor: 'text-sky-600 dark:text-sky-400'
    },
    {
      title: 'Boyong Hari Ini',
      value: dashboardData.boyong?.hari_ini ?? 0,
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      textColor: 'text-amber-600 dark:text-amber-400'
    }
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                Dashboard Ijin & Shohifah
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Pantauan cepat perijinan dan shohifah santri per tahun ajaran.
              </p>
              {tahunAjaran && (
                <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                  Tahun Ajaran Aktif: <span className="font-semibold">{tahunAjaran}</span>
                </p>
              )}
            </div>
            <button
              onClick={loadDashboardData}
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

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              className={`${stat.bgColor} border ${stat.bgColor.includes('blue') ? 'border-blue-200 dark:border-blue-800' : stat.bgColor.includes('teal') ? 'border-teal-200 dark:border-teal-800' : stat.bgColor.includes('purple') ? 'border-purple-200 dark:border-purple-800' : stat.bgColor.includes('sky') ? 'border-sky-200 dark:border-sky-800' : stat.bgColor.includes('amber') ? 'border-amber-200 dark:border-amber-800' : 'border-orange-200 dark:border-orange-800'} rounded-xl p-3 md:p-4`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className={`text-[10px] md:text-xs font-medium ${stat.textColor}`}>
                  {stat.title}
                </p>
                <span className={`inline-flex items-center justify-center rounded-full ${stat.bgColor.replace('50', '100').replace('900/20', '900/40')} ${stat.textColor} p-1`}>
                  <div className="w-3 h-3">
                    {stat.icon}
                  </div>
                </span>
              </div>
              <p className={`text-sm md:text-lg font-bold ${stat.textColor}`}>
                {typeof stat.value === 'number' ? formatNumber(stat.value) : stat.value}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Charts and Recent Data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Ijin Per Bulan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col"
          >
            <div className="mb-3 flex-shrink-0">
              <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">
                Ijin Per Bulan
              </h3>
            </div>
            <div className="flex-1 min-h-0">
              {dashboardData.ijin?.per_bulan && dashboardData.ijin.per_bulan.length > 0 ? (
                <div className="space-y-2.5">
                  {dashboardData.ijin.per_bulan.slice(0, 6).map((item, index) => {
                    const maxValue = Math.max(...dashboardData.ijin.per_bulan.map(i => parseInt(i.jumlah)))
                    const percentage = maxValue > 0 ? (parseInt(item.jumlah) / maxValue) * 100 : 0
                    return (
                      <div key={index} className="flex items-center gap-2.5">
                        <div className="w-16 text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate">
                          {item.bulan}
                        </div>
                        <div className="flex-1">
                          <div className="h-4 md:h-5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-10 text-right text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {item.jumlah}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-xs">
                  Tidak ada data
                </p>
              )}
            </div>
          </motion.div>

          {/* Shohifah Per Bulan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col"
          >
            <div className="mb-3 flex-shrink-0">
              <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">
                Shohifah Per Bulan
              </h3>
            </div>
            <div className="flex-1 min-h-0">
              {dashboardData.shohifah?.per_bulan && dashboardData.shohifah.per_bulan.length > 0 ? (
                <div className="space-y-2.5">
                  {dashboardData.shohifah.per_bulan.slice(0, 6).map((item, index) => {
                    const maxValue = Math.max(...dashboardData.shohifah.per_bulan.map(i => parseInt(i.jumlah)))
                    const percentage = maxValue > 0 ? (parseInt(item.jumlah) / maxValue) * 100 : 0
                    return (
                      <div key={index} className="flex items-center gap-2.5">
                        <div className="w-16 text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate">
                          {item.bulan}
                        </div>
                        <div className="flex-1">
                          <div className="h-4 md:h-5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-purple-500 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                        <div className="w-10 text-right text-xs md:text-sm font-semibold text-gray-700 dark:text-gray-300">
                          {item.jumlah}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-center py-4 text-xs">
                  Tidak ada data
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Recent Data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Ijin Terbaru */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">
                Ijin Terbaru
              </h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {dashboardData.ijin?.terbaru && dashboardData.ijin.terbaru.length > 0 ? (
                dashboardData.ijin.terbaru.map((ijin, index) => (
                  <div key={index} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
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
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-xs">
                  Tidak ada data ijin terbaru
                </div>
              )}
            </div>
          </motion.div>

          {/* Shohifah Terbaru */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100">
                Shohifah Terbaru
              </h3>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {dashboardData.shohifah?.terbaru && dashboardData.shohifah.terbaru.length > 0 ? (
                dashboardData.shohifah.terbaru.map((shohifah, index) => (
                  <div key={index} className="px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs md:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                          {shohifah.nama_santri || `NIS: ${shohifah.nis ?? shohifah.id_santri}`}
                        </p>
                        <p className="text-[10px] md:text-xs text-gray-600 dark:text-gray-400 truncate mt-0.5">
                          Tahun Ajaran: {shohifah.tahun_ajaran}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">
                          {formatDate(shohifah.tanggal_dibuat)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-xs">
                  Tidak ada data shohifah terbaru
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
