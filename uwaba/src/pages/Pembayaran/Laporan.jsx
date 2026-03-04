import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { laporanAPI } from '../../services/api'
import { getTanggalFromAPI } from '../../utils/hijriDate'
import { useAuthStore } from '../../store/authStore'
import { 
  PrinterIcon, 
  FunnelIcon, 
  XMarkIcon,
  CalendarIcon,
  UserIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { getGambarUrl } from '../../config/images'

function Laporan() {
  const { user } = useAuthStore()
  
  // Helper untuk cek role - support multiple roles
  const hasRole = (roles) => {
    if (!user || !roles || !Array.isArray(roles)) {
      return false
    }
    
    // Cek dari all_roles (array semua role user) jika ada
    if (user.all_roles && Array.isArray(user.all_roles) && user.all_roles.length > 0) {
      const userRoles = user.all_roles.map(r => (r || '').toLowerCase()).filter(r => r)
      const allowedRoles = roles.map(r => r.toLowerCase())
      return userRoles.some(userRole => allowedRoles.includes(userRole))
    }
    
    // Fallback: cek role_key utama
    const userRole = (user.role_key || user.level || '').toLowerCase()
    return roles.map(r => r.toLowerCase()).includes(userRole)
  }
  
  // Tentukan tab yang bisa diakses berdasarkan role
  const hasUwabaRole = hasRole(['admin_uwaba', 'petugas_uwaba', 'super_admin'])
  const hasPsbRole = hasRole(['admin_psb', 'petugas_psb', 'super_admin'])
  
  const [mode, setMode] = useState('uwaba') // Default, akan di-update oleh useEffect
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [filteredData, setFilteredData] = useState([])
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [printInfo, setPrintInfo] = useState({ masehi: '', hijriyah: '', waktu: '' })
  
  // Filter states
  const [filterTanggal, setFilterTanggal] = useState('')
  const [filterAll, setFilterAll] = useState(false)
  const [filterTahunAjaran, setFilterTahunAjaran] = useState('')
  const [filterAdmin, setFilterAdmin] = useState('')
  const [filterNama, setFilterNama] = useState('')
  const [filterKeterangan, setFilterKeterangan] = useState('')
  
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
  
  // Set default mode berdasarkan role user saat user data tersedia
  useEffect(() => {
    if (!user) return
    
    // Tentukan default mode berdasarkan role
    if (hasPsbRole && !hasUwabaRole) {
      // Hanya PSB, default ke pendaftaran
      setMode('pendaftaran')
    } else if (hasUwabaRole && !hasPsbRole) {
      // Hanya UWABA, default ke uwaba
      setMode('uwaba')
    } else if (hasUwabaRole && hasPsbRole) {
      // Keduanya, default ke uwaba
      setMode('uwaba')
    }
  }, [user]) // Hanya trigger saat user berubah
  
  // Validasi mode sesuai role user saat mode atau role berubah
  useEffect(() => {
    if (!user) return
    
    // Jika mode tidak sesuai dengan role, ubah ke mode yang sesuai
    if ((mode === 'tunggakan' || mode === 'khusus' || mode === 'uwaba') && !hasUwabaRole) {
      // User tidak punya UWABA role, ubah ke pendaftaran jika punya PSB role
      if (hasPsbRole) {
        setMode('pendaftaran')
      }
    } else if (mode === 'pendaftaran' && !hasPsbRole) {
      // User tidak punya PSB role, ubah ke uwaba jika punya UWABA role
      if (hasUwabaRole) {
        setMode('uwaba')
      }
    }
  }, [mode, hasUwabaRole, hasPsbRole, user]) // Trigger saat mode atau role berubah

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
        admin: filterAdmin
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
    if (filterTanggal) { // Only load if tanggal is set
      loadLaporan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, filterTanggal, filterAll, filterTahunAjaran, filterAdmin])

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
  }, [data, filterNama, filterKeterangan])

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
    let totalAll = 0
    
    filteredData.forEach(row => {
      const nominal = parseInt((row.nominal || '').replace(/[^\d]/g, '')) || 0
      if (row.via === 'Cash') totalCash += nominal
      else if (row.via === 'TF') totalTF += nominal
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
    
    return { totalCash, totalTF, totalLembaga, totalBeasiswa, totalBagDIS, totalPIP, totalKIP, totalAdiktis, totalPemKab, totalSubsidi, totalPrestasi, totalAll }
  }, [filteredData])

  const getKeteranganJenisData = () => {
    if (mode === 'tunggakan') return 'Data Tunggakan'
    if (mode === 'khusus') return 'Data Khusus'
    if (mode === 'uwaba') return 'Data UWABA'
    if (mode === 'pendaftaran') return 'Data Pendaftaran'
    return ''
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden laporan-container print:h-auto print:min-h-0 print:overflow-visible">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 p-4 sm:p-6 lg:p-8 pb-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-4">
          <div className="flex items-center gap-4">
            <img 
              src={getGambarUrl('/uwaba-4.png')} 
              alt="Logo" 
              className="h-11 w-auto max-w-[70px] object-contain" 
            />
            <div>
              <h1 className="text-2xl font-bold text-teal-600">Laporan Pembayaran</h1>
              <div className="text-sm font-semibold text-teal-700 mt-1">
                {getKeteranganJenisData()}
              </div>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            {/* Tab Tunggakan - hanya untuk UWABA role */}
            {hasUwabaRole && (
              <button
                onClick={() => setMode('tunggakan')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'tunggakan'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200'
                }`}
              >
                Tunggakan
              </button>
            )}
            {/* Tab Khusus - hanya untuk UWABA role */}
            {hasUwabaRole && (
              <button
                onClick={() => setMode('khusus')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'khusus'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200'
                }`}
              >
                Khusus
              </button>
            )}
            {/* Tab UWABA - hanya untuk UWABA role */}
            {hasUwabaRole && (
              <button
                onClick={() => setMode('uwaba')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'uwaba'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200'
                }`}
              >
                UWABA
              </button>
            )}
            {/* Tab Pendaftaran - hanya untuk PSB role */}
            {hasPsbRole && (
              <button
                onClick={() => setMode('pendaftaran')}
                className={`px-4 py-2 rounded-t-lg font-semibold transition ${
                  mode === 'pendaftaran'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-teal-600 hover:bg-gray-200'
                }`}
              >
                Pendaftaran
              </button>
            )}
          </div>
        </div>
        </motion.div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 pt-2 print:flex-none print:h-auto print:overflow-visible print:min-h-0">
        {/* Print Info */}
        <div className="text-xs text-gray-500 text-center mb-4 print:block">
          <span>Tanggal Cetak (Masehi): <b>{printInfo.masehi}</b></span> &nbsp;|&nbsp;
          <span>Tanggal Cetak (Hijriyah): <b>{printInfo.hijriyah}</b></span> &nbsp;|&nbsp;
          <span>Waktu: <b>{printInfo.waktu}</b></span>
        </div>

        {/* Summary Box */}
        {filteredData.length > 0 && (
          <div className="mb-6 print:mb-4">
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via Cash</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalCash.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via TF</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalTF.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via Lembaga</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalLembaga.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via Beasiswa</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalBeasiswa.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via BagDIS</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalBagDIS.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via PIP</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalPIP.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via KIP</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalKIP.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via Adiktis</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalAdiktis.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via PemKab</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalPemKab.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via Subsidi</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalSubsidi.toLocaleString('id')}
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-xl shadow-md p-3">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500">via Prestasi</div>
                    <div className="text-lg font-bold text-teal-600">
                      Rp {totals.totalPrestasi.toLocaleString('id')}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-row">
                <div className="flex-1 min-w-[140px] bg-white rounded-xl shadow-md p-4 text-center border-2 border-amber-500">
                  <div className="text-xs text-gray-500 mb-0.5">Total Keseluruhan</div>
                  <div className="text-2xl font-bold text-amber-600">
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
          className="fixed z-50 bottom-20 right-6 bg-teal-600 text-white rounded-full shadow-lg w-14 h-14 flex items-center justify-center text-3xl hover:bg-teal-700 transition print:hidden"
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
              className="fixed z-50 bottom-20 right-6 bg-white rounded-2xl shadow-2xl p-5 w-80 max-w-[95vw] border border-teal-200 flex flex-col gap-3 print:hidden"
              style={{ boxShadow: '0 8px 32px 0 rgba(34,34,59,0.18)' }}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="font-semibold text-teal-700 text-base">Filter & Print</div>
                <button
                  onClick={() => setShowFilterPanel(false)}
                  className="text-gray-400 hover:text-teal-600 text-2xl leading-none"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              {/* Tahun Ajaran */}
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm text-gray-700 block mb-1">Tahun Ajaran</label>
                  <select
                    value={filterTahunAjaran}
                    onChange={(e) => setFilterTahunAjaran(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
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
                <CalendarIcon className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-sm text-gray-700">Tanggal</label>
                    <input
                      type="checkbox"
                      id="filterAll"
                      checked={filterAll}
                      onChange={(e) => {
                        setFilterAll(e.target.checked)
                      }}
                      className="ml-2"
                    />
                    <label htmlFor="filterAll" className="text-sm text-gray-700 cursor-pointer">
                      Tampilkan Semua
                    </label>
                  </div>
                  <input
                    type="date"
                    value={filterTanggal}
                    onChange={(e) => setFilterTanggal(e.target.value)}
                    disabled={filterAll}
                    className={`border rounded px-2 py-1 text-sm w-full ${
                      filterAll ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
                    }`}
                  />
                </div>
              </div>

              {/* Admin */}
              <div className="flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm text-gray-700 block mb-1">Admin</label>
                  <select
                    value={filterAdmin}
                    onChange={(e) => setFilterAdmin(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                  >
                    <option value="">Semua</option>
                    {adminOptions.map(admin => (
                      <option key={admin} value={admin}>{admin}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cari */}
              <div className="flex items-center gap-2">
                <MagnifyingGlassIcon className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm text-gray-700 block mb-1">Cari</label>
                  <input
                    type="text"
                    value={filterNama}
                    onChange={(e) => setFilterNama(e.target.value)}
                    placeholder="Ketik nama santri atau keterangan..."
                    className="border rounded px-2 py-1 text-sm w-full"
                  />
                </div>
              </div>

              {/* Keterangan */}
              <div className="flex items-center gap-2">
                <DocumentTextIcon className="w-5 h-5 text-teal-600 flex-shrink-0" />
                <div className="flex-1">
                  <label className="text-sm text-gray-700 block mb-1">Keterangan</label>
                  <select
                    value={filterKeterangan}
                    onChange={(e) => setFilterKeterangan(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                  >
                    <option value="">Semua Keterangan</option>
                    {keteranganOptions.map(ket => (
                      <option key={ket} value={ket}>{ket}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Print Button */}
              <button
                onClick={handlePrint}
                className="mt-2 px-4 py-2 bg-teal-600 text-white rounded-lg shadow hover:bg-teal-700 transition font-semibold flex items-center gap-2 justify-center"
              >
                <PrinterIcon className="w-5 h-5" />
                Print
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Table Container - Horizontal Scroll Only */}
        <div className="overflow-x-auto overflow-y-visible bg-white rounded-lg shadow-md print:max-h-none print:overflow-visible print:shadow-none print:h-auto print:min-h-0">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Memuat data...</div>
          ) : filteredData.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Tidak ada data</div>
          ) : (
            <table className="w-full text-sm border-collapse laporan-print">
              <thead className="sticky top-0 z-10 print:static print:z-auto">
                <tr>
                  <th className="bg-teal-600 text-white px-3 py-2 border border-gray-300 font-bold">No</th>
                  <th className="bg-teal-600 text-white px-3 py-2 border border-gray-300 font-bold">Nama Santri</th>
                  <th className="bg-teal-600 text-white px-3 py-2 border border-gray-300 font-bold">Nominal</th>
                  <th className="bg-teal-600 text-white px-3 py-2 border border-gray-300 font-bold">Via</th>
                  <th className="bg-teal-600 text-white px-3 py-2 border border-gray-300 font-bold">Keterangan</th>
                  <th className="bg-teal-600 text-white px-3 py-2 border border-gray-300 font-bold">Admin</th>
                  <th className="bg-teal-600 text-white px-3 py-2 border border-gray-300 font-bold">Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => (
                  <tr key={index} className="hover:bg-teal-50 even:bg-gray-50">
                    <td className="text-center px-3 py-2 border border-gray-300">{index + 1}</td>
                    <td className="px-3 py-2 border border-gray-300">
                      {(row.nis ?? row.id_santri) ? `${row.nis ?? row.id_santri} - ${row.nama_santri}` : row.nama_santri}
                    </td>
                    <td className="text-right px-3 py-2 border border-gray-300">{row.nominal}</td>
                    <td className="text-center px-3 py-2 border border-gray-300">{row.via}</td>
                    <td 
                      className="text-left px-3 py-2 border border-gray-300 max-w-[200px] truncate" 
                      title={row.keterangan_1 || '-'}
                    >
                      {row.keterangan_1 || '-'}
                    </td>
                    <td className="text-left px-3 py-2 border border-gray-300">{row.admin || '-'}</td>
                    <td className="text-center px-3 py-2 border border-gray-300">
                      <div className="text-xs text-gray-600 mb-1">{row.hijriyah || '-'}</div>
                      <div className="text-xs text-gray-500">{row.tanggal_dibuat || '-'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

export default Laporan
