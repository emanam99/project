import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { pengeluaranAPI } from '../../../../services/api'
import { useNotification } from '../../../../contexts/NotificationContext'
import { canApprove as canApproveUtil, canEdit as canEditUtil } from '../utils/pengeluaranUtils'
import { useAuthStore } from '../../../../store/authStore'

/**
 * Custom hook untuk mengelola actions rencana (approve, reject, edit)
 * @param {Function} loadAllRencana - Function untuk reload list rencana
 * @param {Function} onCloseOffcanvas - Callback untuk menutup offcanvas setelah action
 * @param {object} [fitur] - Flag dari usePengeluaranFiturAccess (granular)
 * @returns {Object} State dan handlers untuk rencana actions
 */
export const useRencanaActions = (loadAllRencana, onCloseOffcanvas, fitur = {}) => {
  const {
    rencanaEdit = true,
    draftEdit = true,
    rencanaApprove = true,
    rencanaTolak = true
  } = fitur
  const { user } = useAuthStore()
  const { showNotification } = useNotification()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const canApprove = useCallback(
    (rencana) => {
      return canApproveUtil(rencana, user) && rencanaApprove
    },
    [user, rencanaApprove]
  )

  const canReject = useCallback(
    (rencana) => {
      return canApproveUtil(rencana, user) && rencanaTolak
    },
    [user, rencanaTolak]
  )

  const canEdit = useCallback(
    (rencana) => {
      if (!canEditUtil(rencana)) return false
      if (rencana?.ket === 'draft') return draftEdit
      return rencanaEdit
    },
    [rencanaEdit, draftEdit]
  )

  const handleEdit = useCallback((id) => {
    navigate(`/pengeluaran/edit/${id}`)
  }, [navigate])

  const handleApprove = useCallback((id, onOpenModal) => {
    if (onOpenModal) {
      onOpenModal('approve', id)
    }
  }, [])

  const handleReject = useCallback((id, onOpenModal) => {
    if (onOpenModal) {
      onOpenModal('reject', id)
    }
  }, [])

  return {
    loading,
    canApprove,
    canReject,
    canEdit,
    handleEdit,
    handleApprove,
    handleReject
  }
}

