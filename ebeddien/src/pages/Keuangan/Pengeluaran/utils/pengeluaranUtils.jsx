import React from 'react'

/**
 * Format currency to Indonesian Rupiah format
 * @param {number} amount - Amount to format
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount)
}

/**
 * Get status badge component
 * @param {string} status - Status value
 * @returns {JSX.Element} Status badge component
 */
export const getStatusBadge = (status) => {
  const statusMap = {
    'pending': { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
    'di edit': { label: 'Di Edit', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
    'di approve': { label: 'Di Approve', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
    'ditolak': { label: 'Ditolak', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
    'draft': { label: 'Draft', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' }
  }
  const statusInfo = statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-800' }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
      {statusInfo.label}
    </span>
  )
}

/**
 * Check if user can approve a rencana
 * @param {Object} rencana - Rencana object
 * @param {Object} user - Current user object
 * @returns {boolean} True if user can approve
 */
export const canApprove = (rencana, user) => {
  if (!rencana) return false
  const userId = user?.id || user?.user_id
  return rencana.id_admin != userId && rencana.ket !== 'di approve' && rencana.ket !== 'ditolak'
}

/**
 * Check if user can edit a rencana
 * @param {Object} rencana - Rencana object
 * @returns {boolean} True if rencana can be edited
 */
export const canEdit = (rencana) => {
  if (!rencana) return false
  return rencana.ket !== 'ditolak' && rencana.ket !== 'di approve'
}

/**
 * Generate WhatsApp message template for rencana pengeluaran
 * Template terpusat untuk semua notifikasi WhatsApp rencana pengeluaran
 * @param {Object} rencanaData - Data rencana pengeluaran
 * @param {string} status - Status rencana: 'pending', 'approve', 'reject', atau 'edit'
 * @param {Object} options - Opsi tambahan
 * @param {Object} options.user - User object (untuk nama yang approve/reject)
 * @param {string} options.actionLabel - Label custom untuk action (opsional)
 * @param {boolean} options.isCreateMode - Apakah ini mode create (untuk status 'Baru' vs 'Di Edit')
 * @returns {string} Formatted WhatsApp message
 */
/**
 * Nama pengedit terakhir: last_edit_admin_nama dari API, atau dari detail item
 * (versi > 1 / id_admin ≠ pembuat), fallback user yang sedang login.
 */
const resolveLastEditAdminNama = (rencanaData, user, isCreateMode) => {
  if (isCreateMode || !rencanaData) return null
  const fromApi = (rencanaData.last_edit_admin_nama || '').trim()
  if (fromApi) return fromApi

  const creatorId = rencanaData.id_admin != null ? String(rencanaData.id_admin) : null
  const details = Array.isArray(rencanaData.details) ? rencanaData.details : []
  const editedRows = details.filter((d) => {
    const versi = Number(d.versi || 0)
    if (versi > 1) return true
    if (creatorId && d.id_admin != null && String(d.id_admin) !== creatorId) return true
    return false
  })
  if (editedRows.length > 0) {
    const sorted = [...editedRows].sort(
      (a, b) => Number(b.id || 0) - Number(a.id || 0) || Number(b.versi || 0) - Number(a.versi || 0)
    )
    const nama = (sorted[0]?.admin_nama || '').trim()
    if (nama) return nama
  }

  return (user?.nama || '').trim() || null
}

export const generateRencanaWhatsAppMessage = (rencanaData, status, options = {}) => {
  if (!rencanaData) return ''
  
  const { user, actionLabel, isCreateMode, catatan: catatanOverride } = options
  
  // Hitung total nominal
  let totalNominal = parseFloat(rencanaData.nominal || 0)
  if (rencanaData.details && Array.isArray(rencanaData.details) && rencanaData.details.length > 0) {
    totalNominal = rencanaData.details
      .filter(d => !Boolean(d.rejected))
      .reduce((sum, d) => sum + (parseFloat(d.nominal || 0)), 0)
  }

  // Generate link
  const baseUrl = window.location.origin
  const linkRencana = `${baseUrl}/pengeluaran?rencana=${rencanaData.id}`

  // Template berdasarkan status
  let pesan = ''
  
  if (status === 'pending') {
    // Template untuk pending (baru dibuat atau di-edit)
    const statusText = isCreateMode ? 'Baru' : 'Di Edit'
    const dibuatOleh = rencanaData.admin_nama || '-'
    const dieditOleh = resolveLastEditAdminNama(rencanaData, user, isCreateMode)
    const jumlahKomentar = rencanaData.jumlah_komentar || 0
    const jumlahViewer = rencanaData.jumlah_viewer || 0
    // Status Di Edit: tampilkan pengedit dulu (dari id_admin item yang diubah), lalu pembuat
    const olehLines = isCreateMode
      ? `*Dibuat oleh:* ${dibuatOleh}`
      : `*Diedit oleh:* ${dieditOleh || user?.nama || '-'}\n*Dibuat oleh:* ${dibuatOleh}`
    
    pesan = `${linkRencana}

*Rencana Pengeluaran* ⚠️
*Pesantren Salafiyah Al-Utsmani*

> ${rencanaData.keterangan || 'Tanpa Keterangan'}

*Kategori:* ${rencanaData.kategori || '-'}
*Lembaga:* ${rencanaData.lembaga || '-'}
*Sumber Uang:* ${rencanaData.sumber_uang || '-'}
*Total:* ${formatCurrency(totalNominal)}
*Status:* ${statusText}
${olehLines}

> 💬 ${jumlahKomentar} 👁️ ${jumlahViewer}`
    
  } else if (status === 'approve') {
    // Di Approve: jika actionLabel diset (notif dari modal approve) = admin yang login; jika tidak (kirim ulang) = dari DB (admin_approve_nama)
    const dibuatOleh = rencanaData.admin_nama || '-'
    const diuproveOleh = rencanaData.admin_approve_nama || actionLabel || '-'
    const catatan = (catatanOverride ?? rencanaData.catatan ?? '').trim()
    const catatanLine = catatan ? `\nCatatan : ${catatan}` : ''
    
    pesan = `${linkRencana}

Di Approve ✅

> ${rencanaData.keterangan || 'Tanpa Keterangan'}

Total : ${formatCurrency(totalNominal)}
Dibuat : ${dibuatOleh}
Di Approve: ${diuproveOleh}${catatanLine}`
    
  } else if (status === 'reject') {
    // Template untuk reject (backend saat ini tidak menyimpan siapa yang menolak)
    const dibuatOleh = rencanaData.admin_nama || '-'
    const ditolakOleh = user?.nama || actionLabel || '-'
    const catatan = (catatanOverride ?? rencanaData.catatan ?? '').trim()
    const alasanLine = catatan ? `\nAlasan : ${catatan}` : ''
    
    pesan = `${linkRencana}

Ditolak ❌

> ${rencanaData.keterangan || 'Tanpa Keterangan'}

Total : ${formatCurrency(totalNominal)}
Dibuat : ${dibuatOleh}
Ditolak: ${ditolakOleh}${alasanLine}`
  }
  
  return pesan
}

/**
 * Generate preview message for WhatsApp notification
 * Menggunakan template terpusat generateRencanaWhatsAppMessage
 * @param {Object} rencanaData - Rencana data object
 * @param {string} action - Action type ('approve' or 'reject')
 * @param {Object} user - Current user object
 * @returns {string} Formatted message string
 */
export const generatePreviewPesan = (rencanaData, action, user, catatan = '') => {
  if (!rencanaData) return ''
  
  // Gunakan template terpusat
  const status = action === 'approve' ? 'approve' : action === 'reject' ? 'reject' : 'pending'
  return generateRencanaWhatsAppMessage(rencanaData, status, { user, catatan })
}

