import { motion } from 'framer-motion'
import { Bar, Doughnut } from 'react-chartjs-2'

function KhususDashboard({ data }) {
  if (!data) return null
  
  const { total, bayar, kurang, kelompok } = data
  const percentage = calculatePercentage(bayar, total)
  
  const pieData = {
    labels: ['Sudah Bayar', 'Belum Bayar'],
    datasets: [{
      data: [bayar, kurang],
      backgroundColor: ['#22c55e', '#ef4444'],
      borderWidth: 0
    }]
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom'
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || ''
            const value = formatCurrency(context.parsed)
            const total = context.dataset.data.reduce((a, b) => a + b, 0)
            const percentage = Math.round((context.parsed / total) * 100)
            return `${label}: ${value} (${percentage}%)`
          }
        }
      }
    }
  }

  const barData = kelompok && kelompok.length > 0 ? {
    labels: kelompok.slice(0, 10).map(k => k.keterangan_1 || '-'),
    datasets: [{
      label: 'Total Khusus',
      data: kelompok.slice(0, 10).map(k => k.total_wajib ?? k.total ?? 0),
      backgroundColor: 'rgba(139, 92, 246, 0.8)',
      borderColor: 'rgba(139, 92, 246, 1)',
      borderWidth: 1
    }]
  } : null

  const barOptions = {
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
          className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 md:p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] md:text-xs font-medium text-purple-700 dark:text-purple-300">
              Total Khusus
            </p>
            <span className="inline-flex items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 p-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
              </svg>
            </span>
          </div>
          <p className="text-sm md:text-lg font-bold text-purple-700 dark:text-purple-200">
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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
        >
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
            Distribusi Pembayaran
          </h3>
          <div style={{ height: '300px' }}>
            <Doughnut data={pieData} options={pieOptions} />
          </div>
        </motion.div>

        {barData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
          >
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
              Top 10 Keterangan Khusus
            </h3>
            <div style={{ height: '300px' }}>
              <Bar data={barData} options={barOptions} />
            </div>
          </motion.div>
        )}
      </div>
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

export default KhususDashboard

