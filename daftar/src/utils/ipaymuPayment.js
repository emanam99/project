/**
 * Util pembayaran iPayMu — selaras normalisasi & pesan error di API (iPaymuService / PaymentTransactionController).
 */

/** Hanya digit; buang kode negara 62 dan leading 0. */
export function normalizePhoneForIpaymu(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('62')) {
    digits = digits.slice(2)
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1)
  }
  return digits
}

export function isValidIpaymuPhone(raw) {
  return normalizePhoneForIpaymu(raw).length >= 10
}

export function isValidEmailFormat(email) {
  const e = String(email || '').trim()
  if (!e) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/** Nomor HP untuk pembayaran daftar: utamakan no_telpon (wali), lalu WA santri. */
export function pickPaymentPhone(d = {}) {
  return String(d.no_telpon || d.no_wa_santri || d.no_wa || d.no_hp || d.no_telp || '').trim()
}

function isEmailInvalidPaymentError(msg) {
  if (!msg || typeof msg !== 'string') return false
  const m = msg.toLowerCase()
  return m.includes('email') && (m.includes('tidak valid') || m.includes('invalid') || m.includes('format'))
}

function isPhoneInvalidPaymentError(msg) {
  if (!msg || typeof msg !== 'string') return false
  const m = msg.toLowerCase()
  return (
    (m.includes('phone') || m.includes('telepon') || m.includes('hp') || m.includes('whatsapp') || m.includes('wa'))
    && (m.includes('tidak valid') || m.includes('invalid') || m.includes('wajib') || m.includes('kosong') || m.includes('minimal'))
  )
}

export { isEmailInvalidPaymentError, isPhoneInvalidPaymentError }

/** Gabungkan message + detail + errors dari body JSON API. */
export function formatPaymentApiError(body, fallback = 'Gagal memproses pembayaran') {
  if (!body || typeof body !== 'object') {
    return fallback
  }
  const msg = String(body.message || '').trim() || fallback
  const detail = String(body.detail || '').trim()
  if (detail && !msg.includes(detail)) {
    return `${msg} (${detail})`
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    return `${msg}: ${body.errors.join(', ')}`
  }
  return msg
}

/** Ekstrak body error dari Axios atau objek hasil createTransaction yang sudah di-wrap. */
export function paymentErrorFromCatch(err, fallback) {
  if (err?.message && !err?.response && typeof err.message === 'string') {
    const m = err.message
    if (m !== 'Request failed with status code 400' && m !== 'Request failed with status code 503') {
      return m
    }
  }
  const body = err?.response?.data
  if (body) {
    return formatPaymentApiError(body, fallback)
  }
  return err?.message || fallback
}
