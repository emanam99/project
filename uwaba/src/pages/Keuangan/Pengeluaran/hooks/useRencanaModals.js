import { useState, useCallback } from 'react'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

/**
 * Custom hook untuk mengelola modal state dan actions (approve/reject)
 * @param {Function} loadAllRencana - Function untuk reload list rencana
 * @param {Function} onCloseOffcanvas - Callback untuk menutup offcanvas
 * @param {Function} sendNotifications - Function untuk mengirim notifikasi
 * @param {Array} allRencana - Array of all rencana (untuk mencari data)
 * @returns {Object} State dan handlers untuk modals
 */
export const useRencanaModals = (loadAllRencana, onCloseOffcanvas, sendNotifications, allRencana) => {
  const { showNotification } = useNotification()
  
  // Modal konfirmasi (dari list)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null) // 'approve' atau 'reject'
  const [confirmId, setConfirmId] = useState(null)
  const [showPreviewPesan, setShowPreviewPesan] = useState(false)
  
  // Modal approve/reject (dari offcanvas)
  const [showApproveRejectModal, setShowApproveRejectModal] = useState(false)
  const [pendingAction, setPendingAction] = useState(null) // 'approve' or 'reject'
  
  const [loading, setLoading] = useState(false)

  const openConfirmModal = useCallback((action, id) => {
    setConfirmAction(action)
    setConfirmId(id)
    setShowConfirmModal(true)
  }, [])

  const closeConfirmModal = useCallback(() => {
    setShowConfirmModal(false)
    setConfirmAction(null)
    setConfirmId(null)
    setShowPreviewPesan(false)
  }, [])

  const openApproveRejectModal = useCallback((action) => {
    setPendingAction(action)
    setShowApproveRejectModal(true)
  }, [])

  const closeApproveRejectModal = useCallback(() => {
    setShowApproveRejectModal(false)
    setPendingAction(null)
  }, [])

  const handleConfirmAction = useCallback(async (rencanaDetail, confirmSelectedAdmins, confirmListAdmins) => {
    if (!confirmId || !confirmAction) return

    try {
      setLoading(true)
      
      // Ambil data rencana dari allRencana atau rencanaDetail untuk notifikasi
      const rencanaData = allRencana.find(r => r.id === confirmId) || rencanaDetail
      
      let response
      if (confirmAction === 'approve') {
        response = await pengeluaranAPI.approveRencana(confirmId)
        if (response.success) {
          showNotification('Rencana berhasil di-approve', 'success')
          loadAllRencana()
          
          // Tutup offcanvas jika terbuka
          if (onCloseOffcanvas) {
            onCloseOffcanvas()
          }
          
          // Kirim notifikasi jika ada rencana data dan admin terpilih
          if (rencanaData && confirmSelectedAdmins.length > 0 && sendNotifications) {
            await sendNotifications(rencanaData, confirmAction, confirmSelectedAdmins, confirmListAdmins)
          }
        } else {
          showNotification(response.message || 'Gagal meng-approve rencana', 'error')
        }
      } else if (confirmAction === 'reject') {
        response = await pengeluaranAPI.rejectRencana(confirmId)
        if (response.success) {
          showNotification('Rencana berhasil ditolak', 'success')
          loadAllRencana()
          
          // Tutup offcanvas jika terbuka
          if (onCloseOffcanvas) {
            onCloseOffcanvas()
          }
          
          // Kirim notifikasi jika ada rencana data dan admin terpilih
          if (rencanaData && confirmSelectedAdmins.length > 0 && sendNotifications) {
            await sendNotifications(rencanaData, confirmAction, confirmSelectedAdmins, confirmListAdmins)
          }
        } else {
          showNotification(response.message || 'Gagal menolak rencana', 'error')
        }
      }
      
      closeConfirmModal()
    } catch (err) {
      console.error(`Error ${confirmAction}ing rencana:`, err)
      showNotification(err.response?.data?.message || `Terjadi kesalahan saat ${confirmAction === 'approve' ? 'meng-approve' : 'menolak'} rencana`, 'error')
    } finally {
      setLoading(false)
    }
  }, [confirmId, confirmAction, allRencana, loadAllRencana, onCloseOffcanvas, sendNotifications, showNotification, closeConfirmModal])

  const handleConfirmApproveReject = useCallback(async (rencanaDetail, confirmRencanaSelectedAdmins, rencanaListAdmins) => {
    if (!rencanaDetail || !pendingAction) return

    try {
      setLoading(true)
      
      let response
      if (pendingAction === 'approve') {
        response = await pengeluaranAPI.approveRencana(rencanaDetail.id)
        if (response.success) {
          showNotification('Rencana berhasil di-approve', 'success')
          loadAllRencana()
          
          // Tutup offcanvas jika terbuka
          if (onCloseOffcanvas) {
            onCloseOffcanvas()
          }
          
          // Kirim notifikasi jika ada admin terpilih
          if (confirmRencanaSelectedAdmins.length > 0 && sendNotifications) {
            await sendNotifications(rencanaDetail, 'approve', confirmRencanaSelectedAdmins, rencanaListAdmins)
          }
        } else {
          showNotification(response.message || 'Gagal meng-approve rencana', 'error')
        }
      } else if (pendingAction === 'reject') {
        response = await pengeluaranAPI.rejectRencana(rencanaDetail.id)
        if (response.success) {
          showNotification('Rencana berhasil ditolak', 'success')
          loadAllRencana()
          
          // Tutup offcanvas jika terbuka
          if (onCloseOffcanvas) {
            onCloseOffcanvas()
          }
          
          // Kirim notifikasi jika ada admin terpilih
          if (confirmRencanaSelectedAdmins.length > 0 && sendNotifications) {
            await sendNotifications(rencanaDetail, 'reject', confirmRencanaSelectedAdmins, rencanaListAdmins)
          }
        } else {
          showNotification(response.message || 'Gagal menolak rencana', 'error')
        }
      }
      
      closeApproveRejectModal()
    } catch (err) {
      console.error(`Error ${pendingAction}ing rencana:`, err)
      showNotification(err.response?.data?.message || `Terjadi kesalahan saat ${pendingAction === 'approve' ? 'meng-approve' : 'menolak'} rencana`, 'error')
    } finally {
      setLoading(false)
    }
  }, [pendingAction, loadAllRencana, onCloseOffcanvas, sendNotifications, showNotification, closeApproveRejectModal])

  return {
    // Confirm modal state
    showConfirmModal,
    confirmAction,
    confirmId,
    showPreviewPesan,
    setShowPreviewPesan,
    openConfirmModal,
    closeConfirmModal,
    handleConfirmAction,
    
    // Approve/Reject modal state
    showApproveRejectModal,
    pendingAction,
    openApproveRejectModal,
    closeApproveRejectModal,
    handleConfirmApproveReject,
    
    // Loading
    loading
  }
}

