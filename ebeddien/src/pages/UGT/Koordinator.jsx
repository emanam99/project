import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { manageUsersAPI } from '../../services/api'
import api from '../../services/api'
import { useNotification } from '../../contexts/NotificationContext'
import ExportPengurusOffcanvas from '../Settings/Pengurus/components/ExportPengurusOffcanvas'
import CariPengurusOffcanvas from '../../components/CariPengurusOffcanvas'
import DetailPengurusOffcanvas from '../../components/DetailPengurusOffcanvas'

// Koordinator: role key yang dianggap "koordinator" (case-insensitive)
const KOORDINATOR_ROLE_KEYS = ['koordinator_ugt', 'koordinator']

function isCoordinatorRole(role) {
  const key = (role?.role_key || role?.key || role?.role_label || role?.label || '').toLowerCase()
  return KOORDINATOR_ROLE_KEYS.some((k) => key.includes(k))
}

// Section: Cari + Menu (Tambah, Export) + Filter
const SearchAndFilterSection = memo(({
  searchInput,
  onSearchInputChange,
  onSearchInputFocus,
  onSearchInputBlur,
  isInputFocused,
  isFilterOpen,
  onFilterToggle,
  onTambahClick,
  onExportClick,
  statusFilter,
  onStatusFilterChange
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 mb-4">
      <div className="relative pb-2 px-4 pt-3">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={onSearchInputChange}
            onFocus={onSearchInputFocus}
            onBlur={onSearchInputBlur}
            className="w-full p-2 pr-28 focus:outline-none bg-transparent dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Cari ID, nama, atau email..."
          />
          <div className="absolute right-0 top-0 bottom-0 flex items-center gap-1 pr-1 pointer-events-none">
            <div ref={menuRef} className="relative pointer-events-auto">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 p-1.5 rounded text-xs flex items-center gap-1 transition-colors"
                title="Menu"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                Menu
              </button>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-1 py-1 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 z-50"
                  >
                    <button
                      onClick={() => { onTambahClick?.(); setMenuOpen(false) }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Tambah
                    </button>
                    <button
                      onClick={() => { onExportClick(); setMenuOpen(false) }}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
        <div className="absolute left-0 right-0 bottom-0 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
        <div className={`absolute left-0 right-0 bottom-0 h-0.5 bg-teal-500 transition-opacity ${isInputFocused ? 'opacity-100' : 'opacity-0'}`}></div>
      </div>

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
                <span className="text-xs text-gray-600 dark:text-gray-400">Status:</span>
                <select
                  value={statusFilter}
                  onChange={onStatusFilterChange}
                  className="border rounded p-1.5 h-8 min-w-0 text-xs bg-white dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600 focus:ring-1 focus:ring-teal-400"
                >
                  <option value="">Semua</option>
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak Aktif</option>
                  <option value="pending">Pending</option>
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

const KoordinatorListItem = memo(({ pengurus, index, onClick, getStatusBadgeColor, getStatusDisplayName, lembagaList }) => {
  const roles = pengurus.roles || []
  const jabatanList = pengurus.jabatan || []
  const getLembagaNama = (id) => (lembagaList || []).find((l) => String(l.id) === String(id))?.nama || id

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      onClick={() => onClick(pengurus)}
      className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-all duration-200 group"
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
            {pengurus.nama || '-'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
            NIP: {pengurus.nip ?? pengurus.id} {pengurus.email ? ` · ${pengurus.email}` : ''} {pengurus.whatsapp ? ` · ${pengurus.whatsapp}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {roles.length > 0 ? (
              roles.map((r) => (
                <span key={r.role_id || r.role_label} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {r.role_label || r.role_key || r.role_id}
                </span>
              ))
            ) : (
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">Belum memiliki role</span>
            )}
          </div>
          {jabatanList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {jabatanList.map((j, i) => (
                <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                  {j.lembaga_id ? `${j.jabatan_nama || '-'} (${getLembagaNama(j.lembaga_id)})` : (j.jabatan_nama || '-')}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {pengurus.status && (
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeColor(pengurus.status)}`}>
              {getStatusDisplayName(pengurus.status)}
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

KoordinatorListItem.displayName = 'KoordinatorListItem'

function Koordinator() {
  const [allKoordinator, setAllKoordinator] = useState([])
  const [filteredKoordinator, setFilteredKoordinator] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [lembagaList, setLembagaList] = useState([])
  const [coordinatorRoleId, setCoordinatorRoleId] = useState(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isInputFocused, setIsInputFocused] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [showExportOffcanvas, setShowExportOffcanvas] = useState(false)
  const [showCariPengurusOffcanvas, setShowCariPengurusOffcanvas] = useState(false)
  const [addingRole, setAddingRole] = useState(false)
  /** ID pengurus yang detail-nya dibuka (klik list → buka DetailPengurusOffcanvas umum) */
  const [detailPengurusId, setDetailPengurusId] = useState(null)
  const [showDetailEditPanel, setShowDetailEditPanel] = useState(false)
  const navigate = useNavigate()

  const closeDetailOffcanvas = useCallback(() => {
    setDetailPengurusId(null)
    setShowDetailEditPanel(false)
  }, [])
  const { showNotification } = useNotification()

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

  useEffect(() => {
    const loadRoles = async () => {
      try {
        const rolesResponse = await manageUsersAPI.getRolesList()
        if (rolesResponse?.success && Array.isArray(rolesResponse.data)) {
          const coord = rolesResponse.data.find((r) => isCoordinatorRole(r))
          if (coord?.id != null) setCoordinatorRoleId(coord.id)
        }
      } catch (err) {
        console.error('Error loading roles:', err)
      }
    }
    loadRoles()
  }, [])

  const loadKoordinator = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setError('Anda belum login. Silakan login terlebih dahulu.')
        return
      }
      const filterParams = { limit: 10000 }
      if (coordinatorRoleId) filterParams.role_id = coordinatorRoleId
      if (statusFilter) filterParams.status = statusFilter
      const response = await manageUsersAPI.getAll(filterParams)
      if (response.success) {
        let users = response.data?.users || []
        if (!coordinatorRoleId) {
          users = users.filter((u) => (u.roles || []).some(isCoordinatorRole))
        }
        setAllKoordinator(users)
      } else {
        setError(response.message || 'Gagal memuat data koordinator')
      }
    } catch (err) {
      console.error('Error loading koordinator:', err)
      if (err.response?.status === 401) {
        setError('Sesi Anda telah berakhir. Silakan login kembali.')
        setTimeout(() => { window.location.href = '/login' }, 2000)
      } else if (err.response?.status === 403) {
        setError('Anda tidak memiliki izin untuk mengakses halaman ini.')
      } else {
        setError(err.response?.data?.message || 'Terjadi kesalahan saat memuat data koordinator')
      }
    } finally {
      setLoading(false)
    }
  }, [coordinatorRoleId, statusFilter])

  useEffect(() => {
    loadKoordinator()
  }, [loadKoordinator])

  useEffect(() => {
    if (allKoordinator.length === 0) {
      setFilteredKoordinator([])
      setCurrentPage(1)
      return
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) {
      setFilteredKoordinator([...allKoordinator])
      setCurrentPage(1)
      return
    }
    const filtered = allKoordinator.filter(
      (p) =>
        (p.nama && p.nama.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q)) ||
        (p.id && p.id.toString().includes(q))
    )
    setFilteredKoordinator(filtered)
    setCurrentPage(1)
  }, [allKoordinator, searchQuery])

  const totalKoordinator = filteredKoordinator.length
  const totalPages = Math.ceil(totalKoordinator / itemsPerPage)
  const paginatedKoordinator = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredKoordinator.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredKoordinator, currentPage, itemsPerPage])

  const handlePageChange = useCallback((newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [totalPages])

  const handleItemsPerPageChange = useCallback((newLimit) => {
    setItemsPerPage(parseInt(newLimit))
    setCurrentPage(1)
  }, [])

  const getStatusBadgeColor = useCallback((status) => {
    const s = status?.toLowerCase()
    if (s === 'active' || s === 'aktif') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    if (s === 'inactive' || s === 'tidak aktif') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    if (s === 'pending') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
  }, [])

  const getStatusDisplayName = useCallback((status) => {
    const s = status?.toLowerCase()
    const map = { 'active': 'Aktif', 'aktif': 'Aktif', 'inactive': 'Tidak Aktif', 'tidak aktif': 'Tidak Aktif', 'pending': 'Pending' }
    return map[s] || status
  }, [])

  const handleItemClick = useCallback((pengurus) => {
    if (pengurus?.id != null) setDetailPengurusId(pengurus.id)
  }, [])

  const handleSelectPengurus = useCallback(async (pengurus) => {
    if (pengurus?.id == null) return
    if (!coordinatorRoleId) {
      showNotification('Role koordinator tidak ditemukan. Silakan muat ulang halaman.', 'error')
      return
    }
    setAddingRole(true)
    try {
      const response = await manageUsersAPI.addUserRole(pengurus.id, { role_id: coordinatorRoleId })
      if (response?.success) {
        showNotification(`Role koordinator berhasil ditambahkan ke ${pengurus.nama || 'pengurus'}.`, 'success')
        setShowCariPengurusOffcanvas(false)
        loadKoordinator()
      } else {
        showNotification(response?.message || 'Gagal menambahkan role koordinator', 'error')
      }
    } catch (err) {
      console.error('Error adding coordinator role:', err)
      const msg = err.response?.data?.message || 'Terjadi kesalahan saat menambahkan role koordinator'
      showNotification(msg, 'error')
    } finally {
      setAddingRole(false)
    }
  }, [coordinatorRoleId, showNotification, loadKoordinator])

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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            {error && (
              <div className="mb-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <SearchAndFilterSection
              searchInput={searchQuery}
              onSearchInputChange={(e) => setSearchQuery(e.target.value)}
              onSearchInputFocus={() => setIsInputFocused(true)}
              onSearchInputBlur={() => setIsInputFocused(false)}
              isInputFocused={isInputFocused}
              isFilterOpen={isFilterOpen}
              onFilterToggle={() => setIsFilterOpen((p) => !p)}
              onTambahClick={() => setShowCariPengurusOffcanvas(true)}
              onExportClick={() => setShowExportOffcanvas(true)}
              statusFilter={statusFilter}
              onStatusFilterChange={(e) => setStatusFilter(e.target.value)}
            />

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
              {paginatedKoordinator.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                  {filteredKoordinator.length === 0 && allKoordinator.length > 0
                    ? 'Tidak ada koordinator yang sesuai dengan filter'
                    : 'Tidak ada koordinator ditemukan'}
                </div>
              ) : (
                <>
                  <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {paginatedKoordinator.map((pengurus, index) => (
                      <KoordinatorListItem
                        key={pengurus.id}
                        pengurus={pengurus}
                        index={index}
                        onClick={handleItemClick}
                        getStatusBadgeColor={getStatusBadgeColor}
                        getStatusDisplayName={getStatusDisplayName}
                        lembagaList={lembagaList}
                      />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-sm text-gray-700 dark:text-gray-300">Tampilkan:</label>
                          <select
                            value={itemsPerPage}
                            onChange={(e) => handleItemsPerPageChange(e.target.value)}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="10">10</option>
                            <option value="25">25</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                          </select>
                          <span className="text-sm text-gray-500 dark:text-gray-400">per halaman</span>
                        </div>
                        <div className="text-sm text-gray-700 dark:text-gray-300">
                          Menampilkan {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalKoordinator)} dari {totalKoordinator} koordinator
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            Sebelumnya
                          </button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              const pageNum = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => handlePageChange(pageNum)}
                                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${currentPage === pageNum ? 'bg-primary-600 text-white' : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                                >
                                  {pageNum}
                                </button>
                              )
                            })}
                          </div>
                          <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
      {createPortal(
        <ExportPengurusOffcanvas
          isOpen={showExportOffcanvas}
          onClose={() => setShowExportOffcanvas(false)}
          filteredData={filteredKoordinator}
          lembagaList={lembagaList}
        />,
        document.body
      )}
      {createPortal(
        <CariPengurusOffcanvas
          isOpen={showCariPengurusOffcanvas}
          onClose={() => setShowCariPengurusOffcanvas(false)}
          onSelect={handleSelectPengurus}
          title="Cari Pengurus"
        />,
        document.body
      )}
      {createPortal(
        <DetailPengurusOffcanvas
          isOpen={detailPengurusId != null}
          onClose={closeDetailOffcanvas}
          pengurusId={detailPengurusId}
          lembagaList={lembagaList}
          onPengurusPatch={() => loadKoordinator()}
          showEditPanel={showDetailEditPanel}
          onOpenEdit={() => setShowDetailEditPanel(true)}
          onCloseEdit={() => setShowDetailEditPanel(false)}
        />,
        document.body
      )}
    </div>
  )
}

export default Koordinator
