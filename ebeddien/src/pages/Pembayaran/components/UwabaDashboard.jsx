import { useState } from 'react'
import { motion } from 'framer-motion'
import { Line } from 'react-chartjs-2'

function UwabaDashboard({ data }) {
  if (!data) return null
  
  const { total, bayar, kurang, perHari, perBulan } = data
  const percentage = calculatePercentage(bayar, total)
  const [expandedBulan, setExpandedBulan] = useState(null)
  
  const toggleAccordion = (idBulan) => {
    setExpandedBulan(expandedBulan === idBulan ? null : idBulan)
  }
  
  const chartData = {
    labels: perHari.labels || [],
    datasets: [{
      label: 'Pembayaran per Hari',
      data: perHari.data || [],
      borderColor: '#0d9488',
      backgroundColor: 'rgba(13, 148, 136, 0.1)',
      fill: true,
      tension: 0.4
    }]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => `Rp ${formatNumber(context.parsed.y)}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => `Rp ${formatNumber(value)}`
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Statistik Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl p-3 md:p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] md:text-xs font-medium text-teal-700 dark:text-teal-300">
              Total Wajib
            </p>
            <span className="inline-flex items-center justify-center rounded-full bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 p-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <p className="text-sm md:text-lg font-bold text-teal-700 dark:text-teal-200">
            {formatCurrency(total)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 md:p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] md:text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Total Bayar
            </p>
            <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 p-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <p className="text-sm md:text-lg font-bold text-emerald-700 dark:text-emerald-200">
            {formatCurrency(bayar)}
          </p>
          <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
            {percentage}% dari total
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3 md:p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] md:text-xs font-medium text-rose-700 dark:text-rose-300">
              Sisa Kurang
            </p>
            <span className="inline-flex items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 p-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
          </div>
          <p className="text-sm md:text-lg font-bold text-rose-700 dark:text-rose-200">
            {formatCurrency(kurang)}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 md:p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] md:text-xs font-medium text-blue-700 dark:text-blue-300">
              Progress
            </p>
            <span className="inline-flex items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 p-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-blue-200 dark:bg-blue-800/50 rounded-full h-2 mb-1.5">
              <div 
                className="bg-blue-600 dark:bg-blue-400 rounded-full h-2 transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-600 dark:text-gray-400">{percentage}% Lunas</p>
          </div>
        </motion.div>
      </div>

      {/* Chart */}
      {perHari && perHari.labels && perHari.labels.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
        >
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Trend Pembayaran UWABA (15 Hari Terakhir)
          </h3>
          <div style={{ height: '300px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </motion.div>
      )}

      {/* Progress Per Bulan */}
      {perBulan && perBulan.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 md:p-6"
        >
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Progress Pembayaran per Bulan
          </h3>
          <div className="space-y-3">
            {perBulan.map((bulan) => {
              const bulanPercentage = calculatePercentage(bulan.total_bayar, bulan.total_wajib)
              const isExpanded = expandedBulan === bulan.id_bulan
              
              return (
                <div
                  key={bulan.id_bulan}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all duration-200 hover:shadow-md"
                >
                  {/* Header - Bulan, Progress, Persentase */}
                  <button
                    onClick={() => toggleAccordion(bulan.id_bulan)}
                    className="w-full p-4 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-base font-semibold text-gray-800 dark:text-gray-200">
                          {bulan.nama_bulan}
                        </h4>
                        <span className="ml-3 inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {bulanPercentage}%
                        </span>
                      </div>
                      {/* Progress Bar */}
                      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-500 ${
                            bulanPercentage >= 80
                              ? 'bg-emerald-500 dark:bg-emerald-400'
                              : bulanPercentage >= 50
                              ? 'bg-yellow-500 dark:bg-yellow-400'
                              : 'bg-orange-500 dark:bg-orange-400'
                          }`}
                          style={{ width: `${bulanPercentage}%` }}
                        />
                      </div>
                    </div>
                    {/* Chevron Icon */}
                    <div className="ml-4 flex-shrink-0">
                      <svg
                        className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                          isExpanded ? 'transform rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {/* Accordion Content - Detail */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Total Wajib */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Wajib</p>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {formatCurrency(bulan.total_wajib)}
                            </p>
                          </div>
                          
                          {/* Total Bayar Lunas */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Bayar Lunas</p>
                            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(bulan.total_bayar)}
                            </p>
                          </div>
                          
                          {/* Tidak Masuk */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Tidak Masuk</p>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              {bulan.count_tidak_masuk} dari {bulan.total_kewajiban}
                            </span>
                          </div>
                          
                          {/* Count Lunas */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Count Lunas</p>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                              {bulan.count_lunas}
                            </span>
                          </div>
                          
                          {/* Kurang */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Kurang</p>
                            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                              {formatCurrency(bulan.total_kurang)}
                            </p>
                          </div>
                          
                          {/* Count Kurang */}
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Count Kurang</p>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                              {bulan.count_kurang}
                            </span>
                          </div>
                          
                          {/* Count Belum */}
                          <div className="space-y-1 md:col-span-2">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Count Belum</p>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
                              {bulan.count_belum}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Helper functions
const formatCurrency = (value) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(value)
}

const formatNumber = (value) => {
  return new Intl.NumberFormat('id-ID').format(value)
}

const calculatePercentage = (bayar, total) => {
  if (total === 0) return 0
  return Math.round((bayar / total) * 100)
}

export default UwabaDashboard

