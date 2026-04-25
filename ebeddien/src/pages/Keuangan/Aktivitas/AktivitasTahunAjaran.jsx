import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { aktivitasAPI, pemasukanAPI, pengeluaranAPI } from '../../../services/api'
import { useNotification } from '../../../contexts/NotificationContext'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { usePengeluaranFiturAccess } from '../../../hooks/usePengeluaranFiturAccess'
import DetailOffcanvas from '../../../components/DetailOffcanvas/DetailOffcanvas'

function AktivitasTahunAjaran() {
  const { showNotification } = useNotification()
  const { tahunAjaran } = useTahunAjaranStore()
  const pengeluaranFitur = usePengeluaranFiturAccess()
  const [loading, setLoading] = useState(false)
  const [aktivitas, setAktivitas] = useState([])
  const [saldo, setSaldo] = useState({
    saldo_awal: 0,
    pemasukan: 0,
    pengeluaran: 0,
    sisa_saldo: 0
  })
  const [selectedTahunAjaran, setSelectedTahunAjaran] = useState(tahunAjaran)
  const [availableTahunAjaran, setAvailableTahunAjaran] = useState([])
  const tahunAjaranScrollRef = useRef(null)
  const activeTahunAjaranRef = useRef(null)

  // Mode: masehi atau hijriyah
  const [dateMode, setDateMode] = useState('masehi') // 'masehi' or 'hijriyah'

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [tanggalDari, setTanggalDari] = useState('')
  const [tanggalSampai, setTanggalSampai] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [allAktivitas, setAllAktivitas] = useState([]) // Semua data dari server
  const [filteredAktivitas, setFilteredAktivitas] = useState([]) // Hasil filter

  // Month grouping state
  const [monthGroups, setMonthGroups] = useState([]) // List bulan dengan summary
  const [openMonths, setOpenMonths] = useState(new Set()) // Bulan yang terbuka
  const [monthData, setMonthData] = useState({}) // Data per bulan (lazy loaded)
  const [loadingMonths, setLoadingMonths] = useState(false)

  // Detail offcanvas state
  const [showDetailOffcanvas, setShowDetailOffcanvas] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [detailData, setDetailData] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Load available tahun ajaran dari pemasukan dan pengeluaran
  useEffect(() => {
    loadAvailableTahunAjaran()
  }, [])

  // Auto scroll to active tahun ajaran
  useEffect(() => {
    if (availableTahunAjaran.length > 0) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (activeTahunAjaranRef.current && tahunAjaranScrollRef.current) {
            const scrollContainer = tahunAjaranScrollRef.current
            const activeButton = activeTahunAjaranRef.current

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
  }, [availableTahunAjaran, selectedTahunAjaran])

  useEffect(() => {
    if (selectedTahunAjaran) {
      loadAktivitas()
      loadSaldoAwal()
    }
  }, [selectedTahunAjaran])

  // Update month groups when filtered aktivitas or date mode changes
  useEffect(() => {
    if (filteredAktivitas.length > 0) {
      groupByMonth()
    } else {
      setMonthGroups([])
      setMonthData({})
      setOpenMonths(new Set())
    }
  }, [filteredAktivitas, dateMode])

  const loadAvailableTahunAjaran = async () => {
    try {
      // Ambil semua pemasukan dan pengeluaran untuk mendapatkan tahun ajaran yang tersedia
      const pemasukanResponse = await pemasukanAPI.getAll(null, null, null, null, 1, 10000)
      const pengeluaranResponse = await pengeluaranAPI.getPengeluaranList(
        null,
        null,
        null,
        null,
        1,
        10000
      )

      const tahunAjaranSet = new Set()

      if (pemasukanResponse.success && pemasukanResponse.data) {
        const pemasukanData = pemasukanResponse.data.pemasukan || []
        pemasukanData.forEach(p => {
          if (p.tahun_ajaran) {
            tahunAjaranSet.add(p.tahun_ajaran)
          }
        })
      }

      if (pengeluaranResponse.success && pengeluaranResponse.data) {
        const pengeluaranData = pengeluaranResponse.data.pengeluaran || []
        pengeluaranData.forEach(p => {
          if (p.tahun_ajaran) {
            tahunAjaranSet.add(p.tahun_ajaran)
          }
        })
      }

      // Convert to array and sort descending
      const tahunAjaranList = Array.from(tahunAjaranSet).sort((a, b) => {
        // Sort by first year (e.g., "1447-1448" -> 1447)
        const aYear = parseInt(a.split('-')[0])
        const bYear = parseInt(b.split('-')[0])
        return bYear - aYear // Descending
      })

      setAvailableTahunAjaran(tahunAjaranList)

      // Set selected tahun ajaran jika belum ada atau tidak ada di list
      if (!selectedTahunAjaran || !tahunAjaranList.includes(selectedTahunAjaran)) {
        if (tahunAjaranList.length > 0) {
          setSelectedTahunAjaran(tahunAjaranList[0])
        }
      }
    } catch (err) {
      console.error('Error loading available tahun ajaran:', err)
    }
  }

  const loadSaldoAwal = async () => {
    try {
      // Hitung saldo awal dari total keseluruhan tahun_ajaran sebelumnya
      // Ambil tahun ajaran sebelumnya
      const tahunAjaranParts = selectedTahunAjaran.split('-')
      if (tahunAjaranParts.length === 2) {
        const startYear = parseInt(tahunAjaranParts[0])
        const prevStartYear = startYear - 1
        const prevEndYear = startYear
        const prevTahunAjaran = `${prevStartYear}-${prevEndYear}`

        // Get total pemasukan dan pengeluaran dari tahun ajaran sebelumnya
        const pemasukanResponse = await pemasukanAPI.getAll(null, null, null, null, 1, 10000)
        const pengeluaranResponse = await pengeluaranAPI.getPengeluaranList(
          null,
          null,
          null,
          null,
          1,
          10000
        )

        let totalPemasukan = 0
        let totalPengeluaran = 0

        if (pemasukanResponse.success && pemasukanResponse.data) {
          const pemasukanData = pemasukanResponse.data.pemasukan || []
          pemasukanData.forEach(p => {
            if (p.tahun_ajaran === prevTahunAjaran) {
              totalPemasukan += parseFloat(p.nominal || 0)
            }
          })
        }

        if (pengeluaranResponse.success && pengeluaranResponse.data) {
          const pengeluaranData = pengeluaranResponse.data.pengeluaran || []
          pengeluaranData.forEach(p => {
            if (p.tahun_ajaran === prevTahunAjaran) {
              totalPengeluaran += parseFloat(p.nominal || 0)
            }
          })
        }

        // Saldo awal = total pemasukan - total pengeluaran tahun ajaran sebelumnya
        const saldoAwal = totalPemasukan - totalPengeluaran

        setSaldo(prev => ({
          ...prev,
          saldo_awal: saldoAwal
        }))
      }
    } catch (err) {
      console.error('Error loading saldo awal:', err)
    }
  }

  const loadAktivitas = async () => {
    try {
      setLoading(true)
      // Load semua aktivitas tanpa filter bulan, lalu filter berdasarkan tahun_ajaran
      // Kita akan load semua data pemasukan dan pengeluaran, lalu filter client-side
      const pemasukanResponse = await pemasukanAPI.getAll(null, null, null, null, 1, 10000)
      const pengeluaranResponse = await pengeluaranAPI.getPengeluaranList(
        null,
        null,
        null,
        null,
        1,
        10000
      )

      let aktivitasData = []

      // Process pemasukan
      if (pemasukanResponse.success && pemasukanResponse.data) {
        const pemasukanData = pemasukanResponse.data.pemasukan || []
        pemasukanData
          .filter(p => p.tahun_ajaran === selectedTahunAjaran)
          .forEach(p => {
            aktivitasData.push({
              id: p.id,
              tipe: 'pemasukan',
              tanggal_dibuat: p.tanggal_dibuat,
              hijriyah: p.hijriyah,
              keterangan: p.keterangan,
              nominal: p.nominal,
              kategori: p.kategori,
              lembaga: p.lembaga,
              admin_nama: p.admin_nama,
              tahun_ajaran: p.tahun_ajaran
            })
          })
      }

      // Process pengeluaran
      if (pengeluaranResponse.success && pengeluaranResponse.data) {
        const pengeluaranData = pengeluaranResponse.data.pengeluaran || []
        pengeluaranData
          .filter(p => p.tahun_ajaran === selectedTahunAjaran)
          .forEach(p => {
            aktivitasData.push({
              id: p.id,
              tipe: 'pengeluaran',
              tanggal_dibuat: p.tanggal_dibuat,
              hijriyah: p.hijriyah,
              keterangan: p.keterangan,
              nominal: p.nominal,
              kategori: p.kategori,
              lembaga: p.lembaga,
              admin_nama: p.admin_nama,
              admin_approve_nama: p.admin_approve_nama,
              tahun_ajaran: p.tahun_ajaran
            })
          })
      }

      // Sort by tanggal_dibuat descending
      aktivitasData.sort((a, b) => {
        return new Date(b.tanggal_dibuat) - new Date(a.tanggal_dibuat)
      })

      setAllAktivitas(aktivitasData)
      setAktivitas(aktivitasData)

      // Hitung total pemasukan dan pengeluaran untuk seluruh tahun ajaran
      let totalPemasukan = 0
      let totalPengeluaran = 0

      aktivitasData.forEach(item => {
        if (item.tipe === 'pemasukan') {
          totalPemasukan += parseFloat(item.nominal || 0)
        } else {
          totalPengeluaran += parseFloat(item.nominal || 0)
        }
      })

      setSaldo(prev => ({
        ...prev,
        pemasukan: totalPemasukan,
        pengeluaran: totalPengeluaran,
        sisa_saldo: prev.saldo_awal + totalPemasukan - totalPengeluaran
      }))
    } catch (err) {
      console.error('Error loading aktivitas:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar aktivitas', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Group aktivitas by month (masehi or hijriyah)
  const groupByMonth = () => {
    const groups = {}

    filteredAktivitas.forEach(item => {
      let monthKey = ''
      let monthLabel = ''

      if (dateMode === 'masehi') {
        // Group by masehi month
        const date = new Date(item.tanggal_dibuat)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        monthKey = `${year}-${String(month).padStart(2, '0')}`
        monthLabel = `${getMonthNameMasehi(month)} ${year}`
      } else {
        // Group by hijriyah month
        if (item.hijriyah) {
          // Format hijriyah: "1447-12-23" or "1447-12-23 10.10.11"
          const hijriyahDate = item.hijriyah.substring(0, 10) // Get YYYY-MM-DD
          const parts = hijriyahDate.split('-')
          if (parts.length === 3) {
            const year = parseInt(parts[0])
            const month = parseInt(parts[1])
            monthKey = `${year}-${String(month).padStart(2, '0')}`
            monthLabel = `${getMonthNameHijriyah(month)} ${year}`
          }
        }
      }

      if (monthKey) {
        if (!groups[monthKey]) {
          groups[monthKey] = {
            key: monthKey,
            label: monthLabel,
            items: [],
            pemasukan: 0,
            pengeluaran: 0
          }
        }

        groups[monthKey].items.push(item)

        if (item.tipe === 'pemasukan') {
          groups[monthKey].pemasukan += parseFloat(item.nominal || 0)
        } else {
          groups[monthKey].pengeluaran += parseFloat(item.nominal || 0)
        }
      }
    })

    // Convert to array and sort by key (descending - newest first)
    const monthGroupsArray = Object.values(groups).sort((a, b) => {
      return b.key.localeCompare(a.key)
    })

    setMonthGroups(monthGroupsArray)
  }

  // Get month name in masehi
  const getMonthNameMasehi = (month) => {
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ]
    return months[month - 1] || ''
  }

  // Get month name in hijriyah
  const getMonthNameHijriyah = (month) => {
    const months = [
      'Muharram', 'Safar', 'Rabi\'ul Awal', 'Rabi\'ul Akhir', 'Jumadil Awal', 'Jumadil Akhir',
      'Rajab', 'Sya\'ban', 'Ramadhan', 'Syawal', 'Dzulqo\'dah', 'Dzulhijjah'
    ]
    return months[month - 1] || ''
  }

  // Toggle month accordion
  const toggleMonth = (monthKey) => {
    const newOpenMonths = new Set(openMonths)
    if (newOpenMonths.has(monthKey)) {
      newOpenMonths.delete(monthKey)
    } else {
      newOpenMonths.add(monthKey)
      // Load data for this month if not loaded yet
      if (!monthData[monthKey]) {
        loadMonthData(monthKey)
      }
    }
    setOpenMonths(newOpenMonths)
  }

  // Load data for a specific month (lazy loading)
  const loadMonthData = async (monthKey) => {
    if (monthData[monthKey]) {
      return // Already loaded
    }

    setLoadingMonths(true)
    try {
      // Find items for this month
      const monthGroup = monthGroups.find(g => g.key === monthKey)
      if (monthGroup) {
        // Apply search filter to month items
        let filteredItems = [...monthGroup.items]

        // Filter by search query
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim()
          filteredItems = filteredItems.filter(item =>
            (item.keterangan && item.keterangan.toLowerCase().includes(query)) ||
            (item.admin_nama && item.admin_nama.toLowerCase().includes(query)) ||
            (item.id && item.id.toString().includes(query)) ||
            (item.kategori && item.kategori.toLowerCase().includes(query)) ||
            (item.lembaga && item.lembaga && item.lembaga.toLowerCase().includes(query))
          )
        }

        // Filter by date range
        if (tanggalDari) {
          filteredItems = filteredItems.filter(item => {
            const tanggalDibuat = new Date(item.tanggal_dibuat).toISOString().split('T')[0]
            return tanggalDibuat >= tanggalDari
          })
        }

        if (tanggalSampai) {
          filteredItems = filteredItems.filter(item => {
            const tanggalDibuat = new Date(item.tanggal_dibuat).toISOString().split('T')[0]
            return tanggalDibuat <= tanggalSampai
          })
        }

        setMonthData(prev => ({
          ...prev,
          [monthKey]: filteredItems
        }))
      }
    } catch (err) {
      console.error('Error loading month data:', err)
    } finally {
      setLoadingMonths(false)
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
    const datePart = hijriyahString.substring(0, 10)
    const timePart = hijriyahString.length > 10 ? hijriyahString.substring(11) : null

    // Format tanggal: 1447-12-23 -> 23-12-1447
    const parts = datePart.split('-')
    if (parts.length === 3) {
      const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`
      if (timePart) {
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
      'ATK': { label: 'ATK', color: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200' },
      'Rapat': { label: 'Rapat', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200' },
      'Setoran': { label: 'Setoran', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
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

        {/* Tahun Ajaran Navigation - Horizontal Scroll */}
        <div className="mb-4">
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Tahun Ajaran
            </label>
          </div>
          <div
            ref={tahunAjaranScrollRef}
            className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex gap-2 min-w-max">
              {availableTahunAjaran.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Memuat tahun ajaran...</div>
              ) : (
                availableTahunAjaran.map((ta) => {
                  const isActive = ta === selectedTahunAjaran

                  return (
                    <button
                      key={ta}
                      ref={isActive ? activeTahunAjaranRef : null}
                      onClick={() => {
                        setSelectedTahunAjaran(ta)
                      }}
                      className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${isActive
                          ? 'bg-primary-600 text-white shadow-md'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                      {ta}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        {/* Masehi - Hijriyah Toggle */}
        <div className="mb-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tampilkan:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setDateMode('masehi')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateMode === 'masehi'
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                >
                  Masehi
                </button>
                <button
                  onClick={() => setDateMode('hijriyah')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${dateMode === 'hijriyah'
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                >
                  Hijriyah
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Accordion */}
        <div className="mb-6">
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
                      loadAktivitas()
                      loadSaldoAwal()
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

        {/* Saldo Tahun Ajaran */}
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Saldo Awal - Kiri atas */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="text-[10px] sm:text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">
              Saldo Awal Tahun Ajaran
            </div>
            <div className="text-sm sm:text-lg font-bold text-blue-600 dark:text-blue-400">
              {formatCurrency(saldo.saldo_awal)}
            </div>
          </div>
          {/* Pemasukan - Kanan atas */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-[10px] sm:text-xs font-medium text-green-700 dark:text-green-300 mb-1">
              Pemasukan Tahun Ajaran
            </div>
            <div className="text-sm sm:text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(saldo.pemasukan)}
            </div>
          </div>
          {/* Pengeluaran - Kiri bawah */}
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
            <div className="text-[10px] sm:text-xs font-medium text-red-700 dark:text-red-300 mb-1">
              Pengeluaran Tahun Ajaran
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
            {/* Month Accordion Groups */}
            <div className="space-y-3">
              {monthGroups.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
                  Tidak ada aktivitas
                </div>
              ) : (
                monthGroups.map((monthGroup) => {
                  const isOpen = openMonths.has(monthGroup.key)
                  const monthItems = monthData[monthGroup.key] || []

                  return (
                    <div
                      key={monthGroup.key}
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                    >
                      {/* Accordion Header */}
                      <button
                        onClick={() => toggleMonth(monthGroup.key)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 text-left">
                              {monthGroup.label}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0 text-right">
                            <div className="text-xs text-green-600 dark:text-green-400 font-semibold">
                              + {formatCurrency(monthGroup.pemasukan)}
                            </div>
                            <div className="text-xs text-red-600 dark:text-red-400 font-semibold">
                              - {formatCurrency(monthGroup.pengeluaran)}
                            </div>
                          </div>
                        </div>
                      </button>

                      {/* Accordion Content */}
                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-gray-200 dark:border-gray-700">
                              {loadingMonths && !monthData[monthGroup.key] ? (
                                <div className="flex justify-center items-center py-8">
                                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-600"></div>
                                </div>
                              ) : monthItems.length === 0 ? (
                                <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                                  Tidak ada aktivitas
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                  {/* Mobile Card Layout */}
                                  <div className="md:hidden">
                                    {monthItems.map((item, index) => (
                                      <motion.div
                                        key={`${item.tipe}-${item.id}`}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.02 }}
                                        onClick={() => handleItemClick(item)}
                                        className={`px-4 py-3 border-l-4 ${item.tipe === 'pemasukan'
                                            ? 'border-l-green-500'
                                            : 'border-l-red-500'
                                          } cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors`}
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
                                            {dateMode === 'masehi' ? formatDateShort(item.tanggal_dibuat) : formatHijriyahDate(item.hijriyah)}
                                          </span>
                                          {item.lembaga && (
                                            <>
                                              <span className="text-xs text-gray-500 dark:text-gray-400">•</span>
                                              <span className="text-xs text-gray-500 dark:text-gray-400">{item.lembaga}</span>
                                            </>
                                          )}
                                        </div>
                                      </motion.div>
                                    ))}
                                  </div>

                                  {/* Desktop Table Layout */}
                                  <div className="hidden md:block">
                                    <table className="w-full">
                                      <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Tipe
                                          </th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Tanggal
                                          </th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Keterangan
                                          </th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Kategori
                                          </th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Lembaga
                                          </th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Nominal
                                          </th>
                                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                            Admin
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {monthItems.map((item, index) => (
                                          <motion.tr
                                            key={`${item.tipe}-${item.id}`}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.02 }}
                                            onClick={() => handleItemClick(item)}
                                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                                          >
                                            <td className="px-4 py-2 whitespace-nowrap">
                                              {getTipeBadge(item.tipe)}
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                              {dateMode === 'masehi' ? formatDate(item.tanggal_dibuat) : formatHijriyahDate(item.hijriyah)}
                                            </td>
                                            <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                              {item.keterangan || '-'}
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap">
                                              {getKategoriBadge(item.kategori)}
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                                              {item.lembaga || '-'}
                                            </td>
                                            <td className={`px-4 py-2 whitespace-nowrap text-sm font-semibold ${item.tipe === 'pemasukan'
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-600 dark:text-red-400'
                                              }`}>
                                              {item.tipe === 'pemasukan' ? '+' : '-'} {formatCurrency(item.nominal)}
                                            </td>
                                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
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
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })
              )}
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
          activeTab={dateMode === 'masehi' ? 'masehi' : 'hijriyah'}
          canUbahPenerimaUang={pengeluaranFitur.pengeluaranUbahPenerimaUang}
          canHapusKomentar={pengeluaranFitur.rencanaHapusKomentar}
        />
      </div>
    </div>
  )
}

export default AktivitasTahunAjaran
