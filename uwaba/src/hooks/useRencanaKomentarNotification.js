import { useCallback } from 'react'
import { usePWANotification } from './usePWANotification'
import { userAPI } from '../services/api'
import { getGambarUrl } from '../config/images'

/**
 * Custom hook untuk mengirim notifikasi PWA ketika ada komentar baru di rencana pengeluaran
 * Hanya mengirim ke super_admin dan admin_uwaba
 */
export const useRencanaKomentarNotification = () => {
  const { sendNotification, isGranted } = usePWANotification()

  /**
   * Kirim notifikasi PWA ke super_admin dan admin_uwaba ketika ada komentar baru
   * @param {Object} options - Opsi notifikasi
   * @param {number} options.rencanaId - ID rencana pengeluaran
   * @param {string} options.rencanaKeterangan - Keterangan rencana
   * @param {string} options.komentar - Isi komentar
   * @param {string} options.komentarAuthor - Nama pembuat komentar
   */
  const sendKomentarNotification = useCallback(async (options) => {
    const { rencanaId, rencanaKeterangan, komentar, komentarAuthor } = options

    // Cek permission
    if (!isGranted) {
      // Permission belum diberikan, skip notifikasi
      return
    }

    try {
      // Ambil list hanya super_admin dan admin_uwaba
      const response = await userAPI.getSuperAdminAndUwaba()
      if (!response.success) {
        console.error('Failed to get admin list for notification')
        return
      }

      const targetAdmins = response.data || []
      if (targetAdmins.length === 0) {
        // Tidak ada admin target, skip
        return
      }

      // Kirim notifikasi untuk setiap admin target
      // Note: PWA notification akan otomatis muncul di semua device yang sudah grant permission
      // Jadi kita hanya perlu kirim sekali, browser akan handle distribusinya
      
      const baseUrl = window.location.origin
      const rencanaUrl = `${baseUrl}/pengeluaran?rencana=${rencanaId}`

      // Potong komentar jika terlalu panjang
      const komentarPreview = komentar.length > 100 
        ? komentar.substring(0, 100) + '...' 
        : komentar

      // Potong keterangan jika terlalu panjang
      const keteranganPreview = rencanaKeterangan && rencanaKeterangan.length > 50
        ? rencanaKeterangan.substring(0, 50) + '...'
        : rencanaKeterangan || 'Rencana Pengeluaran'

      await sendNotification({
        title: '💬 Komentar Baru di Rencana Pengeluaran',
        body: `${komentarAuthor} mengomentari: "${keteranganPreview}"\n\n"${komentarPreview}"`,
        icon: getGambarUrl('/icon/icon192.png'),
        badge: getGambarUrl('/icon/icon128.png'),
        tag: `rencana-komentar-${rencanaId}`, // Tag untuk grouping
        data: {
          url: rencanaUrl,
          rencanaId: rencanaId,
          type: 'rencana-komentar'
        },
        requireInteraction: false,
        vibrate: [200, 100, 200], // Vibration pattern
        actions: [
          {
            action: 'view',
            title: 'Lihat Rencana',
            icon: getGambarUrl('/icon/icon128.png')
          }
        ]
      })

    } catch (error) {
      // Jangan throw error, hanya log
      // Notifikasi PWA adalah fitur tambahan, tidak boleh mengganggu flow utama
      console.error('Error sending PWA notification for new comment:', error)
    }
  }, [sendNotification, isGranted])

  return {
    sendKomentarNotification
  }
}

