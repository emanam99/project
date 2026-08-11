const HASIL_KEY = 'mybeddian_lupa_nis_hasil'
const UPLOAD_KEY = 'mybeddian_lupa_nis_upload'
const TERKIRIM_KEY = 'mybeddian_lupa_nis_terkirim'

/**
 * @typedef {{
 *   id?: number,
 *   nama: string,
 *   nik?: string,
 *   tanggal_lahir?: string,
 *   no_wa?: string,
 * }} LupaNisPengajuanPayload
 */

/** @typedef {{ nis: string, nik: string, nama: string, already_registered: boolean }} LupaNisHasilPayload */

/** @param {LupaNisHasilPayload} payload */
export function saveLupaNisHasil(payload) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      HASIL_KEY,
      JSON.stringify({
        nis: String(payload.nis || '').replace(/\D/g, '').slice(-7),
        nik: String(payload.nik || '').replace(/\D/g, '').slice(0, 16),
        nama: String(payload.nama || '').trim(),
        already_registered: !!payload.already_registered,
        saved_at: Date.now(),
      })
    )
  } catch {
    /* quota / private mode */
  }
}

/** @returns {LupaNisHasilPayload | null} */
export function loadLupaNisHasil() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(HASIL_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const nis = String(data.nis || '').replace(/\D/g, '').slice(-7)
    if (!nis) return null
    const nik = String(data.nik || '').replace(/\D/g, '').slice(0, 16)
    return {
      nis,
      nik,
      nama: String(data.nama || '').trim(),
      already_registered: !!data.already_registered,
    }
  } catch {
    return null
  }
}

export function clearLupaNisHasil() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(HASIL_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {LupaNisPengajuanPayload} payload */
export function saveLupaNisUpload(payload) {
  if (typeof sessionStorage === 'undefined') return
  try {
    const id = Number(payload.id) || 0
    sessionStorage.setItem(
      UPLOAD_KEY,
      JSON.stringify({
        id: id > 0 ? id : null,
        nama: String(payload.nama || '').trim(),
        nik: String(payload.nik || '').replace(/\D/g, '').slice(0, 16),
        tanggal_lahir: String(payload.tanggal_lahir || '').trim(),
        no_wa: String(payload.no_wa || '').trim(),
        saved_at: Date.now(),
      })
    )
  } catch {
    /* ignore */
  }
}

/** @returns {LupaNisPengajuanPayload | null} */
export function loadLupaNisUpload() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(UPLOAD_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const id = Number(data.id) || 0
    const nama = String(data.nama || '').trim()
    const nik = String(data.nik || '').replace(/\D/g, '').slice(0, 16)
    const tanggal_lahir = String(data.tanggal_lahir || '').trim()
    const no_wa = String(data.no_wa || '').trim()
    if (id > 0) {
      return { id, nama, nik, tanggal_lahir, no_wa }
    }
    if (nama.length >= 2 && nik.length === 16 && tanggal_lahir && no_wa) {
      return { nama, nik, tanggal_lahir, no_wa }
    }
    return null
  } catch {
    return null
  }
}

export function clearLupaNisUpload() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(UPLOAD_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {LupaNisPengajuanPayload & {
 *   wa_me_url?: string,
 *   wa_message?: string,
 *   expires_in_minutes?: number,
 *   message?: string,
 * }} payload */
export function saveLupaNisTerkirim(payload) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(
      TERKIRIM_KEY,
      JSON.stringify({
        id: Number(payload.id) || 0,
        nama: String(payload.nama || '').trim(),
        no_wa: String(payload.no_wa || '').trim(),
        wa_me_url: String(payload.wa_me_url || '').trim(),
        wa_message: String(payload.wa_message || '').trim(),
        expires_in_minutes: Number(payload.expires_in_minutes) || 30,
        message: String(payload.message || '').trim(),
        saved_at: Date.now(),
      })
    )
    clearLupaNisUpload()
  } catch {
    /* ignore */
  }
}

/** @returns {(LupaNisPengajuanPayload & {
 *   wa_me_url?: string,
 *   wa_message?: string,
 *   expires_in_minutes?: number,
 *   message?: string,
 * }) | null} */
export function loadLupaNisTerkirim() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(TERKIRIM_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    const id = Number(data.id)
    if (!id || id < 1) return null
    return {
      id,
      nama: String(data.nama || '').trim(),
      no_wa: String(data.no_wa || '').trim(),
      wa_me_url: String(data.wa_me_url || '').trim(),
      wa_message: String(data.wa_message || '').trim(),
      expires_in_minutes: Number(data.expires_in_minutes) || 30,
      message: String(data.message || '').trim(),
    }
  } catch {
    return null
  }
}

export function clearLupaNisTerkirim() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(TERKIRIM_KEY)
  } catch {
    /* ignore */
  }
}

/** @param {LupaNisPengajuanPayload | null} pending */
export function hasLupaNisUploadPending(pending) {
  if (!pending) return false
  const terkirim = loadLupaNisTerkirim()
  if (terkirim?.id && pending.id && terkirim.id === pending.id) return false
  return true
}

/**
 * @param {URLSearchParams} searchParams
 * @param {unknown} locationState
 * @returns {LupaNisPengajuanPayload | null}
 */
export function resolveLupaNisPengajuan(searchParams, locationState) {
  const fromStorage = loadLupaNisUpload()
  const fromState =
    locationState && typeof locationState === 'object' ? locationState : null
  const id = Number(fromState?.id ?? fromStorage?.id ?? 0)
  const nama = String(fromState?.nama ?? fromStorage?.nama ?? '').trim()
  const nik = String(fromState?.nik ?? fromStorage?.nik ?? '').trim()
  const tanggal_lahir = String(
    fromState?.tanggal_lahir ?? fromStorage?.tanggal_lahir ?? ''
  ).trim()
  const no_wa = String(fromState?.no_wa ?? fromStorage?.no_wa ?? '').trim()

  if (id > 0) {
    return { id, nama, nik, tanggal_lahir, no_wa }
  }
  if (nama.length >= 2 && nik.length === 16 && tanggal_lahir && no_wa) {
    return { nama, nik, tanggal_lahir, no_wa }
  }
  return null
}
