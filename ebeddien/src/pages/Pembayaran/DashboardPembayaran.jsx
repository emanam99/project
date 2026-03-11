import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
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
import { dashboardAPI } from '../../services/api'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import UwabaDashboard from './components/UwabaDashboard'
import KhususDashboard from './components/KhususDashboard'
import TunggakanDashboard from './components/TunggakanDashboard'

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

function DashboardPembayaran() {
  const { tahunAjaran, tahunAjaranMasehi } = useTahunAjaranStore()
  const [activeTab, setActiveTab] = useState('uwaba') // 'uwaba', 'khusus', 'tunggakan'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Data untuk masing-masing tab
  const [uwabaData, setUwabaData] = useState(null)
  const [khususData, setKhususData] = useState(null)
  const [tunggakanData, setTunggakanData] = useState(null)

  useEffect(() => {
    loadAllData()
  }, [tahunAjaran, tahunAjaranMasehi])

  const loadAllData = async () => {
    setLoading(true)
    setError('')
    
    try {
      // Load dashboard data (mengandung data tunggakan dan khusus)
      const dashboardResult = await dashboardAPI.getDashboard('keterangan_1', tahunAjaran, tahunAjaranMasehi)
      
      if (dashboardResult.success) {
        const data = dashboardResult.data
        
        // Set data khusus
        setKhususData({
          total: data.total_khusus || 0,
          bayar: data.total_bayar_khusus || 0,
          kurang: data.total_kurang_khusus || 0,
          kelompok: data.kelompok_khusus || []
        })
        
        // Set data tunggakan
        setTunggakanData({
          total: data.total_tunggakan || 0,
          bayar: data.total_bayar || 0,
          kurang: data.total_kurang || 0,
          kelompok: data.kelompok_tunggakan || [],
          perBulan: data.per_bulan || { labels: [], data: [] }
        })
        
        // Set data UWABA
        setUwabaData({
          total: data.total_uwaba || 0,
          bayar: data.total_bayar_uwaba || 0,
          kurang: data.total_kurang_uwaba || 0,
          perHari: data.uwaba_per_hari || { labels: [], data: [] },
          perBulan: data.uwaba_per_bulan || []
        })
      } else {
        setError(dashboardResult.message || 'Gagal memuat data dashboard')
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
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {/* Tabs */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-6 overflow-hidden">
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab('uwaba')}
                className={`flex-1 px-4 py-2.5 text-center text-sm font-medium transition-all duration-200 ${
                  activeTab === 'uwaba'
                    ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 border-b-2 border-teal-600 dark:border-teal-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>UWABA</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('khusus')}
                className={`flex-1 px-4 py-2.5 text-center text-sm font-medium transition-all duration-200 ${
                  activeTab === 'khusus'
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
                  </svg>
                  <span>Khusus</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('tunggakan')}
                className={`flex-1 px-4 py-2.5 text-center text-sm font-medium transition-all duration-200 ${
                  activeTab === 'tunggakan'
                    ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-b-2 border-orange-600 dark:border-orange-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center justify-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span>Tunggakan</span>
                </div>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {activeTab === 'uwaba' && <UwabaDashboard data={uwabaData} />}
            {activeTab === 'khusus' && <KhususDashboard data={khususData} />}
            {activeTab === 'tunggakan' && <TunggakanDashboard data={tunggakanData} />}
          </div>
        </motion.div>
      </div>
    </div>
  )
}

export default DashboardPembayaran
