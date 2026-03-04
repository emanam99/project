import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'

/**
 * Custom hook untuk mengelola rencana detail offcanvas state dengan URL state management
 * @returns {Object} State dan handlers untuk rencana detail
 */
export const useRencanaDetail = () => {
  const { showNotification } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showRencanaOffcanvas, setShowRencanaOffcanvas] = useState(false)
  const [selectedRencana, setSelectedRencana] = useState(null)
  const [rencanaDetail, setRencanaDetail] = useState(null)
  const [loadingRencanaDetail, setLoadingRencanaDetail] = useState(false)

  // Prevent body scroll when offcanvas is open
  useEffect(() => {
    if (showRencanaOffcanvas) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showRencanaOffcanvas])

  // Sync URL dengan state offcanvas
  useEffect(() => {
    const rencanaId = searchParams.get('rencana')
    if (rencanaId && !showRencanaOffcanvas && !selectedRencana) {
      // URL memiliki rencana ID tapi offcanvas belum terbuka - buka offcanvas
      // Ini akan dipanggil dari komponen utama setelah data rencana dimuat
    }
  }, [searchParams, showRencanaOffcanvas, selectedRencana])

  const handleRencanaClick = useCallback(async (rencana, scrollToKomentar = false, onLoadAdmins) => {
    try {
      setLoadingRencanaDetail(true)
      setSelectedRencana(rencana)
      
      // Update URL dengan rencana ID
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.set('rencana', rencana.id.toString())
      // Hapus pengeluaran jika ada
      newSearchParams.delete('pengeluaran')
      setSearchParams(newSearchParams, { replace: true })
      
      const response = await pengeluaranAPI.getRencanaDetail(rencana.id)
      if (response.success) {
        setRencanaDetail(response.data)
        // Buka offcanvas SETELAH data di-set
        setShowRencanaOffcanvas(true)
        // Load list admins when offcanvas opens
        if (onLoadAdmins) {
          onLoadAdmins()
        }
        
        // Scroll ke input komentar jika diminta
        if (scrollToKomentar) {
          setTimeout(() => {
            const komentarInput = document.getElementById('komentar-input')
            if (komentarInput) {
              komentarInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
              komentarInput.focus()
            }
          }, 300) // Delay untuk memastikan offcanvas sudah terbuka
        }
      } else {
        showNotification(response.message || 'Gagal memuat detail rencana', 'error')
        // Hapus query param jika gagal
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('rencana')
        setSearchParams(newSearchParams, { replace: true })
      }
    } catch (err) {
      console.error('Error loading rencana detail:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail rencana', 'error')
      // Hapus query param jika error
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('rencana')
      setSearchParams(newSearchParams, { replace: true })
    } finally {
      setLoadingRencanaDetail(false)
    }
  }, [showNotification, searchParams, setSearchParams])

  const closeRencanaOffcanvas = useCallback(() => {
    setShowRencanaOffcanvas(false)
    setRencanaDetail(null)
    setSelectedRencana(null)
    // Hapus query param dari URL
    const newSearchParams = new URLSearchParams(searchParams)
    newSearchParams.delete('rencana')
    setSearchParams(newSearchParams, { replace: true })
  }, [searchParams, setSearchParams])

  // Function untuk membuka offcanvas dari URL (deep linking)
  const openRencanaFromUrl = useCallback(async (rencanaId, onLoadAdmins) => {
    if (!rencanaId || selectedRencana?.id?.toString() === rencanaId.toString()) {
      return // Sudah terbuka atau ID sama
    }

    try {
      setLoadingRencanaDetail(true)
      
      const response = await pengeluaranAPI.getRencanaDetail(rencanaId)
      if (response.success) {
        // Cari rencana dari list untuk mendapatkan data lengkap
        const rencana = { id: rencanaId }
        setSelectedRencana(rencana)
        setRencanaDetail(response.data)
        setShowRencanaOffcanvas(true)
        
        if (onLoadAdmins) {
          onLoadAdmins()
        }
      } else {
        showNotification(response.message || 'Gagal memuat detail rencana', 'error')
        // Hapus query param jika gagal
        const newSearchParams = new URLSearchParams(searchParams)
        newSearchParams.delete('rencana')
        setSearchParams(newSearchParams, { replace: true })
      }
    } catch (err) {
      console.error('Error loading rencana detail from URL:', err)
      showNotification(err.response?.data?.message || 'Terjadi kesalahan saat memuat detail rencana', 'error')
      // Hapus query param jika error
      const newSearchParams = new URLSearchParams(searchParams)
      newSearchParams.delete('rencana')
      setSearchParams(newSearchParams, { replace: true })
    } finally {
      setLoadingRencanaDetail(false)
    }
  }, [showNotification, searchParams, setSearchParams, selectedRencana])

  return {
    showRencanaOffcanvas,
    selectedRencana,
    rencanaDetail,
    loadingRencanaDetail,
    handleRencanaClick,
    closeRencanaOffcanvas,
    setShowRencanaOffcanvas,
    setRencanaDetail,
    openRencanaFromUrl
  }
}

