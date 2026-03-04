import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pemasukanAPI } from '../../../services/api'
import { useAuthStore } from '../../../store/authStore'
import { useTahunAjaranStore } from '../../../store/tahunAjaranStore'
import { useNotification } from '../../../contexts/NotificationContext'
import { getTanggalFromAPI } from '../../../utils/hijriDate'
import Modal from '../../../components/Modal/Modal'
import DetailOffcanvas from '../../../components/DetailOffcanvas/DetailOffcanvas'

// Memoized Search and Filter Section
const SearchAndFilterPemasukan = memo(({
  searchInput,
  onSearchInputChange,
  onSearchInputFocus,
  onSearchInputBlur,
  isInputFocused,
  isFilterOpen,
  onFilterToggle,
  kategoriFilter,
  onKategoriFilterChange,
  statusFilter,
  onStatusFilterChange,
  tanggalDari,
  onTanggalDariChange,
  tanggalSampai,
  onTanggalSampaiChange,
  onCreateClick,
  onUwabaClick,
  onTunggakanClick,
  onKhususClick,
  onPendaftaranClick,
  onRefresh
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      {/* Search Input dengan tombol di kanan */}
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari keterangan, admin, atau ID..."
          />
          {/* Tombol Filter dan Refresh di kanan */}
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <button
              onClick={onFilterToggle}
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
              onClick={onRefresh}
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
                <select
                  value={kategoriFilter}
                  onChange={onKategoriFilterChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Kategori</option>
                  <option value="UWABA">UWABA</option>
                  <option value="Tunggakan">Tunggakan</option>
                  <option value="Khusus">Khusus</option>
                  <option value="PSB">PSB</option>
                  <option value="Beasiswa">Beasiswa</option>
                  <option value="Lembaga">Lembaga</option>
                  <option value="Cashback">Cashback</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Status</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
                <input
                  type="date"
                  value={tanggalDari}
                  onChange={onTanggalDariChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  placeholder="Dari Tanggal"
                />
                <input
                  type="date"
                  value={tanggalSampai}
                  onChange={onTanggalSampaiChange}
                  className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  placeholder="Sampai Tanggal"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create and Action Buttons */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 flex-wrap">
        <button
          onClick={onUwabaClick}
          className="px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          UWABA
        </button>
        <button
          onClick={onTunggakanClick}
          className="px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
          Tunggakan
        </button>
        <button
          onClick={onKhususClick}
          className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.539 1.118l-3.975-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.95-.69l1.52-4.674z" />
          </svg>
          Khusus
        </button>
        <button
          onClick={onPendaftaranClick}
          className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          PSB
        </button>
        <button
          onClick={onCreateClick}
          className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Buat
        </button>
      </div>
    </div>
  )
})

SearchAndFilterPemasukan.displayName = 'SearchAndFilterPemasukan'

function Pemasukan() {
  const { user } = useAuthStore()
  const { tahunAjaran } = useTahunAjaranStore()
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showUwabaModal, setShowUwabaModal] = useState(false)
  const [showTunggakanModal, setShowTunggakanModal] = useState(false)
  const [showKhususModal, setShowKhususModal] = useState(false)
  const [showPendaftaranModal, setShowPendaftaranModal] = useState(false)
  const [selectedPemasukan, setSelectedPemasukan] = useState(null)
  const [editingId, setEditingId] = useState(null)

  // State untuk offcanvas detail pemasukan
  const [showPemasukanOffcanvas, setShowPemasukanOffcanvas] = useState(false)
  const [pemasukanDetail, setPemasukanDetail] = useState(null)
  const [loadingPemasukanDetail, setLoadingPemasukanDetail] = useState(false)
  const [uwabaTanggal, setUwabaTanggal] = useState(new Date().toISOString().split('T')[0])
  const [tunggakanTanggal, setTunggakanTanggal] = useState(new Date().toISOString().split('T')[0])
  const [khususTanggal, setKhususTanggal] = useState(new Date().toISOString().split('T')[0])
  const [pendaftaranTanggal, setPendaftaranTanggal] = useState(new Date().toISOString().split('T')[0])
  const [uwabaPendapatan, setUwabaPendapatan] = useState(0)
  const [tunggakanPendapatan, setTunggakanPendapatan] = useState(0)
  const [khususPendapatan, setKhususPendapatan] = useState(0)
  const [pendaftaranPendapatan, setPendaftaranPendapatan] = useState(0)
  const [uwabaListAdmin, setUwabaListAdmin] = useState([])
  const [tunggakanListAdmin, setTunggakanListAdmin] = useState([])
  const [khususListAdmin, setKhususListAdmin] = useState([])
  const [pendaftaranListAdmin, setPendaftaranListAdmin] = useState([])
  const [loadingUwaba, setLoadingUwaba] = useState(false)
  const [loadingTunggakan, setLoadingTunggakan] = useState(false)
  const [loadingKhusus, setLoadingKhusus] = useState(false)
  const [loadingPendaftaran, setLoadingPendaftaran] = useState(false)

  // Data state
  const [allPemasukan, setAllPemasukan] = useState([])
  const [filteredPemasukan, setFilteredPemasukan] = useState([])
  const [pemasukanList, setPemasukanList] = useState([])
  const [pemasukanPage, setPemasukanPage] = useState(1)
  const [pemasukanTotal, setPemasukanTotal] = useState(0)

  // Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [kategoriFilter, setKategoriFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [tanggalDari, setTanggalDari] = useState('')
  const [tanggalSampai, setTanggalSampai] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    keterangan: '',
    kategori: 'Lainnya',
    status: 'Cash',
    nominal: '',
    hijriyah: '',
    tahun_ajaran: ''
  })

  const [itemsPerPage, setItemsPerPage] = useState(50)

  // Load semua data pemasukan
  useEffect(() => {
    loadAllPemasukan()
  }, [])

  const loadAllPemasukan = async () => {
    try {
      setLoading(true)
      const response = await pemasukanAPI.getAll(null, null, null, null, 1, 10000)
      if (response.success) {
        setAllPemasukan(response.data.pemasukan || [])
      } else {
        showNotification(response.message || 'Gagal memuat daftar pemasukan', 'error')
      }
    } catch (err) {
      console.error('Error loading pemasukan:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar pemasukan', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Apply filters (client-side filtering)
  useEffect(() => {
    if (allPemasukan.length === 0) {
      setFilteredPemasukan([])
      return
    }

    let filtered = [...allPemasukan]

    // Filter berdasarkan search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(pemasukan =>
        (pemasukan.keterangan && pemasukan.keterangan.toLowerCase().includes(query)) ||
        (pemasukan.admin_nama && pemasukan.admin_nama.toLowerCase().includes(query)) ||
        (pemasukan.id && pemasukan.id.toString().includes(query))
      )
    }

    // Filter berdasarkan kategori
    if (kategoriFilter) {
      filtered = filtered.filter(pemasukan => pemasukan.kategori === kategoriFilter)
    }

    // Filter berdasarkan status
    if (statusFilter) {
      filtered = filtered.filter(pemasukan => pemasukan.status === statusFilter)
    }

    // Filter berdasarkan tanggal
    if (tanggalDari) {
      filtered = filtered.filter(pemasukan => {
        const tanggalDibuat = new Date(pemasukan.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat >= tanggalDari
      })
    }

    if (tanggalSampai) {
      filtered = filtered.filter(pemasukan => {
        const tanggalDibuat = new Date(pemasukan.tanggal_dibuat).toISOString().split('T')[0]
        return tanggalDibuat <= tanggalSampai
      })
    }

    setFilteredPemasukan(filtered)
    setPemasukanPage(1)
  }, [searchQuery, kategoriFilter, statusFilter, tanggalDari, tanggalSampai, allPemasukan])

  // Pagination
  useEffect(() => {
    const startIndex = (pemasukanPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    setPemasukanList(filteredPemasukan.slice(startIndex, endIndex))
    setPemasukanTotal(filteredPemasukan.length)
  }, [filteredPemasukan, pemasukanPage, itemsPerPage])

  // Search input handlers
  const handleSearchInputChange = useCallback((e) => {
    setSearchQuery(e.target.value)
  }, [])

  const handleSearchInputFocus = useCallback(() => {
    setIsInputFocused(true)
  }, [])

  const handleSearchInputBlur = useCallback(() => {
    setIsInputFocused(false)
  }, [])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount)
  }

  const getStatusBadge = (status) => {
    const statusMap = {
      'Cash': { label: 'Cash', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
      'Bank': { label: 'Bank', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
      'Lainnya': { label: 'Lainnya', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' }
    }
    const statusInfo = statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    )
  }

  const getKategoriBadge = (kategori) => {
    const kategoriMap = {
      'UWABA': { label: 'UWABA', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
      'Tunggakan': { label: 'Tunggakan', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
      'Khusus': { label: 'Khusus', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' },
      'PSB': { label: 'PSB', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' },
      'Beasiswa': { label: 'Beasiswa', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
      'Lembaga': { label: 'Lembaga', color: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
      'Cashback': { label: 'Cashback', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
      'Lainnya': { label: 'Lainnya', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' }
    }
    const kategoriInfo = kategoriMap[kategori] || { label: kategori, color: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`px-2 py-0.5 ${kategoriInfo.color} rounded text-xs`}>
        {kategoriInfo.label}
      </span>
    )
  }

  const handleCreate = async (initialData = {}) => {
    // Ambil hijriyah dari API
    let hijriyahValue = initialData.hijriyah || ''
    if (!hijriyahValue) {
      try {
        const { hijriyah } = await getTanggalFromAPI()
        hijriyahValue = hijriyah
      } catch (error) {
        console.error('Error getting hijriyah:', error)
        hijriyahValue = ''
      }
    }

    setFormData({
      keterangan: initialData.keterangan || '',
      kategori: initialData.kategori || 'Lainnya',
      status: initialData.status || 'Cash',
      nominal: initialData.nominal || '',
      hijriyah: hijriyahValue,
      tahun_ajaran: initialData.tahun_ajaran || tahunAjaran || ''
    })
    setShowCreateModal(true)
  }

  const handleTambahFromUwaba = (nominal, via = null, adminNama = null) => {
    // Format tanggal untuk keterangan (DD-MM-YYYY)
    const date = new Date(uwabaTanggal)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const tanggalFormatted = `${day}-${month}-${year}`

    // Buat keterangan dengan tanggal
    let keterangan = `UWABA - ${tanggalFormatted}`
    if (via) {
      keterangan = `UWABA - ${via} - ${tanggalFormatted}`
    }
    // Tambahkan nama admin jika ada
    if (adminNama) {
      keterangan = `${keterangan} - Admin: ${adminNama}`
    }

    // Tutup modal UWABA terlebih dahulu
    setShowUwabaModal(false)
    // Buka modal create dengan data yang sudah terisi
    handleCreate({
      keterangan: keterangan,
      kategori: 'UWABA',
      status: via === 'TF' ? 'Bank' : 'Cash',
      nominal: nominal.toString(),
      tahun_ajaran: tahunAjaran || ''
    })
  }

  const handleTambahFromTunggakan = (nominal, via = null, adminNama = null) => {
    // Format tanggal untuk keterangan (DD-MM-YYYY)
    const date = new Date(tunggakanTanggal)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const tanggalFormatted = `${day}-${month}-${year}`

    // Buat keterangan dengan tanggal
    let keterangan = `Tunggakan - ${tanggalFormatted}`
    if (via) {
      keterangan = `Tunggakan - ${via} - ${tanggalFormatted}`
    }
    // Tambahkan nama admin jika ada
    if (adminNama) {
      keterangan = `${keterangan} - Admin: ${adminNama}`
    }

    // Tutup modal Tunggakan terlebih dahulu
    setShowTunggakanModal(false)
    // Buka modal create dengan data yang sudah terisi
    handleCreate({
      keterangan: keterangan,
      kategori: 'Tunggakan',
      status: via === 'TF' ? 'Bank' : 'Cash',
      nominal: nominal.toString(),
      tahun_ajaran: tahunAjaran || ''
    })
  }

  const handleTambahFromKhusus = (nominal, via = null, adminNama = null) => {
    // Format tanggal untuk keterangan (DD-MM-YYYY)
    const date = new Date(khususTanggal)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const tanggalFormatted = `${day}-${month}-${year}`

    // Buat keterangan dengan tanggal
    let keterangan = `Khusus - ${tanggalFormatted}`
    if (via) {
      keterangan = `Khusus - ${via} - ${tanggalFormatted}`
    }
    // Tambahkan nama admin jika ada
    if (adminNama) {
      keterangan = `${keterangan} - Admin: ${adminNama}`
    }

    // Tutup modal Khusus terlebih dahulu
    setShowKhususModal(false)
    // Buka modal create dengan data yang sudah terisi
    handleCreate({
      keterangan: keterangan,
      kategori: 'Khusus',
      status: via === 'TF' ? 'Bank' : 'Cash',
      nominal: nominal.toString(),
      tahun_ajaran: tahunAjaran || ''
    })
  }

  const handleTambahFromPendaftaran = (nominal, via = null, adminNama = null) => {
    // Format tanggal untuk keterangan (DD-MM-YYYY)
    const date = new Date(pendaftaranTanggal)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const tanggalFormatted = `${day}-${month}-${year}`

    // Buat keterangan dengan tanggal
    let keterangan = `PSB - ${tanggalFormatted}`
    if (via) {
      keterangan = `PSB - ${via} - ${tanggalFormatted}`
    }
    // Tambahkan nama admin jika ada
    if (adminNama) {
      keterangan = `${keterangan} - Admin: ${adminNama}`
    }

    // Tutup modal Pendaftaran terlebih dahulu
    setShowPendaftaranModal(false)
    // Buka modal create dengan data yang sudah terisi
    handleCreate({
      keterangan: keterangan,
      kategori: 'PSB',
      status: via === 'TF' ? 'Bank' : 'Cash',
      nominal: nominal.toString(),
      tahun_ajaran: tahunAjaran || ''
    })
  }

  // Fungsi untuk cek apakah nominal sudah ditambahkan
  const isNominalAlreadyAdded = (nominal, via = null, kategori = 'UWABA', tanggal = null) => {
    // Format tanggal untuk pencarian (DD-MM-YYYY)
    const date = tanggal ? new Date(tanggal) : new Date(uwabaTanggal)
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const tanggalFormatted = `${day}-${month}-${year}`

    // Cek di data pemasukan yang sudah ada
    return allPemasukan.some(pemasukan => {
      // Harus kategori yang sesuai
      if (pemasukan.kategori !== kategori) return false

      // Nominal harus sama (dengan toleransi kecil untuk floating point)
      const nominalPemasukan = parseFloat(pemasukan.nominal || 0)
      const nominalInput = parseFloat(nominal)
      if (Math.abs(nominalPemasukan - nominalInput) > 0.01) return false

      // Keterangan harus mengandung tanggal yang sama
      if (!pemasukan.keterangan || !pemasukan.keterangan.includes(tanggalFormatted)) return false

      // Jika ada via, keterangan harus mengandung via juga
      if (via && !pemasukan.keterangan.includes(via)) return false

      return true
    })
  }

  const handleEdit = (pemasukan) => {
    setFormData({
      keterangan: pemasukan.keterangan || '',
      kategori: pemasukan.kategori || '',
      status: pemasukan.status || 'Cash',
      nominal: pemasukan.nominal || '',
      hijriyah: pemasukan.hijriyah || '',
      tahun_ajaran: pemasukan.tahun_ajaran || tahunAjaran || ''
    })
    setEditingId(pemasukan.id)
    setShowEditModal(true)
  }

  const handleDelete = (pemasukan) => {
    setSelectedPemasukan(pemasukan)
    setShowDeleteModal(true)
  }

  const handlePemasukanClick = async (pemasukan) => {
    try {
      setLoadingPemasukanDetail(true)
      setShowPemasukanOffcanvas(true)

      const response = await pemasukanAPI.getDetail(pemasukan.id)
      if (response.success) {
        setPemasukanDetail(response.data)
      } else {
        showNotification(response.message || 'Gagal memuat detail pemasukan', 'error')
        setShowPemasukanOffcanvas(false)
      }
    } catch (err) {
      console.error('Error loading pemasukan detail:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail pemasukan', 'error')
      setShowPemasukanOffcanvas(false)
    } finally {
      setLoadingPemasukanDetail(false)
    }
  }

  const loadPendapatanUwaba = async (tanggal) => {
    try {
      setLoadingUwaba(true)
      const response = await pemasukanAPI.getPendapatanUwaba(tanggal)
      if (response.success) {
        setUwabaPendapatan(response.data.total_pendapatan || 0)
        setUwabaListAdmin(response.data.list_admin || [])
      } else {
        showNotification(response.message || 'Gagal memuat pendapatan UWABA', 'error')
        setUwabaPendapatan(0)
        setUwabaListAdmin([])
      }
    } catch (err) {
      console.error('Error loading pendapatan UWABA:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat pendapatan UWABA', 'error')
      setUwabaPendapatan(0)
      setUwabaListAdmin([])
    } finally {
      setLoadingUwaba(false)
    }
  }

  const handleUwabaTanggalChange = (e) => {
    const newTanggal = e.target.value
    setUwabaTanggal(newTanggal)
    loadPendapatanUwaba(newTanggal)
  }

  const loadPendapatanTunggakan = async (tanggal) => {
    try {
      setLoadingTunggakan(true)
      const response = await pemasukanAPI.getPendapatanTunggakan(tanggal)
      if (response.success) {
        setTunggakanPendapatan(response.data.total_pendapatan || 0)
        setTunggakanListAdmin(response.data.list_admin || [])
      } else {
        showNotification(response.message || 'Gagal memuat pendapatan Tunggakan', 'error')
        setTunggakanPendapatan(0)
        setTunggakanListAdmin([])
      }
    } catch (err) {
      console.error('Error loading pendapatan Tunggakan:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat pendapatan Tunggakan', 'error')
      setTunggakanPendapatan(0)
      setTunggakanListAdmin([])
    } finally {
      setLoadingTunggakan(false)
    }
  }

  const loadPendapatanKhusus = async (tanggal) => {
    try {
      setLoadingKhusus(true)
      const response = await pemasukanAPI.getPendapatanKhusus(tanggal)
      if (response.success) {
        setKhususPendapatan(response.data.total_pendapatan || 0)
        setKhususListAdmin(response.data.list_admin || [])
      } else {
        showNotification(response.message || 'Gagal memuat pendapatan Khusus', 'error')
        setKhususPendapatan(0)
        setKhususListAdmin([])
      }
    } catch (err) {
      console.error('Error loading pendapatan Khusus:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat pendapatan Khusus', 'error')
      setKhususPendapatan(0)
      setKhususListAdmin([])
    } finally {
      setLoadingKhusus(false)
    }
  }

  const loadPendapatanPendaftaran = async (tanggal) => {
    try {
      setLoadingPendaftaran(true)
      const response = await pemasukanAPI.getPendapatanPendaftaran(tanggal)
      if (response.success) {
        setPendaftaranPendapatan(response.data.total_pendapatan || 0)
        setPendaftaranListAdmin(response.data.list_admin || [])
      } else {
        showNotification(response.message || 'Gagal memuat pendapatan Pendaftaran', 'error')
        setPendaftaranPendapatan(0)
        setPendaftaranListAdmin([])
      }
    } catch (err) {
      console.error('Error loading pendapatan Pendaftaran:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat pendapatan Pendaftaran', 'error')
      setPendaftaranPendapatan(0)
      setPendaftaranListAdmin([])
    } finally {
      setLoadingPendaftaran(false)
    }
  }

  const handleTunggakanTanggalChange = (e) => {
    const newTanggal = e.target.value
    setTunggakanTanggal(newTanggal)
    loadPendapatanTunggakan(newTanggal)
  }

  const handleKhususTanggalChange = (e) => {
    const newTanggal = e.target.value
    setKhususTanggal(newTanggal)
    loadPendapatanKhusus(newTanggal)
  }

  const handlePendaftaranTanggalChange = (e) => {
    const newTanggal = e.target.value
    setPendaftaranTanggal(newTanggal)
    loadPendapatanPendaftaran(newTanggal)
  }

  useEffect(() => {
    if (showUwabaModal && uwabaTanggal) {
      loadPendapatanUwaba(uwabaTanggal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUwabaModal])

  useEffect(() => {
    if (showTunggakanModal && tunggakanTanggal) {
      loadPendapatanTunggakan(tunggakanTanggal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTunggakanModal])

  useEffect(() => {
    if (showKhususModal && khususTanggal) {
      loadPendapatanKhusus(khususTanggal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKhususModal])

  useEffect(() => {
    if (showPendaftaranModal && pendaftaranTanggal) {
      loadPendapatanPendaftaran(pendaftaranTanggal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPendaftaranModal])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.keterangan.trim()) {
      showNotification('Keterangan wajib diisi', 'error')
      return
    }

    if (!formData.nominal || parseFloat(formData.nominal) <= 0) {
      showNotification('Nominal harus lebih dari 0', 'error')
      return
    }

    try {
      setLoading(true)
      const payload = {
        keterangan: formData.keterangan.trim(),
        kategori: formData.kategori || null,
        status: formData.status,
        nominal: parseFloat(formData.nominal),
        hijriyah: formData.hijriyah || null,
        tahun_ajaran: formData.tahun_ajaran || null
      }

      if (editingId) {
        const response = await pemasukanAPI.update(editingId, payload)
        if (response.success) {
          showNotification('Pemasukan berhasil diupdate', 'success')
          setShowEditModal(false)
          setEditingId(null)
          loadAllPemasukan()
        } else {
          showNotification(response.message || 'Gagal mengupdate pemasukan', 'error')
        }
      } else {
        const response = await pemasukanAPI.create(payload)
        if (response.success) {
          showNotification('Pemasukan berhasil dibuat', 'success')
          setShowCreateModal(false)
          loadAllPemasukan()
        } else {
          showNotification(response.message || 'Gagal membuat pemasukan', 'error')
        }
      }
    } catch (err) {
      console.error('Error saving pemasukan:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat menyimpan pemasukan', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!selectedPemasukan) return

    try {
      setLoading(true)
      const response = await pemasukanAPI.delete(selectedPemasukan.id)
      if (response.success) {
        showNotification('Pemasukan berhasil dihapus', 'success')
        setShowDeleteModal(false)
        setSelectedPemasukan(null)
        loadAllPemasukan()
      } else {
        showNotification(response.message || 'Gagal menghapus pemasukan', 'error')
      }
    } catch (err) {
      console.error('Error deleting pemasukan:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat menghapus pemasukan', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
      <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
        <div className="p-4 sm:p-6 lg:p-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Search and Filter */}
            <SearchAndFilterPemasukan
              searchInput={searchQuery}
              onSearchInputChange={handleSearchInputChange}
              onSearchInputFocus={handleSearchInputFocus}
              onSearchInputBlur={handleSearchInputBlur}
              isInputFocused={isInputFocused}
              isFilterOpen={isFilterOpen}
              onFilterToggle={() => setIsFilterOpen(!isFilterOpen)}
              onRefresh={loadAllPemasukan}
              kategoriFilter={kategoriFilter}
              onKategoriFilterChange={(e) => {
                setKategoriFilter(e.target.value)
                setPemasukanPage(1)
              }}
              statusFilter={statusFilter}
              onStatusFilterChange={(e) => {
                setStatusFilter(e.target.value)
                setPemasukanPage(1)
              }}
              tanggalDari={tanggalDari}
              onTanggalDariChange={(e) => {
                setTanggalDari(e.target.value)
                setPemasukanPage(1)
              }}
              tanggalSampai={tanggalSampai}
              onTanggalSampaiChange={(e) => {
                setTanggalSampai(e.target.value)
                setPemasukanPage(1)
              }}
              onCreateClick={handleCreate}
              onUwabaClick={() => setShowUwabaModal(true)}
              onTunggakanClick={() => setShowTunggakanModal(true)}
              onKhususClick={() => setShowKhususModal(true)}
              onPendaftaranClick={() => setShowPendaftaranModal(true)}
            />


            {/* Pemasukan List */}
            {loading && allPemasukan.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
              </div>
            ) : filteredPemasukan.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
                <p className="text-gray-500 dark:text-gray-400">
                  {allPemasukan.length === 0
                    ? 'Tidak ada pemasukan'
                    : 'Tidak ada pemasukan yang sesuai dengan filter'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pemasukanList.map((pemasukan, index) => (
                  <motion.div
                    key={pemasukan.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    onClick={() => handlePemasukanClick(pemasukan)}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-3 sm:p-4 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 mb-1 truncate">
                          {pemasukan.keterangan || 'Tanpa Keterangan'}
                        </h3>
                        <div className="flex flex-wrap gap-2 mb-1">
                          {pemasukan.kategori && getKategoriBadge(pemasukan.kategori)}
                          {getStatusBadge(pemasukan.status)}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                          Oleh: {pemasukan.admin_nama || 'Unknown'} | {new Date(pemasukan.tanggal_dibuat).toLocaleDateString('id-ID')}
                        </p>
                        {(pemasukan.hijriyah || pemasukan.tahun_ajaran) && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {pemasukan.hijriyah && (
                              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                Hijriyah: {pemasukan.hijriyah}
                              </span>
                            )}
                            {pemasukan.tahun_ajaran && (
                              <span className="text-xs text-blue-600 dark:text-blue-400">
                                Tahun Ajaran: {pemasukan.tahun_ajaran}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-base sm:text-lg font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                            {formatCurrency(parseFloat(pemasukan.nominal || 0))}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleEdit(pemasukan)
                            }}
                            className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm flex items-center gap-1"
                            title="Edit"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(pemasukan)
                            }}
                            className="px-2.5 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs sm:text-sm flex items-center gap-1"
                            title="Hapus"
                          >
                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="hidden sm:inline">Hapus</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {/* Pagination */}
                {pemasukanTotal > 0 && (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
                    {/* Items per page selector */}
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600 dark:text-gray-400">
                        Tampilkan:
                      </label>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value))
                          setPemasukanPage(1)
                        }}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        dari {pemasukanTotal} data
                      </span>
                    </div>

                    {/* Pagination controls */}
                    {pemasukanTotal > itemsPerPage && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPemasukanPage(prev => Math.max(1, prev - 1))}
                          disabled={pemasukanPage === 1}
                          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Previous
                        </button>
                        <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                          Halaman {pemasukanPage} dari {Math.ceil(pemasukanTotal / itemsPerPage)}
                        </span>
                        <button
                          onClick={() => setPemasukanPage(prev => prev + 1)}
                          disabled={pemasukanPage >= Math.ceil(pemasukanTotal / itemsPerPage)}
                          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal || showEditModal}
        onClose={() => {
          setShowCreateModal(false)
          setShowEditModal(false)
          setEditingId(null)
          setFormData({
            keterangan: '',
            kategori: 'Lainnya',
            status: 'Cash',
            nominal: '',
            hijriyah: '',
            tahun_ajaran: ''
          })
        }}
        title={editingId ? 'Edit Pemasukan' : 'Buat Pemasukan Baru'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Keterangan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.keterangan}
                onChange={(e) => setFormData({ ...formData, keterangan: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                rows="3"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Kategori
                </label>
                <select
                  value={formData.kategori}
                  onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Pilih Kategori</option>
                  <option value="UWABA">UWABA</option>
                  <option value="Tunggakan">Tunggakan</option>
                  <option value="Khusus">Khusus</option>
                  <option value="PSB">PSB</option>
                  <option value="Beasiswa">Beasiswa</option>
                  <option value="Lembaga">Lembaga</option>
                  <option value="Cashback">Cashback</option>
                  <option value="BOS">BOS</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Status <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nominal <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={formData.nominal}
                onChange={(e) => setFormData({ ...formData, nominal: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                placeholder="0"
                min="0"
                step="0.01"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Hijriyah
                </label>
                <input
                  type="text"
                  value={formData.hijriyah}
                  onChange={(e) => setFormData({ ...formData, hijriyah: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                  placeholder="Auto dari header"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Otomatis diambil dari tanggal hijriyah di header
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tahun Ajaran
                </label>
                <input
                  type="text"
                  value={formData.tahun_ajaran}
                  onChange={(e) => setFormData({ ...formData, tahun_ajaran: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
                  placeholder="Auto dari header"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Otomatis diambil dari tahun ajaran yang dipilih di profil
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false)
                setShowEditModal(false)
                setEditingId(null)
                setFormData({
                  keterangan: '',
                  kategori: 'Lainnya',
                  status: 'Cash',
                  nominal: ''
                })
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Menyimpan...' : (editingId ? 'Update' : 'Simpan')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setSelectedPemasukan(null)
        }}
        title="Hapus Pemasukan"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Apakah Anda yakin ingin menghapus pemasukan ini?
          </p>
          {selectedPemasukan && (
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
              <p className="font-medium text-gray-800 dark:text-gray-200">{selectedPemasukan.keterangan}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {formatCurrency(parseFloat(selectedPemasukan.nominal || 0))}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setShowDeleteModal(false)
                setSelectedPemasukan(null)
              }}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Menghapus...' : 'Hapus'}
            </button>
          </div>
        </div>
      </Modal>

      {/* UWABA Modal */}
      <Modal
        isOpen={showUwabaModal}
        onClose={() => {
          setShowUwabaModal(false)
          setUwabaTanggal(new Date().toISOString().split('T')[0])
          setUwabaPendapatan(0)
        }}
        title="Pendapatan UWABA"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pilih Tanggal
            </label>
            <input
              type="date"
              value={uwabaTanggal}
              onChange={handleUwabaTanggalChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {loadingUwaba ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            </div>
          ) : (
            <>
              {/* List Admin */}
              {uwabaListAdmin.length > 0 ? (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Detail per Admin ({uwabaListAdmin.length} admin)
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                    {uwabaListAdmin.map((admin, index) => (
                      <div
                        key={admin.id_admin || index}
                        className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                      >
                        {/* Header Admin */}
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {admin.admin_nama || 'Unknown'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {admin.jumlah_transaksi} transaksi
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-teal-600 dark:text-teal-400">
                              {formatCurrency(admin.total_per_admin)}
                            </p>
                            <button
                              onClick={() => handleTambahFromUwaba(admin.total_per_admin, null, admin.admin_nama)}
                              disabled={isNominalAlreadyAdded(admin.total_per_admin, null, 'UWABA', uwabaTanggal)}
                              className="p-1 bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-600"
                              title={isNominalAlreadyAdded(admin.total_per_admin, null, 'UWABA', uwabaTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* List Via */}
                        {admin.list_via && admin.list_via.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {admin.list_via.map((via, viaIndex) => (
                              <div
                                key={viaIndex}
                                className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    {via.via || 'Unknown'}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-500">
                                    ({via.jumlah_transaksi} transaksi)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    {formatCurrency(via.total_via)}
                                  </p>
                                  <button
                                    onClick={() => handleTambahFromUwaba(via.total_via, via.via, admin.admin_nama)}
                                    disabled={isNominalAlreadyAdded(via.total_via, via.via, 'UWABA', uwabaTanggal)}
                                    className="p-1 bg-teal-600 hover:bg-teal-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-teal-600"
                                    title={isNominalAlreadyAdded(via.total_via, via.via, 'UWABA', uwabaTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total Keseluruhan di Paling Bawah */}
                  <div className="bg-teal-600 dark:bg-teal-700 rounded-lg p-4 border border-teal-700 dark:border-teal-600">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">
                        Total Keseluruhan
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold text-white">
                          {formatCurrency(uwabaPendapatan)}
                        </p>
                        <button
                          onClick={() => handleTambahFromUwaba(uwabaPendapatan)}
                          disabled={isNominalAlreadyAdded(uwabaPendapatan, null, 'UWABA', uwabaTanggal)}
                          className="p-1.5 bg-white hover:bg-gray-100 text-teal-600 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                          title={isNominalAlreadyAdded(uwabaPendapatan, null, 'UWABA', uwabaTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Tidak ada data UWABA pada tanggal ini
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => {
                setShowUwabaModal(false)
                setUwabaTanggal(new Date().toISOString().split('T')[0])
                setUwabaPendapatan(0)
                setUwabaListAdmin([])
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Tunggakan Modal */}
      <Modal
        isOpen={showTunggakanModal}
        onClose={() => {
          setShowTunggakanModal(false)
          setTunggakanTanggal(new Date().toISOString().split('T')[0])
          setTunggakanPendapatan(0)
          setTunggakanListAdmin([])
        }}
        title="Pendapatan Tunggakan"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pilih Tanggal
            </label>
            <input
              type="date"
              value={tunggakanTanggal}
              onChange={handleTunggakanTanggalChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {loadingTunggakan ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
            </div>
          ) : (
            <>
              {/* List Admin */}
              {tunggakanListAdmin.length > 0 ? (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Detail per Admin ({tunggakanListAdmin.length} admin)
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                    {tunggakanListAdmin.map((admin, index) => (
                      <div
                        key={admin.id_admin || index}
                        className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                      >
                        {/* Header Admin */}
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {admin.admin_nama || 'Unknown'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {admin.jumlah_transaksi} transaksi
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-orange-600 dark:text-orange-400">
                              {formatCurrency(admin.total_per_admin)}
                            </p>
                            <button
                              onClick={() => handleTambahFromTunggakan(admin.total_per_admin, null, admin.admin_nama)}
                              disabled={isNominalAlreadyAdded(admin.total_per_admin, null, 'Tunggakan', tunggakanTanggal)}
                              className="p-1 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-600"
                              title={isNominalAlreadyAdded(admin.total_per_admin, null, 'Tunggakan', tunggakanTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* List Via */}
                        {admin.list_via && admin.list_via.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {admin.list_via.map((via, viaIndex) => (
                              <div
                                key={viaIndex}
                                className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    {via.via || 'Unknown'}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-500">
                                    ({via.jumlah_transaksi} transaksi)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    {formatCurrency(via.total_via)}
                                  </p>
                                  <button
                                    onClick={() => handleTambahFromTunggakan(via.total_via, via.via, admin.admin_nama)}
                                    disabled={isNominalAlreadyAdded(via.total_via, via.via, 'Tunggakan', tunggakanTanggal)}
                                    className="p-1 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-600"
                                    title={isNominalAlreadyAdded(via.total_via, via.via, 'Tunggakan', tunggakanTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total Keseluruhan di Paling Bawah */}
                  <div className="bg-orange-600 dark:bg-orange-700 rounded-lg p-4 border border-orange-700 dark:border-orange-600">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">
                        Total Keseluruhan
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold text-white">
                          {formatCurrency(tunggakanPendapatan)}
                        </p>
                        <button
                          onClick={() => handleTambahFromTunggakan(tunggakanPendapatan)}
                          disabled={isNominalAlreadyAdded(tunggakanPendapatan, null, 'Tunggakan', tunggakanTanggal)}
                          className="p-1.5 bg-white hover:bg-gray-100 text-orange-600 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                          title={isNominalAlreadyAdded(tunggakanPendapatan, null, 'Tunggakan', tunggakanTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Tidak ada data Tunggakan pada tanggal ini
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => {
                setShowTunggakanModal(false)
                setTunggakanTanggal(new Date().toISOString().split('T')[0])
                setTunggakanPendapatan(0)
                setTunggakanListAdmin([])
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Khusus Modal */}
      <Modal
        isOpen={showKhususModal}
        onClose={() => {
          setShowKhususModal(false)
          setKhususTanggal(new Date().toISOString().split('T')[0])
          setKhususPendapatan(0)
          setKhususListAdmin([])
        }}
        title="Pendapatan Khusus"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pilih Tanggal
            </label>
            <input
              type="date"
              value={khususTanggal}
              onChange={handleKhususTanggalChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loadingKhusus ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* List Admin */}
              {khususListAdmin.length > 0 ? (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Detail per Admin ({khususListAdmin.length} admin)
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                    {khususListAdmin.map((admin, index) => (
                      <div
                        key={admin.id_admin || index}
                        className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                      >
                        {/* Header Admin */}
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {admin.admin_nama || 'Unknown'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {admin.jumlah_transaksi} transaksi
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-blue-600 dark:text-blue-400">
                              {formatCurrency(admin.total_per_admin)}
                            </p>
                            <button
                              onClick={() => handleTambahFromKhusus(admin.total_per_admin, null, admin.admin_nama)}
                              disabled={isNominalAlreadyAdded(admin.total_per_admin, null, 'Khusus', khususTanggal)}
                              className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                              title={isNominalAlreadyAdded(admin.total_per_admin, null, 'Khusus', khususTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* List Via */}
                        {admin.list_via && admin.list_via.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {admin.list_via.map((via, viaIndex) => (
                              <div
                                key={viaIndex}
                                className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    {via.via || 'Unknown'}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-500">
                                    ({via.jumlah_transaksi} transaksi)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    {formatCurrency(via.total_via)}
                                  </p>
                                  <button
                                    onClick={() => handleTambahFromKhusus(via.total_via, via.via, admin.admin_nama)}
                                    disabled={isNominalAlreadyAdded(via.total_via, via.via, 'Khusus', khususTanggal)}
                                    className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                                    title={isNominalAlreadyAdded(via.total_via, via.via, 'Khusus', khususTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total Keseluruhan di Paling Bawah */}
                  <div className="bg-blue-600 dark:bg-blue-700 rounded-lg p-4 border border-blue-700 dark:border-blue-600">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">
                        Total Keseluruhan
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold text-white">
                          {formatCurrency(khususPendapatan)}
                        </p>
                        <button
                          onClick={() => handleTambahFromKhusus(khususPendapatan)}
                          disabled={isNominalAlreadyAdded(khususPendapatan, null, 'Khusus', khususTanggal)}
                          className="p-1.5 bg-white hover:bg-gray-100 text-blue-600 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                          title={isNominalAlreadyAdded(khususPendapatan, null, 'Khusus', khususTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Tidak ada data Khusus pada tanggal ini
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => {
                setShowKhususModal(false)
                setKhususTanggal(new Date().toISOString().split('T')[0])
                setKhususPendapatan(0)
                setKhususListAdmin([])
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Pendaftaran Modal */}
      <Modal
        isOpen={showPendaftaranModal}
        onClose={() => {
          setShowPendaftaranModal(false)
          setPendaftaranTanggal(new Date().toISOString().split('T')[0])
          setPendaftaranPendapatan(0)
          setPendaftaranListAdmin([])
        }}
        title="Pendapatan PSB"
        maxWidth="max-w-md"
      >
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Pilih Tanggal
            </label>
            <input
              type="date"
              value={pendaftaranTanggal}
              onChange={handlePendaftaranTanggalChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {loadingPendaftaran ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              {/* List Admin */}
              {pendaftaranListAdmin.length > 0 ? (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Detail per Admin ({pendaftaranListAdmin.length} admin)
                  </h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
                    {pendaftaranListAdmin.map((admin, index) => (
                      <div
                        key={admin.id_admin || index}
                        className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                      >
                        {/* Header Admin */}
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200 dark:border-gray-600">
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                              {admin.admin_nama || 'Unknown'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {admin.jumlah_transaksi} transaksi
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                              {formatCurrency(admin.total_per_admin)}
                            </p>
                            <button
                              onClick={() => handleTambahFromPendaftaran(admin.total_per_admin, null, admin.admin_nama)}
                              disabled={isNominalAlreadyAdded(admin.total_per_admin, null, 'PSB', pendaftaranTanggal)}
                              className="p-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                              title={isNominalAlreadyAdded(admin.total_per_admin, null, 'PSB', pendaftaranTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* List Via */}
                        {admin.list_via && admin.list_via.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {admin.list_via.map((via, viaIndex) => (
                              <div
                                key={viaIndex}
                                className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded px-2 py-1.5"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                    {via.via || 'Unknown'}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-500">
                                    ({via.jumlah_transaksi} transaksi)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                    {formatCurrency(via.total_via)}
                                  </p>
                                  <button
                                    onClick={() => handleTambahFromPendaftaran(via.total_via, via.via, admin.admin_nama)}
                                    disabled={isNominalAlreadyAdded(via.total_via, via.via, 'PSB', pendaftaranTanggal)}
                                    className="p-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                                    title={isNominalAlreadyAdded(via.total_via, via.via, 'PSB', pendaftaranTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Total Keseluruhan di Paling Bawah */}
                  <div className="bg-indigo-600 dark:bg-indigo-700 rounded-lg p-4 border border-indigo-700 dark:border-indigo-600">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">
                        Total Keseluruhan
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold text-white">
                          {formatCurrency(pendaftaranPendapatan)}
                        </p>
                        <button
                          onClick={() => handleTambahFromPendaftaran(pendaftaranPendapatan)}
                          disabled={isNominalAlreadyAdded(pendaftaranPendapatan, null, 'PSB', pendaftaranTanggal)}
                          className="p-1.5 bg-white hover:bg-gray-100 text-indigo-600 rounded transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
                          title={isNominalAlreadyAdded(pendaftaranPendapatan, null, 'PSB', pendaftaranTanggal) ? "Sudah ditambahkan" : "Tambah ke Pemasukan"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Tidak ada data PSB pada tanggal ini
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => {
                setShowPendaftaranModal(false)
                setPendaftaranTanggal(new Date().toISOString().split('T')[0])
                setPendaftaranPendapatan(0)
                setPendaftaranListAdmin([])
              }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Offcanvas */}
      <DetailOffcanvas
        isOpen={showPemasukanOffcanvas}
        onClose={() => {
          setShowPemasukanOffcanvas(false)
          setPemasukanDetail(null)
        }}
        title="Detail Pemasukan"
        detailData={pemasukanDetail}
        loading={loadingPemasukanDetail}
        type="pemasukan"
        formatCurrency={formatCurrency}
        formatDate={(dateString) => {
          if (!dateString) return '-'
          return new Date(dateString).toLocaleString('id-ID')
        }}
        formatHijriyahDate={(hijriyahString) => {
          if (!hijriyahString) return '-'
          const datePart = hijriyahString.substring(0, 10)
          const timePart = hijriyahString.length > 10 ? hijriyahString.substring(11) : null
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
        }}
        activeTab="masehi"
      />
    </div>
  )
}

export default Pemasukan

