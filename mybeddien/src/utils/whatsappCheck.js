/**
 * Cek nomor WhatsApp lewat API publik (POST /api/public/wa/check).
 * Dev: fallback langsung ke server WA Node (sama halaman Koneksi WA eBeddien) bila PHP tidak terjangkau Node lokal.
 */

import { checkWhatsAppNumberViaAPI } from '../services/api'

const CHECK_WA_MAX_ATTEMPTS = 3
const CHECK_WA_RETRY_DELAY_MS = 1200

export const CHECK_WA_CLIENT_TIMEOUT_MS = 55000

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

export const formatPhoneNumberForWa = (phoneNumber) => {
  if (!phoneNumber) return ''
  let formatted = String(phoneNumber).replace(/\D/g, '')
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.substring(1)
  } else if (!formatted.startsWith('62')) {
    formatted = '62' + formatted
  }
  return formatted
}

/** Axios / fetch gagal sebelum dapat respons HTTP (bukan nomor tidak terdaftar). */
export function isWaCheckNetworkError(error) {
  if (!error) return false
  const code = String(error.code || '')
  const msg = String(error.message || '')
  if (code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') return true
  if (/network error|failed to fetch|load failed|net::/i.test(msg)) return true
  if (/timeout/i.test(msg) && !error.response) return true
  return !error.response && !!error.request
}

/** Pesan ramah pengguna di bawah input nomor WA. */
export function humanizeWaCheckClientError(error) {
  if (isWaCheckNetworkError(error)) {
    if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) {
      return 'Pemeriksaan nomor memakan waktu terlalu lama. Pastikan sinyal internet stabil, lalu ketuk Coba cek lagi.'
    }
    return 'Tidak dapat terhubung ke server. Periksa internet atau Wi‑Fi, matikan VPN/pemblokir iklan bila ada, lalu coba lagi.'
  }
  const serverMsg = error?.response?.data?.message
  if (serverMsg && String(serverMsg).trim() !== '') return String(serverMsg).trim()
  const raw = String(error?.message || '').trim()
  if (raw && !/^network error$/i.test(raw)) return raw
  return 'Gagal mengecek nomor WhatsApp. Silakan coba lagi.'
}

/**
 * Dev: cek lewat proxy Vite /wa-node → wa/ (X-API-Key dari api/.env di vite.config).
 */
async function checkWhatsAppNumberViaNodeDev(phoneNumber, sessionId = 'default') {
  const body = {
    phoneNumber: formatPhoneNumberForWa(phoneNumber),
    sessionId: String(sessionId || 'default').trim() || 'default',
  }
  const res = await fetch('/wa-node/api/whatsapp/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let data = {}
  try {
    data = await res.json()
  } catch {
    /* proxy ECONNREFUSED sering tanpa JSON */
  }
  const isRegistered = !!data?.data?.isRegistered
  if (res.ok && data?.success) {
    return {
      success: true,
      isRegistered,
      waServerDown: false,
      networkError: false,
      canRetry: false,
      message: data.message ?? (isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp'),
    }
  }
  const proxyDown = res.status >= 500 && !data?.message
  return {
    success: false,
    isRegistered: false,
    waServerDown: true,
    networkError: proxyDown,
    canRetry: true,
    message:
      data?.message ||
      (proxyDown
        ? 'Server WA Node tidak merespons. Pastikan `npm run dev` di folder wa/ jalan dan port sama dengan WA_API_URL di api/.env.'
        : 'Tidak bisa menghubungi server WhatsApp (Node).'),
  }
}

async function callCheckApiWithRetry(formattedNumber, sessionId) {
  let lastError = null
  for (let attempt = 0; attempt < CHECK_WA_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(CHECK_WA_RETRY_DELAY_MS * attempt)
    }
    try {
      const result = await checkWhatsAppNumberViaAPI(formattedNumber, sessionId, {
        timeout: CHECK_WA_CLIENT_TIMEOUT_MS,
      })
      return { result, error: null, attempts: attempt + 1 }
    } catch (error) {
      lastError = error
      if (!isWaCheckNetworkError(error) || attempt >= CHECK_WA_MAX_ATTEMPTS - 1) {
        break
      }
    }
  }
  return { result: null, error: lastError, attempts: CHECK_WA_MAX_ATTEMPTS }
}

function mapApiResult(result, { networkError = false, canRetry = false } = {}) {
  const data = result?.data || {}
  const isRegistered = !!data.isRegistered
  const ok = !!result?.success

  if (!ok) {
    return {
      success: false,
      isRegistered: false,
      waServerDown: true,
      networkError,
      canRetry: canRetry || true,
      message:
        result?.message ??
        'Layanan cek WhatsApp sedang bermasalah. Coba lagi sebentar atau hubungi admin pesantren.',
    }
  }

  return {
    success: true,
    isRegistered,
    waServerDown: false,
    networkError: false,
    canRetry: false,
    message:
      result?.message ??
      (isRegistered ? 'Nomor terdaftar di WhatsApp' : 'Nomor tidak terdaftar di WhatsApp'),
  }
}

/**
 * @returns {Promise<{ success: boolean, isRegistered: boolean, waServerDown?: boolean, networkError?: boolean, canRetry?: boolean, message?: string }>}
 */
export const checkWhatsAppNumber = async (phoneNumber, sessionId = 'default') => {
  if (!phoneNumber || String(phoneNumber).trim() === '') {
    return {
      success: false,
      isRegistered: false,
      networkError: false,
      canRetry: false,
      message: 'Nomor WhatsApp tidak boleh kosong',
    }
  }

  const formattedNumber = formatPhoneNumberForWa(phoneNumber.trim())

  try {
    const { result, error } = await callCheckApiWithRetry(formattedNumber, sessionId)

    if (error) {
      if (import.meta.env.DEV) {
        try {
          const nodeTry = await checkWhatsAppNumberViaNodeDev(phoneNumber, sessionId)
          if (nodeTry.success || !nodeTry.waServerDown) {
            return nodeTry
          }
        } catch {
          /* lanjut */
        }
      }
      return {
        success: false,
        isRegistered: false,
        waServerDown: true,
        networkError: true,
        canRetry: true,
        message: humanizeWaCheckClientError(error),
      }
    }

    let mapped = mapApiResult(result)

    if (!mapped.success && import.meta.env.DEV) {
      const phpAnswered =
        result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'success')
      if (!phpAnswered) {
        const nodeTry = await checkWhatsAppNumberViaNodeDev(formattedNumber, sessionId)
        if (nodeTry.success) {
          return nodeTry
        }
        if (!nodeTry.waServerDown) {
          return nodeTry
        }
      }
    }

    if (!mapped.success) {
      mapped = {
        ...mapped,
        canRetry: true,
        message:
          mapped.message ??
          'Layanan cek WhatsApp sedang bermasalah. Sesuaikan Pengaturan → Notifikasi di eBeddien (WA server / WatZap / Evolution), lalu coba lagi.',
      }
    }

    return mapped
  } catch (error) {
    if (import.meta.env.DEV) {
      try {
        const nodeTry = await checkWhatsAppNumberViaNodeDev(phoneNumber, sessionId)
        if (nodeTry.success || !nodeTry.waServerDown) {
          return nodeTry
        }
      } catch {
        /* lanjut */
      }
    }
    return {
      success: false,
      isRegistered: false,
      waServerDown: true,
      networkError: isWaCheckNetworkError(error),
      canRetry: true,
      message: humanizeWaCheckClientError(error),
    }
  }
}
