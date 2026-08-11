import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { laporanAPI } from '../../services/api'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import { useAuthStore } from '../../store/authStore'
import { useLaporanFiturAccess } from '../../hooks/useLaporanFiturAccess'
import {
  PrinterIcon,
  FunnelIcon,
  XMarkIcon,
  CalendarIcon,
  UserIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon
} from '@heroicons/react/24/outline'
import LaporanPrintOffcanvas from './components/LaporanPrintOffcanvas'

/** Selaras backend ViaPembayaranHelper (varian iPayMu tanpa membedakan case/spasi). */
function isIpaymuViaLabel(v) {
  if (v == null || v === '' || v === '-') return false
  return String(v).replace(/[\s_-]/g, '').toLowerCase() === 'ipaymu'
}

function Laporan() {
  const { user } = useAuthStore()
  const {
    tabTunggakan,
    tabKhusus,
    tabUwaba,
    tabPendaftaran,
    apiHasLaporanTabs,
    noTabAccess,
    hasUwabaLaporanGroup,
    hasPsbLaporanGroup
  } = useLaporanFiturAccess()
  
  const [mode, setMode] = useState('uwaba') // Default, akan di-update oleh useEffect
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [showPrintOffcanvas, setShowPrintOffcanvas] = useState(false)
  const [printInfo, setPrintInfo] = useState({ masehi: '', hijriyah: '', waktu: '' })
  
  // Filter states
  const [filterTanggal, setFilterTanggal] = useState('')
  const [filterAll, setFilterAll] = useState(false)
  const [filterTahunAjaran, setFilterTahunAjaran] = useState('')
  const [filterAdmins, setFilterAdmins] = useState([])
  const [filterNama, setFilterNama] = useState('')
  const [filterKeterangan, setFilterKeterangan] = useState('')
  const [showAdminChecklist, setShowAdminChecklist] = useState(false)
  const adminChecklistRef = useRef(null)
  
  // Filter options (populated from data)
  const [adminOptions, setAdminOptions] = useState([])
  const [tahunAjaranOptions, setTahunAjaranOptions] = useState([])
  const [keteranganOptions, setKeteranganOptions] = useState([])

  // Set default tanggal hari ini
  useEffect(() => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    setFilterTanggal(`${yyyy}-${mm}-${dd}`)
  }, [])
  
  /** Urutan fallback tab UWABA lalu PSB */
  const firstAllowedMode = useMemo(() => {
    if (hasUwabaLaporanGroup) {
      if (tabUwaba) return 'uwaba'
      if (tabTunggakan) return 'tunggakan'
      if (tabKhusus) return 'khusus'
    }
    if (hasPsbLaporanGroup && tabPendaftaran) return 'pendaftaran'
    return null
  }, [
    hasUwabaLaporanGroup,
    hasPsbLaporanGroup,
    tabUwaba,
    tabTunggakan,
    tabKhusus,
    tabPendaftaran
  ])

  // Default & koreksi mode: kode fitur dari /me/fitur-menu + matriks Pengaturan → Fitur
  useEffect(() => {
    if (!user) return

    const uwabaModes = ['tunggakan', 'khusus', 'uwaba']
    const modeAllowed = () => {
      if (mode === 'pendaftaran') return hasPsbLaporanGroup && tabPendaftaran
      if (uwabaModes.includes(mode)) {
        if (!hasUwabaLaporanGroup) return false
        if (mode === 'tunggakan') return tabTunggakan
        if (mode === 'khusus') return tabKhusus
        if (mode === 'uwaba') return tabUwaba
      }
      return false
    }

    if (modeAllowed()) return

    if (firstAllowedMode) {
      setMode(firstAllowedMode)
      return
    }

    if (apiHasLaporanTabs) {
      return
    }

    if (hasPsbLaporanGroup && !hasUwabaLaporanGroup) setMode('pendaftaran')
    else if (hasUwabaLaporanGroup && !hasPsbLaporanGroup) setMode('uwaba')
    else if (hasUwabaLaporanGroup && hasPsbLaporanGroup) setMode('uwaba')
  }, [
    user,
    mode,
    hasUwabaLaporanGroup,
    hasPsbLaporanGroup,
    tabTunggakan,
    tabKhusus,
    tabUwaba,
    tabPendaftaran,
    firstAllowedMode,
    apiHasLaporanTabs
  ])

  // Load print info
  useEffect(() => {
    const loadPrintInfo = async () => {
      const { hijriyah } = await getTanggalFromAPI()
      const now = new Date()
      const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
      const hari = hariArr[now.getDay()]
      const tgl = now.toLocaleDateString('id-ID')
      const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      
      setPrintInfo({
        masehi: `${hari}, ${tgl}`,
        hijriyah: hijriyah || '-',
        waktu: jam
      })
    }
    loadPrintInfo()
  }, [])

  // Load laporan data
  const loadLaporan = async () => {
    setLoading(true)
    try {
      const filters = {
        tanggal: filterTanggal,
        showAll: filterAll,
        tahun_ajaran: filterTahunAjaran,
        admin: ''
      }
      
      const response = await laporanAPI.getLaporan(mode, filters)
      
      if (response.success) {
        setData(response.data || [])
        
        // Populate filter options
        const admins = Array.from(new Set(response.data.map(row => row.admin).filter(Boolean)))
        const tahunAjarans = Array.from(new Set(response.data.map(row => row.tahun_ajaran).filter(Boolean)))
        const keterangans = Array.from(new Set(response.data.map(row => row.keterangan_1).filter(Boolean)))
        
        setAdminOptions(admins)
        setTahunAjaranOptions(tahunAjarans)
        setKeteranganOptions(keterangans)
      } else {
        console.error('Failed to load laporan:', response.message)
        setData([])
      }
    } catch (error) {
      console.error('Error loading laporan:', error)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  // Load data when mode or filters change
  useEffect(() => {
    if (noTabAccess) {
      setData([])
      setFilteredData([])
      return
    }
    if (filterTanggal) {
      loadLaporan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filterTanggal, filterAll, filterTahunAjaran, noTabAccess])

  // Filter data based on nama and keterangan
  useEffect(() => {
    let filtered = [...data]
    
    // Filter by nama
    if (filterNama.trim()) {
      const query = filterNama.trim().toLowerCase()
      filtered = filtered.filter(row => 
        (row.nama_santri || '').toLowerCase().includes(query) ||
        (row.keterangan_1 || '').toLowerCase().includes(query)
      )
    }

    // Filter by multi admin checkbox
    if (filterAdmins.length > 0) {
      const selectedAdmins = new Set(filterAdmins)
      filtered = filtered.filter(row => selectedAdmins.has(row.admin || ''))
    }
    
    // Filter by keterangan dropdown
    if (filterKeterangan) {
      filtered = filtered.filter(row => (row.keterangan_1 || '') === filterKeterangan)
    }
    
    // Sort by tanggal_dibuat ascending
    filtered.sort((a, b) => {
      if (a.tanggal_dibuat < b.tanggal_dibuat) return -1
      if (a.tanggal_dibuat > b.tanggal_dibuat) return 1
      return 0
    })
    
    setFilteredData(filtered)
  }, [data, filterNama, filterKeterangan, filterAdmins])

  // Calculate totals
  const totals = useMemo(() => {
    let totalCash = 0
    let totalTF = 0
    let totalLembaga = 0
    let totalBeasiswa = 0
    let totalBagDIS = 0
    let totalPIP = 0
    let totalKIP = 0
    let totalAdiktis = 0
    let totalPemKab = 0
    let totalSubsidi = 0
    let totalPrestasi = 0
    let totalIPayMu = 0
    let totalAll = 0
    
    filteredData.forEach(row => {
      const nominal = parseInt((row.nominal || '').replace(/[^\d]/g, '')) || 0
      if (row.via === 'Cash') totalCash += nominal
      else if (row.via === 'TF') totalTF += nominal
      else if (row.via === 'iPayMu' || isIpaymuViaLabel(row.via)) totalIPayMu += nominal
      else if (row.via === 'Lembaga') totalLembaga += nominal
      else if (row.via === 'Beasiswa') totalBeasiswa += nominal
      else if (row.via === 'BagDIS') totalBagDIS += nominal
      else if (row.via === 'PIP') totalPIP += nominal
      else if (row.via === 'KIP') totalKIP += nominal
      else if (row.via === 'Adiktis') totalAdiktis += nominal
      else if (row.via === 'PemKab') totalPemKab += nominal
      else if (row.via === 'Subsidi') totalSubsidi += nominal
      else if (row.via === 'Prestasi') totalPrestasi += nominal
      totalAll += nominal
    })
    
    return {
      totalCash,
      totalTF,
      totalIPayMu,
      totalLembaga,
      totalBeasiswa,
      totalBagDIS,
      totalPIP,
      totalKIP,
      totalAdiktis,
      totalPemKab,
      totalSubsidi,
      totalPrestasi,
      totalAll,
    }
  }, [filteredData])

  const getKeteranganJenisData = () => {
    if (mode === 'tunggakan') return 'Data Tunggakan'
    if (mode === 'khusus') return 'Data Khusus'
    if (mode === 'uwaba') return 'Data UWABA'
    if (mode === 'pendaftaran') return 'Data Pendaftaran'
    return ''
  }

  const openPrintPreview = () => {
    setShowFilterPanel(false)
    setShowAdminChecklist(false)
    setShowPrintOffcanvas(true)
  }

  const toggleAdmin = (adminName) => {
    setFilterAdmins((prev) => {
      if (prev.includes(adminName)) return prev.filter((a) => a !== adminName)
      return [...prev, adminName]
    })
  }

  const allAdminsSelected = adminOptions.length > 0 && filterAdmins.length === adminOptions.length
  const filterAdminButtonLabel = useMemo(() => {
    if (filterAdmins.length === 0) return 'Semua Admin'
    if (allAdminsSelected) return `Semua Admin (${adminOptions.length})`
    if (filterAdmins.length === 1) return filterAdmins[0]
    if (filterAdmins.length === 2) return `${filterAdmins[0]}, ${filterAdmins[1]}`
    return `${filterAdmins[0]}, ${filterAdmins[1]} +${filterAdmins.length - 2}`
  }, [filterAdmins, allAdminsSelected, adminOptions.length])

  useEffect(() => {
    if (!showAdminChecklist) return
    const handleClickOutside = (event) => {
      if (adminChecklistRef.current && !adminChecklistRef.current.contains(event.target)) {
        setShowAdminChecklist(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAdminChecklist])

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-gray-50 dark:bg-gray-900/40 text-gray-900 dark:text-gray-100">
      {/* Tab jenis laporan (judul & logo ada di preview cetak) */}
      <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex gap-2 flex-wrap"
        >
            {hasUwabaLaporanGroup && tabTunggakan && (
              <button
                onClick={() => setMode('tunggakan')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'tunggakan'
                    ? 'bg-teal-600 text-white dark:bg-teal-500'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-teal-400 dark:hover:bg-gray-700'
                }`}
              >
                Tunggakan
              </button>
            )}
            {hasUwabaLaporanGroup && tabKhusus && (
              <button
                onClick={() => setMode('khusus')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'khusus'
                    ? 'bg-teal-600 text-white dark:bg-teal-500'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-teal-400 dark:hover:bg-gray-700'
                }`}
              >
                Khusus
              </button>
            )}
            {hasUwabaLaporanGroup && tabUwaba && (
              <button
                onClick={() => setMode('uwaba')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'uwaba'
                    ? 'bg-teal-600 text-white dark:bg-teal-500'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-teal-400 dark:hover:bg-gray-700'
                }`}
              >
                UWABA
              </button>
            )}
            {hasPsbLaporanGroup && tabPendaftaran && (
              <button
                onClick={() => setMode('pendaftaran')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'pendaftaran'
                    ? 'bg-teal-600 text-white dark:bg-teal-500'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-teal-400 dark:hover:bg-gray-700'
                }`}
              >
                Pendaftaran
              </button>
            )}
        </motion.div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 pt-2">
        {noTabAccess && (
          <div
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-100"
            role="alert"
          >
            Tidak ada jenis laporan yang diaktifkan untuk peran Anda. Atur centang aksi tab di menu{' '}
            <strong>Laporan</strong> pada halaman Pengaturan → Fitur, atau hubungi administrator.
          </div>
        )}
        {/* Print Info */}
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center mb-4">
          <span>Tanggal Cetak (Masehi): <b>{printInfo.masehi}</b></span> &nbsp;|&nbsp;
          <span>Tanggal Cetak (Hijriyah): <b>{printInfo.hijriyah}</b></span> &nbsp;|&nbsp;
          <span>Waktu: <b>{printInfo.waktu}</b></span>
        </div>

        {/* Summary Box */}
        {filteredData.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via Cash</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalCash.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via TF</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalTF.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via iPayMu</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalIPayMu.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via Lembaga</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalLembaga.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via Beasiswa</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalBeasiswa.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via BagDIS</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalBagDIS.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via PIP</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalPIP.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via KIP</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalKIP.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via Adiktis</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalAdiktis.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via PemKab</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalPemKab.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via Subsidi</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalSubsidi.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 border border-gray-100 dark:border-gray-700 p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">via Prestasi</div>
                    <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                      Rp {totals.totalPrestasi.toLocaleString('id')}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-row">
                <div className="flex-1 min-w-[140px] bg-white dark:bg-gray-800/90 rounded-xl shadow-md dark:shadow-gray-900/30 p-4 text-center border-2 border-amber-500 dark:border-amber-400">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Total Keseluruhan</div>
                  <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    Rp {totals.totalAll.toLocaleString('id')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Floating Filter Button */}
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className="fixed z-50 bottom-20 right-6 bg-teal-600 dark:bg-teal-500 text-white rounded-full shadow-lg w-14 h-14 flex items-center justify-center hover:bg-teal-700 dark:hover:bg-teal-600 transition"
          style={{ boxShadow: '0 4px 24px 0 rgba(34,34,59,0.18)' }}
          title="Filter & Print"
        >
          <FunnelIcon className="w-8 h-8" />
        </button>

        {/* Filter Panel */}
        <AnimatePresence>
          {showFilterPanel && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.3 }}
              className="fixed z-50 bottom-20 right-6 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-5 w-80 max-w-[95vw] border border-teal-200 dark:border-gray-600 flex flex-col gap-3"
              style={{ boxShadow: '0 8px 32px 0 rgba(34,34,59,0.18)' }}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-teal-700 dark:text-teal-400 text-base">Filter & cetak</div>
                <button
                  type="button"
                  onClick={() => setShowFilterPanel(false)}
                  className="text-gray-400 hover:text-teal-600 dark:hover:text-teal-400 text-2xl leading-none rounded-lg p-1 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Tahun Ajaran */}
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm text-gray-700 dark:text-gray-300 block mb-1">Tahun Ajaran</label>
                  <select
                    value={filterTahunAjaran}
                    onChange={(e) => setFilterTahunAjaran(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Semua Tahun Ajaran</option>
                    {tahunAjaranOptions.map(ta => (
                      <option key={ta} value={ta}>{ta}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tanggal */}
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <label className="text-sm text-gray-700 dark:text-gray-300">Tanggal</label>
                    <input
                      type="checkbox"
                      id="filterAll"
                      checked={filterAll}
                      onChange={(e) => {
                        setFilterAll(e.target.checked)
                      }}
                      className="ml-2 rounded border-gray-300 dark:border-gray-600 text-teal-600"
                    />
                    <label htmlFor="filterAll" className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      Tampilkan Semua
                    </label>
                  </div>
                  <input
                    type="date"
                    value={filterTanggal}
                    onChange={(e) => setFilterTanggal(e.target.value)}
                    disabled={filterAll}
                    className={`border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ${
                      filterAll
                        ? 'bg-gray-100 dark:bg-gray-800/80 text-gray-400 cursor-not-allowed'
                        : ''
                    }`}
                  />
                </div>
              </div>

              {/* Admin */}
              <div className="flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <div className="flex-1 relative" ref={adminChecklistRef}>
                  <label className="text-sm text-gray-700 dark:text-gray-300 block mb-1">Admin</label>
                  <button
                    type="button"
                    onClick={() => setShowAdminChecklist((v) => !v)}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-left"
                  >
                    {filterAdminButtonLabel}
                  </button>
                  {showAdminChecklist && (
                    <div className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 p-2 shadow-xl">
                      <label className="flex items-center gap-2 py-1 text-sm text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700 mb-1">
                        <input
                          type="checkbox"
                          checked={allAdminsSelected}
                          onChange={(e) => {
                            if (e.target.checked) setFilterAdmins([...adminOptions])
                            else setFilterAdmins([])
                            setShowAdminChecklist(false)
                          }}
                          className="rounded border-gray-300 dark:border-gray-600 text-teal-600"
                        />
                        Pilih Semua
                      </label>
                      {adminOptions.length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400 py-1">Tidak ada admin</div>
                      ) : (
                        adminOptions.map((admin) => (
                          <label key={admin} className="flex items-center gap-2 py-1 text-sm text-gray-700 dark:text-gray-300">
                            <input
                              type="checkbox"
                              checked={filterAdmins.includes(admin)}
                              onChange={() => toggleAdmin(admin)}
                              className="rounded border-gray-300 dark:border-gray-600 text-teal-600"
                            />
                            {admin}
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Cari */}
              <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm text-gray-700 dark:text-gray-300 block mb-1">Cari</label>
                  <input
                    type="text"
                    value={filterNama}
                    onChange={(e) => setFilterNama(e.target.value)}
                    placeholder="Ketik nama santri atau keterangan..."
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
              </div>

              {/* Keterangan */}
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm text-gray-700 dark:text-gray-300 block mb-1">Keterangan</label>
                  <select
                    value={filterKeterangan}
                    onChange={(e) => setFilterKeterangan(e.target.value)}
                    className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Semua Keterangan</option>
                    {keteranganOptions.map(ket => (
                      <option key={ket} value={ket}>{ket}</option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={openPrintPreview}
                disabled={noTabAccess}
                className="mt-2 px-4 py-2 bg-teal-600 dark:bg-teal-500 text-white rounded-lg shadow hover:bg-teal-700 dark:hover:bg-teal-600 transition font-semibold flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PrinterIcon className="w-5 h-5" />
                Buka preview cetak
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table Container - Horizontal Scroll Only */}
        <div className="overflow-x-auto overflow-y-visible bg-white dark:bg-gray-800/90 rounded-lg shadow-md dark:shadow-gray-900/30 border border-gray-200 dark:border-gray-700">
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Memuat data...</div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Tidak ada data</div>
          ) : (
            <table className="w-full text-sm border-collapse laporan-print">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-teal-600 dark:bg-teal-700 text-white px-3 py-2 border border-teal-700/80 dark:border-teal-600 font-bold">No</th>
                  <th className="bg-teal-600 dark:bg-teal-700 text-white px-3 py-2 border border-teal-700/80 dark:border-teal-600 font-bold">Nama Santri</th>
                  <th className="bg-teal-600 dark:bg-teal-700 text-white px-3 py-2 border border-teal-700/80 dark:border-teal-600 font-bold">Nominal</th>
                  <th className="bg-teal-600 dark:bg-teal-700 text-white px-3 py-2 border border-teal-700/80 dark:border-teal-600 font-bold">Via</th>
                  <th className="bg-teal-600 dark:bg-teal-700 text-white px-3 py-2 border border-teal-700/80 dark:border-teal-600 font-bold">Keterangan</th>
                  <th className="bg-teal-600 dark:bg-teal-700 text-white px-3 py-2 border border-teal-700/80 dark:border-teal-600 font-bold">Admin</th>
                  <th className="bg-teal-600 dark:bg-teal-700 text-white px-3 py-2 border border-teal-700/80 dark:border-teal-600 font-bold">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <tr
                    key={index}
                    className="hover:bg-teal-50/80 dark:hover:bg-teal-900/20 even:bg-gray-50/90 dark:even:bg-gray-700/25"
                  >
                    <td className="text-center px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100">
                      {(row.nis ?? row.id_santri) ? `${row.nis ?? row.id_santri} - ${row.nama_santri}` : row.nama_santri}
                    </td>
                    <td className="text-right px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100">
                      {row.nominal}
                    </td>
                    <td className="text-center px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100">
                      {row.via}
                    </td>
                    <td
                      className="text-left px-3 py-2 border border-gray-200 dark:border-gray-600 max-w-[200px] truncate text-gray-800 dark:text-gray-100"
                      title={row.keterangan_1 || '-'}
                    >
                      {row.keterangan_1 || '-'}
                    </td>
                    <td className="text-left px-3 py-2 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-100">
                      {row.admin || '-'}
                    </td>
                    <td className="text-center px-3 py-2 border border-gray-200 dark:border-gray-600">
                      <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">{row.hijriyah || '-'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{row.tanggal_dibuat || '-'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <LaporanPrintOffcanvas
        isOpen={showPrintOffcanvas}
        onClose={() => setShowPrintOffcanvas(false)}
        jenisLabel={getKeteranganJenisData()}
        printInfo={printInfo}
        totals={totals}
        filteredData={filteredData}
      />
    </div>
  )
}

export default Laporan
