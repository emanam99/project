import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { pemasukanAPI, pengeluaranAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'

// Register Chart.js components (reuse same setup as main Dashboard)
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
  const isInView = useInView(ref, { once: true, margin: '-50px' })

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
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (isInView) {
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
      {shouldRender ? children : <div style={{ minHeight: '260px' }} />}
    </motion.div>
  )
}

function KeuanganDashboard() {
  const { showNotification } = useNotification()
  const { tahunAjaran } = useTahunAjaranStore()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [summary, setSummary] = useState({
    totalPemasukan: 0,
    totalPengeluaran: 0,
    saldoAwal: 0,
    saldoAkhir: 0,
    transaksiCount: 0
  })

  const [aktivitas, setAktivitas] = useState([])
  const [monthlyChartMode, setMonthlyChartMode] = useState('masehi') // 'masehi' or 'hijriyah'

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tahunAjaran])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      // Ambil semua pemasukan & pengeluaran (dibatasi 10.000 untuk keamanan)
      const [pemasukanRes, pengeluaranRes] = await Promise.all([
        pemasukanAPI.getAll(null, null, null, null, 1, 10000),
        pengeluaranAPI.getPengeluaranList(null, null, null, null, 1, 10000)
      ])

      const pemasukanData = pemasukanRes.success ? pemasukanRes.data?.pemasukan || [] : []
      const pengeluaranData = pengeluaranRes.success ? pengeluaranRes.data?.pengeluaran || [] : []

      // Filter by tahun ajaran terpilih
      const pemasukanTA = pemasukanData.filter(p => p.tahun_ajaran === tahunAjaran)
      const pengeluaranTA = pengeluaranData.filter(p => p.tahun_ajaran === tahunAjaran)

      // Hitung saldo awal (tahun ajaran sebelumnya)
      let saldoAwal = 0
      if (tahunAjaran) {
        const parts = tahunAjaran.split('-')
        if (parts.length === 2) {
          const startYear = parseInt(parts[0])
          const prevStart = startYear - 1
          const prevEnd = startYear
          const prevTA = `${prevStart}-${prevEnd}`

          const pemasukanPrev = pemasukanData.filter(p => p.tahun_ajaran === prevTA)
          const pengeluaranPrev = pengeluaranData.filter(p => p.tahun_ajaran === prevTA)

          const totalPemasukanPrev = pemasukanPrev.reduce((sum, p) => sum + parseFloat(p.nominal || 0), 0)
          const totalPengeluaranPrev = pengeluaranPrev.reduce((sum, p) => sum + parseFloat(p.nominal || 0), 0)
          saldoAwal = totalPemasukanPrev - totalPengeluaranPrev
        }
      }

      const totalPemasukan = pemasukanTA.reduce((sum, p) => sum + parseFloat(p.nominal || 0), 0)
      const totalPengeluaran = pengeluaranTA.reduce((sum, p) => sum + parseFloat(p.nominal || 0), 0)
      const saldoAkhir = saldoAwal + totalPemasukan - totalPengeluaran

      // Gabungkan aktivitas pemasukan dan pengeluaran
      const aktivitasCombined = [
        ...pemasukanTA.map(p => ({
          id: p.id,
          tipe: 'pemasukan',
          tanggal_dibuat: p.tanggal_dibuat,
          hijriyah: p.hijriyah,
          keterangan: p.keterangan,
          nominal: p.nominal,
          kategori: p.kategori,
          lembaga: p.lembaga,
          admin_nama: p.admin_nama
        })),
        ...pengeluaranTA.map(p => ({
          id: p.id,
          tipe: 'pengeluaran',
          tanggal_dibuat: p.tanggal_dibuat,
          hijriyah: p.hijriyah,
          keterangan: p.keterangan,
          nominal: p.nominal,
          kategori: p.kategori,
          lembaga: p.lembaga,
          admin_nama: p.admin_nama
        }))
      ].sort((a, b) => new Date(a.tanggal_dibuat) - new Date(b.tanggal_dibuat))

      setSummary({
        totalPemasukan,
        totalPengeluaran,
        saldoAwal,
        saldoAkhir,
        transaksiCount: aktivitasCombined.length
      })
      setAktivitas(aktivitasCombined)
    } catch (err) {
      console.error('Error loading finance dashboard:', err)
      const message = err?.response?.data?.message || 'Terjadi kesalahan saat memuat dashboard keuangan'
      setError(message)
      showNotification(message, 'error')
    } finally {
      setLoading(false)
    }
  }

  // Helpers
  const formatCurrency = (value) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(value || 0)

  const formatShortDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short'
    })
  }

  const getMonthName = (month) => {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
      'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
    ]
    return months[month - 1] || ''
  }

  const getMonthNameHijriyah = (month) => {
    const months = [
      'Muharram', 'Safar', 'Rabi\'ul Awal', 'Rabi\'ul Akhir', 'Jumadil Awal', 'Jumadil Akhir',
      'Rajab', 'Sya\'ban', 'Ramadhan', 'Syawal', 'Dzulqo\'dah', 'Dzulhijjah'
    ]
    return months[month - 1] || ''
  }

  // Data untuk chart: pemasukan vs pengeluaran per bulan
  const monthlyChartData = useMemo(() => {
    if (!aktivitas.length) return null

    const monthly = {}

    aktivitas.forEach(item => {
      let key = ''
      let year = 0
      let month = 0
      let label = ''

      if (monthlyChartMode === 'masehi') {
        // Group by masehi month
        const d = new Date(item.tanggal_dibuat)
        year = d.getFullYear()
        month = d.getMonth() + 1
        key = `${year}-${String(month).padStart(2, '0')}`
        label = getMonthName(month)
      } else {
        // Group by hijriyah month
        if (item.hijriyah) {
          // Format hijriyah: "1447-12-23" or "1447-12-23 10.10.11"
          const hijriyahDate = item.hijriyah.substring(0, 10) // Get YYYY-MM-DD
          const parts = hijriyahDate.split('-')
          if (parts.length === 3) {
            year = parseInt(parts[0])
            month = parseInt(parts[1])
            key = `${year}-${String(month).padStart(2, '0')}`
            label = getMonthNameHijriyah(month)
          } else {
            return // Skip jika format hijriyah tidak valid
          }
        } else {
          return // Skip jika tidak ada hijriyah
        }
      }

      if (!key) return

      if (!monthly[key]) {
        monthly[key] = { pemasukan: 0, pengeluaran: 0, year, month, label }
      }

      if (item.tipe === 'pemasukan') {
        monthly[key].pemasukan += parseFloat(item.nominal || 0)
      } else {
        monthly[key].pengeluaran += parseFloat(item.nominal || 0)
      }
    })

    const sortedKeys = Object.keys(monthly).sort()
    const labels = sortedKeys.map(k => {
      const { month, year } = monthly[k]
      if (monthlyChartMode === 'masehi') {
        return getMonthName(month)
      } else {
        return getMonthNameHijriyah(month)
      }
    })

    const pemasukanArr = sortedKeys.map(k => monthly[k].pemasukan)
    const pengeluaranArr = sortedKeys.map(k => monthly[k].pengeluaran)

    // Tentukan max value untuk Y-axis berdasarkan nilai ke-2 terbesar (atau median jika ada banyak data)
    // Ini membuat grafik lebih proporsional, nilai yang lebih besar akan terpotong
    const allValues = [...pemasukanArr, ...pengeluaranArr]
      .filter(v => v > 0)
      .sort((a, b) => b - a)

    const maxValue = allValues[0] || 0
    const secondMaxValue = allValues[1] || 0
    
    // Gunakan nilai ke-2 terbesar * 1.3 sebagai batas atas, atau nilai tertinggi * 0.5 jika hanya ada 1 nilai
    // Jika ada nilai yang lebih besar, biarkan terpotong di atas
    const chartMaxValue = secondMaxValue > 0 
      ? Math.ceil(secondMaxValue * 1.3)
      : Math.ceil(maxValue * 0.5)

    return {
      labels,
      datasets: [
        {
          label: 'Pemasukan',
          data: pemasukanArr,
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: 'rgba(5, 150, 105, 1)',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 32
        },
        {
          label: 'Pengeluaran',
          data: pengeluaranArr,
          backgroundColor: 'rgba(248, 113, 113, 0.7)',
          borderColor: 'rgba(239, 68, 68, 1)',
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 32
        }
      ],
      chartMaxValue
    }
  }, [aktivitas, monthlyChartMode])

  // Data untuk line chart saldo berjalan - per 15 hari, dari awal tahun ajaran sampai sekarang
  const saldoLineChartData = useMemo(() => {
    if (!aktivitas.length) return null

    // Aktivitas sudah difilter berdasarkan tahun ajaran di loadData
    // Urutkan aktivitas dari awal tahun ajaran
    const sortedAktivitas = aktivitas
      .slice()
      .sort((a, b) => new Date(a.tanggal_dibuat) - new Date(b.tanggal_dibuat))

    if (sortedAktivitas.length === 0) return null

    // Cari tanggal pertama transaksi dalam tahun ajaran yang dipilih
    // Ini adalah tanggal awal untuk perhitungan periode 15 hari
    const firstDate = new Date(sortedAktivitas[0].tanggal_dibuat)
    firstDate.setHours(0, 0, 0, 0)
    
    // Cari tanggal terakhir transaksi atau hari ini (mana yang lebih baru)
    const lastDate = new Date(sortedAktivitas[sortedAktivitas.length - 1].tanggal_dibuat)
    lastDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const endDate = lastDate > today ? lastDate : today

    // Fungsi untuk mendapatkan periode 15 hari (periode dimulai dari tanggal pertama)
    const getPeriodKey = (date) => {
      const daysDiff = Math.floor((date - firstDate) / (1000 * 60 * 60 * 24))
      const periodIndex = Math.floor(daysDiff / 15)
      return periodIndex
    }

    // Kelompokkan transaksi per periode 15 hari
    const periodData = {}
    sortedAktivitas.forEach(item => {
      const itemDate = new Date(item.tanggal_dibuat)
      itemDate.setHours(0, 0, 0, 0)
      const periodKey = getPeriodKey(itemDate)
      
      if (!periodData[periodKey]) {
        // Hitung tanggal awal periode
        const periodStartDate = new Date(firstDate)
        periodStartDate.setDate(firstDate.getDate() + (periodKey * 15))
        // Hitung tanggal akhir periode (hari ke-14 dari awal periode)
        const periodEndDate = new Date(periodStartDate)
        periodEndDate.setDate(periodStartDate.getDate() + 14)
        
        periodData[periodKey] = {
          periodIndex: periodKey,
          startDate: periodStartDate,
          endDate: periodEndDate,
          pemasukan: 0,
          pengeluaran: 0
        }
      }
      
      if (item.tipe === 'pemasukan') {
        periodData[periodKey].pemasukan += parseFloat(item.nominal || 0)
      } else {
        periodData[periodKey].pengeluaran += parseFloat(item.nominal || 0)
      }
    })

    // Buat array semua periode dari awal sampai sekarang
    const totalDays = Math.ceil((endDate - firstDate) / (1000 * 60 * 60 * 24))
    const totalPeriods = Math.ceil(totalDays / 15)
    
    const allPeriods = []
    for (let i = 0; i < totalPeriods; i++) {
      const periodStartDate = new Date(firstDate)
      periodStartDate.setDate(firstDate.getDate() + (i * 15))
      const periodEndDate = new Date(periodStartDate)
      periodEndDate.setDate(periodStartDate.getDate() + 14)
      
      // Jangan melebihi tanggal akhir
      if (periodStartDate > endDate) break
      
      const periodKey = i
      allPeriods.push({
        periodIndex: periodKey,
        startDate: periodStartDate,
        endDate: periodEndDate > endDate ? endDate : periodEndDate,
        pemasukan: periodData[periodKey]?.pemasukan || 0,
        pengeluaran: periodData[periodKey]?.pengeluaran || 0
      })
    }

    // Hitung saldo berjalan per periode
    let runningSaldo = summary.saldoAwal
    const points = allPeriods.map(period => {
      runningSaldo += period.pemasukan - period.pengeluaran
      // Format label: tanggal awal - tanggal akhir periode
      const startStr = period.startDate.toISOString().split('T')[0] + 'T00:00:00.000Z'
      const endStr = period.endDate.toISOString().split('T')[0] + 'T00:00:00.000Z'
      const startLabel = formatShortDate(startStr)
      const endLabel = formatShortDate(endStr)
      return {
        label: `${startLabel} - ${endLabel}`,
        value: runningSaldo,
        startDate: period.startDate,
        endDate: period.endDate
      }
    })

    const labels = points.map(p => p.label)
    const data = points.map(p => p.value)

    // Tentukan max value untuk Y-axis berdasarkan nilai ke-2 terbesar
    const sortedData = [...data].sort((a, b) => b - a)
    const maxValue = sortedData[0] || 0
    const secondMaxValue = sortedData[1] || 0
    
    // Gunakan nilai ke-2 terbesar * 1.3 sebagai batas atas, atau nilai tertinggi * 0.5 jika hanya ada 1 nilai
    const chartMaxValue = secondMaxValue !== undefined && secondMaxValue > 0 
      ? Math.ceil(secondMaxValue * 1.3)
      : Math.ceil(maxValue * 0.5)

    return {
      labels,
      datasets: [
        {
          label: 'Saldo Berjalan',
          data,
          fill: true,
          borderColor: 'rgba(14, 165, 233, 1)',
          backgroundColor: 'rgba(56, 189, 248, 0.2)',
          pointBackgroundColor: 'rgba(14, 165, 233, 1)',
          tension: 0.25,
          borderWidth: 2
        }
      ],
      chartMaxValue
    }
  }, [aktivitas, summary.saldoAwal])

  // Data untuk pie chart komposisi kategori pemasukan
  const kategoriPemasukanPieData = useMemo(() => {
    if (!aktivitas.length) return null

    const kategoriMap = {}
    aktivitas.forEach(item => {
      if (item.tipe === 'pemasukan') {
        const key = item.kategori || 'Lainnya'
        if (!kategoriMap[key]) kategoriMap[key] = 0
        kategoriMap[key] += parseFloat(item.nominal || 0)
      }
    })

    const labels = Object.keys(kategoriMap)
    if (labels.length === 0) return null

    const data = labels.map(k => kategoriMap[k])
    const baseColors = [
      '#22c55e', '#14b8a6', '#0ea5e9', '#3b82f6', '#8b5cf6',
      '#a855f7', '#ec4899', '#f97316', '#facc15', '#38bdf8'
    ]
    const backgroundColor = labels.map((_, i) => baseColors[i % baseColors.length] + 'cc')

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor,
          borderColor: '#0f172a',
          borderWidth: 1
        }
      ]
    }
  }, [aktivitas])

  // Data untuk pie chart komposisi kategori pengeluaran
  const kategoriPengeluaranPieData = useMemo(() => {
    if (!aktivitas.length) return null

    const kategoriMap = {}
    aktivitas.forEach(item => {
      if (item.tipe === 'pengeluaran') {
        const key = item.kategori || 'Lainnya'
        if (!kategoriMap[key]) kategoriMap[key] = 0
        kategoriMap[key] += parseFloat(item.nominal || 0)
      }
    })

    const labels = Object.keys(kategoriMap)
    if (labels.length === 0) return null

    const data = labels.map(k => kategoriMap[k])
    const baseColors = [
      '#ef4444', '#f87171', '#fb7185', '#f97316', '#f59e0b',
      '#eab308', '#ec4899', '#a21caf', '#dc2626', '#991b1b'
    ]
    const backgroundColor = labels.map((_, i) => baseColors[i % baseColors.length] + 'cc')

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor,
          borderColor: '#0f172a',
          borderWidth: 1
        }
      ]
    }
  }, [aktivitas])

  const recentAktivitas = useMemo(
    () => aktivitas.slice().sort((a, b) => new Date(b.tanggal_dibuat) - new Date(a.tanggal_dibuat)).slice(0, 8),
    [aktivitas]
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 space-y-6">
        {/* Header */}
        <ScrollAnimation>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                Dashboard Keuangan
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Pantauan cepat pemasukan, pengeluaran, dan saldo UWABA per tahun ajaran.
              </p>
              {tahunAjaran && (
                <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">
                  Tahun Ajaran Aktif: <span className="font-semibold">{tahunAjaran}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={loadData}
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
              <button
                onClick={() => navigate('/aktivitas')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Detail Aktivitas
              </button>
              <button
                onClick={() => navigate('/aktivitas-tahun-ajaran')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M9 12h6m-6 4h6M9 8h6m2 9a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2h10z"
                  />
                </svg>
                Aktivitas per TA
              </button>
            </div>
          </div>
        </ScrollAnimation>

        {error && (
          <ScrollAnimation>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          </ScrollAnimation>
        )}

        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 md:p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] md:text-xs font-medium text-sky-700 dark:text-sky-300">
                Saldo Awal TA
              </p>
              <span className="inline-flex items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 p-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M3 10h4l3 8 4-16 3 8h4"
                  />
                </svg>
              </span>
            </div>
            <p className="text-sm md:text-lg font-bold text-sky-700 dark:text-sky-200">
              {formatCurrency(summary.saldoAwal)}
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
                Total Pemasukan
              </p>
              <span className="inline-flex items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 p-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </span>
            </div>
            <p className="text-sm md:text-lg font-bold text-emerald-700 dark:text-emerald-200">
              {formatCurrency(summary.totalPemasukan)}
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
                Total Pengeluaran
              </p>
              <span className="inline-flex items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 p-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M20 12H4"
                  />
                </svg>
              </span>
            </div>
            <p className="text-sm md:text-lg font-bold text-rose-700 dark:text-rose-200">
              {formatCurrency(summary.totalPengeluaran)}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className={`rounded-xl p-3 md:p-4 border ${
              summary.saldoAkhir >= 0
                ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <p
                className={`text-[10px] md:text-xs font-medium ${
                  summary.saldoAkhir >= 0
                    ? 'text-teal-700 dark:text-teal-300'
                    : 'text-amber-700 dark:text-amber-300'
                }`}
              >
                Saldo Akhir TA
              </p>
              <span
                className={`inline-flex items-center justify-center rounded-full p-1 ${
                  summary.saldoAkhir >= 0
                    ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300'
                    : 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300'
                }`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2
                    3 .895 3 2-1.343 2-3 2m0-8c1.11 0
                    2.08.402 2.599 1M12 8V7m0 1v8m0
                    0v1m0-1c-1.11 0-2.08-.402-2.599-1M21
                    12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
            </div>
            <p
              className={`text-sm md:text-lg font-bold ${
                summary.saldoAkhir >= 0
                  ? 'text-teal-700 dark:text-teal-200'
                  : 'text-amber-700 dark:text-amber-200'
              }`}
            >
              {formatCurrency(summary.saldoAkhir)}
            </p>
            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
              {summary.transaksiCount} transaksi dalam tahun ajaran ini
            </p>
          </motion.div>
        </div>

        {/* Charts Row - First Row: Pemasukan vs Pengeluaran per Bulan */}
        <ChartAnimation delay={0.1}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col">
            <div className="mb-3 flex-shrink-0">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Pemasukan vs Pengeluaran per Bulan
                </h3>
                <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setMonthlyChartMode('masehi')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                      monthlyChartMode === 'masehi'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    Masehi
                  </button>
                  <button
                    onClick={() => setMonthlyChartMode('hijriyah')}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                      monthlyChartMode === 'hijriyah'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                    }`}
                  >
                    Hijriyah
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                  Tahun Ajaran {tahunAjaran || '-'}
                </span>
              </div>
            </div>
            <div className="flex-1 min-h-0" style={{ height: '260px' }}>
              {monthlyChartData ? (
                <Bar
                  data={monthlyChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          usePointStyle: true,
                          boxWidth: 8
                        }
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const value = ctx.raw
                            const formatted = formatCurrency(value)
                            // Jika nilai melebihi chartMaxValue, tambahkan indikator
                            if (value > monthlyChartData.chartMaxValue) {
                              return `${ctx.dataset.label}: ${formatted} (terpotong)`
                            }
                            return `${ctx.dataset.label}: ${formatted}`
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        grid: {
                          display: false
                        }
                      },
                      y: {
                        max: monthlyChartData.chartMaxValue,
                        beginAtZero: true,
                        ticks: {
                          callback: (value) => {
                            return new Intl.NumberFormat('id-ID', {
                              notation: 'compact',
                              compactDisplay: 'short'
                            }).format(value)
                          }
                        }
                      }
                    }
                  }}
                  height={260}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">
                  Tidak ada data untuk ditampilkan
                </div>
              )}
            </div>
          </div>
        </ChartAnimation>

        {/* Charts Row - Komposisi Kategori: Pemasukan dan Pengeluaran */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
          {/* Pie Chart: Komposisi Kategori Pemasukan */}
          <ChartAnimation delay={0.2}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Komposisi Kategori Pemasukan
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  Pemasukan
                </span>
              </div>
              <div className="flex-1 min-h-0" style={{ height: '260px' }}>
                {kategoriPemasukanPieData ? (
                  <div className="h-full flex flex-col md:flex-row items-center gap-3">
                    <div className="w-40 h-40 md:w-44 md:h-44 flex-shrink-0">
                      <Pie
                        data={kategoriPemasukanPieData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              display: false
                            },
                            tooltip: {
                              callbacks: {
                                label: (ctx) =>
                                  `${ctx.label}: ${formatCurrency(ctx.raw)}`
                              }
                            }
                          }
                        }}
                        height={176}
                      />
                    </div>
                    <div className="flex-1 w-full h-full overflow-y-auto pr-1 space-y-1">
                      {kategoriPemasukanPieData.labels.map((label, idx) => (
                        <div
                          key={label}
                          className="flex items-center justify-between text-[11px] px-2 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: kategoriPemasukanPieData.datasets[0].backgroundColor[idx]
                              }}
                            />
                            <span className="text-gray-700 dark:text-gray-200">{label}</span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(kategoriPemasukanPieData.datasets[0].data[idx])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">
                    Tidak ada data untuk ditampilkan
                  </div>
                )}
              </div>
            </div>
          </ChartAnimation>

          {/* Pie Chart: Komposisi Kategori Pengeluaran */}
          <ChartAnimation delay={0.25}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Komposisi Kategori Pengeluaran
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">
                  Pengeluaran
                </span>
              </div>
              <div className="flex-1 min-h-0" style={{ height: '260px' }}>
                {kategoriPengeluaranPieData ? (
                  <div className="h-full flex flex-col md:flex-row items-center gap-3">
                    <div className="w-40 h-40 md:w-44 md:h-44 flex-shrink-0">
                      <Pie
                        data={kategoriPengeluaranPieData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              display: false
                            },
                            tooltip: {
                              callbacks: {
                                label: (ctx) =>
                                  `${ctx.label}: ${formatCurrency(ctx.raw)}`
                              }
                            }
                          }
                        }}
                        height={176}
                      />
                    </div>
                    <div className="flex-1 w-full h-full overflow-y-auto pr-1 space-y-1">
                      {kategoriPengeluaranPieData.labels.map((label, idx) => (
                        <div
                          key={label}
                          className="flex items-center justify-between text-[11px] px-2 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: kategoriPengeluaranPieData.datasets[0].backgroundColor[idx]
                              }}
                            />
                            <span className="text-gray-700 dark:text-gray-200">{label}</span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatCurrency(kategoriPengeluaranPieData.datasets[0].data[idx])}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">
                    Tidak ada data untuk ditampilkan
                  </div>
                )}
              </div>
            </div>
          </ChartAnimation>
        </div>

        {/* Line Chart: Saldo Berjalan - Full Width */}
        <ChartAnimation delay={0.15}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Pergerakan Saldo
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">
                Per 15 hari
              </span>
            </div>
            <div className="flex-1 min-h-0" style={{ height: '300px' }}>
              {saldoLineChartData ? (
                <Line
                  data={saldoLineChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => {
                            const value = ctx.raw
                            const formatted = formatCurrency(value)
                            // Jika nilai melebihi chartMaxValue, tambahkan indikator
                            if (value > saldoLineChartData.chartMaxValue) {
                              return `Saldo: ${formatted} (terpotong)`
                            }
                            return `Saldo: ${formatted}`
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        grid: {
                          display: false
                        }
                      },
                      y: {
                        max: saldoLineChartData.chartMaxValue,
                        beginAtZero: false,
                        ticks: {
                          callback: (value) =>
                            new Intl.NumberFormat('id-ID', {
                              notation: 'compact',
                              compactDisplay: 'short'
                            }).format(value)
                        }
                      }
                    }
                  }}
                  height={300}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">
                  Tidak ada data untuk ditampilkan
                </div>
              )}
            </div>
          </div>
        </ChartAnimation>

        {/* Recent Activity Table */}
        <ScrollAnimation delay={0.25}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Aktivitas Terbaru
              </h3>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                Menampilkan {recentAktivitas.length} transaksi terbaru
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs md:text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Tipe
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Tanggal
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Keterangan
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Kategori
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Nominal
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Admin
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {recentAktivitas.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="px-3 py-6 text-center text-gray-500 dark:text-gray-400 text-xs"
                      >
                        Tidak ada aktivitas
                      </td>
                    </tr>
                  ) : (
                    recentAktivitas.map(item => (
                      <tr key={`${item.tipe}-${item.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1 ${
                              item.tipe === 'pemasukan'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.tipe === 'pemasukan' ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            {item.tipe === 'pemasukan' ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                          {formatShortDate(item.tanggal_dibuat)}
                        </td>
                        <td className="px-3 py-2 text-gray-800 dark:text-gray-100 max-w-xs">
                          <div className="truncate" title={item.keterangan || '-'}>
                            {item.keterangan || '-'}
                          </div>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                          {item.kategori || '-'}
                        </td>
                        <td
                          className={`px-3 py-2 whitespace-nowrap font-semibold ${
                            item.tipe === 'pemasukan'
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-rose-600 dark:text-rose-300'
                          }`}
                        >
                          {item.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(item.nominal)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                          {item.admin_nama || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </ScrollAnimation>
      </div>
    </div>
  )
}

export default KeuanganDashboard


