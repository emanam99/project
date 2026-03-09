import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

/**
 * Custom hook untuk mengelola pengeluaran detail offcanvas state dengan URL state management
 * @returns {Object} State dan handlers untuk pengeluaran detail
 */
export const usePengeluaranDetail = () => {
  const { showNotification } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showPengeluaranOffcanvas, setShowPengeluaranOffcanvas] = useState(false)
  const [selectedPengeluaran, setSelectedPengeluaran] = useState(null)
  const [loadingPengeluaranDetail, setLoadingPengeluaranDetail] = useState(false)

  const handleViewDetail = useCallback(async (id, onLoadAdmins) => {
    try {
      setLoadingPengeluaranDetail(true)
      
      // Update URL dengan pengeluaran ID (push state agar tombol Back menutup offcanvas)
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.set('pengeluaran', id.toString())
      newSearchParams.delete('rencana')
      setSearchParams(newSearchParams, { replace: false })
      
      const response = await pengeluaranAPI.getPengeluaranDetail(id)
      if (response.success) {
        setSelectedPengeluaran(response.data)
        setShowPengeluaranOffcanvas(true)
        // Load list admins when offcanvas opens
        if (onLoadAdmins) {
          onLoadAdmins()
        }
      } else {
        showNotification(response.message || 'Gagal memuat detail pengeluaran', 'error')
        // Hapus query param jika gagal
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('pengeluaran')
        setSearchParams(newSearchParams, { replace: true })
      }
    } catch (err) {
      console.error('Error loading pengeluaran detail:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail pengeluaran', 'error')
      // Hapus query param jika error
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('pengeluaran')
      setSearchParams(newSearchParams, { replace: true })
    } finally {
      setLoadingPengeluaranDetail(false)
    }
  }, [showNotification, searchParams, setSearchParams])

  const closePengeluaranOffcanvas = useCallback(() => {
    setShowPengeluaranOffcanvas(false)
    setSelectedPengeluaran(null)
    // Hapus query param dari URL
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.delete('pengeluaran')
    setSearchParams(newSearchParams, { replace: true })
  }, [searchParams, setSearchParams])

  // Function untuk membuka offcanvas dari URL (deep linking)
  const openPengeluaranFromUrl = useCallback(async (pengeluaranId, onLoadAdmins) => {
    if (!pengeluaranId || selectedPengeluaran?.id?.toString() === pengeluaranId.toString()) {
      return // Sudah terbuka atau ID sama
    }

    try {
      setLoadingPengeluaranDetail(true)
      
      const response = await pengeluaranAPI.getPengeluaranDetail(pengeluaranId)
      if (response.success) {
        setSelectedPengeluaran(response.data)
        setShowPengeluaranOffcanvas(true)
        
        if (onLoadAdmins) {
          onLoadAdmins()
        }
      } else {
        showNotification(response.message || 'Gagal memuat detail pengeluaran', 'error')
        // Hapus query param jika gagal
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('pengeluaran')
        setSearchParams(newSearchParams, { replace: true })
      }
    } catch (err) {
      console.error('Error loading pengeluaran detail from URL:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail pengeluaran', 'error')
      // Hapus query param jika error
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('pengeluaran')
      setSearchParams(newSearchParams, { replace: true })
    } finally {
      setLoadingPengeluaranDetail(false)
    }
  }, [showNotification, searchParams, setSearchParams, selectedPengeluaran])

  return {
    showPengeluaranOffcanvas,
    selectedPengeluaran,
    loadingPengeluaranDetail,
    handleViewDetail,
    closePengeluaranOffcanvas,
    setShowPengeluaranOffcanvas,
    openPengeluaranFromUrl
  }
}

