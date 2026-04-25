import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { useWhatsAppTemplate } from '../../contexts/WhatsAppTemplateContext'
import { useChatOffcanvas } from '../../contexts/ChatOffcanvasContext'
import { useChatAiOffcanvas } from '../../contexts/ChatAiOffcanvasContext'
import { useThemeStore } from '../../store/themeStore'
import { useTahunAjaranStore } from '../../store/tahunAjaranStore'
import { profilAPI, authAPI, pendaftaranAPI, kalenderAPI, getAppEnv, deepseekAPI } from '../../services/api'
import { CHAT_AI_USAGE_HEADER_EVENT } from '../../utils/chatAiHeaderUsage'
import { getTanggalFromAPI, getBootPenanggalanPair, persistPenanggalanHariIni } from '../../utils/hijriDate'
import { getMasehiKeyHariIni, idbGetToday, readTodayPenanggalanSync } from '../../services/hijriPenanggalanStorage'
import { APP_VERSION } from '../../config/version'
import { STATIC_FALLBACK_MENU_CATALOG_ROWS } from '../../config/menuConfig'
import { HEADER_SPECIAL_SUMMARY_GROUPS } from '../../config/headerSummaryConfig'
import { userHasSuperAdminAccess } from '../../utils/roleAccess'
import { BERANDA_WIDGET_CODES } from '../../config/berandaFiturCodes'
import {
  catalogMenusToNavFlat,
  filterCatalogMenuByUserCodes,
  getHeaderGroupsFromMenuFlat,
  labelForPathFromMenuCatalog,
  matchHeaderRoute
} from '../../utils/menuCatalogNav'
import HeaderAntreanMenuItem from './HeaderAntreanMenuItem'

function Header() {
  const AKTIVITAS_CACHE_KEY_PREFIX = 'headerAktivitasTerakhir_'
  const AKTIVITAS_REFRESH_INTERVAL_MS = 30000
  const appEnv = getAppEnv()
  const isStaging = appEnv === 'staging'
  const { user, logout } = useAuthStore()
  const fiturMenuCatalog = useAuthStore((s) => s.fiturMenuCatalog)
  const fiturMenuCodes = useAuthStore((s) => s.fiturMenuCodes)
  const fiturMenuFetchStatus = useAuthStore((s) => s.fiturMenuFetchStatus)
  const fiturMenuCatalogFetchStatus = useAuthStore((s) => s.fiturMenuCatalogFetchStatus)

  const headerGroups = useMemo(() => {
    const staticFlat = catalogMenusToNavFlat(STATIC_FALLBACK_MENU_CATALOG_ROWS)
    const dataReady =
      fiturMenuFetchStatus === 'ok' &&
      fiturMenuCatalogFetchStatus === 'ok' &&
      Array.isArray(fiturMenuCatalog) &&
      fiturMenuCatalog.length > 0
    if (dataReady) {
      const filtered = filterCatalogMenuByUserCodes(
        fiturMenuCatalog,
        fiturMenuCodes,
        userHasSuperAdminAccess(user)
      )
      const flat = catalogMenusToNavFlat(filtered)
      if (flat.length > 0) {
        return getHeaderGroupsFromMenuFlat(flat)
      }
    }
    return getHeaderGroupsFromMenuFlat(staticFlat)
  }, [
    fiturMenuCatalog,
    fiturMenuCodes,
    fiturMenuFetchStatus,
    fiturMenuCatalogFetchStatus,
    user
  ])
  const { theme, toggleTheme } = useThemeStore()
  const { tahunAjaran, setTahunAjaran, options, tahunAjaranMasehi, setTahunAjaranMasehi, optionsMasehi } = useTahunAjaranStore()
  const navigate = useNavigate()
  const location = useLocation()
  const isChatAiRoute = (location.pathname || '').startsWith('/chat-ai')
  const { open: openTemplateOffcanvas } = useWhatsAppTemplate()
  const { open: openChatOffcanvas, close: closeChatOffcanvas, chatTotalUnread, refreshChatUnreadFromApi } =
    useChatOffcanvas()
  const { open: openChatAiOffcanvas, close: closeChatAiOffcanvas } = useChatAiOffcanvas()
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [showSaldoDropdown, setShowSaldoDropdown] = useState(false)
  const [showAktivitasDropdown, setShowAktivitasDropdown] = useState(false)
  const [tanggalMasehi, setTanggalMasehi] = useState(() => getBootPenanggalanPair().masehi)
  const [tanggalHijriyah, setTanggalHijriyah] = useState(() => getBootPenanggalanPair().hijriyah)
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
  const [aktivitasTerakhir, setAktivitasTerakhir] = useState([])
  const [aktivitasTextVersion, setAktivitasTextVersion] = useState(0)
  const [chatAiHeaderUsage, setChatAiHeaderUsage] = useState({ today: 0, limit: 5 })
  const [openTADropdown, setOpenTADropdown] = useState(null) // 'hijriyah' | 'masehi' | null
  const [todayKalender, setTodayKalender] = useState(() => {
    const s = readTodayPenanggalanSync()
    const iso = typeof window !== 'undefined' ? getMasehiKeyHariIni() : ''
    if (s && iso && String(s.masehi).slice(0, 10) === iso && s.hijriyah) {
      return { masehi: s.masehi.slice(0, 10), hijriyah: s.hijriyah }
    }
    return null
  })
  const [loadingTodayKalender, setLoadingTodayKalender] = useState(() => !readTodayPenanggalanSync()?.hijriyah)
  const [headerPhotoUrl, setHeaderPhotoUrl] = useState(null)
  const [headerUserDetail, setHeaderUserDetail] = useState(null) // nip dll dari GET /user/:id
  const headerPhotoRef = useRef(null)

  const paymentRef = useRef(null)
  const aktivitasRef = useRef(null)
  const userRef = useRef(null)
  const saldoRef = useRef(null)
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

  const CHAT_UNREAD_POLL_MS = 45000
  useEffect(() => {
    if (!user?.id) return
    refreshChatUnreadFromApi()
    const t = setInterval(() => {
      refreshChatUnreadFromApi()
    }, CHAT_UNREAD_POLL_MS)
    return () => clearInterval(t)
  }, [user?.id, refreshChatUnreadFromApi])

  useEffect(() => {
    if (!showUserDropdown || !user?.id) return
    refreshChatUnreadFromApi()
  }, [showUserDropdown, user?.id, refreshChatUnreadFromApi])

  const matchedNavState = useMemo(
    () => matchHeaderRoute(location.pathname, headerGroups),
    [location.pathname, headerGroups]
  )

  const menuCatalogForPathLabel = useMemo(() => {
    const dataReady =
      fiturMenuFetchStatus === 'ok' &&
      fiturMenuCatalogFetchStatus === 'ok' &&
      Array.isArray(fiturMenuCatalog) &&
      fiturMenuCatalog.length > 0
    if (dataReady) {
      const filtered = filterCatalogMenuByUserCodes(
        fiturMenuCatalog,
        fiturMenuCodes,
        userHasSuperAdminAccess(user)
      )
      if (filtered.length > 0) return filtered
    }
    return STATIC_FALLBACK_MENU_CATALOG_ROWS
  }, [
    fiturMenuCatalog,
    fiturMenuCodes,
    fiturMenuFetchStatus,
    fiturMenuCatalogFetchStatus,
    user
  ])

  const catalogPathLabel = useMemo(
    () => labelForPathFromMenuCatalog(menuCatalogForPathLabel, location.pathname),
    [menuCatalogForPathLabel, location.pathname]
  )

  const pageTitle = useMemo(() => {
    if (matchedNavState?.label) return matchedNavState.label
    if (catalogPathLabel) return catalogPathLabel
    const path = location.pathname || '/'
    if (path === '/' || path === '/dashboard') return 'Dashboard'
    const parts = path.split('/').filter(Boolean)
    if (parts.length === 0) return 'Dashboard'
    const last = parts[parts.length - 1]
    return last
      .split('-')
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
      .filter(Boolean)
      .join(' ')
  }, [matchedNavState?.label, catalogPathLabel, location.pathname])

  // Fallback saat route belum/tdk termuat di katalog header, agar grup utama tetap konsisten.
  const fallbackGroupByPath = useMemo(() => {
    const path = location.pathname || ''
    if (path.startsWith('/pendaftaran')) return 'Pendaftaran'
    if (
      path.startsWith('/uwaba') ||
      path.startsWith('/tunggakan') ||
      path.startsWith('/khusus') ||
      path.startsWith('/laporan') ||
      path === '/' ||
      path === '/dashboard' ||
      path.startsWith('/dashboard-pembayaran')
    ) {
      return 'UWABA'
    }
    return null
  }, [location.pathname])

  // Cek grup aktif dari headerGroups (katalog DB + kode user)
  const activeGroupRaw = matchedNavState?.group || fallbackGroupByPath
  const [activeGroup, setActiveGroup] = useState(activeGroupRaw)
  useEffect(() => {
    if (activeGroupRaw) setActiveGroup(activeGroupRaw)
  }, [activeGroupRaw])
  const isKeuanganGroup = activeGroup === 'Keuangan'
  const isPendaftaranGroup = activeGroup === 'Pendaftaran'
  const isKalenderGroup = activeGroup === 'Kalender'
  const PAYMENT_HEADER_GROUPS = new Set(HEADER_SPECIAL_SUMMARY_GROUPS.pembayaran || [])
  const isConfiguredPaymentGroup = PAYMENT_HEADER_GROUPS.has(activeGroup || '')
  const showAktivitasAsDefault =
    !isKeuanganGroup &&
    !isKalenderGroup &&
    !isPendaftaranGroup &&
    !isConfiguredPaymentGroup

  // Format tanggal Y-m-d -> dd-mm-yyyy untuk header Kalender
  const formatDateDMY = (ymd) => {
    if (!ymd || String(ymd).length < 10) return ymd || ''
    const s = String(ymd).slice(0, 10)
    const [y, m, d] = s.split('-')
    return d && m && y ? `${d}-${m}-${y}` : s
  }

  // Update document title when route changes
  useEffect(() => {
    document.title = `${pageTitle} - Sistem Pembayaran`
  }, [pageTitle])

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

  const paymentSummaryData = useMemo(() => {
    const pendaftaranAdmin = pendapatanPendaftaranAdminHariIni || 0
    const pendaftaranAllAdmin = pendapatanPendaftaranHariIni || 0
    return {
      total: (paymentData.total || 0) + pendaftaranAdmin,
      totalKeseluruhan: (paymentData.totalKeseluruhan || 0) + pendaftaranAllAdmin,
      rincian: {
        ...(paymentData.rincian || {}),
        pendaftaran: pendaftaranAdmin,
        total: (paymentData.rincian?.total || 0) + pendaftaranAdmin
      },
      rincianVia: {
        ...(paymentData.rincianVia || {}),
        pendaftaran: pendapatanPendaftaranRincian?.rincian_via_admin || {}
      },
      keseluruhan: {
        ...(paymentData.keseluruhan || {}),
        pendaftaran: pendaftaranAllAdmin,
        total: (paymentData.keseluruhan?.total || 0) + pendaftaranAllAdmin
      }
    }
  }, [
    paymentData,
    pendapatanPendaftaranAdminHariIni,
    pendapatanPendaftaranHariIni,
    pendapatanPendaftaranRincian
  ])

  const renderPaymentDropdownContent = () => (
    <div className="px-4 pb-3 border-b dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Rincian Pembayaran Hari Ini</h3>
      <div className="mb-4">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{user?.nama || 'Admin'}</div>
        <div className="space-y-1.5">
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-400">Uwaba:</span>
              <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentSummaryData.rincian.uwaba)}</span>
            </div>
            {renderViaBreakdown(paymentSummaryData.rincianVia.uwaba, 'uwaba')}
          </div>
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-400">Tunggakan:</span>
              <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentSummaryData.rincian.tunggakan)}</span>
            </div>
            {renderViaBreakdown(paymentSummaryData.rincianVia.tunggakan, 'tunggakan')}
          </div>
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-400">Khusus:</span>
              <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentSummaryData.rincian.khusus)}</span>
            </div>
            {renderViaBreakdown(paymentSummaryData.rincianVia.khusus, 'khusus')}
          </div>
          <div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-600 dark:text-gray-400">Pendaftaran:</span>
              <span className="text-base font-bold text-gray-800 dark:text-gray-200">{formatCurrency(paymentSummaryData.rincian.pendaftaran)}</span>
            </div>
            {renderViaBreakdown(paymentSummaryData.rincianVia.pendaftaran, 'pendaftaran')}
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Total:</span>
            <span className="text-base font-bold text-primary-600 dark:text-primary-400">{formatCurrency(paymentSummaryData.rincian.total)}</span>
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Semua Admin</div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600 dark:text-gray-400">Uwaba:</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentSummaryData.keseluruhan.uwaba)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600 dark:text-gray-400">Tunggakan:</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentSummaryData.keseluruhan.tunggakan)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600 dark:text-gray-400">Khusus:</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentSummaryData.keseluruhan.khusus)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-600 dark:text-gray-400">Pendaftaran:</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatCurrency(paymentSummaryData.keseluruhan.pendaftaran)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Total:</span>
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400">{formatCurrency(paymentSummaryData.keseluruhan.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )

  const aktivitasPreviewText = useMemo(() => {
    if (!aktivitasTerakhir[0]) return 'Belum ada aktivitas'
    const first = aktivitasTerakhir[0]
    return `${first.action || 'Aktivitas'} · ${first.entity_type || '-'}`
  }, [aktivitasTerakhir])

  // Update tanggal dari API (cache lokal/IndexedDB diisi di getTanggalFromAPI)
  const updateTanggal = async () => {
    try {
      const { masehi, hijriyah } = await getTanggalFromAPI()
      setTanggalMasehi((prev) => (masehi ? masehi.slice(0, 10) : prev))
      setTanggalHijriyah((prev) => {
        if (hijriyah && hijriyah !== '-') return hijriyah.slice(0, 10)
        return prev
      })
    } catch (error) {
      console.error('Error updating tanggal:', error)
    }
  }

  // Update tanggal on mount and every minute; isi dari IndexedDB jika mirror belum ada
  useEffect(() => {
    let cancelled = false
    const iso = getMasehiKeyHariIni()
    if (!readTodayPenanggalanSync()?.hijriyah) {
      ;(async () => {
        const row = await idbGetToday(iso)
        const p = row?.payload
        if (cancelled || !p || Array.isArray(p) || !p.hijriyah || p.hijriyah === '0000-00-00') return
        persistPenanggalanHariIni(p)
        setTanggalMasehi((prev) => p.masehi?.slice(0, 10) || prev)
        setTanggalHijriyah((prev) => prev || p.hijriyah.slice(0, 10))
      })()
    }
    updateTanggal()
    const interval = setInterval(updateTanggal, 60000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Load hari ini (Masehi + Hijriyah) untuk header grup Kalender — cache dulu, lalu segarkan API
  useEffect(() => {
    if (!isKalenderGroup) {
      setTodayKalender(null)
      setLoadingTodayKalender(false)
      return
    }
    let cancelled = false
    const sync = readTodayPenanggalanSync()
    const tanggal = getMasehiKeyHariIni()
    if (sync && String(sync.masehi).slice(0, 10) === tanggal && sync.hijriyah) {
      setTodayKalender({ masehi: sync.masehi.slice(0, 10), hijriyah: sync.hijriyah })
      setLoadingTodayKalender(false)
    } else {
      setLoadingTodayKalender(true)
    }
    ;(async () => {
      const row = await idbGetToday(tanggal)
      const p = row?.payload
      if (cancelled || !p || Array.isArray(p)) return
      const h = p.hijriyah
      if (!h || h === '0000-00-00') return
      setTodayKalender((prev) => (prev?.hijriyah ? prev : { masehi: p.masehi || tanggal, hijriyah: h }))
      setLoadingTodayKalender(false)
      persistPenanggalanHariIni(p)
    })()
    const now = new Date()
    const waktu = now.toTimeString().slice(0, 8)
    kalenderAPI.get({ action: 'today', tanggal, waktu })
      .then((res) => {
        if (cancelled || !res || Array.isArray(res)) return
        if (res.hijriyah && res.hijriyah !== '0000-00-00') {
          persistPenanggalanHariIni(res)
          setTodayKalender({ masehi: res.masehi || tanggal, hijriyah: res.hijriyah })
        } else {
          setTodayKalender((prev) => prev || { masehi: res.masehi || tanggal, hijriyah: null })
        }
      })
      .catch(() => {
        if (!cancelled) setTodayKalender((prev) => prev)
      })
      .finally(() => {
        if (!cancelled) setLoadingTodayKalender(false)
      })
    return () => { cancelled = true }
  }, [location.pathname, isKalenderGroup])

  // Load payment data — selaras widget Beranda: aksi action.beranda.widget.pembayaran_hari_ini di matriks fitur
  const canAccessTotalPembayaran = useMemo(() => {
    if (userHasSuperAdminAccess(user)) return true
    const codes = Array.isArray(fiturMenuCodes) ? fiturMenuCodes : []
    return codes.includes(BERANDA_WIDGET_CODES.pembayaranHariIni)
  }, [user, fiturMenuCodes])

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
    if (!isKeuanganGroup) return

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
  }, [isKeuanganGroup, tahunAjaran])

  // Load pendapatan hari ini dari transaksi pendaftaran untuk grup Pendaftaran
  useEffect(() => {
    if (!isPendaftaranGroup && !isConfiguredPaymentGroup) return

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
  }, [isPendaftaranGroup, isConfiguredPaymentGroup, tahunAjaran, tahunAjaranMasehi])

  const aktivitasCacheKey = useMemo(
    () => (user?.id ? `${AKTIVITAS_CACHE_KEY_PREFIX}${user.id}` : null),
    [user?.id]
  )

  useEffect(() => {
    if (!aktivitasCacheKey) {
      setAktivitasTerakhir([])
      return
    }
    try {
      const raw = localStorage.getItem(aktivitasCacheKey)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) setAktivitasTerakhir(parsed)
    } catch {
      // ignore parse/cache error
    }
  }, [aktivitasCacheKey])

  const refreshAktivitasBackground = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await profilAPI.getAktivitas({ limit: 5 })
      if (!(res?.success && Array.isArray(res.data))) return
      const next = res.data
      const nextSignature = JSON.stringify(next)
      const prevSignature = JSON.stringify(aktivitasTerakhir)
      if (nextSignature === prevSignature) return
      setAktivitasTerakhir(next)
      setAktivitasTextVersion((v) => v + 1)
      if (aktivitasCacheKey) {
        try {
          localStorage.setItem(aktivitasCacheKey, JSON.stringify(next))
        } catch {
          // ignore write cache error
        }
      }
    } catch {
      // keep last cached value
    }
  }, [user?.id, aktivitasTerakhir, aktivitasCacheKey])

  useEffect(() => {
    if (!user?.id) return
    refreshAktivitasBackground()
    const interval = setInterval(refreshAktivitasBackground, AKTIVITAS_REFRESH_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshAktivitasBackground()
    }
    window.addEventListener('focus', refreshAktivitasBackground)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', refreshAktivitasBackground)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user?.id, refreshAktivitasBackground])

  const refreshChatAiHeaderUsage = useCallback(async () => {
    if (!user?.id) return
    try {
      const res = await deepseekAPI.getAccount()
      if (!res?.success || !res?.data) return
      setChatAiHeaderUsage({
        today: Math.max(0, Number(res.data.ai_today_count ?? 0)),
        limit: Math.max(0, Number(res.data.ai_daily_limit ?? 5))
      })
    } catch {
      /* noop */
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || !isChatAiRoute) return
    refreshChatAiHeaderUsage()
    const onDetail = (e) => {
      const d = e?.detail
      if (!d) return
      setChatAiHeaderUsage({
        today: Math.max(0, Number(d.aiTodayCount) || 0),
        limit: Math.max(0, Number(d.aiDailyLimit) || 0)
      })
    }
    window.addEventListener(CHAT_AI_USAGE_HEADER_EVENT, onDetail)
    const interval = setInterval(refreshChatAiHeaderUsage, AKTIVITAS_REFRESH_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshChatAiHeaderUsage()
    }
    window.addEventListener('focus', refreshChatAiHeaderUsage)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener(CHAT_AI_USAGE_HEADER_EVENT, onDetail)
      clearInterval(interval)
      window.removeEventListener('focus', refreshChatAiHeaderUsage)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [user?.id, isChatAiRoute, refreshChatAiHeaderUsage])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (paymentRef.current && !paymentRef.current.contains(event.target)) {
        setShowPaymentDropdown(false)
      }
      if (aktivitasRef.current && !aktivitasRef.current.contains(event.target)) {
        setShowAktivitasDropdown(false)
      }
      if (userRef.current && !userRef.current.contains(event.target)) {
        setShowUserDropdown(false)
      }
      if (saldoRef.current && !saldoRef.current.contains(event.target)) {
        setShowSaldoDropdown(false)
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
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={pageTitle}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-xl md:text-2xl font-bold"
          >
            {pageTitle}
          </motion.h1>
        </AnimatePresence>
        {/* Subtitle grup Kalender: Hari ini dd-mm-yyyy M / dd-mm-yyyy H */}
        {isKalenderGroup && !loadingTodayKalender && todayKalender && (
          <p className="text-sm text-white/90 mt-0.5">
            Hari ini{' '}
            <motion.span
              key={`${todayKalender.masehi}-${todayKalender.hijriyah || ''}`}
              initial={{ opacity: 0.45, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="inline"
            >
              {formatDateDMY(todayKalender.masehi)} M
              {todayKalender.hijriyah && (
                <span className="ml-1.5 font-medium">{formatDateDMY(todayKalender.hijriyah)} H</span>
              )}
            </motion.span>
          </p>
        )}

        {/* Mobile: Keuangan = saldo, Pendaftaran = pendapatan hari ini (transaksi pendaftaran), lain = pembayaran */}
        {isKeuanganGroup ? (
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
        ) : showAktivitasAsDefault ? (
          isChatAiRoute ? (
            <div className="md:hidden flex items-center gap-2 mt-2">
              <svg className="w-4 h-4 text-white/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-xs font-bold text-white tabular-nums">
                  {chatAiHeaderUsage.today}/{chatAiHeaderUsage.limit}
                </span>
                <span className="text-xs text-white/70">Penggunaan AI hari ini</span>
              </div>
            </div>
          ) : (
            <div className="md:hidden relative mt-2" ref={aktivitasRef}>
              <button
                type="button"
                className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg py-0.5 text-left transition-colors active:bg-white/15"
                onClick={() => setShowAktivitasDropdown(!showAktivitasDropdown)}
                aria-expanded={showAktivitasDropdown}
                aria-haspopup="menu"
              >
                <svg className="w-4 h-4 text-white/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={`${aktivitasTextVersion}-${aktivitasPreviewText}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.22 }}
                      className="truncate text-xs font-semibold text-white"
                    >
                      {aktivitasPreviewText}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </button>
              <AnimatePresence>
                {showAktivitasDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute left-0 top-full z-[60] mt-2 w-72 rounded-lg border border-gray-200 bg-white py-3 text-gray-700 shadow-xl dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  >
                    <div className="px-4">
                      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Aktivitas User Terakhir</h3>
                      {aktivitasTerakhir.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada aktivitas tercatat.</p>
                      ) : (
                        <div className="space-y-2">
                          {aktivitasTerakhir.map((a) => (
                            <div key={a.id} className="border-b border-gray-100 py-1.5 last:border-b-0 dark:border-gray-700">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                <span className="capitalize">{a.action}</span> · {a.entity_type}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {a.created_at ? new Date(a.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        ) : (
          <div 
            className="md:hidden flex items-center gap-2 mt-2 cursor-pointer hover:opacity-80 transition-opacity relative"
            onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
          >
            <svg className="w-4 h-4 text-white/80 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white">{formatCurrency(paymentSummaryData.total)}</span>
              <span className="text-xs text-white/60">•</span>
              <span className="text-xs text-white/70">Total: {formatCurrency(paymentSummaryData.totalKeseluruhan)}</span>
            </div>
          </div>
        )}

        {/* Mobile Payment Dropdown - tidak ditampilkan di grup Kalender */}
        <AnimatePresence>
          {showPaymentDropdown && !isKalenderGroup && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="md:hidden absolute left-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
            >
              {renderPaymentDropdownContent()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right Section - Desktop: Keuangan = saldo, Pendaftaran = pendapatan hari ini, lain = pembayaran */}
      <div className="relative flex items-center gap-3 flex-shrink-0" ref={paymentRef}>
        {isKeuanganGroup ? (
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
        ) : showAktivitasAsDefault ? (
          isChatAiRoute ? (
            <div className="hidden md:flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
              <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-white tabular-nums">
                  {chatAiHeaderUsage.today}/{chatAiHeaderUsage.limit}
                </span>
                <span className="text-xs text-white/70">Penggunaan AI hari ini</span>
              </div>
            </div>
          ) : (
            <div className="hidden md:block relative" ref={aktivitasRef}>
              <div
                className="hidden md:flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30 cursor-pointer hover:bg-white/30 transition-colors"
                onClick={() => setShowAktivitasDropdown(!showAktivitasDropdown)}
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex flex-col min-w-0">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={`${aktivitasTextVersion}-${aktivitasPreviewText}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.22 }}
                      className="text-sm font-bold text-white truncate"
                    >
                      {aktivitasPreviewText}
                    </motion.span>
                  </AnimatePresence>
                  <span className="text-xs text-white/70">Aktivitas User Terakhir</span>
                </div>
              </div>
              <AnimatePresence>
                {showAktivitasDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full z-[60] mt-2 hidden w-72 rounded-lg border border-gray-200 bg-white py-3 text-gray-700 shadow-xl dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 md:block"
                  >
                    <div className="px-4">
                      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Aktivitas User Terakhir</h3>
                      {aktivitasTerakhir.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">Belum ada aktivitas tercatat.</p>
                      ) : (
                        <div className="space-y-2">
                          {aktivitasTerakhir.map((a) => (
                            <div key={a.id} className="border-b border-gray-100 py-1.5 last:border-b-0 dark:border-gray-700">
                              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                <span className="capitalize">{a.action}</span> · {a.entity_type}
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                {a.created_at ? new Date(a.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        ) : (
          <div 
            className="hidden md:flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30 cursor-pointer hover:bg-white/30 transition-colors"
            onClick={() => setShowPaymentDropdown(!showPaymentDropdown)}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex flex-col">
              <span className="text-sm font-bold text-white">{formatCurrency(paymentSummaryData.total)}</span>
              <span className="text-xs text-white/70">Total: {formatCurrency(paymentSummaryData.totalKeseluruhan)}</span>
            </div>
          </div>
        )}

        {/* Desktop Payment Dropdown - tidak ditampilkan di grup Kalender */}
        <AnimatePresence>
          {showPaymentDropdown && !isKalenderGroup && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="hidden md:block absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border dark:border-gray-700 py-3 text-gray-700 dark:text-gray-200 z-50"
            >
              {renderPaymentDropdownContent()}
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
            type="button"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="relative w-11 h-11 rounded-full bg-teal-500/10 dark:bg-teal-400/10 flex items-center justify-center cursor-pointer shadow-lg border-2 border-gray-200 dark:border-gray-600 hover:border-teal-400 transition-colors overflow-visible shrink-0"
          >
            <span className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center">
              {headerPhotoUrl ? (
                <img src={headerPhotoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-teal-600 dark:text-teal-400">
                  {(user?.nama || user?.username || '?').toString().charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            {chatTotalUnread > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 z-10 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold tabular-nums pointer-events-none"
                aria-label={`${chatTotalUnread} pesan belum dibaca`}
              >
                {chatTotalUnread > 99 ? '99+' : chatTotalUnread}
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
                  type="button"
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 justify-between"
                  onClick={() => {
                    setShowUserDropdown(false)
                    closeChatAiOffcanvas()
                    openChatOffcanvas()
                  }}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <svg className="w-5 h-5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-4 4v-4z" />
                    </svg>
                    Chat
                  </span>
                  {chatTotalUnread > 0 && (
                    <span className="shrink-0 tabular-nums text-[11px] font-bold text-red-600 dark:text-red-400">
                      {chatTotalUnread > 99 ? '99+' : chatTotalUnread}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  onClick={() => {
                    setShowUserDropdown(false)
                    closeChatOffcanvas()
                    openChatAiOffcanvas()
                  }}
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 3a6.75 6.75 0 016.502 8.565A6.75 6.75 0 119.75 3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.5 14.5L21 21" />
                  </svg>
                  eBeddien
                </button>
                
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

                <HeaderAntreanMenuItem onOpenPanel={() => setShowUserDropdown(false)} />
                
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
                        <motion.span
                          key={tanggalMasehi || 'm'}
                          initial={{ opacity: 0.45, y: -3 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="font-mono text-xs text-gray-800 dark:text-gray-200"
                        >
                          {tanggalMasehi || '\u00A0'}
                        </motion.span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12.79A9 9 0 1111.21 3a7 7 0 109.79 9.79z" />
                        </svg>
                        <motion.span
                          key={tanggalHijriyah || 'h'}
                          initial={{ opacity: 0.45, y: -3 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="font-mono text-xs text-gray-800 dark:text-gray-200"
                        >
                          {tanggalHijriyah || '\u00A0'}
                        </motion.span>
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
