import { useState, useEffect, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useWhatsAppTemplate } from '../../contexts/WhatsAppTemplateContext'
import { useThemeStore } from '../../store/themeStore'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { profilAPI, authAPI, pendaftaranAPI, kalenderAPI, getAppEnv } from '../../services/api'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import { APP_VERSION } from '../../config/version'
import { getHeaderGroups } from '../../config/menuConfig'
import { userHasSuperAdminAccess, userMatchesAnyAllowedRole } from '../../utils/roleAccess'

const HEADER_GROUPS = getHeaderGroups()

function Header() {
  const appEnv = getAppEnv()
  const isStaging = appEnv === 'staging'
  const { user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const { tahunAjaran, setTahunAjaran, options, tahunAjaranMasehi, setTahunAjaranMasehi, optionsMasehi } = useTahunAjaranStore()
  const navigate = useNavigate()
  const location = useLocation()
  const { open: openTemplateOffcanvas } = useWhatsAppTemplate()
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showSaldoDropdown, setShowSaldoDropdown] = useState(false)
  const [tanggalMasehi, setTanggalMasehi] = useState('')
  const [tanggalHijriyah, setTanggalHijriyah] = useState('')
  const [paymentData, setPaymentData] = useState({
    total: 0,
    totalKeseluruhan: 0,
    rincian: {
      uwaba: 0,
      tunggakan: 0,
      khusus: 0,
      total: 0
    },
    rincianVia: {
      uwaba: {},
      tunggakan: {},
      khusus: {}
    },
    keseluruhan: {
      uwaba: 0,
      tunggakan: 0,
      khusus: 0,
      total: 0
    }
  })
  const [saldoData, setSaldoData] = useState({
    saldo_awal_tahun: 0,
    total_pemasukan: 0,
    total_pengeluaran: 0,
    sisa_saldo: 0
  })
  const [pendapatanPendaftaranHariIni, setPendapatanPendaftaranHariIni] = useState(0)
  const [pendapatanPendaftaranAdminHariIni, setPendapatanPendaftaranAdminHariIni] = useState(0)
  const [pendapatanPendaftaranRincian, setPendapatanPendaftaranRincian] = useState({ jumlah_transaksi: 0, jumlah_transaksi_admin: 0, rincian_via: {}, rincian_via_admin: {} })
  const [showPendaftaranDropdown, setShowPendaftaranDropdown] = useState(false)
  const [openTADropdown, setOpenTADropdown] = useState(null) // 'hijriyah' | 'masehi' | null
  const [todayKalender, setTodayKalender] = useState(null)
  const [loadingTodayKalender, setLoadingTodayKalender] = useState(false)
  const [headerPhotoUrl, setHeaderPhotoUrl] = useState(null)
  const [headerUserDetail, setHeaderUserDetail] = useState(null) // nip dll dari GET /user/:id
  const headerPhotoRef = useRef(null)

  const paymentRef = useRef(null)
  const userRef = useRef(null)
  const saldoRef = useRef(null)
  const pendaftaranRef = useRef(null)
  const taRef = useRef(null)

  const loadHeaderPhoto = () => {
    if (!user?.id) {
      setHeaderUserDetail(null)
      return
    }
    profilAPI.getUser(user.id).then((res) => {
      if (res.success && res.user) {
        setHeaderUserDetail(res.user)
        if (res.user?.foto_profil) {
          profilAPI.getProfilFotoBlob().then((blob) => {
            if (blob instanceof Blob && headerPhotoRef) {
              if (headerPhotoRef.current) URL.revokeObjectURL(headerPhotoRef.current)
              headerPhotoRef.current = URL.createObjectURL(blob)
              setHeaderPhotoUrl(headerPhotoRef.current)
            }
          }).catch(() => {})
        } else {
          if (headerPhotoRef.current) {
            URL.revokeObjectURL(headerPhotoRef.current)
            headerPhotoRef.current = null
          }
          setHeaderPhotoUrl(null)
        }
      } else {
        setHeaderUserDetail(null)
        if (headerPhotoRef.current) {
          URL.revokeObjectURL(headerPhotoRef.current)
          headerPhotoRef.current = null
        }
        setHeaderPhotoUrl(null)
      }
    }).catch(() => {
      setHeaderUserDetail(null)
    })
  }

  useEffect(() => {
    loadHeaderPhoto()
    const onFotoUpdated = () => loadHeaderPhoto()
    window.addEventListener('profil-foto-updated', onFotoUpdated)
    return () => {
      window.removeEventListener('profil-foto-updated', onFotoUpdated)
      if (headerPhotoRef.current) {
        URL.revokeObjectURL(headerPhotoRef.current)
        headerPhotoRef.current = null
      }
    }
  }, [user?.id])

  // Judul halaman: berdasarkan grup aktif, judul = label menu yang aktif (lebih simpel)
  const getPageTitle = () => {
    const path = location.pathname
    if (path === '/' || path === '/dashboard') return 'Dashboard Pembayaran'
    if (path === '/aktivitas-saya') return 'Aktivitas Saya'
    for (const group of HEADER_GROUPS) {
      for (const route of group.routes) {
        const match = route.prefix
          ? (path === route.path || path.startsWith(route.path + '/'))
          : path === route.path
        if (match) return route.label
      }
    }
    return 'Dashboard'
  }

  // Grup yang aktif (untuk pengecekan dropdown/subtitle)
  const getActiveGroup = () => {
    const path = location.pathname
    if (path === '/' || path === '/dashboard') return 'UWABA'
    for (const group of HEADER_GROUPS) {
      for (const route of group.routes) {
        const match = route.prefix
          ? (path === route.path || path.startsWith(route.path + '/'))
          : path === route.path
        if (match) return group.name
      }
    }
    return null
  }

  // Check if current page is pemasukan or pengeluaran
  const isPemasukanPengeluaranPage = () => {
    const path = location.pathname
    return path === '/pengeluaran' || path.startsWith('/pengeluaran/') || 
           path === '/pemasukan' || path.startsWith('/pemasukan/')
  }

  // Check if current page is aktivitas
  const isAktivitasPage = () => {
    const path = location.pathname
    return path === '/aktivitas' || path.startsWith('/aktivitas/')
  }

  // Cek grup aktif (satu sumber dari HEADER_GROUPS)
  const isKeuanganGroup = () => getActiveGroup() === 'Keuangan'
  const isPendaftaranGroup = () => getActiveGroup() === 'Pendaftaran'
  const isKalenderGroup = () => getActiveGroup() === 'Kalender'

  // Format tanggal Y-m-d -> dd-mm-yyyy untuk header Kalender
  const formatDateDMY = (ymd) => {
    if (!ymd || String(ymd).length < 10) return ymd || ''
    const s = String(ymd).slice(0, 10)
    const [y, m, d] = s.split('-')
    return d && m && y ? `${d}-${m}-${y}` : s
  }

  // Update document title when route changes
  useEffect(() => {
    const title = getPageTitle()
    document.title = `${title} - Sistem Pembayaran`
  }, [location.pathname])

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }


  // Render via breakdown for a category
  const renderViaBreakdown = (viaData, categoryName) => {
    if (!viaData || Object.keys(viaData).length === 0) return null

    return (
      <div className="ml-3 mt-1.5 mb-2 space-y-1 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
        {Object.entries(viaData).map(([via, amount]) => (
          <div key={via} className="flex justify-between items-center">
            <span className="text-xs text-gray-500 dark:text-gray-500">• {via}:</span>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{formatCurrency(amount)}</span>
          </div>
        ))}
      </div>
    )
  }

  // Render rincian pendapatan pendaftaran (per via: Cash, Transfer, ipaymu, dll.)
  const renderPendaftaranRincianVia = () => {
    const viaData = pendapatanPendaftaranRincian?.rincian_via ?? {}
    if (!viaData || Object.keys(viaData).length === 0) return null
    const viaLabel = (v) => (v && String(v).trim() !== '' ? v : 'Lainnya')
    return (
      <div className="mt-2">
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Pembayaran per metode / channel</p>
        <div className="space-y-2">
          {Object.entries(viaData).map(([via, amount]) => (
            <div key={via} className="flex justify-between items-center py-1.5 px-2 rounded bg-gray-50 dark:bg-gray-700/50">
              <span className="text-xs text-gray-700 dark:text-gray-300">Pembayaran via {viaLabel(via)}</span>
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(amount)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Update tanggal dari API
  const updateTanggal = async () => {
    try {
      const { masehi, hijriyah } = await getTanggalFromAPI()
      setTanggalMasehi(masehi)
      setTanggalHijriyah(hijriyah)
    } catch (error) {
      console.error('Error updating tanggal:', error)
      setTanggalMasehi('-')
      setTanggalHijriyah('-')
    }
  }


  // Update tanggal on mount and every minute
  useEffect(() => {
    updateTanggal()
    const interval = setInterval(updateTanggal, 60000) // Update setiap 1 menit
    return () => clearInterval(interval)
  }, [])

  // Load hari ini (Masehi + Hijriyah) untuk header grup Kalender
  useEffect(() => {
    if (!isKalenderGroup()) {
      setTodayKalender(null)
      return
    }
    let cancelled = false
    setLoadingTodayKalender(true)
    const now = new Date()
    const tanggal = now.toISOString().slice(0, 10)
    const waktu = now.toTimeString().slice(0, 8)
    kalenderAPI.get({ action: 'today', tanggal, waktu })
      .then((res) => {
        if (cancelled || !res || Array.isArray(res)) return
        if (res.hijriyah && res.hijriyah !== '0000-00-00') {
          setTodayKalender({ masehi: res.masehi || tanggal, hijriyah: res.hijriyah })
        } else {
          setTodayKalender({ masehi: res.masehi || tanggal, hijriyah: null })
        }
      })
      .catch(() => {
        if (!cancelled) setTodayKalender(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingTodayKalender(false)
      })
    return () => { cancelled = true }
  }, [location.pathname])

  // Load payment data — endpoint hanya boleh diakses role admin_uwaba, petugas_uwaba, super_admin (gabungan multi_role)
  const canAccessTotalPembayaran = useMemo(
    () => userMatchesAnyAllowedRole(user, ['admin_uwaba', 'petugas_uwaba', 'super_admin']),
    [user]
  )

  useEffect(() => {
    if (!user?.id || !canAccessTotalPembayaran) return

    const loadPaymentData = async () => {
      try {
        const response = await profilAPI.getTotalPembayaran(user.id)
        if (response.success) {
          setPaymentData({
            total: response.total || 0,
            totalKeseluruhan: response.total_keseluruhan || 0,
            rincian: {
              uwaba: response.detail?.uwaba || 0,
              tunggakan: response.detail?.tunggakan || 0,
              khusus: response.detail?.khusus || 0,
              total: response.total || 0
            },
            rincianVia: {
              uwaba: response.detail_via?.uwaba || {},
              tunggakan: response.detail_via?.tunggakan || {},
              khusus: response.detail_via?.khusus || {}
            },
            keseluruhan: {
              uwaba: response.detail_keseluruhan?.uwaba || 0,
              tunggakan: response.detail_keseluruhan?.tunggakan || 0,
              khusus: response.detail_keseluruhan?.khusus || 0,
              total: response.total_keseluruhan || 0
            }
          })
        }
      } catch (error) {
        if (error?.response?.status !== 403) console.error('Error loading payment data:', error)
      }
    }

    loadPaymentData()
    const interval = setInterval(loadPaymentData, 30000)
    return () => clearInterval(interval)
  }, [user?.id, canAccessTotalPembayaran])

  // Load saldo data (pemasukan & pengeluaran) untuk grup Keuangan
  useEffect(() => {
    if (!isKeuanganGroup()) return

    const loadSaldoData = async () => {
      try {
        const response = await profilAPI.getTotalPemasukanPengeluaran(tahunAjaran)
        if (response.success) {
          setSaldoData({
            saldo_awal_tahun: response.saldo_awal_tahun || 0,
            total_pemasukan: response.total_pemasukan || 0,
            total_pengeluaran: response.total_pengeluaran || 0,
            sisa_saldo: response.sisa_saldo || 0
          })
        }
      } catch (error) {
        console.error('Error loading saldo data:', error)
      }
    }

    loadSaldoData()
    // Refresh setiap 30 detik
    const interval = setInterval(loadSaldoData, 30000)
    return () => clearInterval(interval)
  }, [location.pathname, tahunAjaran])

  // Load pendapatan hari ini dari transaksi pendaftaran untuk grup Pendaftaran
  useEffect(() => {
    if (!isPendaftaranGroup()) return

    const loadPendapatanHariIni = async () => {
      try {
        const response = await pendaftaranAPI.getPendapatanHariIni(tahunAjaran, tahunAjaranMasehi)
        if (response.success && response.data) {
          setPendapatanPendaftaranHariIni(response.data.total_pendapatan_hari_ini ?? 0)
          setPendapatanPendaftaranAdminHariIni(response.data.total_pendapatan_hari_ini_admin ?? 0)
          setPendapatanPendaftaranRincian({
            jumlah_transaksi: response.data.jumlah_transaksi ?? 0,
            jumlah_transaksi_admin: response.data.jumlah_transaksi_admin ?? 0,
            rincian_via: response.data.rincian_via ?? {},
            rincian_via_admin: response.data.rincian_via_admin ?? {}
          })
        }
      } catch (error) {
        console.error('Error loading pendapatan pendaftaran hari ini:', error)
      }
    }

    loadPendapatanHariIni()
    const interval = setInterval(loadPendapatanHariIni, 30000)
    return () => clearInterval(interval)
  }, [location.pathname, tahunAjaran, tahunAjaranMasehi])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (paymentRef.current && !paymentRef.current.contains(event.target)) {
        setShowPaymentDropdown(false)
      }
      if (userRef.current && !userRef.current.contains(event.target)) {
        setShowUserDropdown(false)
      }
      if (saldoRef.current && !saldoRef.current.contains(event.target)) {
        setShowSaldoDropdown(false)
      }
      if (pendaftaranRef.current && !pendaftaranRef.current.contains(event.target)) {
        setShowPendaftaranDropdown(false)
      }
      if (taRef.current && !taRef.current.contains(event.target)) {
        setOpenTADropdown(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    try {
      await authAPI.logoutV2()
    } catch (_) {}
    logout()
    navigate('/login')
  }

  return (
    <header className={`${isStaging ? 'bg-red-600 dark:bg-red-800' : 'bg-primary-600 dark:bg-primary-800'} text-white p-3 rounded-lg mb-2 shadow-lg flex items-start md:items-center justify-between relative gap-3 mx-2 sm:mx-3 mt-2`}>
      {/* Left Section - Title & Mobile Payment */}
      <div className="flex-1 min-w-0 relative">
        <h1 className="text-xl md:text-2xl font-bold">{getPageTitle()}</h1>
        {/* Subtitle grup Kalender: Hari ini dd-mm-yyyy M / dd-mm-yyyy H */}
        {isKalenderGroup() && !loadingTodayKalender && todayKalender && (
          <p className="text-sm text-white/90 mt-0.5">
            Hari ini {formatDateDMY(todayKalender.masehi)} M
            {todayKalender.hijriyah && (
              <span className="ml-1.5 font-medium">{formatDateDMY(todayKalender.hijriyah)} H</span>
            )}
          </p>
        )}

        {/* Mobile: Keuangan = saldo, Pendaftaran = pendapatan hari ini (transaksi pendaftaran), lain = pembayaran */}
        {isKeuanganGroup() ? (
          <div className="md:hidden relative" ref={saldoRef}>
            <div 
              className="flex items-center gap-2 mt-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowSaldoDropdown(!showSaldoDropdown)}
            >
              <svg className="w-4 h-4 text-white/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  <span className="text-xs font-bold text-white">{formatCurrency(saldoData.total_pemasukan)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-3 h-3 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 7V3" />
                  </svg>
                  <span className="text-xs text-white/70">{formatCurrency(saldoData.total_pengeluaran)}</span>
                </div>
              </div>
            </div>

            {/* Mobile Saldo Dropdown */}
            <AnimatePresence>
              {showSaldoDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="md:hidden absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
                >
                  <div className="px-4">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Rincian Saldo Tahun Ajaran {tahunAjaran}</h3>
                    <div className="space-y-3">
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Saldo Awal Tahun</span>
                        </div>
                        <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{formatCurrency(saldoData.saldo_awal_tahun)}</p>
                      </div>
                      
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                          <span className="text-xs font-medium text-green-700 dark:text-green-300">Total Pemasukan</span>
                        </div>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(saldoData.total_pemasukan)}</p>
                      </div>
                      
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 7V3" />
                          </svg>
                          <span className="text-xs font-medium text-red-700 dark:text-red-300">Total Pengeluaran</span>
                        </div>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(saldoData.total_pengeluaran)}</p>
                      </div>
                      
                      <div className={`rounded-lg p-3 border ${
                        saldoData.sisa_saldo >= 0 
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                          : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <svg className={`w-4 h-4 ${
                            saldoData.sisa_saldo >= 0 
                              ? 'text-blue-600 dark:text-blue-400' 
                              : 'text-orange-600 dark:text-orange-400'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className={`text-xs font-medium ${
                            saldoData.sisa_saldo >= 0 
                              ? 'text-blue-700 dark:text-blue-300' 
                              : 'text-orange-700 dark:text-orange-300'
                          }`}>Sisa Saldo</span>
                        </div>
                        <p className={`text-lg font-bold ${
                          saldoData.sisa_saldo >= 0 
                            ? 'text-blue-600 dark:text-blue-400' 
                            : 'text-orange-600 dark:text-orange-400'
                        }`}>{formatCurrency(saldoData.sisa_saldo)}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : isKalenderGroup() ? null : isPendaftaranGroup() ? (
          <div className="md:hidden relative" ref={pendaftaranRef}>
            <div
              className="flex items-center gap-2 mt-2 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowPendaftaranDropdown(!showPendaftaranDropdown)}
            >
              <svg className="w-4 h-4 text-white/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">{formatCurrency(pendapatanPendaftaranAdminHariIni)}</span>
                <span className="text-xs text-white/60">•</span>
                <span className="text-xs text-white/70">Total: {formatCurrency(pendapatanPendaftaranHariIni)}</span>
              </div>
            </div>
            <AnimatePresence>
              {showPendaftaranDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="md:hidden absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
                >
                  <div className="px-4">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Pendapatan Hari Ini (Pendaftaran)</h3>
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{user?.nama || 'Admin'}</div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Hari ini:</span>
                        <span className="text-base font-bold text-teal-600 dark:text-teal-400">{formatCurrency(pendapatanPendaftaranAdminHariIni)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pendapatanPendaftaranRincian.jumlah_transaksi_admin} transaksi</p>
                    </div>
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Semua Admin</div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Total hari ini:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(pendapatanPendaftaranHariIni)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pendapatanPendaftaranRincian.jumlah_transaksi} transaksi</p>
                    </div>
                    {renderPendaftaranRincianVia()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div 
            className="md:hidden flex items-center gap-2 mt-2 cursor-pointer hover:opacity-80 transition-opacity relative"
            onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
          >
            <svg className="w-4 h-4 text-white/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">{formatCurrency(paymentData.total)}</span>
              <span className="text-xs text-white/60">•</span>
              <span className="text-xs text-white/70">Total: {formatCurrency(paymentData.totalKeseluruhan)}</span>
            </div>
          </div>
        )}

        {/* Mobile Payment Dropdown - tidak ditampilkan di grup Kalender */}
        <AnimatePresence>
          {showPaymentDropdown && !isKalenderGroup() && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
            >
              <div className="px-4 pb-3 border-b dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Rincian Pembayaran Hari Ini</h3>
                {/* Rincian Admin */}
                <div className="mb-4">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{user?.nama || 'Admin'}</div>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Uwaba:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentData.rincian.uwaba)}</span>
                      </div>
                      {renderViaBreakdown(paymentData.rincianVia.uwaba, 'uwaba')}
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Tunggakan:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentData.rincian.tunggakan)}</span>
                      </div>
                      {renderViaBreakdown(paymentData.rincianVia.tunggakan, 'tunggakan')}
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Khusus:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentData.rincian.khusus)}</span>
                      </div>
                      {renderViaBreakdown(paymentData.rincianVia.khusus, 'khusus')}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Total:</span>
                      <span className="text-base font-bold text-primary-600 dark:text-primary-400">{formatCurrency(paymentData.rincian.total)}</span>
                    </div>
                  </div>
                </div>
                {/* Rincian Keseluruhan */}
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Semua Admin</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Uwaba:</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentData.keseluruhan.uwaba)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Tunggakan:</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentData.keseluruhan.tunggakan)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Khusus:</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentData.keseluruhan.khusus)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Total:</span>
                      <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{formatCurrency(paymentData.keseluruhan.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Section - Desktop: Keuangan = saldo, Pendaftaran = pendapatan hari ini, lain = pembayaran */}
      <div className="relative flex items-center gap-3 flex-shrink-0" ref={paymentRef}>
        {isKeuanganGroup() ? (
          <div className="hidden md:block relative" ref={saldoRef}>
            <div 
              className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30 cursor-pointer hover:bg-white/30 transition-colors"
              onClick={() => setShowSaldoDropdown(!showSaldoDropdown)}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex flex-col">
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  <span className="text-sm font-bold text-white">{formatCurrency(saldoData.total_pemasukan)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 7V3" />
                  </svg>
                  <span className="text-xs text-white/70">{formatCurrency(saldoData.total_pengeluaran)}</span>
                </div>
              </div>
            </div>

            {/* Desktop Saldo Dropdown */}
            <AnimatePresence>
              {showSaldoDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="hidden md:block absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
                >
                  <div className="px-4">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Rincian Saldo Tahun Ajaran {tahunAjaran}</h3>
                    <div className="space-y-3">
                      <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">Saldo Awal Tahun</span>
                        </div>
                        <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{formatCurrency(saldoData.saldo_awal_tahun)}</p>
                      </div>
                      
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                          <span className="text-xs font-medium text-green-700 dark:text-green-300">Total Pemasukan</span>
                        </div>
                        <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(saldoData.total_pemasukan)}</p>
                      </div>
                      
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 7V3" />
                          </svg>
                          <span className="text-xs font-medium text-red-700 dark:text-red-300">Total Pengeluaran</span>
                        </div>
                        <p className="text-lg font-bold text-red-600 dark:text-red-400">{formatCurrency(saldoData.total_pengeluaran)}</p>
                      </div>
                      
                      <div className={`rounded-lg p-3 border ${
                        saldoData.sisa_saldo >= 0 
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' 
                          : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <svg className={`w-4 h-4 ${
                            saldoData.sisa_saldo >= 0 
                              ? 'text-blue-600 dark:text-blue-400' 
                              : 'text-orange-600 dark:text-orange-400'
                          }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span className={`text-xs font-medium ${
                            saldoData.sisa_saldo >= 0 
                              ? 'text-blue-700 dark:text-blue-300' 
                              : 'text-orange-700 dark:text-orange-300'
                          }`}>Sisa Saldo</span>
                        </div>
                        <p className={`text-lg font-bold ${
                          saldoData.sisa_saldo >= 0 
                            ? 'text-blue-600 dark:text-blue-400' 
                            : 'text-orange-600 dark:text-orange-400'
                        }`}>{formatCurrency(saldoData.sisa_saldo)}</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : isKalenderGroup() ? null : isPendaftaranGroup() ? (
          <div className="hidden md:block relative" ref={pendaftaranRef}>
            <div
              className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30 cursor-pointer hover:bg-white/30 transition-colors"
              onClick={() => setShowPendaftaranDropdown(!showPendaftaranDropdown)}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">{formatCurrency(pendapatanPendaftaranAdminHariIni)}</span>
                <span className="text-xs text-white/70">Total: {formatCurrency(pendapatanPendaftaranHariIni)}</span>
              </div>
            </div>
            <AnimatePresence>
              {showPendaftaranDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="hidden md:block absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
                >
                  <div className="px-4">
                    <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Pendapatan Hari Ini (Pendaftaran)</h3>
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{user?.nama || 'Admin'}</div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Hari ini:</span>
                        <span className="text-base font-bold text-teal-600 dark:text-teal-400">{formatCurrency(pendapatanPendaftaranAdminHariIni)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pendapatanPendaftaranRincian.jumlah_transaksi_admin} transaksi</p>
                    </div>
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Semua Admin</div>
                      <div className="flex justify-between items-center py-1.5">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Total hari ini:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(pendapatanPendaftaranHariIni)}</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{pendapatanPendaftaranRincian.jumlah_transaksi} transaksi</p>
                    </div>
                    {renderPendaftaranRincianVia()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div 
            className="hidden md:flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30 cursor-pointer hover:bg-white/30 transition-colors"
            onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">{formatCurrency(paymentData.total)}</span>
              <span className="text-xs text-white/70">Total: {formatCurrency(paymentData.totalKeseluruhan)}</span>
            </div>
          </div>
        )}

        {/* Desktop Payment Dropdown - tidak ditampilkan di grup Kalender */}
        <AnimatePresence>
          {showPaymentDropdown && !isKalenderGroup() && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="hidden md:block absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
            >
              <div className="px-4 pb-3 border-b dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Rincian Pembayaran Hari Ini</h3>
                {/* Rincian Admin */}
                <div className="mb-4">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{user?.nama || 'Admin'}</div>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Uwaba:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentData.rincian.uwaba)}</span>
                      </div>
                      {renderViaBreakdown(paymentData.rincianVia.uwaba, 'uwaba')}
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Tunggakan:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentData.rincian.tunggakan)}</span>
                      </div>
                      {renderViaBreakdown(paymentData.rincianVia.tunggakan, 'tunggakan')}
                    </div>
                    <div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-600 dark:text-gray-400">Khusus:</span>
                        <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentData.rincian.khusus)}</span>
                      </div>
                      {renderViaBreakdown(paymentData.rincianVia.khusus, 'khusus')}
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Total:</span>
                      <span className="text-base font-bold text-primary-600 dark:text-primary-400">{formatCurrency(paymentData.rincian.total)}</span>
                    </div>
                  </div>
                </div>
                {/* Rincian Keseluruhan */}
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Semua Admin</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Uwaba:</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentData.keseluruhan.uwaba)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Tunggakan:</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentData.keseluruhan.tunggakan)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-600 dark:text-gray-400">Khusus:</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentData.keseluruhan.khusus)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Total:</span>
                      <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{formatCurrency(paymentData.keseluruhan.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tahun Ajaran - Desktop (custom dropdown, tampil modern saat terbuka) */}
        <div className="hidden sm:flex flex-col gap-1.5 mr-2 relative" ref={taRef}>
          {/* Tahun Ajaran Hijriyah */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenTADropdown((v) => (v === 'hijriyah' ? null : 'hijriyah'))}
              className="text-xs font-bold text-white cursor-pointer min-w-[100px] py-0.5 hover:opacity-90 text-center flex items-center justify-center gap-1"
            >
              <span>{options.find((o) => o.value === tahunAjaran)?.label ?? tahunAjaran}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${openTADropdown === 'hijriyah' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <AnimatePresence>
              {openTADropdown === 'hijriyah' && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 min-w-[120px] max-h-[220px] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-600 py-1.5 z-50"
                >
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTahunAjaran(option.value)
                        setOpenTADropdown(null)
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                        option.value === tahunAjaran
                          ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Tahun Ajaran Masehi */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenTADropdown((v) => (v === 'masehi' ? null : 'masehi'))}
              className="text-xs font-bold text-white cursor-pointer min-w-[100px] py-0.5 hover:opacity-90 text-center flex items-center justify-center gap-1"
            >
              <span>{optionsMasehi.find((o) => o.value === tahunAjaranMasehi)?.label ?? tahunAjaranMasehi}</span>
              <svg className={`w-3.5 h-3.5 transition-transform ${openTADropdown === 'masehi' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <AnimatePresence>
              {openTADropdown === 'masehi' && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 min-w-[120px] max-h-[220px] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-600 py-1.5 z-50"
                >
                  {optionsMasehi.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setTahunAjaranMasehi(option.value)
                        setOpenTADropdown(null)
                      }}
                      className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                        option.value === tahunAjaranMasehi
                          ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* User Avatar + Staging badge (di bawah foto) */}
        <div className="relative flex flex-col items-center gap-1" ref={userRef}>
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="w-11 h-11 rounded-full bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center cursor-pointer shadow-lg border-2 border-gray-200 dark:border-gray-600 hover:border-teal-400 transition-colors overflow-hidden shrink-0"
          >
            {headerPhotoUrl ? (
              <img src={headerPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-teal-600 dark:text-teal-400">
                {(user?.nama || user?.username || '?').toString().charAt(0).toUpperCase()}
              </span>
            )}
          </button>
          {isStaging && (
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded whitespace-nowrap" title="Mode staging">Staging</span>
          )}

          {/* User Dropdown */}
          <AnimatePresence>
            {showUserDropdown && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-2 text-gray-700 dark:text-gray-200 z-50 max-h-[calc(100vh-120px)] overflow-y-auto overscroll-contain"
              >
                <div className="flex flex-col items-center px-4 pt-4 pb-3 border-b dark:border-gray-700">
                  <div className="w-16 h-16 rounded-full bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center mb-2 border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0">
                    {headerPhotoUrl ? (
                      <img src={headerPhotoUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-semibold text-teal-600 dark:text-teal-400">
                        {(user?.nama || user?.username || '?').toString().charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-gray-800 dark:text-gray-200 text-base">{user?.nama || 'User'}</div>
                  {(() => {
                    const nip = headerUserDetail?.pengurus?.nip ?? user?.nip
                    return nip != null && nip !== '' ? (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{nip}</div>
                    ) : null
                  })()}
                  {user?.username && <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">@{user.username}</div>}
                </div>

                {userHasSuperAdminAccess(user) && (
                  <>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                      onClick={() => {
                        setShowUserDropdown(false)
                        openTemplateOffcanvas()
                      }}
                    >
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      Template WA
                    </button>
                  </>
                )}
                
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowUserDropdown(false)
                    navigate('/profil')
                  }}
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Profil
                </button>
                
                {/* Theme Toggle */}
                <div className="w-full text-left px-4 py-2 flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                  <span className="flex-1">Tema</span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={theme === 'dark'}
                      onChange={toggleTheme}
                      className="sr-only"
                    />
                    <span className={`w-10 h-6 flex items-center rounded-full p-1 duration-300 ${
                      theme === 'dark' ? 'bg-primary-600' : 'bg-gray-200'
                    }`}>
                      <motion.span
                        animate={{
                          x: theme === 'dark' ? 16 : 0
                        }}
                        className="bg-white w-4 h-4 rounded-full shadow-md transform duration-300"
                      />
                    </span>
                  </label>
                </div>
                
                <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                
                <button 
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400 flex items-center gap-2"
                  onClick={handleLogout}
                >
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h4a2 2 0 012 2v1" />
                  </svg>
                  Log Out
                </button>
                
                {/* Tahun Ajaran (Mobile Only) - Di dalam menu profil untuk mobile */}
                <div className="sm:hidden w-full flex flex-col items-center mt-4 mb-2 px-4">
                  {/* Tahun Ajaran Hijriyah Selector */}
                  <div className="font-bold text-xs text-center mb-2 w-full">
                    <label htmlFor="tahunAjaranSelectMobile" className="mr-1 text-gray-700 dark:text-gray-300">
                      Tahun Ajaran:
                    </label>
                    <select
                      id="tahunAjaranSelectMobile"
                      value={tahunAjaran}
                      onChange={(e) => setTahunAjaran(e.target.value)}
                      className="font-bold text-xs border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-2 py-1 mt-1 w-full"
                    >
                      {options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Tahun Ajaran Masehi Selector */}
                  <div className="font-bold text-xs text-center mb-2 w-full">
                    <label htmlFor="tahunAjaranMasehiSelectMobile" className="mr-1 text-gray-700 dark:text-gray-300">
                      Tahun Ajaran Masehi:
                    </label>
                    <select
                      id="tahunAjaranMasehiSelectMobile"
                      value={tahunAjaranMasehi}
                      onChange={(e) => setTahunAjaranMasehi(e.target.value)}
                      className="font-bold text-xs border dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded px-2 py-1 mt-1 w-full"
                    >
                      {optionsMasehi.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Versi & Tanggal Box - Tampil di PC dan Mobile */}
                <div className="w-full flex flex-col items-center mt-4 mb-2 px-4">
                  <div 
                    className="flex flex-row items-center justify-between bg-white dark:bg-gray-700 rounded-xl px-4 py-3 border dark:border-gray-600 border-gray-200 shadow-md gap-4 transition hover:shadow-lg w-full cursor-pointer"
                    onClick={updateTanggal}
                    title="Klik untuk refresh tanggal"
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7a1 1 0 011-1h8a1 1 0 011 1v8a1 1 0 01-1 1H8a1 1 0 01-1-1V7z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7l10 10" />
                        </svg>
                        Versi
                      </span>
                      <span className="font-mono text-base text-gray-800 dark:text-gray-200">{APP_VERSION}</span>
                    </div>
                    <div className="flex flex-col items-center border-l dark:border-gray-600 border-gray-200 pl-4">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{tanggalMasehi}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
                        </svg>
                        <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{tanggalHijriyah}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </header>
  )
}

export default Header
