import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI } from '../../services/api'
import api from '../../services/api'
import * as XLSX from 'xlsx'

// Memoized Search and Filter Section - filter Tipe, Role, Lembaga, Lembaga (Jabatan) + Export
const SearchAndFilterSection = memo(({
  searchInput,
  onSearchInputChange,
  onSearchInputFocus,
  onSearchInputBlur,
  isInputFocused,
  isFilterOpen,
  onFilterToggle,
  onExportClick,
  typeFilter,
  onTypeFilterChange,
  roleFilter,
  onRoleFilterChange,
  lembagaFilter,
  onLembagaFilterChange,
  jabatanLembagaFilter,
  onJabatanLembagaFilterChange,
  rolesList,
  lembagaList
}) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      {/* Search Input dengan tombol Filter dan Export di kanan */}
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            className="w-full p-2 pr-28 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari username, nama, atau email..."
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <button
              onClick={onExportClick}
              className="bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-800/50 text-green-800 dark:text-green-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors pointer-events-auto"
              title="Export ke Excel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export
            </button>
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
          </div>
        </div>
        {/* Border bawah yang sampai ke kanan */}
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
        <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
      </div>

      {/* Filter Container - Tipe, Role, Lembaga, Lembaga (Jabatan) */}
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
              <div className="flex flex-wrap gap-3 items-center">
                <span className="text-xs text-gray-600 dark:text-gray-400">Tipe:</span>
                <select
                  value={typeFilter}
                  onChange={onTypeFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="all">Semua</option>
                  <option value="santri">Santri</option>
                  <option value="pengurus">Pengurus</option>
                </select>

                <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Role:</span>
                <select
                  value={roleFilter}
                  onChange={onRoleFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua</option>
                  {(rolesList || []).map((r) => (
                    <option key={r.id} value={r.id}>{r.label || r.key || r.id}</option>
                  ))}
                </select>

                <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Lembaga:</span>
                <select
                  value={lembagaFilter}
                  onChange={onLembagaFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[180px]"
                >
                  <option value="">Semua</option>
                  {(lembagaList || []).map((l) => (
                    <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                  ))}
                </select>

                <span className="text-xs text-gray-600 dark:text-gray-400 ml-1">Lembaga (Jabatan):</span>
                <select
                  value={jabatanLembagaFilter}
                  onChange={onJabatanLembagaFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400 max-w-[180px]"
                >
                  <option value="">Semua</option>
                  {(lembagaList || []).map((l) => (
                    <option key={l.id} value={l.id}>{l.nama || l.id}</option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

SearchAndFilterSection.displayName = 'SearchAndFilterSection'

// Memoized User List Item (v2: data dari tabel users, badge Santri/Pengurus)
const UserListItem = memo(({ user, index, onClick, getStatusBadgeColor, getStatusDisplayName }) => {
  const isSantri = user.is_santri === true
  const isPengurus = user.is_pengurus === true

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      onClick={() => onClick(user.id)}
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-all duration-200 group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {user.nama || user.username || '-'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            @{user.username} {user.email ? ` · ${user.email}` : ''}
          </p>
          
          {/* Badge Santri / Pengurus - satu akun bisa punya keduanya */}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {isPengurus && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Pengurus
              </span>
            )}
            {isSantri && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                Santri
              </span>
            )}
            {!isSantri && !isPengurus && (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">Belum terhubung santri/pengurus</span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          {user.status && (
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeColor(user.status)}`}>
              {getStatusDisplayName(user.status)}
            </span>
          )}
          <svg className="w-5 h-5 text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </motion.div>
  )
})

UserListItem.displayName = 'UserListItem'

function ManageUsers() {
  const [allUsers, setAllUsers] = useState([]) // Data dari v2 (tabel users)
  const [filteredUsers, setFilteredUsers] = useState([]) // Hasil filter client-side (search)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all') // all | santri | pengurus
  const [roleFilter, setRoleFilter] = useState('') // role_id
  const [lembagaFilter, setLembagaFilter] = useState('') // lembaga_id (dari role)
  const [jabatanLembagaFilter, setJabatanLembagaFilter] = useState('') // lembaga dari tabel jabatan
  const [lembagaList, setLembagaList] = useState([]) // untuk AddUserModal / filter / export
  const [rolesList, setRolesList] = useState([]) // untuk filter role
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const navigate = useNavigate()

  // Load lembaga list (untuk AddUserModal & filter)
  useEffect(() => {
    const loadLembaga = async () => {
      try {
        const lembagaResponse = await api.get('/lembaga')
        if (lembagaResponse.data?.success) {
          setLembagaList(lembagaResponse.data.data || [])
        }
      } catch (err) {
        console.error('Error loading lembaga:', err)
      }
    }
    loadLembaga()
  }, [])

  // Load roles list (untuk filter role)
  useEffect(() => {
    const loadRoles = async () => {
      try {
        const rolesResponse = await manageUsersAPI.getRolesList()
        if (rolesResponse?.success && rolesResponse?.data) {
          setRolesList(Array.isArray(rolesResponse.data) ? rolesResponse.data : [])
        }
      } catch (err) {
        console.error('Error loading roles:', err)
      }
    }
    loadRoles()
  }, [])

  // Load data users dari v2 (tabel users) - hanya filter type/role/lembaga, TANPA search (supaya tidak lag saat ketik)
  const loadAllUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Anda belum login. Silakan login terlebih dahulu.')
        return
      }
      const filterParams = { limit: 10000, type: typeFilter }
      if (roleFilter) filterParams.role_id = roleFilter
      if (lembagaFilter) filterParams.lembaga_id = lembagaFilter
      if (jabatanLembagaFilter) filterParams.jabatan_lembaga_id = jabatanLembagaFilter
      const response = await manageUsersAPI.getAllV2(filterParams)
      if (response.success) {
        setAllUsers(response.data.users || [])
      } else {
        setError(response.message || 'Gagal memuat data users')
      }
    } catch (err) {
      console.error('Error loading users:', err)
      if (err.response?.status === 401) {
        setError('Sesi Anda telah berakhir. Silakan login kembali.')
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else if (err.response?.status === 403) {
        setError('Anda tidak memiliki izin untuk mengakses halaman ini.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data users')
      }
    } finally {
      setLoading(false)
    }
  }, [typeFilter, roleFilter, lembagaFilter, jabatanLembagaFilter])

  useEffect(() => {
    loadAllUsers()
  }, [loadAllUsers])

  // Pencarian instant client-side (seperti di Pengeluaran/Pemasukan) - tidak panggil API saat ketik
  useEffect(() => {
    if (allUsers.length === 0) {
      setFilteredUsers([])
      setCurrentPage(1)
      return
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      setFilteredUsers([...allUsers])
      setCurrentPage(1)
      return
    }
    const filtered = allUsers.filter(
      (user) =>
        (user.nama && user.nama.toLowerCase().includes(q)) ||
        (user.username && user.username.toLowerCase().includes(q)) ||
        (user.email && user.email.toLowerCase().includes(q))
    )
    setFilteredUsers(filtered)
    setCurrentPage(1)
  }, [allUsers, searchQuery])

  // Calculate pagination dari filteredUsers
  const totalUsers = filteredUsers.length
  const totalPages = Math.ceil(totalUsers / itemsPerPage)
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    return filteredUsers.slice(startIndex, endIndex)
  }, [filteredUsers, currentPage, itemsPerPage])

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [totalPages])

  const handleItemsPerPageChange = useCallback((newLimit) => {
    setItemsPerPage(parseInt(newLimit))
    setCurrentPage(1) // Reset to first page
  }, [])


  // Memoize helper functions to prevent re-renders
  const getStatusBadgeColor = useCallback((status) => {
    const statusLower = status?.toLowerCase()
    switch (statusLower) {
      case 'active':
      case 'aktif':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'inactive':
      case 'tidak aktif':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }, [])

  const getStatusDisplayName = useCallback((status) => {
    const statusLower = status?.toLowerCase()
    const statusNames = {
      'active': 'Aktif',
      'aktif': 'Aktif',
      'inactive': 'Tidak Aktif',
      'tidak aktif': 'Tidak Aktif',
      'pending': 'Pending'
    }
    return statusNames[statusLower] || status
  }, [])

  const handleUserClick = useCallback((userId) => {
    navigate(`/manage-users/edit/${userId}`)
  }, [navigate])

  // Search input handler - langsung update searchQuery (tidak perlu debounce)
  const handleSearchInputChange = useCallback((e) => {
    setSearchQuery(e.target.value)
  }, [])

  const handleSearchInputFocus = useCallback(() => {
    setIsInputFocused(true)
  }, [])

  const handleSearchInputBlur = useCallback(() => {
    setIsInputFocused(false)
  }, [])

  const handleFilterToggle = useCallback(() => {
    setIsFilterOpen(prev => !prev)
  }, [])

  const handleTypeFilterChange = useCallback((e) => {
    setTypeFilter(e.target.value)
  }, [])

  const handleRoleFilterChange = useCallback((e) => {
    setRoleFilter(e.target.value)
  }, [])

  const handleLembagaFilterChange = useCallback((e) => {
    setLembagaFilter(e.target.value)
  }, [])

  const handleJabatanLembagaFilterChange = useCallback((e) => {
    setJabatanLembagaFilter(e.target.value)
  }, [])

  // Export users to Excel (v2: data dari tabel users)
  const handleExportUsers = useCallback(() => {
    try {
      if (filteredUsers.length === 0) {
        alert('Tidak ada data untuk diexport')
        return
      }
      const excelData = filteredUsers.map(user => ({
        'ID': user.id || '',
        'Username': user.username || '',
        'Nama': user.nama || '',
        'Email': user.email || '',
        'No. WA': user.no_wa || '',
        'Tipe': [user.is_pengurus && 'Pengurus', user.is_santri && 'Santri'].filter(Boolean).join(', ') || '-',
        'Status': user.status || '',
        'Tanggal Dibuat': user.tanggal_dibuat ? new Date(user.tanggal_dibuat).toLocaleDateString('id-ID') : '',
        'Tanggal Update': user.tanggal_update ? new Date(user.tanggal_update).toLocaleDateString('id-ID') : ''
      }))
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.json_to_sheet(excelData)
      ws['!cols'] = [{ wch: 8 }, { wch: 20 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Users')
      XLSX.writeFile(wb, `users_export_${new Date().toISOString().split('T')[0]}.xlsx`)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert('Gagal export data ke Excel: ' + error.message)
    }
  }, [filteredUsers])

  if (loading) {
    return (
      <div className="h-full overflow-hidden" style={{ minHeight: 0 }}>
        <div className="h-full overflow-y-auto" style={{ minHeight: 0 }}>
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          </div>
        </div>
      </div>
    )
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
        {error && (
          <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Search and Filter Section - Export + Filter, Tipe, Role, Lembaga, Lembaga (Jabatan) */}
        <SearchAndFilterSection
          searchInput={searchQuery}
          onSearchInputChange={handleSearchInputChange}
          onSearchInputFocus={handleSearchInputFocus}
          onSearchInputBlur={handleSearchInputBlur}
          isInputFocused={isInputFocused}
          isFilterOpen={isFilterOpen}
          onFilterToggle={handleFilterToggle}
          onExportClick={handleExportUsers}
          typeFilter={typeFilter}
          onTypeFilterChange={handleTypeFilterChange}
          roleFilter={roleFilter}
          onRoleFilterChange={handleRoleFilterChange}
          lembagaFilter={lembagaFilter}
          onLembagaFilterChange={handleLembagaFilterChange}
          jabatanLembagaFilter={jabatanLembagaFilter}
          onJabatanLembagaFilterChange={handleJabatanLembagaFilterChange}
          rolesList={rolesList}
          lembagaList={lembagaList}
        />

        {/* Users List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : paginatedUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              {filteredUsers.length === 0 && allUsers.length > 0
                ? 'Tidak ada user yang sesuai dengan filter'
                : 'Tidak ada user ditemukan'}
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {paginatedUsers.map((user, index) => (
                  <UserListItem
                    key={user.id}
                    user={user}
                    index={index}
                    onClick={handleUserClick}
                    getStatusBadgeColor={getStatusBadgeColor}
                    getStatusDisplayName={getStatusDisplayName}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {/* Items per page selector */}
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-700 dark:text-gray-300">
                        Tampilkan:
                      </label>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => handleItemsPerPageChange(e.target.value)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        per halaman
                      </span>
                    </div>

                    {/* Page info */}
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      Menampilkan {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalUsers)} dari {totalUsers} user
                    </div>

                    {/* Page navigation */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        Sebelumnya
                      </button>

                      {/* Page numbers */}
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum
                          if (totalPages <= 5) {
                            pageNum = i + 1
                          } else if (currentPage <= 3) {
                            pageNum = i + 1
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i
                          } else {
                            pageNum = currentPage - 2 + i
                          }

                          return (
                            <button
                              key={pageNum}
                              onClick={() => handlePageChange(pageNum)}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-primary-600 text-white'
                                  : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                              }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </div>

                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        Selanjutnya
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </motion.div>
        </div>
      </div>
    </div>
  )
}

export default ManageUsers
