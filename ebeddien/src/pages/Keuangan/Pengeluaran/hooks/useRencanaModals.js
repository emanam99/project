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
/** @param {number[]} selectedIds @param {Array<{id:number, whatsapp?:string}>} listAdmins */
const waRecipientsFrom = (selectedIds, listAdmins) => {
  if (!Array.isArray(selectedIds) || !Array.isArray(listAdmins)) return []
  return listAdmins
    .filter((a) => selectedIds.includes(a.id) && a.whatsapp)
    .map((a) => ({ id: a.id, whatsapp: a.whatsapp }))
}

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
      
      const recipients = waRecipientsFrom(confirmSelectedAdmins, confirmListAdmins)

      let response
      if (confirmAction === 'approve') {
        response = await pengeluaranAPI.approveRencana(confirmId, recipients.length ? { recipients } : {})
        if (response.success) {
          showNotification('Rencana berhasil di-approve', 'success')
          const wa = response.data?.wa_notif
          if (wa && !wa.queued && !wa.async) {
            const total = (wa.success_count ?? 0) + (wa.fail_count ?? 0)
            if (total > 0) {
              const ok = wa.success_count ?? 0
              const fail = wa.fail_count ?? 0
              if (fail === 0) showNotification(`Notifikasi WA terkirim ke ${ok} admin`, 'success')
              else showNotification(`WA: ${ok} berhasil, ${fail} gagal`, 'warning')
            }
          } else if (!wa && rencanaData && confirmSelectedAdmins.length > 0 && sendNotifications) {
            sendNotifications(rencanaData, confirmAction, confirmSelectedAdmins, confirmListAdmins)
          }
          loadAllRencana()

          if (onCloseOffcanvas) {
            onCloseOffcanvas()
          }
        } else {
          showNotification(response.message || 'Gagal meng-approve rencana', 'error')
        }
      } else if (confirmAction === 'reject') {
        response = await pengeluaranAPI.rejectRencana(confirmId, recipients.length ? { recipients } : {})
        if (response.success) {
          showNotification('Rencana berhasil ditolak', 'success')
          const wa = response.data?.wa_notif
          if (wa && !wa.queued && !wa.async) {
            const total = (wa.success_count ?? 0) + (wa.fail_count ?? 0)
            if (total > 0) {
              const ok = wa.success_count ?? 0
              const fail = wa.fail_count ?? 0
              if (fail === 0) showNotification(`Notifikasi WA terkirim ke ${ok} admin`, 'success')
              else showNotification(`WA: ${ok} berhasil, ${fail} gagal`, 'warning')
            }
          } else if (!wa && rencanaData && confirmSelectedAdmins.length > 0 && sendNotifications) {
            sendNotifications(rencanaData, confirmAction, confirmSelectedAdmins, confirmListAdmins)
          }
          loadAllRencana()

          if (onCloseOffcanvas) {
            onCloseOffcanvas()
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
      
      const recipients = waRecipientsFrom(confirmRencanaSelectedAdmins, rencanaListAdmins)

      let response
      if (pendingAction === 'approve') {
        response = await pengeluaranAPI.approveRencana(rencanaDetail.id, recipients.length ? { recipients } : {})
        if (response.success) {
          showNotification('Rencana berhasil di-approve', 'success')
          const wa = response.data?.wa_notif
          if (wa && !wa.queued && !wa.async) {
            const total = (wa.success_count ?? 0) + (wa.fail_count ?? 0)
            if (total > 0) {
              const ok = wa.success_count ?? 0
              const fail = wa.fail_count ?? 0
              if (fail === 0) showNotification(`Notifikasi WA terkirim ke ${ok} admin`, 'success')
              else showNotification(`WA: ${ok} berhasil, ${fail} gagal`, 'warning')
            }
          } else if (!wa && confirmRencanaSelectedAdmins.length > 0 && sendNotifications) {
            sendNotifications(rencanaDetail, 'approve', confirmRencanaSelectedAdmins, rencanaListAdmins)
          }
          loadAllRencana()

          if (onCloseOffcanvas) {
            onCloseOffcanvas()
          }
        } else {
          showNotification(response.message || 'Gagal meng-approve rencana', 'error')
        }
      } else if (pendingAction === 'reject') {
        response = await pengeluaranAPI.rejectRencana(rencanaDetail.id, recipients.length ? { recipients } : {})
        if (response.success) {
          showNotification('Rencana berhasil ditolak', 'success')
          const wa = response.data?.wa_notif
          if (wa && !wa.queued && !wa.async) {
            const total = (wa.success_count ?? 0) + (wa.fail_count ?? 0)
            if (total > 0) {
              const ok = wa.success_count ?? 0
              const fail = wa.fail_count ?? 0
              if (fail === 0) showNotification(`Notifikasi WA terkirim ke ${ok} admin`, 'success')
              else showNotification(`WA: ${ok} berhasil, ${fail} gagal`, 'warning')
            }
          } else if (!wa && confirmRencanaSelectedAdmins.length > 0 && sendNotifications) {
            sendNotifications(rencanaDetail, 'reject', confirmRencanaSelectedAdmins, rencanaListAdmins)
          }
          loadAllRencana()

          if (onCloseOffcanvas) {
            onCloseOffcanvas()
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

