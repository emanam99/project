import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { umrohJamaahAPI } from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'

function Jamaah() {
  const navigate = useNavigate()
  const { showNotification } = useNotification()
  const [jamaahList, setJamaahList] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState({
    status: '',
    status_keberangkatan: '',
    status_pembayaran: '',
    paket_umroh: ''
  })
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0
  })

  // Fetch data jamaah
  const fetchJamaah = async () => {
    try {
      setLoading(true)
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      }
      if (searchInput) {
        params.search = searchInput
      }
      
      const response = await umrohJamaahAPI.getAll(params)
      if (response.success) {
        setJamaahList(response.data || [])
        setPagination(response.pagination || pagination)
      }
    } catch (error) {
      console.error('Error fetching jamaah:', error)
      showNotification('Gagal memuat data jamaah', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchJamaah()
  }, [pagination.page, filters, searchInput])

  const handleSearchInputChange = (e) => {
    setSearchInput(e.target.value)
    setPagination(prev => ({ ...prev, page: 1 }))
  }

  const handleSearchInputFocus = () => {
    setIsInputFocused(true)
  }

  const handleSearchInputBlur = () => {
    setIsInputFocused(false)
  }

  const handleFilterToggle = () => {
    setIsFilterOpen(!isFilterOpen)
  }

  const handleRefresh = () => {
    fetchJamaah()
  }

  const handleCreate = () => {
    navigate('/umroh/jamaah/create')
  }

  const handleRowClick = (id) => {
    navigate(`/umroh/jamaah/${id}/edit`)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6">
      {/* Search and Filter Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
        {/* Search Input dengan tombol di kanan */}
        <div className="relative pb-2 px-4 pt-3">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={handleSearchInputChange}
              onFocus={handleSearchInputFocus}
              onBlur={handleSearchInputBlur}
              className="w-full p-2 pr-24 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Cari nama, kode, NIK, atau paspor..."
            />
            {/* Tombol Filter dan Refresh di kanan */}
            <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
              <button
                onClick={handleFilterToggle}
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
                onClick={handleRefresh}
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
                    value={filters.status}
                    onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  >
                    <option value="">Status</option>
                    <option value="Aktif">Aktif</option>
                    <option value="Nonaktif">Nonaktif</option>
                    <option value="Selesai">Selesai</option>
                    <option value="Batal">Batal</option>
                  </select>

                  <select
                    value={filters.status_keberangkatan}
                    onChange={(e) => setFilters(prev => ({ ...prev, status_keberangkatan: e.target.value }))}
                    className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  >
                    <option value="">Keberangkatan</option>
                    <option value="Belum Berangkat">Belum Berangkat</option>
                    <option value="Sudah Berangkat">Sudah Berangkat</option>
                    <option value="Sudah Pulang">Sudah Pulang</option>
                    <option value="Batal">Batal</option>
                  </select>

                  <select
                    value={filters.status_pembayaran}
                    onChange={(e) => setFilters(prev => ({ ...prev, status_pembayaran: e.target.value }))}
                    className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  >
                    <option value="">Pembayaran</option>
                    <option value="Belum Lunas">Belum Lunas</option>
                    <option value="Lunas">Lunas</option>
                    <option value="Kredit">Kredit</option>
                  </select>

                  <input
                    type="text"
                    value={filters.paket_umroh}
                    onChange={(e) => setFilters(prev => ({ ...prev, paket_umroh: e.target.value }))}
                    placeholder="Paket Umroh"
                    className="border rounded p-1 h-7 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Create Button */}
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Tambah Jamaah
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Memuat data...</p>
          </div>
        ) : jamaahList.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-600 dark:text-gray-400">Tidak ada data jamaah</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Kode
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Nama Lengkap
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      NIK
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Paket
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Tabungan
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {jamaahList.map((jamaah) => (
                    <tr
                      key={jamaah.id}
                      onClick={() => handleRowClick(jamaah.id)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {jamaah.kode_jamaah || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {jamaah.nama_lengkap}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {jamaah.nik || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {jamaah.paket_umroh || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          jamaah.status === 'Aktif' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          jamaah.status === 'Selesai' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          jamaah.status === 'Batal' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                        }`}>
                          {jamaah.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(jamaah.total_tabungan || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.total_pages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Menampilkan {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} dari {pagination.total}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Sebelumnya
                  </button>
                  <button
                    onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.total_pages}
                    className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Selanjutnya
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}

export default Jamaah

