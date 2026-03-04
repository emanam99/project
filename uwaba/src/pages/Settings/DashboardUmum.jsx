import { useState, useEffect, useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Bar, Line, Pie } from 'react-chartjs-2'
import * as XLSX from 'xlsx'
import { dashboardAPI } from '../../services/api'
import { useNavigate } from 'react-router-dom'
import Modal from '../../components/Modal/Modal'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

// Scroll Animation Wrapper Component
function ScrollAnimation({ children, delay = 0 }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// Chart Animation Wrapper Component
function ChartAnimation({ children, delay = 0 }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  const [shouldRender, setShouldRender] = useState(false)
  
  useEffect(() => {
    if (isInView) {
      // Delay sedikit untuk memastikan animasi chart dimulai setelah container muncul
      const timer = setTimeout(() => {
        setShouldRender(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isInView])
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 20, scale: 0.98 }}
      transition={{ duration: 0.35, delay, ease: 'easeOut' }}
    >
      {shouldRender ? children : <div style={{ minHeight: '300px' }} />}
    </motion.div>
  )
}

function DashboardUmum() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groupBy, setGroupBy] = useState('keterangan_1')
  const [dashboardData, setDashboardData] = useState(null)
  const [showKelompokModal, setShowKelompokModal] = useState(false)
  const [kelompokModalData, setKelompokModalData] = useState(null)
  const [kelompokSearch, setKelompokSearch] = useState('')
  const [kelompokEditMode, setKelompokEditMode] = useState(false)
  const [kelompokEditValue, setKelompokEditValue] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy])

  const loadDashboard = async (useCache = true) => {
    try {
      // Load from cache first if available
      if (useCache) {
        const cacheKey = `dashboard_${groupBy}`
        const cachedData = localStorage.getItem(cacheKey)
        const cacheTimestamp = localStorage.getItem(`${cacheKey}_timestamp`)
        
        if (cachedData && cacheTimestamp) {
          const cacheAge = Date.now() - parseInt(cacheTimestamp)
          const cacheMaxAge = 5 * 60 * 1000 // 5 minutes
          
          if (cacheAge < cacheMaxAge) {
            try {
              const parsedData = JSON.parse(cachedData)
              setDashboardData(parsedData)
              setLoading(false)
              // Refresh in background
              loadDashboard(false)
              return
            } catch (e) {
              console.error('Error parsing cached data:', e)
            }
          }
        }
      }
      
      setLoading(true)
      setError('')
      const response = await dashboardAPI.getDashboard(groupBy)
      if (response.success) {
        setDashboardData(response.data)
        // Save to cache
        const cacheKey = `dashboard_${groupBy}`
        localStorage.setItem(cacheKey, JSON.stringify(response.data))
        localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString())
      } else {
        setError(response.message || 'Gagal memuat data dashboard')
      }
    } catch (err) {
      console.error('Error loading dashboard:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleShowKelompokDetail = async (tipe, groupValue) => {
    try {
      setShowKelompokModal(true)
      setKelompokSearch('')
      setKelompokEditMode(false)
      
      const response = await dashboardAPI.getKelompokDetail(tipe, groupBy, groupValue)
      if (response.success) {
        setKelompokModalData({
          tipe,
          groupValue,
          data: response.data
        })
      } else {
        setError(response.message || 'Gagal memuat detail kelompok')
      }
    } catch (err) {
      console.error('Error loading kelompok detail:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail')
    }
  }

  const handleUpdateKelompok = async () => {
    if (!kelompokModalData || !kelompokEditValue.trim()) {
      return
    }

    try {
      const ids = kelompokModalData.data.map(row => row.id).filter(Boolean)
      const response = await dashboardAPI.updateKelompok({
        tipe: kelompokModalData.tipe,
        group_by: groupBy,
        id: ids,
        new_value: kelompokEditValue.trim()
      })

      if (response.success) {
        setKelompokEditMode(false)
        loadDashboard()
        // Reload modal data
        handleShowKelompokDetail(kelompokModalData.tipe, kelompokEditValue.trim())
      } else {
        setError(response.message || 'Gagal mengupdate kelompok')
      }
    } catch (err) {
      console.error('Error updating kelompok:', err)
      setError(err.response?.data?.message || 'Terjadi kesalahan saat mengupdate')
    }
  }

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

  const handleExportExcel = () => {
    if (!kelompokModalData || !filteredKelompokData || filteredKelompokData.length === 0) {
      return
    }

    try {
      const excelData = filteredKelompokData.map(row => ({
        'NIS': row.nis ?? row.id_santri ?? '',
        'Nama': row.nama || '',
        'Tahun Ajaran': row.tahun_ajaran || '',
        'Lembaga': row.lembaga || '',
        'Keterangan': row.keterangan_1 || '',
        'Total Tunggakan': row.total_tunggakan || 0,
        'Total Bayar': row.total_bayar || 0,
        'Sisa': (row.total_tunggakan || 0) - (row.total_bayar || 0)
      }))

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(excelData)

      // Set column widths
      const colWidths = [
        { wch: 12 }, // NIS
        { wch: 25 }, // Nama
        { wch: 15 }, // Tahun Ajaran
        { wch: 20 }, // Lembaga
        { wch: 25 }, // Keterangan
        { wch: 18 }, // Total Tunggakan
        { wch: 18 }, // Total Bayar
        { wch: 18 }  // Sisa
      ]
      ws['!cols'] = colWidths

      XLSX.utils.book_append_sheet(wb, ws, 'Data Santri')

      const filename = `${kelompokModalData.tipe}_${kelompokModalData.groupValue}_${new Date().toISOString().split('T')[0]}.xlsx`
      XLSX.writeFile(wb, filename)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      setError('Gagal export data ke Excel: ' + error.message)
    }
  }

  // Filter kelompok data berdasarkan search
  const filteredKelompokData = kelompokModalData?.data?.filter(row => {
    if (!kelompokSearch.trim()) return true
    const query = kelompokSearch.toLowerCase()
    return (
      (row.nis ?? row.id_santri)?.toString().toLowerCase().includes(query) ||
      row.nama?.toLowerCase().includes(query) ||
      row.tahun_ajaran?.toLowerCase().includes(query) ||
      row.lembaga?.toLowerCase().includes(query) ||
      row.keterangan_1?.toLowerCase().includes(query)
    )
  }) || []

  if (loading && !dashboardData) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error && !dashboardData) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </div>
    )
  }

  if (!dashboardData) return null

  const d = dashboardData

  // Chart data
  const barChartData = {
    labels: ['Tunggakan', 'Bayar', 'Kurang'],
    datasets: [{
      label: 'Nominal (Rp)',
      data: [d.total_tunggakan, d.total_bayar, d.total_kurang],
      backgroundColor: ['#ef4444', '#22c55e', '#f59e42']
    }]
  }

  const barChartKhususData = {
    labels: ['Tunggakan Khusus', 'Bayar Khusus', 'Kurang Khusus'],
    datasets: [{
      label: 'Nominal (Rp)',
      data: [d.total_khusus, d.total_bayar_khusus, d.total_kurang_khusus],
      backgroundColor: ['#a21caf', '#2563eb', '#db2777']
    }]
  }

  const lineChartData = {
    labels: d.per_bulan?.labels || [],
    datasets: [{
      label: 'Pembayaran (Rp)',
      data: d.per_bulan?.data || [],
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.1)',
      fill: true,
      tension: 0.3
    }]
  }

  const pieChartData = {
    labels: d.komposisi_status?.labels || [],
    datasets: [{
      label: 'Status Santri',
      data: d.komposisi_status?.data || [],
      backgroundColor: [
        '#0ea5e9', '#22d3ee', '#f59e42', '#fbbf24', '#a3e635',
        '#f87171', '#818cf8', '#f472b6', '#34d399', '#facc15'
      ]
    }]
  }

  const uwabaPerHariData = {
    labels: d.uwaba_per_hari?.labels?.slice(-15).map(dateStr => {
      const date = new Date(dateStr + 'T00:00:00')
      const day = String(date.getDate()).padStart(2, '0')
      const month = String(date.getMonth() + 1).padStart(2, '0')
      return `${day}/${month}`
    }) || [],
    datasets: [{
      label: 'Total Pembayaran (Rp)',
      data: d.uwaba_per_hari?.data?.slice(-15) || [],
      borderColor: '#0d9488',
      backgroundColor: 'rgba(13, 148, 136, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 6
    }]
  }

  const kelompokTunggakanChartData = (d.kelompok_tunggakan && Array.isArray(d.kelompok_tunggakan) && d.kelompok_tunggakan.length > 0) ? {
    labels: d.kelompok_tunggakan.map(k => (k && k[groupBy]) || '-'),
    datasets: [{
      label: 'Total Tunggakan (Rp)',
      data: d.kelompok_tunggakan.map(k => k?.total || 0),
      backgroundColor: d.kelompok_tunggakan.map((_, i) => `hsl(${(i * 40 + 180) % 360}, 70%, 70%)`)
    }]
  } : null

  const kelompokKhususChartData = (d.kelompok_khusus && Array.isArray(d.kelompok_khusus) && d.kelompok_khusus.length > 0) ? {
    labels: d.kelompok_khusus.map(k => (k && k[groupBy]) || '-'),
    datasets: [{
      label: 'Total Khusus (Rp)',
      data: d.kelompok_khusus.map(k => k?.total || 0),
      backgroundColor: d.kelompok_khusus.map((_, i) => `hsl(${(i * 40) % 360}, 70%, 70%)`)
    }]
  } : null

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 800,
      easing: 'easeOutQuart'
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return formatCurrency(context.parsed.y || context.parsed)
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            if (value >= 1000000) {
              return 'Rp ' + (value / 1000000).toFixed(1) + 'Jt'
            } else if (value >= 1000) {
              return 'Rp ' + (value / 1000).toFixed(0) + 'Rb'
            }
            return 'Rp ' + value
          }
        }
      }
    }
  }

  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 800,
      easing: 'easeOutQuart',
      animateRotate: true,
      animateScale: true
    },
    plugins: {
      legend: {
        position: 'bottom'
      }
    }
  }

  const lineChartOptions = {
    ...chartOptions,
    animation: {
      duration: 800,
      easing: 'easeOutQuart',
      x: {
        type: 'number',
        easing: 'easeOutQuart',
        duration: 800,
        from: NaN
      },
      y: {
        type: 'number',
        easing: 'easeOutQuart',
        duration: 800,
        from: 0
      }
    },
    plugins: {
      ...chartOptions.plugins,
      legend: {
        display: true
      }
    }
  }

  return (
    <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
      <div className="p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Statistik Total Santri & Pengurus */}
        <ScrollAnimation delay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4"
            >
              <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatNumber(d.total_santri)}</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Santri</div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4"
            >
              <svg className="w-8 h-8 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 11a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatNumber(d.total_pengurus)}</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Pengurus</div>
              </div>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* Rekap Status Santri */}
        {d.komposisi_status && (
          <ScrollAnimation delay={0.2}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6"
            >
            <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Rekap Santri per Status</h3>
            <div className="overflow-x-auto">
              <table className="min-w-max w-full table-auto text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-xs leading-normal">
                    <th className="py-2 px-4 text-left">Status</th>
                    <th className="py-2 px-4 text-right">L</th>
                    <th className="py-2 px-4 text-right">P</th>
                    <th className="py-2 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.komposisi_status.labels.map((label, i) => {
                    const l = d.komposisi_status.l?.[i] || 0
                    const p = d.komposisi_status.p?.[i] || 0
                    const total = d.komposisi_status.data[i]
                    return (
                      <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
                        <td className="py-2 px-4">{label}</td>
                        <td className="py-2 px-4 text-right font-semibold">{formatNumber(l)}</td>
                        <td className="py-2 px-4 text-right font-semibold">{formatNumber(p)}</td>
                        <td className="py-2 px-4 text-right font-semibold">{formatNumber(total)}</td>
                      </tr>
                    )
                  })}
                  <tr className="bg-gray-100 dark:bg-gray-700 font-bold">
                    <td className="py-2 px-4">Total</td>
                    <td className="py-2 px-4 text-right">
                      {formatNumber(d.komposisi_status.l?.reduce((a, b) => a + b, 0) || 0)}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {formatNumber(d.komposisi_status.p?.reduce((a, b) => a + b, 0) || 0)}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {formatNumber(d.komposisi_status.data.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            </motion.div>
          </ScrollAnimation>
        )}

        {/* Grafik Pembayaran Uwaba Per Hari */}
        {d.uwaba_per_hari && d.uwaba_per_hari.labels && d.uwaba_per_hari.labels.length > 0 && (
          <ChartAnimation delay={0.3}>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.35, delay: 0.15, ease: 'easeOut' }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6"
            >
              <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Grafik Pembayaran Uwaba Per Hari</h3>
              <div style={{ height: '300px' }}>
                <Line data={uwabaPerHariData} options={lineChartOptions} />
              </div>
            </motion.div>
          </ChartAnimation>
        )}

        {/* Group By Selector */}
        <div className="flex items-center gap-2 mb-4">
          <label className="text-sm text-gray-700 dark:text-gray-300">Kelompokkan berdasarkan:</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
          >
            <option value="lembaga">Lembaga</option>
            <option value="tahun_ajaran">Tahun Ajaran</option>
            <option value="keterangan_1">Keterangan 1</option>
            <option value="keterangan_2">Keterangan 2</option>
          </select>
        </div>

        {/* Kelompok Total Tunggakan */}
        <ScrollAnimation delay={0.3}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4"
            >
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0 0V4m0 7v7m-7-7h14" />
              </svg>
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatCurrency(d.total_tunggakan)}</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Tunggakan</div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4"
            >
              <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0 0V4m0 7v7m-7-7h14" />
              </svg>
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatCurrency(d.total_bayar)}</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Bayar</div>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4"
            >
              <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 1.343-3 3s1.343 3 3 3 3-1.343 3-3-1.343-3-3-3zm0 0V4m0 7v7m-7-7h14" />
              </svg>
              <div>
                <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatCurrency(d.total_kurang)}</div>
                <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Kurang</div>
              </div>
            </motion.div>
          </div>
        </ScrollAnimation>

        {/* Tombol Pembayaran Khusus dan Monitoring Uwaba */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 mb-2">
                  Pembayaran Khusus
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-0">
                  Kelola dan monitor pembayaran khusus santri dengan detail lengkap
                </p>
              </div>
              <button
                onClick={() => navigate('/pembayaran-khusus')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"></path>
                </svg>
                <span className="hidden sm:inline">Buka Pembayaran Khusus</span>
                <span className="sm:hidden">Buka</span>
              </button>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 mb-2">
                  Monitoring Uwaba
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-0">
                  Pantau pembayaran bulanan santri dengan filter dan analisis lengkap
                </p>
              </div>
              <button
                onClick={() => navigate('/uwaba')}
                className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                <span className="hidden sm:inline">Buka Monitoring Uwaba</span>
                <span className="sm:hidden">Buka</span>
              </button>
            </div>
          </div>
        </div>

        {/* Kelompok Total Khusus */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4">
            <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" />
            </svg>
            <div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatCurrency(d.total_khusus)}</div>
              <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Khusus</div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4">
            <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" />
            </svg>
            <div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatCurrency(d.total_bayar_khusus)}</div>
              <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Bayar Khusus</div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex items-center gap-4">
            <svg className="w-8 h-8 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" />
            </svg>
            <div>
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">{formatCurrency(d.total_kurang_khusus)}</div>
              <div className="text-gray-500 dark:text-gray-400 text-sm mt-1">Total Kurang Khusus</div>
            </div>
          </div>
        </div>

        {/* Kelompok Total Keuangan Tunggakan */}
        {d.kelompok_tunggakan && d.kelompok_tunggakan.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Kelompok Total Keuangan Tunggakan</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              {d.kelompok_tunggakan.map((item, idx) => {
                const groupLabel = item[groupBy] || '-'
                return (
                  <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 flex flex-col gap-1 relative">
                    <button
                      onClick={() => handleShowKelompokDetail('tunggakan', groupLabel)}
                      className="absolute top-2 right-2 px-2 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded z-10"
                    >
                      Lihat
                    </button>
                    <div className="text-lg font-semibold text-blue-700 dark:text-blue-400 mb-0 flex items-center gap-2">
                      <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      {groupLabel}
                    </div>
                    <div className="text-xs text-gray-400 mb-1">{item.keterangan_2 || ''}</div>
                    <div className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                      Jumlah Tunggakan: <span className="font-bold text-gray-800 dark:text-gray-200">{formatNumber(item.jumlah_tunggakan)}</span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 text-xs">
                      Total: <span className="font-bold text-green-700 dark:text-green-400">{formatCurrency(item.total)}</span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 text-xs">
                      Total Bayar: <span className="font-bold text-blue-700 dark:text-blue-400">{formatCurrency(item.total_bayar)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {kelompokTunggakanChartData && (
              <ChartAnimation delay={0.4}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 mt-6">
                  <h3 className="text-base font-semibold mb-2 text-blue-700 dark:text-blue-400">Grafik Total Tunggakan per Kelompok</h3>
                  <div style={{ height: '300px' }}>
                    <Bar data={kelompokTunggakanChartData} options={chartOptions} />
                  </div>
                </div>
              </ChartAnimation>
            )}
          </div>
        )}

        {/* Kelompok Total Keuangan Khusus */}
        {d.kelompok_khusus && d.kelompok_khusus.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Kelompok Total Keuangan Khusus</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              {d.kelompok_khusus.map((item, idx) => {
                const groupLabel = item[groupBy] || '-'
                return (
                  <div key={idx} className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 flex flex-col gap-1 relative">
                    <button
                      onClick={() => handleShowKelompokDetail('khusus', groupLabel)}
                      className="absolute top-2 right-2 px-2 py-1 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded z-10"
                    >
                      Lihat
                    </button>
                    <div className="text-lg font-semibold text-purple-700 dark:text-purple-400 mb-0 flex items-center gap-2">
                      <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3" />
                      </svg>
                      {groupLabel}
                    </div>
                    <div className="text-xs text-gray-400 mb-1">{item.keterangan_2 || ''}</div>
                    <div className="text-gray-600 dark:text-gray-400 text-xs mb-1">
                      Jumlah Tunggakan: <span className="font-bold text-gray-800 dark:text-gray-200">{formatNumber(item.jumlah_tunggakan)}</span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 text-xs">
                      Total: <span className="font-bold text-green-700 dark:text-green-400">{formatCurrency(item.total)}</span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-400 text-xs">
                      Total Bayar: <span className="font-bold text-purple-700 dark:text-purple-400">{formatCurrency(item.total_bayar)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            {kelompokKhususChartData && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-3 mt-6">
                <h3 className="text-base font-semibold mb-2 text-purple-700 dark:text-purple-400">Grafik Total Khusus per Kelompok</h3>
                <div style={{ height: '300px' }}>
                  <Bar data={kelompokKhususChartData} options={chartOptions} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <ChartAnimation delay={0.5}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Grafik Pembayaran Per Bulan</h3>
              <div style={{ height: '300px' }}>
                <Line data={lineChartData} options={lineChartOptions} />
              </div>
            </div>
          </ChartAnimation>
          <ChartAnimation delay={0.6}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Komposisi Santri</h3>
              <div style={{ height: '300px' }}>
                <Pie data={pieChartData} options={pieChartOptions} />
              </div>
            </div>
          </ChartAnimation>
        </div>

        {/* Grafik Pembayaran Khusus */}
        <ChartAnimation delay={0.7}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Grafik Pembayaran Khusus</h3>
            <div style={{ height: '300px' }}>
              <Bar data={barChartKhususData} options={chartOptions} />
            </div>
          </div>
        </ChartAnimation>

        {/* Grafik Tunggakan */}
        <ChartAnimation delay={0.8}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Grafik Tunggakan</h3>
            <div style={{ height: '300px' }}>
              <Bar data={barChartData} options={chartOptions} />
            </div>
          </div>
        </ChartAnimation>

      </motion.div>

      {/* Modal Kelompok Detail */}
      <Modal
        isOpen={showKelompokModal && !!kelompokModalData}
        onClose={() => {
          setShowKelompokModal(false)
          setKelompokEditMode(false)
        }}
        title={kelompokModalData?.groupValue || ''}
        maxWidth="max-w-4xl"
        showCloseButton={!kelompokEditMode}
      >
        {/* Custom Header Content */}
        <div className="px-6 pt-4 pb-2 border-b dark:border-gray-700">
          {kelompokEditMode ? (
            <div className="flex flex-col gap-2 w-full">
              <input
                type="text"
                value={kelompokEditValue}
                onChange={(e) => setKelompokEditValue(e.target.value)}
                className="border rounded px-2 py-1 text-sm dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                placeholder={`${groupBy.replace('_', ' ').toUpperCase()}`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleUpdateKelompok}
                  className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 text-sm"
                >
                  Simpan
                </button>
                <button
                  onClick={() => {
                    setKelompokEditMode(false)
                    setKelompokEditValue('')
                  }}
                  className="bg-gray-300 text-gray-700 px-3 py-1 rounded hover:bg-gray-400 text-sm"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full mb-4">
              <button
                onClick={() => {
                  setKelompokEditMode(true)
                  setKelompokEditValue(kelompokModalData?.groupValue || '')
                }}
                className="px-2 py-1 text-xs bg-yellow-400 hover:bg-yellow-500 text-gray-800 rounded"
              >
                Edit
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={kelompokSearch}
                  onChange={(e) => setKelompokSearch(e.target.value)}
                  placeholder="Cari nama, ID, tahun ajaran, lembaga, atau keterangan..."
                  className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600"
                  style={{ minWidth: 0, maxWidth: '220px' }}
                />
                <button
                  onClick={handleExportExcel}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="hidden sm:inline">Export Excel</span>
                  <span className="sm:hidden">Export</span>
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="p-6">
          {filteredKelompokData.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 text-center py-4">
              Tidak ada data santri pada kelompok ini
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-max w-full table-auto text-sm border rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-xs leading-normal">
                    <th className="py-2 px-4 text-left">NIS</th>
                    <th className="py-2 px-4 text-left">Nama</th>
                    <th className="py-2 px-4 text-left">Tahun Ajaran</th>
                    <th className="py-2 px-4 text-left">Lembaga</th>
                    <th className="py-2 px-4 text-left">Keterangan</th>
                    <th className="py-2 px-4 text-right">Total Tunggakan</th>
                    <th className="py-2 px-4 text-right">Total Bayar</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKelompokData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-blue-50 dark:hover:bg-gray-700 transition border-b dark:border-gray-600">
                      <td className="py-2 px-4 font-mono">{row.nis ?? row.id_santri}</td>
                      <td className="py-2 px-4">{row.nama}</td>
                      <td className="py-2 px-4">{row.tahun_ajaran || '-'}</td>
                      <td className="py-2 px-4">{row.lembaga || '-'}</td>
                      <td className="py-2 px-4">{row.keterangan_1 || '-'}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(row.total_tunggakan || 0)}</td>
                      <td className="py-2 px-4 text-right">{formatCurrency(row.total_bayar || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
      </div>
    </div>
  )
}

export default DashboardUmum
