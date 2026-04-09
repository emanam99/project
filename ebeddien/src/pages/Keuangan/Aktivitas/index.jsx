import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { aktivitasAPI, pemasukanAPI, pengeluaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { usePengeluaranFiturAccess } from '../../../hooks/usePengeluaranFiturAccess'
import DetailOffcanvas from '../../../components/DetailOffcanvas/DetailOffcanvas'
import PrintLaporanAktivitasOffcanvas from './components/PrintLaporanAktivitasOffcanvas'

function Aktivitas() {
  const { showNotification } = useNotification()
  const pengeluaranFitur = usePengeluaranFiturAccess()
  const [loading, setLoading] = useState(false)
  const [aktivitas, setAktivitas] = useState([])
  const [saldo, setSaldo] = useState({
    saldo_awal: 0,
    pemasukan: 0,
    pengeluaran: 0,
    sisa_saldo: 0
  })
  const [activeTab, setActiveTab] = useState('hijriyah') // 'masehi' atau 'hijriyah'
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1)
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentHijriyahMonth, setCurrentHijriyahMonth] = useState(1)
  const [currentHijriyahYear, setCurrentHijriyahYear] = useState(1447)
  const [availableMonths, setAvailableMonths] = useState([])
  const [availableHijriyahMonths, setAvailableHijriyahMonths] = useState([])
  const monthScrollRef = useRef(null)
  const activeMonthRef = useRef(null)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [tanggalDari, setTanggalDari] = useState('')
  const [tanggalSampai, setTanggalSampai] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [allAktivitas, setAllAktivitas] = useState([]) // Semua data dari server
  const [filteredAktivitas, setFilteredAktivitas] = useState([]) // Hasil filter

  // Detail offcanvas state
  const [showDetailOffcanvas, setShowDetailOffcanvas] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Print laporan bulanan offcanvas
  const [showPrintLaporanOffcanvas, setShowPrintLaporanOffcanvas] = useState(false)

  useEffect(() => {
    if (activeTab === 'masehi') {
      loadAvailableMonths()
    } else {
      loadAvailableHijriyahMonths()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === 'masehi') {
      loadAktivitas()
    } else {
      loadAktivitasHijriyah()
    }
  }, [activeTab, currentMonth, currentYear, currentHijriyahMonth, currentHijriyahYear])

  // Auto scroll to active month
  useEffect(() => {
    const months = activeTab === 'masehi' ? availableMonths : availableHijriyahMonths
    if (months.length > 0) {
      // Use requestAnimationFrame and setTimeout to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (activeMonthRef.current && monthScrollRef.current) {
            const scrollContainer = monthScrollRef.current
            const activeButton = activeMonthRef.current

            // Calculate scroll position to center the active button
            const containerWidth = scrollContainer.offsetWidth
            const buttonLeft = activeButton.offsetLeft
            const buttonWidth = activeButton.offsetWidth
            const scrollPosition = buttonLeft - (containerWidth / 2) + (buttonWidth / 2)

            scrollContainer.scrollTo({
              left: Math.max(0, scrollPosition),
              behavior: 'smooth'
            })
          }
        }, 150)
      })
    }
  }, [activeTab, availableMonths, availableHijriyahMonths, currentMonth, currentYear, currentHijriyahMonth, currentHijriyahYear])

  const loadAvailableMonths = async () => {
    try {
      const response = await aktivitasAPI.getAvailableMonths()
      if (response.success) {
        setAvailableMonths(response.data || [])
      }
    } catch (err) {
      console.error('Error loading available months:', err)
    }
  }

  const loadAvailableHijriyahMonths = async () => {
    try {
      const response = await aktivitasAPI.getAvailableHijriyahMonths()
      if (response.success) {
        setAvailableHijriyahMonths(response.data || [])
        // Set bulan dan tahun hijriyah pertama jika belum ada
        if (response.data && response.data.length > 0) {
          const firstMonth = response.data[response.data.length - 1] // Ambil yang terakhir (terbaru)
          setCurrentHijriyahMonth(parseInt(firstMonth.bulan))
          setCurrentHijriyahYear(parseInt(firstMonth.tahun))
        }
      }
    } catch (err) {
      console.error('Error loading available hijriyah months:', err)
    }
  }

  const loadAktivitas = async () => {
    try {
      setLoading(true)
      const response = await aktivitasAPI.getAktivitasList(currentMonth, currentYear)
      if (response.success) {
        const aktivitasData = response.data.aktivitas || []
        setAllAktivitas(aktivitasData)
        setAktivitas(aktivitasData)
        setSaldo(response.data.saldo || {
          saldo_awal: 0,
          pemasukan: 0,
          pengeluaran: 0,
          sisa_saldo: 0
        })
      } else {
        showNotification(response.message || 'Gagal memuat daftar aktivitas', 'error')
      }
    } catch (err) {
      console.error('Error loading aktivitas:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar aktivitas', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadAktivitasHijriyah = async () => {
    try {
      setLoading(true)
      const response = await aktivitasAPI.getAktivitasListHijriyah(currentHijriyahMonth, currentHijriyahYear)
      if (response.success) {
        const aktivitasData = response.data.aktivitas || []
        setAllAktivitas(aktivitasData)
        setAktivitas(aktivitasData)
        setSaldo(response.data.saldo || {
          saldo_awal: 0,
          pemasukan: 0,
          pengeluaran: 0,
          sisa_saldo: 0
        })
      } else {
        showNotification(response.message || 'Gagal memuat daftar aktivitas hijriyah', 'error')
      }
    } catch (err) {
      console.error('Error loading aktivitas hijriyah:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar aktivitas hijriyah', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Apply filters (client-side filtering)
  useEffect(() => {
    if (allAktivitas.length === 0) {
      setFilteredAktivitas([])
      setAktivitas([])
      return
    }

    let filtered = [...allAktivitas]

    // Filter berdasarkan search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(item =>
        (item.keterangan && item.keterangan.toLowerCase().includes(query)) ||
        (item.admin_nama && item.admin_nama.toLowerCase().includes(query)) ||
        (item.id && item.id.toString().includes(query)) ||
        (item.kategori && item.kategori.toLowerCase().includes(query)) ||
        (item.lembaga && item.lembaga && item.lembaga.toLowerCase().includes(query))
      )
    }

    // Filter berdasarkan tanggal dari
    if (tanggalDari) {
      filtered = filtered.filter(item => {
        const tanggalDibuat = new Date(item.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat >= tanggalDari
      })
    }

    // Filter berdasarkan tanggal sampai
    if (tanggalSampai) {
      filtered = filtered.filter(item => {
        const tanggalDibuat = new Date(item.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat <= tanggalSampai
      })
    }

    setFilteredAktivitas(filtered)
    setAktivitas(filtered)
  }, [searchQuery, tanggalDari, tanggalSampai, allAktivitas])

  const getMonthName = (month) => {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    return months[month - 1] || ''
  }

  const getHijriyahMonthName = (month) => {
    const months = [
      'Muharram', 'Shafar', 'Rabiul Awal', 'Rabiul Akhir',
      'Jumadil Ula', 'Jumadil Akhir', 'Rajab', 'Sya\'ban',
      'Ramadhan', 'Syawal', 'Dzul Qo\'dah', 'Dzul Hijjah'
    ]
    return months[month - 1] || ''
  }

  const getMonthYearString = (month, year) => {
    return `${getMonthName(month)} ${year}`
  }

  const getHijriyahMonthYearString = (month, year) => {
    return `${getHijriyahMonthName(month)} ${year}`
  }

  const selectMonth = (bulan, tahun) => {
    setCurrentMonth(bulan)
    setCurrentYear(tahun)
  }

  const isCurrentMonth = (bulan, tahun) => {
    return bulan === currentMonth && tahun === currentYear
  }

  const selectHijriyahMonth = (bulan, tahun) => {
    setCurrentHijriyahMonth(bulan)
    setCurrentHijriyahYear(tahun)
  }

  const isCurrentHijriyahMonth = (bulan, tahun) => {
    return bulan === currentHijriyahMonth && tahun === currentHijriyahYear
  }

  const navigateMonth = (direction) => {
    if (direction === 'prev') {
      if (currentMonth === 1) {
        setCurrentMonth(12)
        setCurrentYear(currentYear - 1)
      } else {
        setCurrentMonth(currentMonth - 1)
      }
    } else {
      if (currentMonth === 12) {
        setCurrentMonth(1)
        setCurrentYear(currentYear + 1)
      } else {
        setCurrentMonth(currentMonth + 1)
      }
    }
  }

  const getPrevMonthName = () => {
    let prevMonth = currentMonth - 1
    let prevYear = currentYear
    if (prevMonth === 0) {
      prevMonth = 12
      prevYear = currentYear - 1
    }
    return getMonthName(prevMonth)
  }

  const getNextMonthName = () => {
    let nextMonth = currentMonth + 1
    let nextYear = currentYear
    if (nextMonth === 13) {
      nextMonth = 1
      nextYear = currentYear + 1
    }
    return getMonthName(nextMonth)
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateShort = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatHijriyahDate = (hijriyahString) => {
    if (!hijriyahString) return '-'
    // Format hijriyah: 1447-12-23 atau 1447-12-23 10.10.11
    // Ambil 10 karakter pertama untuk tanggal, sisanya untuk jam jika ada
    const datePart = hijriyahString.substring(0, 10)
    const timePart = hijriyahString.length > 10 ? hijriyahString.substring(11) : null

    // Format tanggal: 1447-12-23 -> 23-12-1447
    const parts = datePart.split('-')
    if (parts.length === 3) {
      const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`
      if (timePart) {
        // Format jam: 10.10.11 -> 10:10:11
        const formattedTime = timePart.replace(/\./g, ':')
        return `${formattedDate} ${formattedTime}`
      }
      return formattedDate
    }
    return hijriyahString
  }

  const getTipeBadge = (tipe) => {
    if (tipe === 'pemasukan') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          Pemasukan
        </span>
      )
    } else {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 7V3" />
          </svg>
          Pengeluaran
        </span>
      )
    }
  }

  // Prevent body scroll when offcanvas is open
  useEffect(() => {
    if (showDetailOffcanvas) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showDetailOffcanvas])

  const handleItemClick = async (item) => {
    try {
      setLoadingDetail(true)
      setSelectedItem(item)
      setShowDetailOffcanvas(true)

      if (item.tipe === 'pemasukan') {
        const response = await pemasukanAPI.getDetail(item.id)
        if (response.success) {
          setDetailData(response.data)
        } else {
          showNotification(response.message || 'Gagal memuat detail pemasukan', 'error')
          setShowDetailOffcanvas(false)
        }
      } else if (item.tipe === 'pengeluaran') {
        const response = await pengeluaranAPI.getPengeluaranDetail(item.id)
        if (response.success) {
          setDetailData(response.data)
        } else {
          showNotification(response.message || 'Gagal memuat detail pengeluaran', 'error')
          setShowDetailOffcanvas(false)
        }
      }
    } catch (err) {
      console.error('Error loading detail:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail', 'error')
      setShowDetailOffcanvas(false)
    } finally {
      setLoadingDetail(false)
    }
  }

  const getKategoriBadge = (kategori) => {
    if (!kategori) return null

    const kategoriMap = {
      'UWABA': { label: 'UWABA', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
      'Tunggakan': { label: 'Tunggakan', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
      'Khusus': { label: 'Khusus', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
      'PSB': { label: 'PSB', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
      'Beasiswa': { label: 'Beasiswa', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
      'Lembaga': { label: 'Lembaga', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
      'Lainnya': { label: 'Lainnya', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
      'Cashback': { label: 'Cashback', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
      'Bisyaroh': { label: 'Bisyaroh', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
      'Acara': { label: 'Acara', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200' },
      'Pengadaan': { label: 'Pengadaan', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
      'Perbaikan': { label: 'Perbaikan', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
      'ATK': { label: 'ATK', color: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200' }
    }

    const kategoriInfo = kategoriMap[kategori] || { label: kategori, color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${kategoriInfo.color}`}>
        {kategoriInfo.label}
      </span>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0 p-4 md:p-6" style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 #f1f5f9'
      }}>
        <style>{`
          div::-webkit-scrollbar {
            width: 8px;
          }
          div::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          div::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
          .dark div::-webkit-scrollbar-track {
            background: #1f2937;
          }
          .dark div::-webkit-scrollbar-thumb {
            background: #4b5563;
          }
          .dark div::-webkit-scrollbar-thumb:hover {
            background: #6b7280;
          }
        `}</style>
        {/* Tabs */}
        <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex -mb-px justify-between">
              <button
                onClick={() => setActiveTab('masehi')}
                className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'masehi'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Masehi
              </button>
              <button
                onClick={() => setActiveTab('hijriyah')}
                className={`flex-1 px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center justify-center gap-2 ${activeTab === 'hijriyah'
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Hijriyah
              </button>
            </nav>
          </div>
          <div className="px-4 pt-2 pb-1 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPrintLaporanOffcanvas(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Laporan Bulanan
            </button>
          </div>
        </div>

        {/* Month Navigation and Filter */}
        <div className="mb-6 space-y-4">
          {/* Month Navigation - Horizontal Scroll */}
          <div>
            <div
              ref={monthScrollRef}
              className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="flex gap-2 min-w-max">
                {activeTab === 'masehi' ? (
                  availableMonths.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Memuat bulan...</div>
                  ) : (
                    availableMonths.map((monthData) => {
                      const bulan = parseInt(monthData.bulan)
                      const tahun = parseInt(monthData.tahun)
                      const isActive = isCurrentMonth(bulan, tahun)

                      return (
                        <button
                          key={`${tahun}-${bulan}`}
                          ref={isActive ? activeMonthRef : null}
                          onClick={() => selectMonth(bulan, tahun)}
                          className={`flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${isActive
                              ? 'bg-primary-600 text-white shadow-md'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                          {getMonthName(bulan)} {tahun}
                        </button>
                      )
                    })
                  )
                ) : (
                  availableHijriyahMonths.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400">Memuat bulan...</div>
                  ) : (
                    availableHijriyahMonths.map((monthData) => {
                      const bulan = parseInt(monthData.bulan)
                      const tahun = parseInt(monthData.tahun)
                      const isActive = isCurrentHijriyahMonth(bulan, tahun)

                      return (
                        <button
                          key={`hijriyah-${tahun}-${bulan}`}
                          ref={isActive ? activeMonthRef : null}
                          onClick={() => selectHijriyahMonth(bulan, tahun)}
                          className={`flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${isActive
                              ? 'bg-primary-600 text-white shadow-md'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                        >
                          {getHijriyahMonthName(bulan)} {tahun}
                        </button>
                      )
                    })
                  )
                )}
              </div>
            </div>
          </div>

          {/* Filter Accordion */}
          <div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              {/* Search Input dengan tombol di kanan */}
              <div className="relative pb-2 px-4 pt-3">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    placeholder="Cari keterangan, admin, atau ID..."
                  />
                  {/* Tombol Filter dan Refresh di kanan */}
                  <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
                    <button
                      onClick={() => setIsFilterOpen(!isFilterOpen)}
                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
                      title={isFilterOpen ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
                      </svg>
                      {isFilterOpen ? (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7"></path>
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        if (activeTab === 'masehi') {
                          loadAktivitas()
                        } else {
                          loadAktivitasHijriyah()
                        }
                      }}
                      className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-700 dark:hover:bg-blue-600 text-blue-700 dark:text-blue-300 p-1.5 rounded text-xs transition-colors pointer-events-auto"
                      title="Refresh"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Border bawah yang sampai ke kanan */}
                <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
              </div>

              {/* Filter Container dengan Accordion */}
              <AnimatePresence>
                {isFilterOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-b bg-gray-50 dark:bg-gray-700/50"
                  >
                    <div className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="date"
                          value={tanggalDari}
                          onChange={(e) => setTanggalDari(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          placeholder="Dari Tanggal"
                        />
                        <input
                          type="date"
                          value={tanggalSampai}
                          onChange={(e) => setTanggalSampai(e.target.value)}
                          className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                          placeholder="Sampai Tanggal"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Saldo Bulan Ini */}
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Saldo Awal - Kiri atas */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="text-[10px] sm:text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
              Saldo Awal Bulan
            </div>
            <div className="text-sm sm:text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(saldo.saldo_awal)}
            </div>
          </div>
          {/* Pemasukan - Kanan atas */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-[10px] sm:text-xs font-medium text-green-700 dark:text-green-300 mb-1">
              Pemasukan Bulan Ini
            </div>
            <div className="text-sm sm:text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(saldo.pemasukan)}
            </div>
          </div>
          {/* Pengeluaran - Kiri bawah */}
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <div className="text-[10px] sm:text-xs font-medium text-red-700 dark:text-red-300 mb-1">
              Pengeluaran Bulan Ini
            </div>
            <div className="text-sm sm:text-lg font-bold text-red-600 dark:text-red-400">
              {formatCurrency(saldo.pengeluaran)}
            </div>
          </div>
          {/* Sisa Saldo - Kanan bawah */}
          <div className={`rounded-lg p-4 border ${saldo.sisa_saldo >= 0
              ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800'
              : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
            }`}>
            <div className={`text-[10px] sm:text-xs font-medium ${saldo.sisa_saldo >= 0
                ? 'text-teal-700 dark:text-teal-300'
                : 'text-orange-700 dark:text-orange-300'
              } mb-1`}>
              Sisa Saldo
            </div>
            <div className={`text-sm sm:text-lg font-bold ${saldo.sisa_saldo >= 0
                ? 'text-teal-600 dark:text-teal-400'
                : 'text-orange-600 dark:text-orange-400'
              }`}>
              {formatCurrency(saldo.sisa_saldo)}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {/* Mobile Card Layout */}
            <div className="md:hidden space-y-3">
              {aktivitas.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
                  Tidak ada aktivitas
                </div>
              ) : (
                aktivitas.map((item, index) => (
                  <motion.div
                    key={`${item.tipe}-${item.id}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => handleItemClick(item)}
                    className={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border-l-4 ${item.tipe === 'pemasukan'
                        ? 'border-l-green-500'
                        : 'border-l-red-500'
                      } border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:shadow-md transition-shadow`}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <div className="flex-shrink-0 mt-0.5">
                        {item.tipe === 'pemasukan' ? (
                          <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7 7V3" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                          {item.keterangan || '-'}
                        </div>
                      </div>
                      <div className={`text-sm font-bold flex-shrink-0 ${item.tipe === 'pemasukan'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                        }`}>
                        {item.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(item.nominal)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {getKategoriBadge(item.kategori)}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {activeTab === 'hijriyah' && item.hijriyah
                          ? formatHijriyahDate(item.hijriyah)
                          : formatDateShort(item.tanggal_dibuat)}
                      </span>
                      {item.lembaga && (
                        <>
                          <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{item.lembaga}</span>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Tipe
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Tanggal
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Keterangan
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Kategori
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Lembaga
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Nominal
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                        Admin
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {aktivitas.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          Tidak ada aktivitas
                        </td>
                      </tr>
                    ) : (
                      aktivitas.map((item, index) => (
                        <motion.tr
                          key={`${item.tipe}-${item.id}`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          onClick={() => handleItemClick(item)}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getTipeBadge(item.tipe)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                            {activeTab === 'hijriyah' && item.hijriyah
                              ? formatHijriyahDate(item.hijriyah)
                              : formatDate(item.tanggal_dibuat)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {item.keterangan || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getKategoriBadge(item.kategori)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                            {item.lembaga || '-'}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-sm font-semibold ${item.tipe === 'pemasukan'
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                            }`}>
                            {item.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(item.nominal)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                            <div>
                              <div>{item.admin_nama || '-'}</div>
                              {item.tipe === 'pengeluaran' && item.admin_approve_nama && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  Approve: {item.admin_approve_nama}
                                </div>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </>
        )}

        {/* Detail Offcanvas */}
        <DetailOffcanvas
          isOpen={showDetailOffcanvas}
          onClose={() => {
            setShowDetailOffcanvas(false)
            setDetailData(null)
            setSelectedItem(null)
          }}
          title={selectedItem?.tipe === 'pemasukan' ? 'Detail Pemasukan' : 'Detail Pengeluaran'}
          detailData={detailData}
          loading={loadingDetail}
          type={selectedItem?.tipe || 'pengeluaran'}
          formatCurrency={formatCurrency}
          formatDate={formatDateShort}
          formatHijriyahDate={formatHijriyahDate}
          activeTab={activeTab}
          canUbahPenerimaUang={pengeluaranFitur.pengeluaranUbahPenerimaUang}
          canHapusKomentar={pengeluaranFitur.rencanaHapusKomentar}
        />

        {/* Print Laporan Aktivitas Bulanan - Offcanvas bawah */}
        <PrintLaporanAktivitasOffcanvas
          isOpen={showPrintLaporanOffcanvas}
          onClose={() => setShowPrintLaporanOffcanvas(false)}
          initialMonth={currentMonth}
          initialYear={currentYear}
          initialTab={activeTab}
          initialHijriyahMonth={currentHijriyahMonth}
          initialHijriyahYear={currentHijriyahYear}
        />
      </div>
    </div>
  )
}

export default Aktivitas

