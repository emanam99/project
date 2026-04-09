import { useState, useCallback } from 'react'
import { userAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

/**
 * Custom hook untuk mengelola loading dan selection admin list
 * @param {boolean} onlySuperAdminAndUwaba - Jika true, load penerima WA pengeluaran (endpoint list-super-admin-uwaba + lembaga_id)
 * @returns {Object} State dan handlers untuk admin list
 */
export const useAdminList = (onlySuperAdminAndUwaba = false) => {
  const { showNotification } = useNotification()
  const [listAdmins, setListAdmins] = useState([])
  const [selectedAdmins, setSelectedAdmins] = useState([])
  const [loading, setLoading] = useState(false)

  /**
   * @param {string|null} [lembagaId]
   * @param {boolean} [notifDraft] - true = daftar penerima WA untuk rencana draft (satu lembaga, aksi draft.notif)
   */
  const loadAdmins = useCallback(async (lembagaId = null, notifDraft = false) => {
    try {
      setLoading(true)
      // Gunakan API yang sesuai berdasarkan parameter
      const response = onlySuperAdminAndUwaba
        ? await userAPI.getSuperAdminAndUwaba(lembagaId, notifDraft ? { notifContext: 'draft' } : {})
        : await userAPI.getAll()
      if (response.success) {
        let adminList = response.data || []
        
        // Jika memakai endpoint khusus, backend sudah menentukan policy; frontend hanya dedupe.
        if (onlySuperAdminAndUwaba) {
          const adminUwabaMap = new Map()
          adminList.forEach((admin) => {
            if (!adminUwabaMap.has(admin.id)) {
              adminUwabaMap.set(admin.id, admin)
            }
          })
          adminList = Array.from(adminUwabaMap.values())
        }
        
        // Hanya tampilkan admin yang memiliki nomor WhatsApp
        const adminsWithWhatsapp = adminList.filter(admin => 
          admin.whatsapp && admin.whatsapp.trim() !== ''
        )
        setListAdmins(adminsWithWhatsapp)
        // Secara default, centang semua admin yang memiliki nomor WhatsApp
        setSelectedAdmins(adminsWithWhatsapp.map(admin => admin.id))
      } else {
        showNotification(response.message || 'Gagal memuat daftar admin', 'error')
      }
    } catch (err) {
      console.error('Error loading admins:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat daftar admin', 'error')
    } finally {
      setLoading(false)
    }
  }, [showNotification, onlySuperAdminAndUwaba])

  const toggleAdmin = useCallback((adminId) => {
    setSelectedAdmins(prev => {
      if (prev.includes(adminId)) {
        return prev.filter(id => id !== adminId)
      } else {
        return [...prev, adminId]
      }
    })
  }, [])

  const resetSelection = useCallback(() => {
    setSelectedAdmins([])
  }, [])

  return {
    listAdmins,
    selectedAdmins,
    loading,
    loadAdmins,
    toggleAdmin,
    resetSelection,
    setSelectedAdmins
  }
}

