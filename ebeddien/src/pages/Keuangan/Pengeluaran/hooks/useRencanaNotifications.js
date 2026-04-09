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
   * Kirim notifikasi ke multiple admins untuk rencana (non-blocking; backend memproses di latar belakang).
   */
  const sendRencanaNotifications = useCallback(
    (rencanaData, action, selectedAdmins, listAdmins) => {
      void (async () => {
        if (selectedAdmins.length === 0) {
          return
        }

        const selectedAdminData = listAdmins.filter((admin) => selectedAdmins.includes(admin.id))
        const adminsWithWhatsapp = selectedAdminData.filter((admin) => admin.whatsapp)

        if (adminsWithWhatsapp.length === 0) {
          return
        }

        let updatedRencanaData = rencanaData
        if (rencanaData && rencanaData.id) {
          try {
            const response = await pengeluaranAPI.getRencanaDetail(rencanaData.id)
            if (response.success && response.data) {
              updatedRencanaData = {
                ...rencanaData,
                ...response.data,
                admin_nama: rencanaData.admin_nama || response.data.admin_nama || '-',
                jumlah_komentar: response.data.jumlah_komentar ?? rencanaData.jumlah_komentar ?? 0,
                jumlah_viewer: response.data.jumlah_viewer ?? rencanaData.jumlah_viewer ?? 0,
                admin_approve_nama: response.data.admin_approve_nama ?? rencanaData.admin_approve_nama
              }
            }
          } catch (error) {
            console.error('Error fetching updated rencana data:', error)
          }
        }

        let status = 'pending'
        if (action === 'approve') {
          status = 'approve'
        } else if (action === 'reject') {
          status = 'reject'
        } else {
          status = 'pending'
        }

        const ket = updatedRencanaData.ket || ''
        const hasEditHistory =
          updatedRencanaData.edit_history && Object.keys(updatedRencanaData.edit_history).length > 0
        const isCreateMode = ket !== 'di edit' && !hasEditHistory && ket === 'pending'
        const pesan = generateRencanaWhatsAppMessage(updatedRencanaData, status, {
          user,
          isCreateMode: status === 'pending' ? isCreateMode : false
        })

        try {
          const result = await pengeluaranAPI.sendNotifWa(
            updatedRencanaData.id,
            pesan,
            adminsWithWhatsapp.map((a) => ({ id: a.id, whatsapp: a.whatsapp }))
          )
          if (result.success) {
            if (result.data?.queued) {
              return
            }
            const successCount = result.data?.success_count ?? 0
            const failCount = result.data?.fail_count ?? 0
            if (failCount === 0) {
              showNotification(
                result.message || `Notifikasi berhasil dikirim ke ${successCount} admin`,
                'success'
              )
            } else {
              showNotification(
                result.message ||
                  `Notifikasi berhasil dikirim ke ${successCount} admin, gagal ke ${failCount} admin`,
                'warning'
              )
            }
          } else {
            showNotification(result.message || 'Gagal mengirim notifikasi', 'error')
          }
        } catch (error) {
          console.error('Error sending rencana notifications:', error)
          showNotification(
            error.response?.data?.message || error.message || 'Gagal mengirim notifikasi',
            'error'
          )
        }
      })()
    },
    [showNotification, user]
  )

  /**
   * Kirim notifikasi untuk modal konfirmasi (approve/reject dari list) — non-blocking.
   */
  const sendNotificationsToConfirmAdmins = useCallback(
    (rencanaData, action, selectedAdmins, listAdmins) => {
      void (async () => {
        if (selectedAdmins.length === 0) {
          return
        }

        const selectedAdminData = listAdmins.filter((admin) => selectedAdmins.includes(admin.id))
        const adminsWithWhatsapp = selectedAdminData.filter((admin) => admin.whatsapp)

        if (adminsWithWhatsapp.length === 0) {
          return
        }

        const status = action === 'approve' ? 'approve' : 'reject'
        const pesan = generateRencanaWhatsAppMessage(rencanaData, status, {
          user,
          actionLabel: action === 'approve' ? (user?.nama || '') : undefined
        })

        try {
          const result = await pengeluaranAPI.sendNotifWa(
            rencanaData.id,
            pesan,
            adminsWithWhatsapp.map((a) => ({ id: a.id, whatsapp: a.whatsapp }))
          )
          if (result.success) {
            if (result.data?.queued) {
              return
            }
            const successCount = result.data?.success_count ?? 0
            const failCount = result.data?.fail_count ?? 0
            if (failCount === 0) {
              showNotification(
                result.message || `Notifikasi berhasil dikirim ke ${successCount} admin`,
                'success'
              )
            } else {
              showNotification(
                result.message ||
                  `Notifikasi berhasil dikirim ke ${successCount} admin, gagal ke ${failCount} admin`,
                'warning'
              )
            }
          } else {
            showNotification(result.message || 'Gagal mengirim notifikasi', 'error')
          }
        } catch (error) {
          console.error('Error sending notifications to confirm admins:', error)
          showNotification(
            error.response?.data?.message || error.message || 'Gagal mengirim notifikasi',
            'error'
          )
        }
      })()
    },
    [showNotification, user]
  )

  return {
    sendRencanaNotifications,
    sendNotificationsToConfirmAdmins
  }
}
