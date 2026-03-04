import { useState, useCallback } from 'react'
import { userAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

/**
 * Custom hook untuk mengelola loading dan selection admin list
 * @param {boolean} onlySuperAdminAndUwaba - Jika true, hanya load super admin dan admin uwaba
 * @returns {Object} State dan handlers untuk admin list
 */
export const useAdminList = (onlySuperAdminAndUwaba = false) => {
  const { showNotification } = useNotification()
  const [listAdmins, setListAdmins] = useState([])
  const [selectedAdmins, setSelectedAdmins] = useState([])
  const [loading, setLoading] = useState(false)

  const loadAdmins = useCallback(async () => {
    try {
      setLoading(true)
      // Gunakan API yang sesuai berdasarkan parameter
      const response = onlySuperAdminAndUwaba 
        ? await userAPI.getSuperAdminAndUwaba()
        : await userAPI.getAll()
      if (response.success) {
        let adminList = response.data || []
        
        // Jika menggunakan getSuperAdminAndUwaba, filter hanya admin yang punya role admin_uwaba
        // (termasuk yang juga punya super_admin, tapi harus punya admin_uwaba)
        if (onlySuperAdminAndUwaba) {
          // Deduplicate berdasarkan id untuk menghindari duplikasi
          const adminUwabaMap = new Map()
          adminList.forEach(admin => {
            // Hanya ambil yang punya role admin_uwaba
            // Backend sudah filter, tapi untuk memastikan, kita filter lagi di frontend
            if (admin.role_key === 'admin_uwaba' || !admin.role_key) {
              // Jika belum ada di map, tambahkan
              if (!adminUwabaMap.has(admin.id)) {
                adminUwabaMap.set(admin.id, admin)
              }
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

