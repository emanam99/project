/**
 * Utility functions untuk cek nomor WhatsApp
 * Satu jalur lewat backend API publik (POST /api/public/wa/check).
 */

import { checkWhatsAppNumberViaAPI } from '../services/api'

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
export const checkWhatsAppNumber = async (phoneNumber, sessionId = null) => {
  if (!phoneNumber || String(phoneNumber).trim() === '') {
    return {
      success: false,
      isRegistered: false,
      message: 'Nomor telepon tidak boleh kosong'
    }
  }

  try {
    const formattedNumber = formatPhoneNumber(phoneNumber.trim())
    const result = await checkWhatsAppNumberViaAPI(formattedNumber, sessionId)

    const data = result.data || {}
    const isRegistered = !!data.isRegistered
    const ok = !!result.success

    // success false = server WA tidak terjangkau / belum login QR — bukan "nomor tidak punya WA".
    if (!ok) {
      return {
        success: false,
        isRegistered: false,
        waServerDown: true,
        message: result.message ?? 'Tidak bisa menghubungi server WhatsApp untuk cek nomor.'
      }
    }

    return {
      success: true,
      isRegistered,
      waServerDown: false,
      message: result.message ?? (isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp')
    }
  } catch (error) {
    console.error('Error checking WhatsApp number:', error)
    const msg = error.response?.data?.message || error.message || 'Gagal mengecek nomor WhatsApp'
    return {
      success: false,
      isRegistered: false,
      waServerDown: true,
      message: msg,
      error: error
    }
  }
}

