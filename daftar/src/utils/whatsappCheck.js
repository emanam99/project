/**
 * Utility untuk cek nomor WhatsApp via API (backend WA baru).
 * Memakai POST /api/wa/check (API meneruskan ke wa.alutsmani.id / lokal).
 */

import { getSlimApiUrl } from '../services/api'

/**
 * Format nomor telepon untuk WhatsApp API
 * - Hapus karakter non-digit
 * - Tambahkan 62 jika nomor dimulai dengan 0
 * - Tambahkan 62 jika nomor belum dimulai dengan 62
 *
 * @param {string} phoneNumber - Nomor telepon yang akan diformat
 * @returns {string} Nomor telepon yang sudah diformat (dengan prefix 62)
 */
export const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return ''

  let formatted = String(phoneNumber).replace(/\D/g, '')
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substring(1)
  } else if (!formatted.startsWith('62')) {
    formatted = '62' + formatted
  }
  return formatted
}

/**
 * Cek apakah nomor telepon terdaftar di WhatsApp (lewat API → backend WA baru).
 *
 * @param {string} phoneNumber - Nomor telepon yang akan dicek (bisa dengan atau tanpa format)
 * @returns {Promise<{success: boolean, isRegistered: boolean, message?: string, error?: Error}>}
 */
export const checkWhatsAppNumber = async (phoneNumber) => {
  if (!phoneNumber || String(phoneNumber).trim() === '') {
    return {
      success: false,
      isRegistered: false,
      message: 'Nomor telepon tidak boleh kosong'
    }
  }

  try {
    const formattedNumber = formatPhoneNumber(phoneNumber.trim())
    const apiBase = getSlimApiUrl()
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null

    const response = await fetch(`${apiBase}/wa/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ phoneNumber: formattedNumber })
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result.message || result.error || `HTTP ${response.status}`)
    }

    const data = result.data || {}
    const isRegistered = !!data.isRegistered

    return {
      success: !!result.success,
      isRegistered,
      message: result.message ?? (isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp')
    }
  } catch (error) {
    console.error('Error checking WhatsApp number:', error)
    return {
      success: false,
      isRegistered: false,
      message: error.message || 'Gagal mengecek nomor WhatsApp',
      error: error
    }
  }
}
