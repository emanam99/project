import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { pendaftaranAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'

// Angka animasi dari 0 ke nilai (ease-out)
function AnimatedNumber({ value, duration = 700, className = '' }) {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const target = typeof value === 'number' ? value : 0
    const startVal = displayRef.current
    let startTime = null

    const step = (now) => {
      if (startTime == null) startTime = now
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      const next = Math.round(startVal + (target - startVal) * eased)
      displayRef.current = next
      setDisplay(next)
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return <span className={className}>{display.toLocaleString('id-ID')}</span>
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
)

function DashboardPendaftaran() {
  const { tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboardData, setDashboardData] = useState(null)
  const [lastPendaftar, setLastPendaftar] = useState([])
  const [lembagaFilter, setLembagaFilter] = useState('')
  const [lembagaOptions, setLembagaOptions] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      pendaftaranAPI.getLembagaOptions('formal'),
      pendaftaranAPI.getLembagaOptions('diniyah')
    ])
      .then(([formalRes, diniyahRes]) => {
        if (cancelled) return
        const map = new Map()
        const rows = [
          ...(formalRes?.success && Array.isArray(formalRes.data) ? formalRes.data : []),
          ...(diniyahRes?.success && Array.isArray(diniyahRes.data) ? diniyahRes.data : [])
        ]
        for (const r of rows) {
          if (r?.id == null || r.id === '') continue
          const id = String(r.id)
          if (!map.has(id)) map.set(id, { id, nama: r.nama || id })
        }
        setLembagaOptions([...map.values()].sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id')))
      })
      .catch(() => {
        if (!cancelled) setLembagaOptions([])
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    loadDashboardData()
  }, [tahunAjaran, tahunAjaranMasehi, lembagaFilter])

  const loadDashboardData = async () => {
    setLoading(true)
    setError('')
    
    try {
      // Load dashboard statistics and last pendaftar in parallel dengan filter tahun ajaran
      const [dashboardResult, pendaftarResult] = await Promise.all([
        pendaftaranAPI.getDashboard(tahunAjaran, tahunAjaranMasehi, lembagaFilter || null),
        pendaftaranAPI.getLastPendaftar(tahunAjaran, tahunAjaranMasehi)
      ])
      
      if (dashboardResult.success) {
        setDashboardData(dashboardResult.data)
      } else {
        setError(dashboardResult.message || 'Gagal memuat data dashboard')
      }
      
      if (pendaftarResult.success) {
        setLastPendaftar(pendaftarResult.data || [])
      } else {
        console.error('Error loading last pendaftar:', pendaftarResult.message)
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err)
      setError(err.message || 'Terjadi kesalahan saat memuat data')
    } finally {
      setLoading(false)
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

  const formalBreakdown = dashboardData?.formal_breakdown ?? []
  const diniyahBreakdown = dashboardData?.diniyah_breakdown ?? []

  // Palette untuk banyak segmen (formal = nuansa teal, diniyah = nuansa biru)
  const paletteFormal = ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#0f766e', '#115e59', '#134e4a']
  const paletteDiniyah = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#1e40af', '#1e3a8a', '#172554']
  const getColors = (palette, n) => Array.from({ length: n }, (_, i) => palette[i % palette.length])

  const totalFormalSum = formalBreakdown.reduce((s, x) => s + x.count, 0)
  const totalDiniyahSum = diniyahBreakdown.reduce((s, x) => s + x.count, 0)

  const pieDataFormal = {
    labels: formalBreakdown.map(x => x.label || '-'),
    datasets: [{
      data: formalBreakdown.map(x => x.count),
      backgroundColor: getColors(paletteFormal, formalBreakdown.length),
      borderWidth: 0
    }]
  }
  const pieOptionsFormal = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed
            const pct = totalFormalSum > 0 ? Math.round((v / totalFormalSum) * 100) : 0
            return `${ctx.label}: ${v} (${pct}%)`
          }
        }
      }
    }
  }

  const pieDataDiniyah = {
    labels: diniyahBreakdown.map(x => x.label || '-'),
    datasets: [{
      data: diniyahBreakdown.map(x => x.count),
      backgroundColor: getColors(paletteDiniyah, diniyahBreakdown.length),
      borderWidth: 0
    }]
  }
  const pieOptionsDiniyah = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed
            const pct = totalDiniyahSum > 0 ? Math.round((v / totalDiniyahSum) * 100) : 0
            return `${ctx.label}: ${v} (${pct}%)`
          }
        }
      }
    }
  }

  const barDataFormal = {
    labels: formalBreakdown.map(x => x.label || '-'),
    datasets: [{
      label: 'Jumlah',
      data: formalBreakdown.map(x => x.count),
      backgroundColor: 'rgba(20, 184, 166, 0.8)',
      borderColor: '#14b8a6',
      borderWidth: 1
    }]
  }
  const barDataDiniyah = {
    labels: diniyahBreakdown.map(x => x.label || '-'),
    datasets: [{
      label: 'Jumlah',
      data: diniyahBreakdown.map(x => x.count),
      backgroundColor: 'rgba(59, 130, 246, 0.8)',
      borderColor: '#2563eb',
      borderWidth: 1
    }]
  }
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${ctx.raw} pendaftar` } }
    },
    scales: {
      x: { beginAtZero: true, ticks: { stepSize: 1 } }
    }
  }

  const genderBlock = dashboardData?.gender ?? {}
  const genderLaki = genderBlock.laki_laki ?? 0
  const genderPerempuan = genderBlock.perempuan ?? 0
  const genderUnknown = genderBlock.tidak_diketahui ?? 0
  const genderTotal = genderBlock.total ?? dashboardData?.total_pendaftar ?? 0
  const genderPieSlices = []
  const genderPieColors = []
  const genderPieLabels = []
  if (genderLaki > 0) {
    genderPieLabels.push('Laki-laki')
    genderPieSlices.push(genderLaki)
    genderPieColors.push('#0ea5e9')
  }
  if (genderPerempuan > 0) {
    genderPieLabels.push('Perempuan')
    genderPieSlices.push(genderPerempuan)
    genderPieColors.push('#f43f5e')
  }
  if (genderUnknown > 0) {
    genderPieLabels.push('Belum lengkap')
    genderPieSlices.push(genderUnknown)
    genderPieColors.push('#94a3b8')
  }
  const genderPieData = {
    labels: genderPieLabels,
    datasets: [{
      data: genderPieSlices,
      backgroundColor: genderPieColors,
      borderWidth: 0
    }]
  }
  const genderPieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed
            const pct = genderTotal > 0 ? Math.round((v / genderTotal) * 100) : 0
            return `${ctx.label}: ${v} (${pct}%)`
          }
        }
      }
    }
  }

  const stats = [
    {
      title: 'Pendaftar',
      value: dashboardData?.total_pendaftar || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Santri Baru',
      value: dashboardData?.total_santri_baru || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
      color: 'bg-emerald-500',
      bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
      textColor: 'text-emerald-600 dark:text-emerald-400'
    },
    {
      title: 'Formal',
      value: dashboardData?.total_formal || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      color: 'bg-teal-500',
      bgColor: 'bg-teal-50 dark:bg-teal-900/20',
      textColor: 'text-teal-600 dark:text-teal-400'
    },
    {
      title: 'Diniyah',
      value: dashboardData?.total_diniyah || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      textColor: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Bulan Ini',
      value: dashboardData?.total_bulan_ini || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      color: 'bg-orange-500',
      bgColor: 'bg-orange-50 dark:bg-orange-900/20',
      textColor: 'text-orange-600 dark:text-orange-400'
    },
    {
      title: 'Hari Ini',
      value: dashboardData?.total_hari_ini || 0,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
      color: 'bg-amber-500',
      bgColor: 'bg-amber-50 dark:bg-amber-900/20',
      textColor: 'text-amber-600 dark:text-amber-400'
    }
  ]

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            {/* Tahun ajaran + filter lembaga */}
            <motion.div
              className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.05 }}
            >
              {(tahunAjaran || tahunAjaranMasehi) && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Tahun Ajaran: {tahunAjaran && tahunAjaranMasehi
                    ? `${tahunAjaran} / ${tahunAjaranMasehi}`
                    : tahunAjaran || tahunAjaranMasehi}
                </p>
              )}
              <div className={`flex flex-col gap-1 min-w-[min(100%,220px)] ${!(tahunAjaran || tahunAjaranMasehi) ? 'sm:ml-auto' : ''}`}>
                <label htmlFor="dashboard-psb-lembaga" className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Filter lembaga
                </label>
                <select
                  id="dashboard-psb-lembaga"
                  value={lembagaFilter}
                  onChange={(e) => setLembagaFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                >
                  <option value="">Semua lembaga</option>
                  {lembagaOptions.map((l) => (
                    <option key={l.id} value={l.id}>{l.nama}</option>
                  ))}
                </select>
              </div>
            </motion.div>

            {/* Statistics Cards - 2 kolom di mobile, 5 di desktop; kotak lebih kecil; animasi muncul & angka 0→nilai */}
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3 lg:gap-4 mb-6">
              {stats.map((stat, index) => (
                <motion.div
                  key={stat.title}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className={`${stat.bgColor} rounded-xl shadow-sm p-3 sm:p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow duration-200`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate">
                        {stat.title}
                      </h3>
                      <p className={`text-lg sm:text-xl font-bold ${stat.textColor} mt-0.5`}>
                        <AnimatedNumber value={stat.value} duration={700} />
                      </p>
                    </div>
                    <div className={`${stat.color} p-2 rounded-lg text-white flex items-center justify-center flex-shrink-0`}>
                      {stat.icon}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Perbandingan gender (ikut filter lembaga + tahun ajaran) */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Pendaftar menurut jenis kelamin
                </h3>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Total:{' '}
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    <AnimatedNumber value={genderTotal} duration={700} />
                  </span>
                </span>
              </div>
              {genderTotal > 0 ? (
                <div className="flex flex-col md:flex-row items-stretch gap-4">
                  <div className="w-full md:w-48 h-44 flex-shrink-0 mx-auto md:mx-0">
                    {genderPieSlices.length > 0 ? (
                      <Pie data={genderPieData} options={genderPieOptions} />
                    ) : (
                      <div className="flex items-center justify-center h-full text-xs text-gray-400">—</div>
                    )}
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-500 flex-shrink-0" />
                        <span className="text-xs font-medium text-sky-800 dark:text-sky-200">Laki-laki</span>
                      </div>
                      <p className="text-xl font-bold text-sky-700 dark:text-sky-300">
                        <AnimatedNumber value={genderLaki} duration={700} />
                      </p>
                      <p className="text-[11px] text-sky-600/80 dark:text-sky-400/80 mt-0.5">
                        {genderTotal > 0 ? `${Math.round((genderLaki / genderTotal) * 100)}%` : '0%'} dari total
                      </p>
                    </div>
                    <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0" />
                        <span className="text-xs font-medium text-rose-800 dark:text-rose-200">Perempuan</span>
                      </div>
                      <p className="text-xl font-bold text-rose-700 dark:text-rose-300">
                        <AnimatedNumber value={genderPerempuan} duration={700} />
                      </p>
                      <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
                        {genderTotal > 0 ? `${Math.round((genderPerempuan / genderTotal) * 100)}%` : '0%'} dari total
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-600 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Belum lengkap</span>
                      </div>
                      <p className="text-xl font-bold text-slate-700 dark:text-slate-200">
                        <AnimatedNumber value={genderUnknown} duration={700} />
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Tanpa jenis kelamin di registrasi/biodata
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
                  Tidak ada pendaftar untuk filter ini
                </p>
              )}
            </motion.div>

            {/* Diagram Lingkaran: Daftar Formal & Daftar Diniyah (tampilan seperti Dashboard Keuangan) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 mb-6">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col"
              >
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Komposisi Daftar Formal
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                    Formal
                  </span>
                </div>
                <div className="flex-1 min-h-0" style={{ height: '260px' }}>
                  {formalBreakdown.length > 0 ? (
                    <div className="h-full flex flex-col md:flex-row items-center gap-3">
                      <div className="w-40 h-40 md:w-44 md:h-44 flex-shrink-0">
                        <Pie
                          data={pieDataFormal}
                          options={pieOptionsFormal}
                          height={176}
                        />
                      </div>
                      <div className="flex-1 w-full h-full overflow-y-auto pr-1 space-y-1">
                        {pieDataFormal.labels.map((label, idx) => (
                          <div
                            key={`${label}-${idx}`}
                            className="flex items-center justify-between text-[11px] px-2 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: pieDataFormal.datasets[0].backgroundColor[idx]
                                }}
                              />
                              <span className="text-gray-700 dark:text-gray-200 truncate">{label}</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                              {pieDataFormal.datasets[0].data[idx]} pendaftar
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
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.42, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 h-full flex flex-col"
              >
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Komposisi Daftar Diniyah
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    Diniyah
                  </span>
                </div>
                <div className="flex-1 min-h-0" style={{ height: '260px' }}>
                  {diniyahBreakdown.length > 0 ? (
                    <div className="h-full flex flex-col md:flex-row items-center gap-3">
                      <div className="w-40 h-40 md:w-44 md:h-44 flex-shrink-0">
                        <Pie
                          data={pieDataDiniyah}
                          options={pieOptionsDiniyah}
                          height={176}
                        />
                      </div>
                      <div className="flex-1 w-full h-full overflow-y-auto pr-1 space-y-1">
                        {pieDataDiniyah.labels.map((label, idx) => (
                          <div
                            key={`${label}-${idx}`}
                            className="flex items-center justify-between text-[11px] px-2 py-1 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                  backgroundColor: pieDataDiniyah.datasets[0].backgroundColor[idx]
                                }}
                              />
                              <span className="text-gray-700 dark:text-gray-200 truncate">{label}</span>
                            </div>
                            <span className="font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                              {pieDataDiniyah.datasets[0].data[idx]} pendaftar
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
              </motion.div>
            </div>

            {/* Diagram Batang: perbandingan tiap isi Formal & Diniyah */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 mb-6">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col"
              >
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Daftar Formal (Diagram Batang)
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                    Formal
                  </span>
                </div>
                <div className="flex-1 min-h-0" style={{ height: '260px' }}>
                  {formalBreakdown.length > 0 ? (
                    <Bar data={barDataFormal} options={barOptions} height={260} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">
                      Tidak ada data untuk ditampilkan
                    </div>
                  )}
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.57, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 flex flex-col"
              >
                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Daftar Diniyah (Diagram Batang)
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                    Diniyah
                  </span>
                </div>
                <div className="flex-1 min-h-0" style={{ height: '260px' }}>
                  {diniyahBreakdown.length > 0 ? (
                    <Bar data={barDataDiniyah} options={barOptions} height={260} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-gray-400 dark:text-gray-500">
                      Tidak ada data untuk ditampilkan
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            {/* List 10 Pendaftar Terakhir */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-gray-200">
                    10 Pendaftar Terakhir
                  </h2>
                  <button
                    onClick={loadDashboardData}
                    className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200"
                    title="Refresh data"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {lastPendaftar.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                  <p>Belum ada data pendaftar</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          No
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          NIS
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Nama
                        </th>
                        <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Formal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {lastPendaftar.map((pendaftar, index) => (
                        <motion.tr
                          key={index}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.3, delay: index * 0.05 }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
                        >
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-200">
                            {pendaftar.no}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-mono">
                            {pendaftar.nis ?? pendaftar.id ?? '-'}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">
                            {pendaftar.nama}
                          </td>
                          <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              pendaftar.formal && pendaftar.formal !== '-'
                                ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {pendaftar.formal || '-'}
                            </span>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPendaftaran
