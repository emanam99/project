/**
 * Utility functions untuk cek nomor WhatsApp
 * Satu jalur lewat backend API publik (POST /api/public/wa/check)
 * atau auth (POST /api/wa/check) bila id_santri + field (nomor di UI ter-mask).
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

/** Nomor yang tampil di UI sudah disamarkan (****). */
export const isMaskedPhone = (phoneNumber) => String(phoneNumber || '').includes('*')

/**
 * Cek apakah nomor telepon terdaftar di WhatsApp (lewat API → backend WA).
 *
 * @param {string} phoneNumber - Nomor (boleh mask jika opts.id_santri + opts.field)
 * @param {string|null} sessionId
 * @param {{ id_santri?: number|string, field?: string }?} opts
 * @returns {Promise<{success: boolean, isRegistered: boolean, message?: string, error?: Error}>}
 */
export const checkWhatsAppNumber = async (phoneNumber, sessionId = null, opts = null) => {
  const idSantri = opts?.id_santri != null ? Number(opts.id_santri) : 0
  const field = opts?.field || opts?.phone_field || ''
  const viaSantri = idSantri > 0 && !!field

  if (!viaSantri && (!phoneNumber || String(phoneNumber).trim() === '')) {
    return {
      success: false,
      isRegistered: false,
      message: 'Nomor telepon tidak boleh kosong'
    }
  }

  if (!viaSantri && isMaskedPhone(phoneNumber)) {
    return {
      success: false,
      isRegistered: false,
      message: 'Nomor disamarkan. Cek lewat data santri (backend).'
    }
  }

  try {
    const formattedNumber = viaSantri ? '' : formatPhoneNumber(String(phoneNumber).trim())
    const result = await checkWhatsAppNumberViaAPI(
      formattedNumber,
      sessionId,
      viaSantri ? { id_santri: idSantri, field } : null
    )

    const data = result.data || {}
    const isRegistered = !!data.isRegistered
    const ok = !!result.success

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
