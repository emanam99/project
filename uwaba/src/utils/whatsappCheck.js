/**
 * Utility functions untuk cek nomor WhatsApp
 * Reusable untuk digunakan di mana saja
 */

const API_KEY = 'wa-alutsmani-api-key-2024-production'
const API_URL = 'https://wa.alutsmani.cloud/api/external/check'
const INSTANCE = 'uwaba1'

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
  
  // Hapus karakter non-digit
  let formatted = phoneNumber.replace(/\D/g, '')
  
  // Tambahkan 62 jika nomor dimulai dengan 0
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substring(1)
  } 
  // Tambahkan 62 jika nomor belum dimulai dengan 62
  else if (!formatted.startsWith('62')) {
    formatted = '62' + formatted
  }
  
  return formatted
}

/**
 * Cek apakah nomor telepon terdaftar di WhatsApp
 * 
 * @param {string} phoneNumber - Nomor telepon yang akan dicek (bisa dengan atau tanpa format)
 * @returns {Promise<{success: boolean, isRegistered: boolean, message?: string, error?: Error}>}
 */
export const checkWhatsAppNumber = async (phoneNumber) => {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return {
      success: false,
      isRegistered: false,
      message: 'Nomor telepon tidak boleh kosong'
    }
  }

  try {
    // Format nomor telepon
    const formattedNumber = formatPhoneNumber(phoneNumber.trim())

    // Panggil API
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        instance: INSTANCE,
        phoneNumber: formattedNumber
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}` }
      }
      throw new Error(errorData.message || 'Gagal mengecek nomor')
    }

    const result = await response.json()

    if (result.success && result.data && result.data.isRegistered) {
      return {
        success: true,
        isRegistered: true,
        message: 'Nomor terdaftar di WhatsApp'
      }
    } else {
      return {
        success: true,
        isRegistered: false,
        message: 'Nomor tidak terdaftar di WhatsApp'
      }
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

