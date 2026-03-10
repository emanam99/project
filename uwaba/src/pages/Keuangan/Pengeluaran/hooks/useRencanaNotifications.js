import { useCallback } from 'react'
import { useNotification } from '../../../../contexts/NotificationContext'
import { useAuthStore } from '../../../../store/authStore'
import { generateRencanaWhatsAppMessage } from '../utils/pengeluaranUtils'
import { pengeluaranAPI } from '../../../../services/api'

/**
 * Custom hook untuk mengelola pengiriman notifikasi WhatsApp untuk rencana
 * @returns {Object} Functions untuk mengirim notifikasi
 */
export const useRencanaNotifications = () => {
  const { showNotification } = useNotification()
  const { user } = useAuthStore()

  /**
   * Kirim notifikasi ke multiple admins untuk rencana
   * @param {Object} rencanaData - Data rencana
   * @param {string} action - 'pending', 'approve', atau 'reject'
   * @param {Array} selectedAdmins - Array of admin IDs yang terpilih
   * @param {Array} listAdmins - Array of all admins
   */
  const sendRencanaNotifications = useCallback(async (rencanaData, action, selectedAdmins, listAdmins) => {
    if (selectedAdmins.length === 0) {
      return
    }

    const selectedAdminData = listAdmins.filter(admin => selectedAdmins.includes(admin.id))
    const adminsWithWhatsapp = selectedAdminData.filter(admin => admin.whatsapp)
    
    if (adminsWithWhatsapp.length === 0) {
      return
    }

    // Fetch data rencana terbaru untuk mendapatkan jumlah komentar, viewer, dan (untuk approve) siapa yang approve dari DB
    let updatedRencanaData = rencanaData
    if (rencanaData && rencanaData.id) {
      try {
        const response = await pengeluaranAPI.getRencanaDetail(rencanaData.id)
        if (response.success && response.data) {
          // Merge data terbaru dengan data yang sudah ada
          // Pastikan admin_nama dari rencanaData tetap digunakan (pembuat asli)
          // Untuk kirim ulang notif approve: pakai admin_approve_nama dari DB (response.data)
          updatedRencanaData = {
            ...rencanaData,
            ...response.data,
            admin_nama: rencanaData.admin_nama || response.data.admin_nama || '-',
            jumlah_komentar: response.data.jumlah_komentar ?? rencanaData.jumlah_komentar ?? 0,
            jumlah_viewer: response.data.jumlah_viewer ?? rencanaData.jumlah_viewer ?? 0,
            // Kirim ulang = ambil siapa yang approve dari database
            admin_approve_nama: response.data.admin_approve_nama ?? rencanaData.admin_approve_nama
          }
        }
      } catch (error) {
        console.error('Error fetching updated rencana data:', error)
        // Jika error, gunakan data yang sudah ada
      }
    }

    // Gunakan template terpusat berdasarkan status
    // Support: 'pending', 'approve', 'reject'
    let status = 'pending' // default
    if (action === 'approve') {
      status = 'approve'
    } else if (action === 'reject') {
      status = 'reject'
    } else {
      status = 'pending'
    }
    
    // Untuk pending, perlu cek apakah ini create atau edit
    // Jika status adalah 'di edit' atau ada edit_history, maka ini adalah edit mode
    const ket = updatedRencanaData.ket || ''
    const hasEditHistory = updatedRencanaData.edit_history && Object.keys(updatedRencanaData.edit_history).length > 0
    const isCreateMode = ket !== 'di edit' && !hasEditHistory && ket === 'pending'
    const pesan = generateRencanaWhatsAppMessage(updatedRencanaData, status, { 
      user,
      isCreateMode: status === 'pending' ? isCreateMode : false
    })

    try {
      const result = await pengeluaranAPI.sendNotifWa(
        updatedRencanaData.id,
        pesan,
        adminsWithWhatsapp.map(a => ({ id: a.id, whatsapp: a.whatsapp }))
      )
      if (result.success) {
        const successCount = result.data?.success_count ?? 0
        const failCount = result.data?.fail_count ?? 0
        if (failCount === 0) {
          showNotification(result.message || `Notifikasi berhasil dikirim ke ${successCount} admin`, 'success')
        } else {
          showNotification(result.message || `Notifikasi berhasil dikirim ke ${successCount} admin, gagal ke ${failCount} admin`, 'warning')
        }
      } else {
        showNotification(result.message || 'Gagal mengirim notifikasi', 'error')
      }
    } catch (error) {
      console.error('Error sending rencana notifications:', error)
      showNotification(error.response?.data?.message || error.message || 'Gagal mengirim notifikasi', 'error')
    }
  }, [showNotification, user])

  /**
   * Kirim notifikasi untuk modal konfirmasi (approve/reject dari list)
   * @param {Object} rencanaData - Data rencana
   * @param {string} action - 'approve' atau 'reject'
   * @param {Array} selectedAdmins - Array of admin IDs yang terpilih
   * @param {Array} listAdmins - Array of all admins
   */
  const sendNotificationsToConfirmAdmins = useCallback(async (rencanaData, action, selectedAdmins, listAdmins) => {
    if (selectedAdmins.length === 0) {
      return
    }

    const selectedAdminData = listAdmins.filter(admin => selectedAdmins.includes(admin.id))
    const adminsWithWhatsapp = selectedAdminData.filter(admin => admin.whatsapp)
    
    if (adminsWithWhatsapp.length === 0) {
      return
    }

    // Gunakan template terpusat berdasarkan status
    // Notif dikirim dari modal approve = yang approve adalah admin yang login
    const status = action === 'approve' ? 'approve' : 'reject'
    const pesan = generateRencanaWhatsAppMessage(rencanaData, status, {
      user,
      actionLabel: action === 'approve' ? (user?.nama || '') : undefined
    })

    try {
      const result = await pengeluaranAPI.sendNotifWa(
        rencanaData.id,
        pesan,
        adminsWithWhatsapp.map(a => ({ id: a.id, whatsapp: a.whatsapp }))
      )
      if (result.success) {
        const successCount = result.data?.success_count ?? 0
        const failCount = result.data?.fail_count ?? 0
        if (failCount === 0) {
          showNotification(result.message || `Notifikasi berhasil dikirim ke ${successCount} admin`, 'success')
        } else {
          showNotification(result.message || `Notifikasi berhasil dikirim ke ${successCount} admin, gagal ke ${failCount} admin`, 'warning')
        }
      } else {
        showNotification(result.message || 'Gagal mengirim notifikasi', 'error')
      }
    } catch (error) {
      console.error('Error sending notifications to confirm admins:', error)
      showNotification(error.response?.data?.message || error.message || 'Gagal mengirim notifikasi', 'error')
    }
  }, [showNotification, user])

  return {
    sendRencanaNotifications,
    sendNotificationsToConfirmAdmins
  }
}

