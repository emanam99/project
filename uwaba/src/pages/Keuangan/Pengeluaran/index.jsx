import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { pengeluaranAPI, userAPI } from '../../../services/api'
import { useAuthStore } from '../../../store/authStore'
import { useNotification } from '../../../contexts/NotificationContext'
import Modal from '../../../components/Modal/Modal'
import DetailOffcanvas from '../../../components/DetailOffcanvas/DetailOffcanvas'
import SearchAndFilterRencana from './components/SearchAndFilterRencana'
import SearchAndFilterPengeluaran from './components/SearchAndFilterPengeluaran'
import SearchAndFilterDraft from './components/SearchAndFilterDraft'
import DraftTab from './components/DraftTab'
import { formatCurrency, getStatusBadge, generatePreviewPesan, generateRencanaWhatsAppMessage } from './utils/pengeluaranUtils'
import { useRencanaFilters } from './hooks/useRencanaFilters'
import { usePengeluaranFilters } from './hooks/usePengeluaranFilters'
import { useDraftFilters } from './hooks/useDraftFilters'
import { useRencanaActions } from './hooks/useRencanaActions'
import { useRencanaModals } from './hooks/useRencanaModals'
import { useRencanaNotifications } from './hooks/useRencanaNotifications'
import { useAdminList } from './hooks/useAdminList'
import { useRencanaDetail } from './hooks/useRencanaDetail'
import { usePengeluaranDetail } from './hooks/usePengeluaranDetail'
import { useOffcanvasBackClose } from '../../../hooks/useOffcanvasBackClose'

function Pengeluaran() {
  const { user } = useAuthStore()
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Set activeTab dari URL query param jika ada
  const tabFromUrl = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabFromUrl || 'rencana') // 'rencana', 'pengeluaran', atau 'draft'
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [confirmKomentarId, setConfirmKomentarId] = useState(null)
  const [confirmKomentarData, setConfirmKomentarData] = useState(null)
  
  // Use custom hooks for filtering
  const rencanaFilters = useRencanaFilters(activeTab, itemsPerPage)
  const pengeluaranFilters = usePengeluaranFilters(activeTab, itemsPerPage)
  const draftFilters = useDraftFilters(activeTab, itemsPerPage)
  
  // Destructure rencana filters
  const {
    allRencana,
    rencanaList,
    loading: rencanaLoading,
    rencanaTotal,
    rencanaSearchQuery,
    rencanaStatusFilter,
    rencanaKategoriFilter,
    rencanaLembagaFilter,
    rencanaTanggalDari,
    rencanaTanggalSampai,
    rencanaPage,
    setRencanaPage,
    isRencanaFilterOpen,
    setIsRencanaFilterOpen,
    isRencanaInputFocused,
    loadAllRencana,
    handleRencanaSearchInputChange,
    handleRencanaSearchInputFocus,
    handleRencanaSearchInputBlur,
    setRencanaStatusFilter,
    setRencanaKategoriFilter,
    setRencanaLembagaFilter,
    setRencanaTanggalDari,
    setRencanaTanggalSampai
  } = rencanaFilters
  
  // Destructure pengeluaran filters
  const {
    allPengeluaran,
    pengeluaranList,
    loading: pengeluaranLoading,
    pengeluaranTotal,
    pengeluaranSearchQuery,
    pengeluaranKategoriFilter,
    pengeluaranLembagaFilter,
    pengeluaranTanggalDari,
    pengeluaranTanggalSampai,
    pengeluaranPage,
    setPengeluaranPage,
    isPengeluaranFilterOpen,
    setIsPengeluaranFilterOpen,
    isPengeluaranInputFocused,
    loadAllPengeluaran,
    handlePengeluaranSearchInputChange,
    handlePengeluaranSearchInputFocus,
    handlePengeluaranSearchInputBlur,
    setPengeluaranKategoriFilter,
    setPengeluaranLembagaFilter,
    setPengeluaranTanggalDari,
    setPengeluaranTanggalSampai
  } = pengeluaranFilters
  
  // Destructure draft filters
  const {
    draftList,
    loading: draftLoading,
    draftTotal,
    draftSearchQuery,
    setDraftSearchQuery,
    draftKategoriFilter,
    setDraftKategoriFilter,
    draftLembagaFilter,
    setDraftLembagaFilter,
    draftTanggalDari,
    setDraftTanggalDari,
    draftTanggalSampai,
    setDraftTanggalSampai,
    draftPage,
    setDraftPage,
    isDraftFilterOpen,
    setIsDraftFilterOpen,
    isDraftInputFocused,
    setIsDraftInputFocused,
    loadAllDraft
  } = draftFilters
  
  const [showDetailModal, setShowDetailModal] = useState(false)
  
  // Use custom hooks for detail management
  const rencanaDetailHook = useRencanaDetail()
  const pengeluaranDetailHook = usePengeluaranDetail()
  
  // Use custom hooks for admin list management
  const confirmAdminList = useAdminList(true) // Hanya super admin dan admin uwaba untuk approve/reject rencana pengeluaran
  const rencanaAdminList = useAdminList(true) // Hanya super admin dan admin uwaba untuk rencana pengeluaran
  const pengeluaranAdminList = useAdminList()
  
  const closePengeluaranDetailOffcanvas = useOffcanvasBackClose(pengeluaranDetailHook.showPengeluaranOffcanvas, () => { pengeluaranDetailHook.closePengeluaranOffcanvas(); pengeluaranAdminList.resetSelection() })
  const closeRencanaDetailOffcanvas = useOffcanvasBackClose(rencanaDetailHook.showRencanaOffcanvas, () => { rencanaDetailHook.closeRencanaOffcanvas(); rencanaAdminList.resetSelection() })
  
  // Use custom hooks for notifications
  const { sendRencanaNotifications, sendNotificationsToConfirmAdmins } = useRencanaNotifications()
  
  // Use custom hooks for modals
  const rencanaModals = useRencanaModals(
    loadAllRencana,
    rencanaDetailHook.closeRencanaOffcanvas,
    sendNotificationsToConfirmAdmins,
    allRencana
  )
  
  // Use custom hooks for actions
  const rencanaActions = useRencanaActions(
    loadAllRencana,
    rencanaDetailHook.closeRencanaOffcanvas
  )
  
  // Combine loading states
  const isLoading = rencanaModals.loading || rencanaLoading || pengeluaranLoading || draftLoading
  
  // Handle tab change from URL query param
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab')
    if (tabFromUrl && ['rencana', 'pengeluaran', 'draft'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl)
      // Refresh data jika switch ke tab draft
      if (tabFromUrl === 'draft') {
        loadAllDraft()
      }
    }
  }, [searchParams, loadAllDraft])
  
  // Handler untuk draft click (sama seperti rencana)
  const handleDraftClick = async (draft) => {
    await rencanaDetailHook.handleRencanaClick(draft, false, rencanaAdminList.loadAdmins)
  }
  
  // Handler untuk draft search input
  const handleDraftSearchInputChange = (e) => {
    setDraftSearchQuery(e.target.value)
    setDraftPage(1)
  }
  
  const handleDraftSearchInputFocus = () => {
    setIsDraftInputFocused(true)
  }
  
  const handleDraftSearchInputBlur = () => {
    setIsDraftInputFocused(false)
  }

  // Track processed URL IDs to avoid infinite loops
  const processedRencanaIdRef = useRef(null)
  const processedPengeluaranIdRef = useRef(null)

  // Handle deep linking from URL query parameters
  useEffect(() => {
    const rencanaId = searchParams.get('rencana')
    const pengeluaranId = searchParams.get('pengeluaran')

    // Skip if we've already processed this ID
    if (rencanaId && processedRencanaIdRef.current === rencanaId && rencanaDetailHook.showRencanaOffcanvas) {
      return
    }
    if (pengeluaranId && processedPengeluaranIdRef.current === pengeluaranId && pengeluaranDetailHook.showPengeluaranOffcanvas) {
      return
    }

    // Jika ada rencana ID di URL, buka offcanvas rencana
    if (rencanaId && !rencanaDetailHook.showRencanaOffcanvas && !rencanaDetailHook.loadingRencanaDetail) {
      processedRencanaIdRef.current = rencanaId
      processedPengeluaranIdRef.current = null // Reset pengeluaran
      
      // Pastikan data rencana sudah dimuat
      if (allRencana.length > 0) {
        const rencana = allRencana.find(r => r.id.toString() === rencanaId.toString())
        if (rencana) {
          handleRencanaClick(rencana, false, rencanaAdminList.loadAdmins)
        } else {
          // Jika tidak ditemukan di list, coba buka langsung dari API
          rencanaDetailHook.openRencanaFromUrl(rencanaId, rencanaAdminList.loadAdmins)
        }
      } else {
        // Tunggu sampai data dimuat
        const timer = setTimeout(() => {
          if (allRencana.length > 0) {
            const rencana = allRencana.find(r => r.id.toString() === rencanaId.toString())
            if (rencana) {
              handleRencanaClick(rencana, false, rencanaAdminList.loadAdmins)
            } else {
              rencanaDetailHook.openRencanaFromUrl(rencanaId, rencanaAdminList.loadAdmins)
            }
          }
        }, 500)
        return () => clearTimeout(timer)
      }
    }

    // Jika ada pengeluaran ID di URL, buka offcanvas pengeluaran
    if (pengeluaranId && !pengeluaranDetailHook.showPengeluaranOffcanvas && !pengeluaranDetailHook.loadingPengeluaranDetail) {
      processedPengeluaranIdRef.current = pengeluaranId
      processedRencanaIdRef.current = null // Reset rencana
      
      // Pastikan data pengeluaran sudah dimuat
      if (allPengeluaran.length > 0) {
        const pengeluaran = allPengeluaran.find(p => p.id.toString() === pengeluaranId.toString())
        if (pengeluaran) {
          handleViewDetail(pengeluaran.id, pengeluaranAdminList.loadAdmins)
        } else {
          // Jika tidak ditemukan di list, coba buka langsung dari API
          pengeluaranDetailHook.openPengeluaranFromUrl(pengeluaranId, pengeluaranAdminList.loadAdmins)
        }
      } else {
        // Tunggu sampai data dimuat
        const timer = setTimeout(() => {
          if (allPengeluaran.length > 0) {
            const pengeluaran = allPengeluaran.find(p => p.id.toString() === pengeluaranId.toString())
            if (pengeluaran) {
              handleViewDetail(pengeluaran.id, pengeluaranAdminList.loadAdmins)
            } else {
              pengeluaranDetailHook.openPengeluaranFromUrl(pengeluaranId, pengeluaranAdminList.loadAdmins)
            }
          }
        }, 500)
        return () => clearTimeout(timer)
      }
    }

    // Reset refs jika tidak ada query params
    if (!rencanaId && !pengeluaranId) {
      processedRencanaIdRef.current = null
      processedPengeluaranIdRef.current = null
    }
  }, [searchParams, allRencana, allPengeluaran])

  // Handle browser back button - tutup offcanvas jika query param dihapus
  useEffect(() => {
    const rencanaId = searchParams.get('rencana')
    const pengeluaranId = searchParams.get('pengeluaran')
    
    // Jika tidak ada rencana ID di URL tapi offcanvas terbuka, tutup
    if (!rencanaId && rencanaDetailHook.showRencanaOffcanvas) {
      processedRencanaIdRef.current = null
      rencanaDetailHook.closeRencanaOffcanvas()
    }
    
    // Jika tidak ada pengeluaran ID di URL tapi offcanvas terbuka, tutup
    if (!pengeluaranId && pengeluaranDetailHook.showPengeluaranOffcanvas) {
      processedPengeluaranIdRef.current = null
      pengeluaranDetailHook.closePengeluaranOffcanvas()
    }
  }, [searchParams, rencanaDetailHook, pengeluaranDetailHook])

  const handleApprove = (id) => {
    rencanaModals.openConfirmModal('approve', id)
    confirmAdminList.loadAdmins()
  }

  const handleReject = (id) => {
    rencanaModals.openConfirmModal('reject', id)
    confirmAdminList.loadAdmins()
  }

  // Generate preview pesan untuk modal konfirmasi
  const generatePreviewPesanWrapper = (rencanaData, action) => {
    return generatePreviewPesan(rencanaData, action, user)
  }

  const handleConfirmAction = async () => {
    await rencanaModals.handleConfirmAction(
      rencanaDetailHook.rencanaDetail,
      confirmAdminList.selectedAdmins,
      confirmAdminList.listAdmins
    )
    confirmAdminList.resetSelection()
  }

  const handleConfirmApproveReject = async () => {
    await rencanaModals.handleConfirmApproveReject(
      rencanaDetailHook.rencanaDetail,
      rencanaAdminList.selectedAdmins,
      rencanaAdminList.listAdmins
    )
    rencanaAdminList.resetSelection()
  }

  const handleRencanaClick = async (rencana, scrollToKomentar = false) => {
    await rencanaDetailHook.handleRencanaClick(rencana, scrollToKomentar, rencanaAdminList.loadAdmins)
  }

  const handleRencanaApprove = () => {
    if (!rencanaDetailHook.selectedRencana) return
    rencanaModals.openConfirmModal('approve', rencanaDetailHook.selectedRencana.id)
    confirmAdminList.loadAdmins()
  }

  const handleRencanaReject = () => {
    if (!rencanaDetailHook.selectedRencana) return
    rencanaModals.openConfirmModal('reject', rencanaDetailHook.selectedRencana.id)
    confirmAdminList.loadAdmins()
  }

  const handleViewDetail = async (id) => {
    await pengeluaranDetailHook.handleViewDetail(id, pengeluaranAdminList.loadAdmins)
  }

  const handleSendNotification = async (admin) => {
    if (!admin.whatsapp) {
      showNotification('Nomor WhatsApp tidak tersedia untuk admin ini', 'error')
      return
    }

    const nomorTelepon = admin.whatsapp.trim().replace(/[^0-9]/g, '')
    if (!nomorTelepon || nomorTelepon === '') {
      showNotification('Nomor WhatsApp tidak valid', 'error')
      return
    }

    const baseUrl = window.location.origin
    const linkPengeluaran = `${baseUrl}/pengeluaran?pengeluaran=${pengeluaranDetailHook.selectedPengeluaran?.id}`
    const pesan = `${linkPengeluaran}

*Pengeluaran*
*Pesantren Salafiyah Al-Utsmani*

Keterangan: ${pengeluaranDetailHook.selectedPengeluaran?.keterangan || 'Tanpa Keterangan'}
Kategori: ${pengeluaranDetailHook.selectedPengeluaran?.kategori || '-'}
Lembaga: ${pengeluaranDetailHook.selectedPengeluaran?.lembaga || '-'}
Sumber Uang: ${pengeluaranDetailHook.selectedPengeluaran?.sumber_uang || '-'}
Total: ${formatCurrency(parseFloat(pengeluaranDetailHook.selectedPengeluaran?.nominal || 0))}
Tanggal: ${pengeluaranDetailHook.selectedPengeluaran?.tanggal_dibuat ? new Date(pengeluaranDetailHook.selectedPengeluaran.tanggal_dibuat).toLocaleDateString('id-ID') : '-'}
Dibuat oleh: ${pengeluaranDetailHook.selectedPengeluaran?.admin_nama || '-'}
${pengeluaranDetailHook.selectedPengeluaran?.admin_approve_nama ? `Di-approve oleh: ${pengeluaranDetailHook.selectedPengeluaran.admin_approve_nama}` : ''}

> Simpan nomor ini agar link di atas bisa diklik.
`

    try {
      const result = await pengeluaranAPI.sendNotifWaPengeluaran(
        pengeluaranDetailHook.selectedPengeluaran?.id,
        pesan,
        [{ id: admin.id, whatsapp: admin.whatsapp }]
      )
      if (result.success) {
        showNotification(result.message || 'Pesan WhatsApp berhasil dikirim!', 'success')
      } else {
        showNotification(result.message || 'Gagal mengirim pesan', 'error')
      }
    } catch (error) {
      console.error('Error sending WhatsApp:', error)
      const errMsg = error.response?.data?.message || error.message
      showNotification('Gagal mengirim pesan: ' + errMsg, 'error')
    }
  }

  const handleSendBulkNotification = async () => {
    if (pengeluaranAdminList.selectedAdmins.length === 0) {
      showNotification('Pilih minimal satu admin untuk mengirim notifikasi', 'error')
      return
    }

    const selectedAdminData = pengeluaranAdminList.listAdmins.filter(admin => pengeluaranAdminList.selectedAdmins.includes(admin.id))
    const adminsWithWhatsapp = selectedAdminData.filter(admin => admin.whatsapp)
    if (adminsWithWhatsapp.length === 0) {
      showNotification('Tidak ada admin terpilih yang memiliki nomor WhatsApp', 'error')
      return
    }

    const baseUrl = window.location.origin
    const linkPengeluaran = `${baseUrl}/pengeluaran?pengeluaran=${pengeluaranDetailHook.selectedPengeluaran?.id}`
    const pesan = `${linkPengeluaran}

Assalamu'alaikum Warahmatullahi Wabarakatuh

*Pengeluaran*
*Pesantren Salafiyah Al-Utsmani*

Keterangan: ${pengeluaranDetailHook.selectedPengeluaran?.keterangan || 'Tanpa Keterangan'}
Kategori: ${pengeluaranDetailHook.selectedPengeluaran?.kategori || '-'}
Lembaga: ${pengeluaranDetailHook.selectedPengeluaran?.lembaga || '-'}
Sumber Uang: ${pengeluaranDetailHook.selectedPengeluaran?.sumber_uang || '-'}
Total: ${formatCurrency(parseFloat(pengeluaranDetailHook.selectedPengeluaran?.nominal || 0))}
Tanggal: ${pengeluaranDetailHook.selectedPengeluaran?.tanggal_dibuat ? new Date(pengeluaranDetailHook.selectedPengeluaran.tanggal_dibuat).toLocaleDateString('id-ID') : '-'}
Dibuat oleh: ${pengeluaranDetailHook.selectedPengeluaran?.admin_nama || '-'}
${pengeluaranDetailHook.selectedPengeluaran?.admin_approve_nama ? `Di-approve oleh: ${pengeluaranDetailHook.selectedPengeluaran.admin_approve_nama}` : ''}

> Simpan nomor ini agar link di atas bisa diklik.
`

    try {
      const result = await pengeluaranAPI.sendNotifWaPengeluaran(
        pengeluaranDetailHook.selectedPengeluaran?.id,
        pesan,
        adminsWithWhatsapp.map(a => ({ id: a.id, whatsapp: a.whatsapp }))
      )
      if (result.success) {
        showNotification(result.message || `Pesan berhasil dikirim ke ${result.data?.success_count ?? 0} admin`, 'success')
      } else {
        showNotification(result.message || 'Gagal mengirim pesan', 'error')
      }
    } catch (error) {
      console.error('Error sending bulk WhatsApp:', error)
      showNotification(error.response?.data?.message || error.message || 'Gagal mengirim pesan ke semua admin', 'error')
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
            {/* Tabs */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-6">
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('rencana')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'rencana'
                        ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Rencana
                  </button>
                  <button
                    onClick={() => setActiveTab('pengeluaran')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'pengeluaran'
                        ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Pengeluaran
                  </button>
                  <div className="flex-1"></div>
                  <button
                    onClick={() => setActiveTab('draft')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'draft'
                        ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                    }`}
                  >
                    Draft
                  </button>
                </nav>
              </div>
            </div>

            {/* Content */}
            {activeTab === 'rencana' && (
              <div className="space-y-4">
                {/* Search and Filter */}
                <SearchAndFilterRencana
                  searchInput={rencanaSearchQuery}
                  onSearchInputChange={handleRencanaSearchInputChange}
                  onSearchInputFocus={handleRencanaSearchInputFocus}
                  onSearchInputBlur={handleRencanaSearchInputBlur}
                  isInputFocused={isRencanaInputFocused}
                  isFilterOpen={isRencanaFilterOpen}
                  onFilterToggle={() => setIsRencanaFilterOpen(!isRencanaFilterOpen)}
                  onRefresh={loadAllRencana}
                  statusFilter={rencanaStatusFilter}
                  onStatusFilterChange={(e) => {
                    setRencanaStatusFilter(e.target.value)
                    setRencanaPage(1)
                  }}
                  kategoriFilter={rencanaKategoriFilter}
                  onKategoriFilterChange={(e) => {
                    setRencanaKategoriFilter(e.target.value)
                    setRencanaPage(1)
                  }}
                  lembagaFilter={rencanaLembagaFilter}
                  onLembagaFilterChange={(e) => {
                    setRencanaLembagaFilter(e.target.value)
                    setRencanaPage(1)
                  }}
                  tanggalDari={rencanaTanggalDari}
                  onTanggalDariChange={(e) => {
                    setRencanaTanggalDari(e.target.value)
                    setRencanaPage(1)
                  }}
                  tanggalSampai={rencanaTanggalSampai}
                  onTanggalSampaiChange={(e) => {
                    setRencanaTanggalSampai(e.target.value)
                    setRencanaPage(1)
                  }}
                  onCreateClick={() => navigate('/pengeluaran/create')}
                />

                {/* Rencana List */}
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                  </div>
                ) : rencanaList.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
                    <p className="text-gray-500 dark:text-gray-400">Tidak ada rencana pengeluaran</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rencanaList.map((rencana, index) => {
                      // Tentukan warna background berdasarkan status
                      const getBackgroundColor = () => {
                        if (rencana.ket === 'pending' || rencana.ket === 'di edit') {
                          return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        } else if (rencana.ket === 'ditolak') {
                          return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        } else if (rencana.ket === 'draft') {
                          return 'bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                        }
                        return 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }
                      
                      return (
                      <motion.div
                        key={rencana.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        onClick={() => handleRencanaClick(rencana)}
                        className={`${getBackgroundColor()} rounded-lg shadow-md p-3 sm:p-4 border cursor-pointer hover:shadow-lg transition-shadow`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 truncate">
                                {rencana.keterangan || 'Tanpa Keterangan'}
                              </h3>
                            </div>
                            <div className="flex flex-wrap gap-2 mb-1">
                              {rencana.kategori && (
                                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                                  {rencana.kategori}
                                </span>
                              )}
                              {rencana.lembaga && (
                                <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                                  {rencana.lembaga}
                                </span>
                              )}
                              {rencana.sumber_uang && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  rencana.sumber_uang === 'Cash' 
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                                }`}>
                                  {rencana.sumber_uang}
                                </span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
                              Oleh: {rencana.admin_nama || 'Unknown'} | {new Date(rencana.tanggal_dibuat).toLocaleDateString('id-ID')}
                            </p>
                            {rencana.hijriyah && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                  Hijriyah: {rencana.hijriyah}
                                </span>
                              </div>
                            )}
                            {rencana.jumlah_detail_ditolak > 0 && (
                              <p className="text-xs text-red-600 dark:text-red-400">
                                ({rencana.jumlah_detail_ditolak} item ditolak)
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-base sm:text-lg font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                                {formatCurrency(parseFloat(rencana.nominal || 0))}
                              </p>
                            </div>
                            <div className="text-right">
                              {getStatusBadge(rencana.ket)}
                              {/* Jumlah Komentar dan Viewer */}
                              <div className="flex items-center gap-2 mt-2 justify-end">
                                {(rencana.jumlah_komentar !== undefined && rencana.jumlah_komentar !== null) && (
                                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    <span>{rencana.jumlah_komentar || 0}</span>
                                  </div>
                                )}
                                {(rencana.jumlah_viewer !== undefined && rencana.jumlah_viewer !== null) && (
                                  <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    <span>{rencana.jumlah_viewer || 0}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                      )
                    })}

                    {/* Pagination */}
                    {rencanaTotal > 0 && (
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
                              setRencanaPage(1)
                            }}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                          </select>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            dari {rencanaTotal} data
                          </span>
                        </div>

                        {/* Pagination controls */}
                        {rencanaTotal > itemsPerPage && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setRencanaPage(prev => Math.max(1, prev - 1))}
                              disabled={rencanaPage === 1}
                              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              Previous
                            </button>
                            <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              Halaman {rencanaPage} dari {Math.ceil(rencanaTotal / itemsPerPage)}
                            </span>
                            <button
                              onClick={() => setRencanaPage(prev => prev + 1)}
                              disabled={rencanaPage >= Math.ceil(rencanaTotal / itemsPerPage)}
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
              </div>
            )}

            {activeTab === 'draft' && (
              <div className="space-y-4">
                {/* Search and Filter */}
                <SearchAndFilterDraft
                  searchInput={draftSearchQuery}
                  onSearchInputChange={handleDraftSearchInputChange}
                  onSearchInputFocus={handleDraftSearchInputFocus}
                  onSearchInputBlur={handleDraftSearchInputBlur}
                  isInputFocused={isDraftInputFocused}
                  isFilterOpen={isDraftFilterOpen}
                  onFilterToggle={() => setIsDraftFilterOpen(!isDraftFilterOpen)}
                  onRefresh={loadAllDraft}
                  kategoriFilter={draftKategoriFilter}
                  onKategoriFilterChange={(e) => {
                    setDraftKategoriFilter(e.target.value)
                    setDraftPage(1)
                  }}
                  lembagaFilter={draftLembagaFilter}
                  onLembagaFilterChange={(e) => {
                    setDraftLembagaFilter(e.target.value)
                    setDraftPage(1)
                  }}
                  tanggalDari={draftTanggalDari}
                  onTanggalDariChange={(e) => {
                    setDraftTanggalDari(e.target.value)
                    setDraftPage(1)
                  }}
                  tanggalSampai={draftTanggalSampai}
                  onTanggalSampaiChange={(e) => {
                    setDraftTanggalSampai(e.target.value)
                    setDraftPage(1)
                  }}
                  onCreateClick={() => navigate('/pengeluaran/create')}
                />

                {/* Draft List */}
                <DraftTab
                  draftList={draftList}
                  draftLoading={draftLoading}
                  draftTotal={draftTotal}
                  draftPage={draftPage}
                  setDraftPage={setDraftPage}
                  itemsPerPage={itemsPerPage}
                  setItemsPerPage={setItemsPerPage}
                  onDraftClick={handleDraftClick}
                />
              </div>
            )}

            {activeTab === 'pengeluaran' && (
              <div className="space-y-4">
                {/* Search and Filter */}
                <SearchAndFilterPengeluaran
                  searchInput={pengeluaranSearchQuery}
                  onSearchInputChange={handlePengeluaranSearchInputChange}
                  onSearchInputFocus={handlePengeluaranSearchInputFocus}
                  onSearchInputBlur={handlePengeluaranSearchInputBlur}
                  isInputFocused={isPengeluaranInputFocused}
                  isFilterOpen={isPengeluaranFilterOpen}
                  onFilterToggle={() => setIsPengeluaranFilterOpen(!isPengeluaranFilterOpen)}
                  onRefresh={loadAllPengeluaran}
                  kategoriFilter={pengeluaranKategoriFilter}
                  onKategoriFilterChange={(e) => {
                    setPengeluaranKategoriFilter(e.target.value)
                    setPengeluaranPage(1)
                  }}
                  lembagaFilter={pengeluaranLembagaFilter}
                  onLembagaFilterChange={(e) => {
                    setPengeluaranLembagaFilter(e.target.value)
                    setPengeluaranPage(1)
                  }}
                  tanggalDari={pengeluaranTanggalDari}
                  onTanggalDariChange={(e) => {
                    setPengeluaranTanggalDari(e.target.value)
                    setPengeluaranPage(1)
                  }}
                  tanggalSampai={pengeluaranTanggalSampai}
                  onTanggalSampaiChange={(e) => {
                    setPengeluaranTanggalSampai(e.target.value)
                    setPengeluaranPage(1)
                  }}
                />

                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
                  </div>
                ) : pengeluaranList.length === 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 text-center">
                    <p className="text-gray-500 dark:text-gray-400">
                      {allPengeluaran.length === 0 
                        ? 'Tidak ada pengeluaran' 
                        : 'Tidak ada pengeluaran yang sesuai dengan filter'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pengeluaranList.map((pengeluaran, index) => {
                      // Warna kuning jika id_penerima null
                      const bgColor = pengeluaran.id_penerima === null || pengeluaran.id_penerima === undefined
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      
                      return (
                        <motion.div
                          key={pengeluaran.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className={`${bgColor} rounded-lg shadow-md p-3 sm:p-4 border cursor-pointer hover:shadow-lg transition-shadow`}
                          onClick={() => handleViewDetail(pengeluaran.id)}
                        >
                          <div className="flex flex-col gap-2">
                            {/* Keterangan - bisa wrap panjang ke kanan */}
                            <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-200 break-words">
                              {pengeluaran.keterangan || 'Tanpa Keterangan'}
                            </h3>
                            
                            {/* Badges dan Nominal - satu baris */}
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex flex-wrap gap-2 flex-1">
                                {pengeluaran.kategori && (
                                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                                    {pengeluaran.kategori}
                                  </span>
                                )}
                                {pengeluaran.lembaga && (
                                  <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded">
                                    {pengeluaran.lembaga}
                                  </span>
                                )}
                                {pengeluaran.sumber_uang && (
                                  <span className={`text-xs px-2 py-0.5 rounded ${
                                    pengeluaran.sumber_uang === 'Cash' 
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                                      : 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
                                  }`}>
                                    {pengeluaran.sumber_uang}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <p className="text-base sm:text-lg font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                                  {formatCurrency(parseFloat(pengeluaran.nominal || 0))}
                                </p>
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                            </div>
                            
                            {/* Oleh dan Penerima - satu baris */}
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 flex-1">
                                Oleh: {pengeluaran.admin_nama || 'Unknown'}
                              </p>
                              <div className="flex-shrink-0">
                                {pengeluaran.penerima_nama && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                    Penerima: {pengeluaran.penerima_nama}
                                  </p>
                                )}
                                {(!pengeluaran.penerima_nama && (pengeluaran.id_penerima === null || pengeluaran.id_penerima === undefined)) && (
                                  <p className="text-xs text-yellow-600 dark:text-yellow-400 italic whitespace-nowrap">
                                    Belum ada penerima
                                  </p>
                                )}
                              </div>
                            </div>
                            
                            {/* Tanggal Masehi dan Hijriyah - satu baris */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                Masehi: {(() => {
                                  const date = new Date(pengeluaran.tanggal_dibuat)
                                  const year = date.getFullYear()
                                  const month = String(date.getMonth() + 1).padStart(2, '0')
                                  const day = String(date.getDate()).padStart(2, '0')
                                  return `${year}-${month}-${day}`
                                })()}
                              </span>
                              {pengeluaran.hijriyah && (
                                <span className="text-xs text-yellow-600 dark:text-yellow-400 whitespace-nowrap">
                                  Hijriyah: {pengeluaran.hijriyah}
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}

                    {/* Pagination */}
                    {pengeluaranTotal > 0 && (
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
                              setPengeluaranPage(1)
                            }}
                            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                            <option value="100">100</option>
                          </select>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            dari {pengeluaranTotal} data
                          </span>
                        </div>

                        {/* Pagination controls */}
                        {pengeluaranTotal > itemsPerPage && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setPengeluaranPage(prev => Math.max(1, prev - 1))}
                              disabled={pengeluaranPage === 1}
                              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              Previous
                            </button>
                            <span className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                              Halaman {pengeluaranPage} dari {Math.ceil(pengeluaranTotal / itemsPerPage)}
                            </span>
                            <button
                              onClick={() => setPengeluaranPage(prev => prev + 1)}
                              disabled={pengeluaranPage >= Math.ceil(pengeluaranTotal / itemsPerPage)}
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
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Detail Offcanvas - Pengeluaran */}
      <DetailOffcanvas
        isOpen={pengeluaranDetailHook.showPengeluaranOffcanvas}
        onClose={closePengeluaranDetailOffcanvas}
        detailData={pengeluaranDetailHook.selectedPengeluaran}
        loading={pengeluaranDetailHook.loadingPengeluaranDetail}
        type="pengeluaran"
        formatCurrency={formatCurrency}
        formatDate={(dateString) => {
          if (!dateString) return '-'
          return new Date(dateString).toLocaleString('id-ID')
        }}
        formatHijriyahDate={null}
        activeTab="masehi"
      />

      {/* Detail Offcanvas - Rencana */}
      <DetailOffcanvas
        isOpen={rencanaDetailHook.showRencanaOffcanvas}
        onClose={closeRencanaDetailOffcanvas}
        detailData={rencanaDetailHook.rencanaDetail}
        loading={rencanaDetailHook.loadingRencanaDetail}
        type="rencana"
        formatCurrency={formatCurrency}
        formatDate={(dateString) => {
          if (!dateString) return '-'
          return new Date(dateString).toLocaleString('id-ID')
        }}
        formatHijriyahDate={null}
        activeTab="masehi"
        getStatusBadge={getStatusBadge}
        canEdit={rencanaActions.canEdit(rencanaDetailHook.selectedRencana)}
        canApprove={rencanaActions.canApprove(rencanaDetailHook.selectedRencana)}
        onEdit={() => rencanaActions.handleEdit(rencanaDetailHook.selectedRencana?.id)}
        onApprove={handleRencanaApprove}
        onReject={handleRencanaReject}
        listAdmins={rencanaAdminList.listAdmins}
        selectedAdmins={rencanaAdminList.selectedAdmins}
        onToggleAdmin={rencanaAdminList.toggleAdmin}
        loadingAdmins={rencanaAdminList.loading}
        onSendNotification={async () => {
          if (rencanaDetailHook.rencanaDetail && rencanaAdminList.selectedAdmins.length > 0) {
            // Tentukan action berdasarkan status rencana
            const ket = rencanaDetailHook.rencanaDetail.ket || 'pending'
            let action = 'pending' // default untuk pending
            
            if (ket === 'di approve' || ket === 'disetujui') {
              action = 'approve'
            } else if (ket === 'ditolak') {
              action = 'reject'
            } else {
              // pending, di edit, atau status lainnya -> pending
              action = 'pending'
            }
            
            await sendRencanaNotifications(rencanaDetailHook.rencanaDetail, action, rencanaAdminList.selectedAdmins, rencanaAdminList.listAdmins)
          }
        }}
      />

      {/* Detail Modal - Removed, using offcanvas instead */}

      {/* Confirm Modal */}
      <Modal
        isOpen={rencanaModals.showConfirmModal || (rencanaModals.confirmAction === 'delete-komentar')}
        onClose={() => {
          rencanaModals.closeConfirmModal()
          confirmAdminList.resetSelection()
          setConfirmKomentarId(null)
          setConfirmKomentarData(null)
        }}
        title={rencanaModals.confirmAction === 'delete-komentar' ? 'Konfirmasi Hapus Komentar' : rencanaModals.confirmAction === 'approve' ? 'Konfirmasi Approve' : 'Konfirmasi Reject'}
        maxWidth={rencanaModals.confirmAction === 'delete-komentar' ? 'max-w-md' : 'max-w-2xl'}
      >
        <div className="p-6">
          {/* Modal untuk Hapus Komentar */}
          {rencanaModals.confirmAction === 'delete-komentar' ? (
            <>
              <p className="text-gray-700 dark:text-gray-300 mb-6">
                Apakah Anda yakin ingin menghapus komentar ini? Tindakan ini tidak dapat dibatalkan.
              </p>
              {confirmKomentarData && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6 border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-gray-800 dark:text-gray-200 text-sm">
                      {confirmKomentarData.admin_nama || 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(confirmKomentarData.tanggal_dibuat).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {confirmKomentarData.komentar}
                  </p>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    rencanaModals.closeConfirmModal()
                    setConfirmKomentarId(null)
                    setConfirmKomentarData(null)
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={async () => {
                    if (!rencanaModals.confirmId || !confirmKomentarId) return
                    try {
                      const response = await pengeluaranAPI.deleteKomentar(rencanaModals.confirmId, confirmKomentarId)
                      if (response.success) {
                        // Reload detail
                        const detailResponse = await pengeluaranAPI.getRencanaDetail(rencanaModals.confirmId)
                        if (detailResponse.success) {
                          rencanaDetailHook.setRencanaDetail(detailResponse.data)
                        }
                        showNotification('Komentar berhasil dihapus', 'success')
                        rencanaModals.closeConfirmModal()
                        setConfirmKomentarId(null)
                        setConfirmKomentarData(null)
                      } else {
                        showNotification(response.message || 'Gagal menghapus komentar', 'error')
                      }
                    } catch (error) {
                      console.error('Error deleting komentar:', error)
                      showNotification('Gagal menghapus komentar', 'error')
                    }
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                >
                  Hapus
                </button>
              </div>
            </>
          ) : (
            <>
              {/* List Admin untuk Notifikasi - Dipindah ke atas */}
              <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Kirim Notifikasi ke Admin
              </h3>
            </div>
            
            {confirmAdminList.loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
              </div>
            ) : confirmAdminList.listAdmins.length > 0 ? (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {confirmAdminList.listAdmins.map((admin) => (
                    <div
                      key={admin.id}
                      className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={confirmAdminList.selectedAdmins.includes(admin.id)}
                        onChange={() => confirmAdminList.toggleAdmin(admin.id)}
                        className="w-4 h-4 text-teal-600 border-gray-300 dark:border-gray-600 rounded focus:ring-teal-500 dark:bg-gray-700"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          {admin.nama || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {admin.whatsapp}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Tidak ada admin tersedia
                </p>
              </div>
              )}
              </div>

              {/* Preview Pesan dengan Accordion - Dipindah ke atas */}
              {(() => {
            const rencanaData = allRencana.find(r => r.id === rencanaModals.confirmId)
            const previewPesan = rencanaData ? generatePreviewPesanWrapper(rencanaData, rencanaModals.confirmAction) : ''
            
            return (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => rencanaModals.setShowPreviewPesan(!rencanaModals.showPreviewPesan)}
                  className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Preview Pesan WhatsApp
                  </span>
                  <svg 
                    className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${rencanaModals.showPreviewPesan ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <AnimatePresence>
                  {rencanaModals.showPreviewPesan && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                        <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                          {previewPesan}
                        </pre>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              )
            })()}

            <p className="text-gray-700 dark:text-gray-300 mb-6">
              {rencanaModals.confirmAction === 'approve' 
                ? 'Apakah Anda yakin ingin meng-approve rencana pengeluaran ini?'
                : 'Apakah Anda yakin ingin menolak rencana pengeluaran ini?'}
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  rencanaModals.closeConfirmModal()
                  confirmAdminList.resetSelection()
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
              >
                Batal
              </button>
              {rencanaModals.confirmAction === 'reject' && (
                <button
                  onClick={async () => {
                    // Tutup modal
                    rencanaModals.closeConfirmModal()
                    confirmAdminList.resetSelection()
                    
                    // Cari rencana yang akan dibuka
                    const rencana = allRencana.find(r => r.id === rencanaModals.confirmId)
                    if (rencana) {
                      // Buka offcanvas dan scroll ke input komentar
                      await handleRencanaClick(rencana, true)
                    }
                  }}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Komentar
                </button>
              )}
              <button
                onClick={handleConfirmAction}
                disabled={rencanaModals.loading}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  rencanaModals.confirmAction === 'approve'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {rencanaModals.loading ? 'Memproses...' : rencanaModals.confirmAction === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
            </>
          )}
        </div>
      </Modal>

      {/* Rencana Detail Offcanvas - Moved to DetailOffcanvas component */}

      {/* Modal Konfirmasi Approve/Reject */}
      {rencanaModals.showApproveRejectModal && createPortal(
        <AnimatePresence>
          {rencanaModals.showApproveRejectModal && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black bg-opacity-50 z-[100000]"
                onClick={() => {
                  rencanaModals.closeApproveRejectModal()
                  rencanaAdminList.resetSelection()
                }}
              />
              
              {/* Modal Content */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[100001] flex items-center justify-center p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-6">
                    <div className="space-y-6">
                      {/* Header */}
                      <div className="flex items-center gap-4">
                        {rencanaModals.pendingAction === 'approve' ? (
                          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        )}
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                          Konfirmasi {rencanaModals.pendingAction === 'approve' ? 'Uprove' : 'Tolak'} Rencana
                        </h2>
                      </div>
                      
                      {/* Preview Pesan */}
                      {rencanaDetailHook.rencanaDetail && (() => {
                        // Gunakan template terpusat untuk preview
                        const status = rencanaModals.pendingAction === 'approve' ? 'approve' : 'reject'
                        const previewPesan = generateRencanaWhatsAppMessage(rencanaDetailHook.rencanaDetail, status, { user })
                        
                        return (
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Preview Pesan Notifikasi:</h3>
                            <div className="bg-white dark:bg-gray-800 rounded p-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap border border-gray-200 dark:border-gray-600">
                              {previewPesan}
                            </div>
                          </div>
                        )
                      })()}

                      {/* List Admin */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          Pilih Admin untuk Dikirimi Notifikasi:
                        </h3>
                        {rencanaAdminList.loading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
                          </div>
                        ) : rencanaAdminList.listAdmins.length > 0 ? (
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
                            <div className="space-y-2 max-h-64 overflow-y-auto">
                              {rencanaAdminList.listAdmins.map((admin) => (
                                <div
                                  key={admin.id}
                                  className={`flex items-center gap-3 rounded-lg p-3 border transition-colors ${
                                    rencanaAdminList.selectedAdmins.includes(admin.id)
                                      ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700'
                                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={rencanaAdminList.selectedAdmins.includes(admin.id)}
                                    onChange={() => rencanaAdminList.toggleAdmin(admin.id)}
                                    disabled={!admin.whatsapp}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-50"
                                  />
                                  <div className="flex-1">
                                    <p className={`text-sm font-medium ${
                                      rencanaAdminList.selectedAdmins.includes(admin.id)
                                        ? 'text-primary-800 dark:text-primary-200'
                                        : 'text-gray-800 dark:text-gray-200'
                                    }`}>
                                      {admin.nama || 'Unknown'}
                                    </p>
                                    <p className={`text-xs ${
                                      admin.whatsapp
                                        ? 'text-gray-500 dark:text-gray-400'
                                        : 'text-red-500 dark:text-red-400'
                                    }`}>
                                      {admin.whatsapp || 'Tidak ada WhatsApp'}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center border border-gray-200 dark:border-gray-600">
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Tidak ada admin tersedia
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Footer */}
                  <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-3">
                    <button
                      onClick={() => {
                        rencanaModals.closeApproveRejectModal()
                        rencanaAdminList.resetSelection()
                      }}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Batal
                    </button>
                    {rencanaModals.pendingAction === 'reject' && rencanaDetailHook.rencanaDetail && (
                      <button
                        onClick={async () => {
                          // Tutup modal
                          rencanaModals.closeApproveRejectModal()
                          rencanaAdminList.resetSelection()
                          
                          // Buka offcanvas dan scroll ke input komentar
                          await handleRencanaClick(rencanaDetailHook.rencanaDetail, true)
                        }}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        Komentar
                      </button>
                    )}
                    <button
                      onClick={handleConfirmApproveReject}
                      disabled={rencanaModals.loading || rencanaAdminList.selectedAdmins.length === 0}
                      className={`px-4 py-2 text-white rounded-lg transition-colors flex items-center gap-2 ${
                        rencanaModals.pendingAction === 'approve'
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-red-600 hover:bg-red-700'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {rencanaModals.loading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                          <span>Memproses...</span>
                        </>
                      ) : (
                        <>
                          {rencanaModals.pendingAction === 'approve' ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                          <span>Konfirmasi {rencanaModals.pendingAction === 'approve' ? 'Uprove' : 'Tolak'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      , document.body)}
    </div>
  )
}

export default Pengeluaran
